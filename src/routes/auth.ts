import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/password';
import { eq, and } from 'drizzle-orm';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from '../lib/loginSecurity';
import { logAudit } from '../lib/audit';
import { authLogger } from '../lib/logger';

export const authRoutes = new Elysia({ prefix: '/auth' })
    .use(authPlugin)

    // Login
    .post(
        '/login',
        async (ctx) => {
            const { jwt, body, set, cookie } = ctx as any;
            const { email, password } = body;

            // Check if account is locked
            const lockStatus = isLockedOut(email);
            if (lockStatus.locked) {
                set.status = 429;
                return {
                    success: false,
                    error: {
                        code: 'ACCOUNT_LOCKED',
                        message: `Account temporarily locked. Try again in ${lockStatus.minutesRemaining} minutes.`
                    },
                };
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
                const result = recordFailedAttempt(email);

                // Notify Super Admin if locked out
                if (result.lockedOut) {
                    try {
                        const { notifyLoginLocked } = await import('../lib/telegram');
                        const ip = ctx.request.headers.get('x-forwarded-for') || 'unknown';
                        notifyLoginLocked(email, ip);
                    } catch (e) { authLogger.error('Failed to notify login locked', { error: String(e) }); }
                }

                set.status = 401;
                return {
                    success: false,
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: result.lockedOut
                            ? 'Account locked due to too many failed attempts.'
                            : `Invalid email or password. ${result.attemptsRemaining} attempts remaining.`
                    },
                };
            }

            // Verify password first (security best practice)
            authLogger.debug('Verifying password');
            const isValid = await verifyPassword(password, user.passwordHash);
            authLogger.debug('Password verification result', { valid: isValid });
            if (!isValid) {
                const result = recordFailedAttempt(email);

                // Notify Super Admin if locked out
                if (result.lockedOut) {
                    try {
                        const { notifyLoginLocked } = await import('../lib/telegram');
                        const ip = ctx.request.headers.get('x-forwarded-for') || 'unknown';
                        notifyLoginLocked(email, ip);
                    } catch (e) { authLogger.error('Failed to notify login locked', { error: String(e) }); }
                }

                set.status = 401;
                return {
                    success: false,
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: result.lockedOut
                            ? 'Account locked due to too many failed attempts.'
                            : `Invalid email or password. ${result.attemptsRemaining} attempts remaining.`
                    },
                };
            }

            // Check if tenant is suspended (after valid credentials)
            authLogger.debug('Checking tenant status', { role: user.role, tenantId: user.tenantId });
            if (user.role !== 'super_admin' && user.tenantId) {
                const [tenant] = await db
                    .select({ isActive: schema.tenants.isActive })
                    .from(schema.tenants)
                    .where(eq(schema.tenants.id, user.tenantId))
                    .limit(1);

                authLogger.debug('Tenant status', { isActive: tenant?.isActive });

                if (tenant && tenant.isActive === false) {
                    set.status = 403;
                    return {
                        success: false,
                        error: {
                            code: 'TENANT_SUSPENDED',
                            message: 'Your organization account has been suspended. Please contact support.'
                        }
                    };
                }
            } else {
                authLogger.debug('Skipping tenant check for Super Admin or Global User');
            }

            // Clear failed attempts on successful login
            clearFailedAttempts(email);

            // Log successful login
            await logAudit(
                'user.login',
                `User logged in via ${user.role} portal`,
                user.id,
                user.tenantId,
                user.id,
                'user',
                '::1', // TODO: Get real IP from request headers if possible
                'Elysia Client'
            );

            // Create JWT token
            const accessToken = await jwt.sign({
                sub: user.id,
                tenantId: user.tenantId,
                role: user.role,
                type: 'user',
            });

            // Update last login
            await db
                .update(schema.users)
                .set({ lastLoginAt: new Date() })
                .where(eq(schema.users.id, user.id));

            // Set HTTP-only cookie
            if (cookie?.token) {
                cookie.token.set({
                    value: accessToken,
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60, // 7 days
                    path: '/',
                });
            }

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
                    },
                },
            };
        },
        {
            body: t.Object({
                email: t.String({ format: 'email' }),
                password: t.String({ minLength: 6 }),
            }),
        }
    )

    // Portal Login (Customer Users)
    .post(
        '/portal/login',
        async (ctx) => {
            const { jwt, body, set, cookie } = ctx as any;
            const { email, password } = body;

            // Find customer user by email
            const [user] = await db
                .select()
                .from(schema.customerUsers)
                .where(
                    and(
                        eq(schema.customerUsers.email, email.toLowerCase()),
                        eq(schema.customerUsers.isActive, true)
                    )
                )
                .limit(1);

            if (!user) {
                set.status = 401;
                return {
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
                };
            }

            // Verify password
            const isValid = await verifyPassword(password, user.passwordHash);
            if (!isValid) {
                set.status = 401;
                return {
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
                };
            }

            // Create JWT token
            const accessToken = await jwt.sign({
                sub: user.id,
                tenantId: user.tenantId,
                role: 'customer_user',
                type: 'customer_user',
            });

            // Update last login
            await db
                .update(schema.customerUsers)
                .set({ lastLoginAt: new Date() })
                .where(eq(schema.customerUsers.id, user.id));

            // Set HTTP-only cookie
            if (cookie?.token) {
                cookie.token.set({
                    value: accessToken,
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60, // 7 days
                    path: '/',
                });
            }

            return {
                success: true,
                data: {
                    token: accessToken,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: 'customer_user',
                        tenantId: user.tenantId,
                        customerId: user.customerId,
                    },
                },
            };
        },
        {
            body: t.Object({
                email: t.String({ format: 'email' }),
                password: t.String({ minLength: 6 }),
            }),
        }
    )

    // Logout
    .post('/logout', (ctx) => {
        const { cookie } = ctx as any;
        if (cookie?.token) {
            cookie.token.remove();
        }
        return { success: true };
    })

    // Get current user
    .get('/me', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;

        if (!isAuthenticated || !user) {
            set.status = 401;
            return {
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
            };
        }

        // Fetch full user details
        const [fullUser] = await db
            .select({
                id: schema.users.id,
                email: schema.users.email,
                name: schema.users.name,
                role: schema.users.role,
                tenantId: schema.users.tenantId,
                phone: schema.users.phone,
                createdAt: schema.users.createdAt,
            })
            .from(schema.users)
            .where(eq(schema.users.id, user.id))
            .limit(1);

        if (!fullUser) {
            set.status = 404;
            return {
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' },
            };
        }

        // Get tenant info if applicable
        let tenant = null;
        if (fullUser.tenantId) {
            const [tenantData] = await db
                .select({
                    id: schema.tenants.id,
                    name: schema.tenants.name,
                    subdomain: schema.tenants.subdomain,
                    plan: schema.tenants.plan,
                    currency: schema.tenants.currency,
                    timezone: schema.tenants.timezone,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, fullUser.tenantId))
                .limit(1);
            tenant = tenantData;
        }

        return {
            success: true,
            data: {
                user: fullUser,
                tenant,
            },
        };
    })

    // Change password
    .post(
        '/change-password',
        async (ctx) => {
            const { user, isAuthenticated, body, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return {
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
                };
            }

            const { currentPassword, newPassword } = body;

            // Get current user with password hash
            const [currentUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id))
                .limit(1);

            if (!currentUser) {
                set.status = 404;
                return {
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'User not found' },
                };
            }

            // Verify current password
            const isValid = await verifyPassword(currentPassword, currentUser.passwordHash);
            if (!isValid) {
                set.status = 400;
                return {
                    success: false,
                    error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
                };
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

            return { success: true, message: 'Password changed successfully' };
        },
        {
            body: t.Object({
                currentPassword: t.String({ minLength: 6 }),
                newPassword: t.String({ minLength: 8 }),
            }),
        }
    )

    // Impersonate User (Super Admin only)
    .post(
        '/impersonate',
        async (ctx) => {
            const { user, isAuthenticated, body, jwt, set, cookie } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'Only Super Admins can impersonate users' } };
            }

            const { userId } = body;

            // Find target user
            const [targetUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .limit(1);

            if (!targetUser) {
                set.status = 404;
                return { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
            }

            // Create JWT token for target user
            const accessToken = await jwt.sign({
                sub: targetUser.id,
                tenantId: targetUser.tenantId,
                role: targetUser.role,
                type: 'user',
                impersonatedBy: user.id // Audit trail claim
            });

            // Set cookie
            if (cookie?.token) {
                cookie.token.set({
                    value: accessToken,
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60, // 7 days
                    path: '/',
                });
            }

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
                    },
                },
            };
        },
        {
            body: t.Object({
                userId: t.String(),
            }),
        }
    )

    // Request password reset
    .post(
        '/forgot-password',
        async (ctx) => {
            const { body, set } = ctx as any;
            const { email } = body;

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

            // Build reset URL (frontend URL)
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
        },
        {
            body: t.Object({
                email: t.String({ format: 'email' }),
            }),
        }
    )

    // Reset password with token
    .post(
        '/reset-password',
        async (ctx) => {
            const { body, set } = ctx as any;
            const { token, password } = body;

            // Validate token
            const { consumeResetToken } = await import('../lib/resetTokens');
            const tokenData = consumeResetToken(token);

            if (!tokenData) {
                set.status = 400;
                return {
                    success: false,
                    error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset link.' },
                };
            }

            // Hash new password
            const newHash = await hashPassword(password);

            // Update user password
            await db
                .update(schema.users)
                .set({ passwordHash: newHash })
                .where(eq(schema.users.id, tokenData.userId));

            return { success: true, message: 'Password reset successfully. You can now log in.' };
        },
        {
            body: t.Object({
                token: t.String(),
                password: t.String({ minLength: 6 }),
            }),
        }
    );
