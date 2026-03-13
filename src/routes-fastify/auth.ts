import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { hashPassword, verifyPassword } from '../lib/password';
import { eq, and } from 'drizzle-orm';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from '../lib/loginSecurity';
import { logAudit } from '../lib/audit';
import { authLogger } from '../lib/logger';
import { criticalEndpointLimiter } from '../lib/advanced-rate-limiting';
import { evaluateTenantAccess } from '../lib/tenant-access';
import {
    createSession,
    getSessionTtlMs,
    getSessionTtlSeconds,
    revokeSessionByToken,
    revokeSessionsForUser,
} from '../lib/auth-sessions';
import { getPermissionsForRole } from '../lib/permissions';

// Schemas
const LoginBodySchema = Type.Object({
    email: Type.String({ format: 'email' }),
    password: Type.String({ minLength: 8 }),
});

const ChangePasswordSchema = Type.Object({
    currentPassword: Type.String({ minLength: 6 }),
    newPassword: Type.String({ minLength: 8 }),
});

const ImpersonateSchema = Type.Object({
    userId: Type.String(),
});

const ForgotPasswordSchema = Type.Object({
    email: Type.String({ format: 'email' }),
});

const ResetPasswordSchema = Type.Object({
    token: Type.String(),
    password: Type.String({ minLength: 8 }),
});

type LoginBody = Static<typeof LoginBodySchema>;
type ChangePasswordBody = Static<typeof ChangePasswordSchema>;
type ImpersonateBody = Static<typeof ImpersonateSchema>;
type ForgotPasswordBody = Static<typeof ForgotPasswordSchema>;
type ResetPasswordBody = Static<typeof ResetPasswordSchema>;

export const authRoutes: FastifyPluginAsync = async (fastify) => {
    // Login
    fastify.post<{ Body: LoginBody }>('/login', {
        schema: {
            body: LoginBodySchema,
        },
        preHandler: [criticalEndpointLimiter.login],
    }, async (request, reply) => {
        const { email, password } = request.body;

        // Check if account is locked
        const lockStatus = await isLockedOut(email);
        if (lockStatus.locked) {
            return reply.code(429).send({
                success: false,
                error: {
                    code: 'ACCOUNT_LOCKED',
                    message: `Account temporarily locked. Try again in ${lockStatus.minutesRemaining} minutes.`,
                },
            });
        }

        // Find user by email
        authLogger.debug('Attempting login', { email });
        const [user] = await db
            .select()
            .from(schema.users)
            .where(
                and(
                    eq(schema.users.email, email.toLowerCase()),
                    eq(schema.users.isActive, true)
                )
            )
            .limit(1);

        authLogger.debug('User lookup result', { found: !!user, userId: user?.id, role: user?.role });

        if (!user) {
            authLogger.debug('User not found or inactive', { email });
            const result = await recordFailedAttempt(email);

            // Notify Super Admin if locked out
            if (result.lockedOut) {
                try {
                    const { notifyLoginLocked } = await import('../lib/telegram');
                    const ip = request.headers['x-forwarded-for'] as string || 'unknown';
                    notifyLoginLocked(email, ip);
                } catch (e) {
                    authLogger.error('Failed to notify login locked', undefined, { error: String(e) });
                }
            }

            return reply.code(401).send({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: result.lockedOut
                        ? 'Account locked due to too many failed attempts.'
                        : `Invalid email or password. ${result.attemptsRemaining} attempts remaining.`,
                },
            });
        }

        // Verify password
        authLogger.debug('Verifying password');
        const isValid = await verifyPassword(password, user.passwordHash);
        authLogger.debug('Password verification result', { valid: isValid });

        if (!isValid) {
            const result = await recordFailedAttempt(email);

            if (result.lockedOut) {
                try {
                    const { notifyLoginLocked } = await import('../lib/telegram');
                    const ip = request.headers['x-forwarded-for'] as string || 'unknown';
                    notifyLoginLocked(email, ip);
                } catch (e) {
                    authLogger.error('Failed to notify login locked', undefined, { error: String(e) });
                }
            }

            return reply.code(401).send({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: result.lockedOut
                        ? 'Account locked due to too many failed attempts.'
                        : `Invalid email or password. ${result.attemptsRemaining} attempts remaining.`,
                },
            });
        }

        let tenantAccess = { mode: 'full', reason: 'ok', message: '' as string };

        // Check tenant access state (full vs read-only)
        authLogger.debug('Checking tenant status', { role: user.role, tenantId: user.tenantId });
        if (user.role !== 'super_admin' && user.tenantId) {
            const [tenant] = await db
                .select({
                    isActive: schema.tenants.isActive,
                    planStatus: schema.tenants.planStatus,
                    subscriptionEndAt: schema.tenants.subscriptionEndAt,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            tenantAccess = evaluateTenantAccess(tenant);
            authLogger.debug('Tenant access mode', { mode: tenantAccess.mode, reason: tenantAccess.reason });
        }

        // Clear failed attempts on success
        await clearFailedAttempts(email);

        // Log successful login
        await logAudit(
            'user.login',
            `User logged in via ${user.role} portal`,
            user.id,
            user.tenantId,
            user.id,
            'user',
            request.ip || '::1',
            'Fastify Client'
        );

        // Create JWT token
        const accessToken = fastify.jwt.sign({
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
            type: 'user',
        }, {
            expiresIn: getSessionTtlSeconds(),
        });

        await createSession({
            userId: user.id,
            userType: 'user',
            token: accessToken,
            ipAddress: request.ip || null,
            userAgent: (request.headers['user-agent'] as string) || null,
            expiresAt: new Date(Date.now() + getSessionTtlMs()),
        });

        // Update last login
        await db
            .update(schema.users)
            .set({ lastLoginAt: new Date() })
            .where(eq(schema.users.id, user.id));

        return {
            success: true,
            data: {
                token: accessToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tenantId: user.tenantId,
                    actorType: 'user',
                    permissions: getPermissionsForRole(user.role),
                },
                tenantAccess,
            },
        };
    });

    // Portal Login (Customer Users)
    fastify.post<{ Body: LoginBody }>('/portal/login', {
        schema: {
            body: LoginBodySchema,
        },
    }, async (request, reply) => {
        return reply.code(410).send({
            success: false,
            error: {
                code: 'LEGACY_AUTH_DISABLED',
                message: 'Legacy customer portal password login is disabled. Use OTP-based customer portal authentication.',
            },
        });
    });

    // Logout
    fastify.post('/logout', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const authHeader = request.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (token) {
            await revokeSessionByToken(token);
        }
        return { success: true };
    });

    // Get current user
    fastify.get('/me', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        let fullUser: any = null;
        if (user.actorType === 'customer_user') {
            const [customerUser] = await db
                .select({
                    id: schema.customerUsers.id,
                    email: schema.customerUsers.email,
                    name: schema.customerUsers.name,
                    tenantId: schema.customerUsers.tenantId,
                    customerId: schema.customerUsers.customerId,
                    createdAt: schema.customerUsers.createdAt,
                })
                .from(schema.customerUsers)
                .where(eq(schema.customerUsers.id, user.id))
                .limit(1);
            fullUser = customerUser
                ? { ...customerUser, role: 'customer_user' }
                : null;
        } else {
            const [staffUser] = await db
                .select({
                    id: schema.users.id,
                    email: schema.users.email,
                    name: schema.users.name,
                    role: schema.users.role,
                    tenantId: schema.users.tenantId,
                    phone: schema.users.phone,
                    gpsTrackingEnabled: schema.users.gpsTrackingEnabled,
                    createdAt: schema.users.createdAt,
                })
                .from(schema.users)
                .where(eq(schema.users.id, user.id))
                .limit(1);
            fullUser = staffUser;
        }

        if (!fullUser) {
            return reply.code(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        // Get tenant info if applicable
        let tenant = null;
        let tenantAccess = { mode: 'full', reason: 'ok', message: '' as string };
        if (fullUser.tenantId) {
            const [tenantData] = await db
                .select({
                    id: schema.tenants.id,
                    name: schema.tenants.name,
                    subdomain: schema.tenants.subdomain,
                    plan: schema.tenants.plan,
                    currency: schema.tenants.currency,
                    timezone: schema.tenants.timezone,
                    isActive: schema.tenants.isActive,
                    planStatus: schema.tenants.planStatus,
                    subscriptionEndAt: schema.tenants.subscriptionEndAt,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, fullUser.tenantId))
                .limit(1);
            tenant = tenantData;
            tenantAccess = evaluateTenantAccess(tenantData);
        }

        return {
            success: true,
            data: {
                user: fullUser,
                tenant,
                tenantAccess,
            },
        };
    });

    // Change password
    fastify.post<{ Body: ChangePasswordBody }>('/change-password', {
        preHandler: [fastify.authenticate],
        schema: {
            body: ChangePasswordSchema,
        },
    }, async (request, reply) => {
        const user = request.user!;
        const { currentPassword, newPassword } = request.body;

        // Get current user with password hash
        const [currentUser] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, user.id))
            .limit(1);

        if (!currentUser) {
            return reply.code(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        // Verify current password
        const isValid = await verifyPassword(currentPassword, currentUser.passwordHash);
        if (!isValid) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
            });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password
        await db
            .update(schema.users)
            .set({
                passwordHash: newPasswordHash,
                updatedAt: new Date(),
            })
            .where(eq(schema.users.id, user.id));

        await revokeSessionsForUser(user.id, 'user');

        return { success: true, message: 'Password changed successfully' };
    });

    // Impersonate User (Super Admin only)
    fastify.post<{ Body: ImpersonateBody }>('/impersonate', {
        preHandler: [fastify.authenticate, fastify.requirePermission('auth.impersonate')],
        schema: {
            body: ImpersonateSchema,
        },
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'super_admin') {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only Super Admins can impersonate users' },
            });
        }

        const { userId } = request.body;

        // Find target user
        const [targetUser] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);

        if (!targetUser) {
            return reply.code(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        // Create JWT token for target user
        const accessToken = fastify.jwt.sign({
            sub: targetUser.id,
            tenantId: targetUser.tenantId,
            role: targetUser.role,
            type: 'user',
            impersonatedBy: user.id,
        }, {
            expiresIn: getSessionTtlSeconds(),
        });

        await createSession({
            userId: targetUser.id,
            userType: 'user',
            token: accessToken,
            ipAddress: request.ip || null,
            userAgent: (request.headers['user-agent'] as string) || null,
            expiresAt: new Date(Date.now() + getSessionTtlMs()),
        });

        await logAudit(
            'user.impersonate',
            {
                impersonatedBy: user.id,
                targetUserId: targetUser.id,
                targetRole: targetUser.role,
            },
            user.id,
            targetUser.tenantId,
            targetUser.id,
            'user',
            request.ip || '::1',
            (request.headers['user-agent'] as string) || 'Fastify Client'
        );

        return {
            success: true,
            data: {
                token: accessToken,
                user: {
                    id: targetUser.id,
                    email: targetUser.email,
                    name: targetUser.name,
                    role: targetUser.role,
                    tenantId: targetUser.tenantId,
                    actorType: 'user',
                    permissions: getPermissionsForRole(targetUser.role),
                    impersonatedBy: user.id,
                },
            },
        };
    });

    // Request password reset
    fastify.post<{ Body: ForgotPasswordBody }>('/forgot-password', {
        schema: {
            body: ForgotPasswordSchema,
        },
    }, async (request, reply) => {
        const { email } = request.body;

        // Find user by email
        const [user] = await db
            .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.email, email.toLowerCase()))
            .limit(1);

        // Always return success to prevent email enumeration
        if (!user) {
            return { success: true, message: 'If an account exists, a reset link has been sent.' };
        }

        // Generate reset token
        const { generateResetToken } = await import('../lib/resetTokens');
        const token = generateResetToken(user.id, user.email);

        // Build reset URL
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        // Send email
        const { sendEmail, getPasswordResetEmail } = await import('../lib/email');
        const emailData = getPasswordResetEmail(resetUrl, user.name);
        emailData.to = user.email;

        const sent = await sendEmail(emailData);

        if (!sent) {
            authLogger.info('Password reset email not sent (SMTP not configured)', { resetUrl });
        }

        return { success: true, message: 'If an account exists, a reset link has been sent.' };
    });

    // Reset password with token
    fastify.post<{ Body: ResetPasswordBody }>('/reset-password', {
        schema: {
            body: ResetPasswordSchema,
        },
    }, async (request, reply) => {
        const { token, password } = request.body;

        // Validate token
        const { consumeResetToken } = await import('../lib/resetTokens');
        const tokenData = consumeResetToken(token);

        if (!tokenData) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset link.' },
            });
        }

        // Hash new password
        const newHash = await hashPassword(password);

        // Update user password
        await db
            .update(schema.users)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(schema.users.id, tokenData.userId));

        await revokeSessionsForUser(tokenData.userId, 'user');

        return { success: true, message: 'Password reset successfully. You can now log in.' };
    });
};
