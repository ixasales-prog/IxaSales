/**
 * Customer Portal - Auth Routes
 * 
 * OTP-based authentication for customer portal.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { customerPortalLogger as logger } from '../../lib/logger';
import { checkOtpRequestLimit, checkOtpVerifyLimit, clearOtpVerifyLimit } from '../../lib/rate-limit';
import { OTP_EXPIRY_MINUTES } from './types';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[CustomerPortal] CRITICAL: JWT_SECRET must be set and at least 32 characters long');
}
const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET || 'development-only-secret-key-32ch');

// ============================================================================
// OTP UTILITIES
// ============================================================================

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPViaTelegram(
    tenantId: string,
    chatId: string,
    otp: string
): Promise<boolean> {
    try {
        const [tenant] = await db
            .select({
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramEnabled: schema.tenants.telegramEnabled,
                name: schema.tenants.name,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        if (!tenant || !tenant.telegramEnabled || !tenant.telegramBotToken) {
            return false;
        }

        // Multi-language OTP message templates
        const otpMessages = {
            uz: `🔐 <b>Tasdiqlash kodi</b>\n\nSizning kodingiz: <code>${otp}</code>\n\nKod ${OTP_EXPIRY_MINUTES} daqiqa ichida amal qiladi.\n\n⚠️ Bu kodni hech kimga bermang!`,
            ru: `🔐 <b>Код подтверждения</b>\n\nВаш код: <code>${otp}</code>\n\nКод действителен ${OTP_EXPIRY_MINUTES} минут.\n\n⚠️ Никому не сообщайте этот код!`,
            en: `🔐 <b>Verification Code</b>\n\nYour code: <code>${otp}</code>\n\nCode valid for ${OTP_EXPIRY_MINUTES} minutes.\n\n⚠️ Do not share this code!`
        };

        // Use Uzbek as default (can be extended to detect customer's language preference)
        const text = otpMessages.uz;

        const response = await fetch(
            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                }),
            }
        );

        const result = await response.json();
        return result.ok;
    } catch (error) {
        logger.error('Error sending OTP', { error: String(error) });
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

// ============================================================================
// ROUTES
// ============================================================================

export const authRoutes = new Elysia()
    /**
     * Request OTP - send verification code to customer's Telegram
     */
    .post('/auth/request-otp', async ({ body, set, request }) => {
        const { phone, tenantSubdomain } = body;
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const rateLimitKey = `${tenantSubdomain}:${normalizedPhone}`;
        const ip = request.headers.get('x-forwarded-for') || 'unknown';

        // Check rate limit
        const rateCheck = checkOtpRequestLimit(rateLimitKey, ip);
        if (!rateCheck.allowed) {
            set.status = 429;
            return createErrorResponse('RATE_LIMITED');
        }

        const phoneVariants = getPhoneVariants(phone);
        logger.debug('OTP request', { tenantSubdomain, phoneVariants });

        // Find tenant
        const [tenant] = await db
            .select({ id: schema.tenants.id, name: schema.tenants.name })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, tenantSubdomain))
            .limit(1);

        if (!tenant) {
            set.status = 404;
            return createErrorResponse('TENANT_NOT_FOUND');
        }

        // Find customer by any phone variant
        let customer = null;
        for (const phoneVariant of phoneVariants) {
            const [found] = await db
                .select({
                    id: schema.customers.id,
                    name: schema.customers.name,
                    phone: schema.customers.phone,
                    telegramChatId: schema.customers.telegramChatId,
                })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.tenantId, tenant.id),
                    eq(schema.customers.phone, phoneVariant)
                ))
                .limit(1);

            if (found) {
                customer = found;
                break;
            }
        }

        if (!customer) {
            set.status = 404;
            return createErrorResponse('CUSTOMER_NOT_FOUND');
        }

        if (!customer.telegramChatId) {
            set.status = 400;
            return createErrorResponse('NO_TELEGRAM');
        }

        // Generate and save OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await db
            .update(schema.customers)
            .set({
                otpCode: otp,
                otpExpiresAt: expiresAt,
                updatedAt: new Date()
            })
            .where(eq(schema.customers.id, customer.id));

        // Send OTP via Telegram
        const sent = await sendOTPViaTelegram(tenant.id, customer.telegramChatId, otp);

        if (!sent) {
            set.status = 500;
            return createErrorResponse('OTP_SEND_FAILED');
        }

        return createSuccessResponse('OTP_SENT', {
            expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
            maskedName: customer.name?.substring(0, 3) + '***',
            remainingAttempts: rateCheck.remainingAttempts
        });
    }, {
        body: t.Object({
            phone: t.String(),
            tenantSubdomain: t.String()
        })
    })

    /**
     * Verify OTP and issue JWT token
     */
    .post('/auth/verify-otp', async ({ body, set, request }) => {
        const { phone, otp, tenantSubdomain } = body;
        const normalizedPhone = phone.replace(/[^\d+]/g, '');
        const rateLimitKey = `${tenantSubdomain}:${normalizedPhone}`;
        const ip = request.headers.get('x-forwarded-for') || 'unknown';

        // Check rate limit
        const rateCheck = checkOtpVerifyLimit(rateLimitKey, ip);
        if (!rateCheck.allowed) {
            set.status = 429;
            return createErrorResponse('RATE_LIMITED');
        }

        const phoneVariants = getPhoneVariants(phone);

        // Find tenant
        const [tenant] = await db
            .select({ id: schema.tenants.id })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, tenantSubdomain))
            .limit(1);

        if (!tenant) {
            set.status = 404;
            return createErrorResponse('TENANT_NOT_FOUND');
        }

        // Find customer
        let customer = null;
        for (const phoneVariant of phoneVariants) {
            const [found] = await db
                .select({
                    id: schema.customers.id,
                    name: schema.customers.name,
                    phone: schema.customers.phone,
                    otpCode: schema.customers.otpCode,
                    otpExpiresAt: schema.customers.otpExpiresAt,
                })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.tenantId, tenant.id),
                    eq(schema.customers.phone, phoneVariant)
                ))
                .limit(1);

            if (found) {
                customer = found;
                break;
            }
        }

        if (!customer) {
            set.status = 404;
            return createErrorResponse('CUSTOMER_NOT_FOUND');
        }

        // Check OTP
        if (!customer.otpCode || customer.otpCode !== otp) {
            set.status = 400;
            return createErrorResponse('INVALID_OTP');
        }

        if (!customer.otpExpiresAt || new Date() > customer.otpExpiresAt) {
            set.status = 400;
            return createErrorResponse('OTP_EXPIRED');
        }

        // Clear OTP and rate limits
        await db
            .update(schema.customers)
            .set({
                otpCode: null,
                otpExpiresAt: null,
                updatedAt: new Date()
            })
            .where(eq(schema.customers.id, customer.id));

        clearOtpVerifyLimit(rateLimitKey);

        // Generate JWT
        const token = await new SignJWT({
            customerId: customer.id,
            tenantId: tenant.id,
            type: 'customer'
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(JWT_SECRET_KEY);

        return {
            success: true,
            data: {
                token,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone
                }
            }
        };
    }, {
        body: t.Object({
            phone: t.String(),
            otp: t.String(),
            tenantSubdomain: t.String()
        })
    });
