/**
 * Customer Portal - Auth Routes (Fastify)
 *
 * OTP-based authentication for customer portal.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { randomInt } from 'crypto';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { customerPortalLogger as logger } from '../../lib/logger';
import { checkOtpRequestLimitAsync, checkOtpVerifyLimitAsync, clearOtpVerifyLimitAsync } from '../../lib/rate-limit';
import { OTP_EXPIRY_MINUTES } from './types';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { generateCustomerToken } from '../../lib/customer-auth';
import { hashCustomerOtp, verifyCustomerOtpHash } from '../../lib/customer-otp';
import { getTelegramIntegration } from '../../lib/tenant-integrations';
import { revokeSessionByToken, revokeSessionsForUser } from '../../lib/auth-sessions';
import { requireCustomerAuth } from './middleware';
import { getTenantAdminsWithTelegram, notifyUser } from '../../lib/telegram';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../../lib/idempotency';
import type { IdempotencyStartResult } from '../../lib/idempotency';

// ============================================================================
// OTP UTILITIES
// ============================================================================

function generateOTP(): string {
    return String(randomInt(100000, 1000000));
}

async function sendOTPViaTelegram(
    tenantId: string,
    chatId: string,
    otp: string
): Promise<boolean> {
    try {
        const tenant = await getTelegramIntegration(tenantId, true);

        if (!tenant.enabled || !tenant.botToken) {
            return false;
        }

        const otpMessages = {
            uz: `Verification code\n\nSizning kodingiz: ${otp}\n\nKod ${OTP_EXPIRY_MINUTES} daqiqa ichida amal qiladi.\n\nBu kodni hech kimga bermang!`,
            ru: `Код подтверждения\n\nВаш код: ${otp}\n\nКод действителен ${OTP_EXPIRY_MINUTES} минут.\n\nНикому не сообщайте этот код!`,
            en: `Verification code\n\nYour code: ${otp}\n\nCode valid for ${OTP_EXPIRY_MINUTES} minutes.\n\nDo not share this code!`,
        };

        const text = otpMessages.uz;

        const response = await fetch(
            `https://api.telegram.org/bot${tenant.botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                }),
            }
        );

        const result = await response.json();
        return result.ok;
    } catch (error) {
        logger.error('Error sending OTP', undefined, { error: String(error) });
        return false;
    }
}

// ============================================================================
// PHONE NORMALIZATION
// ============================================================================

function getPhoneVariants(phone: string): string[] {
    const normalized = phone.replace(/[^\d+]/g, '');
    return [
        normalized,
        normalized.replace(/^\+/, ''),
        '+' + normalized.replace(/^\+/, ''),
        normalized.replace(/^998/, '+998'),
        normalized.replace(/^\+998/, '998'),
    ];
}

function normalizeOtpInput(otp: string): string {
    return otp.replace(/\D/g, '').slice(0, 6);
}

function createGenericOtpRequestResponse(remainingAttempts: number) {
    return createSuccessResponse('OTP_SENT', {
        expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
        maskedName: '***',
        remainingAttempts,
    });
}

async function findCustomerByPhoneVariants(tenantId: string, phoneVariants: string[]) {
    for (const phoneVariant of phoneVariants) {
        const [found] = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                phone: schema.customers.phone,
                telegramChatId: schema.customers.telegramChatId,
                otpCode: schema.customers.otpCode,
                otpExpiresAt: schema.customers.otpExpiresAt,
                isActive: schema.customers.isActive,
            })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.tenantId, tenantId),
                eq(schema.customers.phone, phoneVariant)
            ))
            .limit(1);

        if (found) {
            return found;
        }
    }
    return null;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const RequestOtpSchema = {
    body: Type.Object({
        phone: Type.String(),
        tenantSubdomain: Type.String(),
    }),
};

const VerifyOtpSchema = {
    body: Type.Object({
        phone: Type.String(),
        otp: Type.String(),
        tenantSubdomain: Type.String(),
    }),
};

const RegisterRequestSchema = {
    body: Type.Object({
        name: Type.String({ minLength: 2 }),
        phone: Type.String(),
        tenantSubdomain: Type.String(),
        telegramChatId: Type.Optional(Type.String()),
        telegramUsername: Type.Optional(Type.String()),
        telegramUserId: Type.Optional(Type.String()),
        telegramFirstName: Type.Optional(Type.String()),
        telegramLastName: Type.Optional(Type.String()),
        telegramLanguageCode: Type.Optional(Type.String()),
        registrationSource: Type.Optional(Type.String()),
        consentGiven: Type.Optional(Type.Boolean()),
        consentAt: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
    }),
};

// ============================================================================
// ROUTES
// ============================================================================

export const authRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/auth/register-request', {
        schema: RegisterRequestSchema,
    }, async (request, reply) => {
        const body = request.body as {
            name: string;
            phone: string;
            tenantSubdomain: string;
            telegramChatId?: string;
            telegramUsername?: string;
            telegramUserId?: string;
            telegramFirstName?: string;
            telegramLastName?: string;
            telegramLanguageCode?: string;
            registrationSource?: string;
            consentGiven?: boolean;
            consentAt?: string;
            notes?: string;
        };
        let idempotency: IdempotencyStartResult = { enabled: false };
        try {
            idempotency = await beginIdempotentRequest(request, 'customer_portal.register_request.create');
        } catch (idempotencyError) {
            logger.warn('Idempotency initialization failed for registration request; continuing without idempotency', {
                tenantSubdomain: body.tenantSubdomain,
                error: String(idempotencyError),
            });
        }
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_IN_PROGRESS',
                    message: 'A request with this idempotency key is currently being processed',
                },
            });
        }
        if (idempotency.enabled && idempotency.conflict) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_KEY_REUSED',
                    message: idempotency.conflict,
                },
            });
        }

        try {
            const normalizedPhone = body.phone.replace(/[^\d+]/g, '');
            const phoneVariants = getPhoneVariants(normalizedPhone);
            // Public endpoint: never trust caller-provided source labels.
            const normalizedSource = 'web';
            const consentAt = body.consentAt ? new Date(body.consentAt) : null;
            const normalizedConsentAt = consentAt && !Number.isNaN(consentAt.getTime()) ? consentAt : null;
            const rawForwardedFor = request.headers['x-forwarded-for'];
            const requestIp = Array.isArray(rawForwardedFor)
                ? rawForwardedFor[0]
                : typeof rawForwardedFor === 'string'
                    ? rawForwardedFor.split(',')[0].trim()
                    : request.ip || null;
            const requestUserAgent = (request.headers['user-agent'] as string) || null;

        const [tenant] = await db
            .select({ id: schema.tenants.id, name: schema.tenants.name })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, body.tenantSubdomain))
            .limit(1);

        if (!tenant) {
            await abortIdempotentRequest(idempotency);
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
        }

        const [existingCustomer] = await db
            .select({ id: schema.customers.id })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.tenantId, tenant.id),
                inArray(schema.customers.phone, phoneVariants)
            ))
            .limit(1);

        if (existingCustomer) {
            const responseBody = {
                success: true,
                data: {
                    status: 'already_registered',
                    message: 'Customer already exists. Please log in with OTP.',
                },
            };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        }

        const [pending] = await db
            .select({ id: schema.customerRegistrationRequests.id })
            .from(schema.customerRegistrationRequests)
            .where(and(
                eq(schema.customerRegistrationRequests.tenantId, tenant.id),
                inArray(schema.customerRegistrationRequests.phone, phoneVariants),
                eq(schema.customerRegistrationRequests.status, 'pending')
            ))
            .orderBy(schema.customerRegistrationRequests.createdAt)
            .limit(1);

        if (pending) {
            const responseBody = {
                success: true,
                data: {
                    requestId: pending.id,
                    status: 'pending',
                    message: 'Registration request is already pending approval.',
                },
            };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        }

            let created;
            try {
                [created] = await db.insert(schema.customerRegistrationRequests).values({
                    tenantId: tenant.id,
                    name: body.name.trim(),
                    phone: normalizedPhone,
                    // Public self-registration must not bind Telegram identity fields.
                    telegramChatId: null,
                    telegramUsername: null,
                    telegramUserId: null,
                    telegramFirstName: null,
                    telegramLastName: null,
                    telegramLanguageCode: null,
                    registrationSource: normalizedSource,
                    consentGiven: body.consentGiven === true,
                    consentAt: normalizedConsentAt,
                    requestIp,
                    requestUserAgent,
                    notes: body.notes || null,
                    status: 'pending',
                }).returning();
            } catch (insertError) {
                // Backward-compatible fallback if optional columns are missing in a stale DB schema.
                logger.warn('Registration request insert with optional fields failed, retrying with minimal payload', {
                    tenantId: tenant.id,
                    phone: normalizedPhone,
                    error: String(insertError),
                });
                [created] = await db.insert(schema.customerRegistrationRequests).values({
                    tenantId: tenant.id,
                    name: body.name.trim(),
                    phone: normalizedPhone,
                    status: 'pending',
                }).returning();
            }

            try {
                const admins = await getTenantAdminsWithTelegram(tenant.id);
                const requestLabel = created.id.slice(0, 8);
                for (const admin of admins) {
                    await notifyUser(
                        admin.telegramChatId,
                        `<b>Yangi ro'yxatdan o'tish so'rovi</b>\n\n` +
                        `ID: ${requestLabel}\n` +
                        `Ism: ${body.name}\n` +
                        `Telefon: ${normalizedPhone}\n` +
                        (body.telegramUsername ? `Telegram: @${body.telegramUsername.replace('@', '')}\n` : '') +
                        (body.notes ? `Izoh: ${body.notes}\n` : '') +
                        `\nTasdiqlash uchun admin paneldan ko'ring.`
                    );
                }
            } catch (notifyError) {
                // Notification delivery must not block registration request creation.
                logger.warn('Failed to notify admins about registration request', {
                    tenantId: tenant.id,
                    requestId: created.id,
                    error: String(notifyError),
                });
            }

            const responseBody = {
                success: true,
                data: {
                    requestId: created.id,
                    status: 'pending',
                    message: 'Registration request submitted. Wait for admin approval.',
                },
            };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Register request failed', err, {
                tenantSubdomain: body.tenantSubdomain,
                phone: body.phone,
            });
            await abortIdempotentRequest(idempotency);
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });

    fastify.post('/auth/request-otp', {
        schema: RequestOtpSchema,
    }, async (request, reply) => {
        const { phone, tenantSubdomain } = request.body as { phone: string; tenantSubdomain: string };
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const rateLimitKey = `${tenantSubdomain}:${normalizedPhone}`;
        const forwarded = request.headers['x-forwarded-for'];
        const ip = Array.isArray(forwarded)
            ? forwarded[0]
            : typeof forwarded === 'string'
                ? forwarded.split(',')[0].trim()
                : request.ip || 'unknown';

        const rateCheck = await checkOtpRequestLimitAsync(rateLimitKey, ip);
        if (!rateCheck.allowed) {
            return reply.status(429).send(createErrorResponse('RATE_LIMITED'));
        }

        const phoneVariants = getPhoneVariants(phone);
        logger.debug('OTP request', { tenantSubdomain, phoneVariants });

        const [tenant] = await db
            .select({ id: schema.tenants.id, name: schema.tenants.name })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, tenantSubdomain))
            .limit(1);

        if (!tenant) {
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
        }

        const customer = await findCustomerByPhoneVariants(tenant.id, phoneVariants);

        if (!customer) {
            return createGenericOtpRequestResponse(rateCheck.remainingAttempts);
        }

        if (!customer.isActive) {
            return createGenericOtpRequestResponse(rateCheck.remainingAttempts);
        }

        if (!customer.telegramChatId) {
            return createGenericOtpRequestResponse(rateCheck.remainingAttempts);
        }

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await db
            .update(schema.customers)
            .set({
                otpCode: hashCustomerOtp(otp, customer.id, tenant.id),
                otpExpiresAt: expiresAt,
                updatedAt: new Date(),
            })
            .where(eq(schema.customers.id, customer.id));

        const sent = await sendOTPViaTelegram(tenant.id, customer.telegramChatId, otp);
        if (!sent) {
            return reply.status(500).send(createErrorResponse('OTP_SEND_FAILED'));
        }

        return createGenericOtpRequestResponse(rateCheck.remainingAttempts);
    });

    fastify.post('/auth/verify-otp', {
        schema: VerifyOtpSchema,
    }, async (request, reply) => {
        const { phone, otp, tenantSubdomain } = request.body as { phone: string; otp: string; tenantSubdomain: string };
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const normalizedOtp = normalizeOtpInput(otp);
        const rateLimitKey = `${tenantSubdomain}:${normalizedPhone}`;
        const forwarded = request.headers['x-forwarded-for'];
        const ip = Array.isArray(forwarded)
            ? forwarded[0]
            : typeof forwarded === 'string'
                ? forwarded.split(',')[0].trim()
                : request.ip || 'unknown';

        const rateCheck = await checkOtpVerifyLimitAsync(rateLimitKey, ip);
        if (!rateCheck.allowed) {
            return reply.status(429).send(createErrorResponse('RATE_LIMITED'));
        }

        const phoneVariants = getPhoneVariants(phone);

        const [tenant] = await db
            .select({ id: schema.tenants.id })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, tenantSubdomain))
            .limit(1);

        if (!tenant) {
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
        }

        const customer = await findCustomerByPhoneVariants(tenant.id, phoneVariants);

        if (!customer || !customer.isActive) {
            return reply.status(400).send(createErrorResponse('INVALID_OTP'));
        }

        if (normalizedOtp.length !== 6) {
            return reply.status(400).send(createErrorResponse('INVALID_OTP'));
        }

        if (!verifyCustomerOtpHash(customer.otpCode, normalizedOtp, customer.id, tenant.id)) {
            return reply.status(400).send(createErrorResponse('INVALID_OTP'));
        }

        if (!customer.otpExpiresAt || new Date() > customer.otpExpiresAt) {
            return reply.status(400).send(createErrorResponse('INVALID_OTP'));
        }

        await db
            .update(schema.customers)
            .set({
                otpCode: null,
                otpExpiresAt: null,
                updatedAt: new Date(),
            })
            .where(eq(schema.customers.id, customer.id));

        await clearOtpVerifyLimitAsync(rateLimitKey);

        await revokeSessionsForUser(customer.id, 'customer');

        const token = await generateCustomerToken(customer.id, tenant.id, '7d', {
            ipAddress: request.ip || null,
            userAgent: (request.headers['user-agent'] as string) || null,
        });

        return {
            success: true,
            data: {
                token,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                },
            },
        };
    });

    fastify.post('/auth/logout', {
        preHandler: [requireCustomerAuth],
    }, async (request) => {
        const authHeader = request.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (token) {
            await revokeSessionByToken(token);
        }
        return { success: true };
    });
};
