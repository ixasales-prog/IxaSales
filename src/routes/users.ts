import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { hashPassword } from '../lib/password';
import { eq, and, sql, desc } from 'drizzle-orm';

export const userRoutes = new Elysia({ prefix: '/users' })
    .use(authPlugin)

    // List users (tenant admin or supervisor)
    .get(
        '/',
        async (ctx) => {
            const { user, isAuthenticated, query, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!user.tenantId && user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } };
            }

            const { page = 1, limit = 20, search, role, isActive } = query;
            const offset = (page - 1) * limit;

            // Build conditions
            const conditions: any[] = [];

            // Filter by tenant for non-super admins
            if (user.role !== 'super_admin') {
                if (!user.tenantId) {
                    set.status = 403;
                    return { success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } };
                }
                conditions.push(eq(schema.users.tenantId, user.tenantId));
            } else if (query.tenantId) {
                // Allow super admin to filter by tenant
                conditions.push(eq(schema.users.tenantId, query.tenantId));
            }

            if (search) {
                conditions.push(
                    sql`(${schema.users.name} ILIKE ${`%${search}%`} OR ${schema.users.email} ILIKE ${`%${search}%`})`
                );
            }

            if (role) {
                conditions.push(eq(schema.users.role, role));
            }

            if (isActive !== undefined) {
                conditions.push(eq(schema.users.isActive, isActive === 'true'));
            }

            // If supervisor, only show their team
            if (user.role === 'supervisor') {
                conditions.push(eq(schema.users.supervisorId, user.id));
            }

            // Get users
            const users = await db
                .select({
                    id: schema.users.id,
                    name: schema.users.name,
                    email: schema.users.email,
                    role: schema.users.role,
                    phone: schema.users.phone,
                    isActive: schema.users.isActive,
                    lastLoginAt: schema.users.lastLoginAt,
                    createdAt: schema.users.createdAt,
                    supervisorId: schema.users.supervisorId,
                })
                .from(schema.users)
                .where(and(...conditions))
                .orderBy(desc(schema.users.createdAt))
                .limit(limit)
                .offset(offset);

            // Get total count
            const [{ count }] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.users)
                .where(and(...conditions));

            return {
                success: true,
                data: users,
                meta: {
                    page,
                    limit,
                    total: Number(count),
                    totalPages: Math.ceil(Number(count) / limit),
                },
            };
        },
        {
            query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                search: t.Optional(t.String()),
                role: t.Optional(t.String()),
                isActive: t.Optional(t.String()),
                tenantId: t.Optional(t.String()),
            }),
        }
    )

    // Create user
    .post(
        '/',
        async (ctx) => {
            const { user, isAuthenticated, body, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!['tenant_admin', 'super_admin'].includes(user.role)) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            if (user.role !== 'super_admin' && !user.tenantId) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } };
            }

            const bodyTenantId = body.tenantId === '' ? null : body.tenantId;

            const targetTenantId = user.role === 'super_admin' && bodyTenantId
                ? bodyTenantId
                : user.tenantId;

            if (!targetTenantId && body.role !== 'super_admin') {
                set.status = 400;
                return { success: false, error: { code: 'BAD_REQUEST', message: 'Tenant ID is required for non-super admins' } };
            }

            // Check plan limits (skip for super_admin creating users)
            if (user.role !== 'super_admin') {
                const { canCreateUser } = await import('../lib/planLimits');
                const limitCheck = await canCreateUser(targetTenantId);
                if (!limitCheck.allowed) {
                    set.status = 403;
                    return {
                        success: false,
                        error: {
                            code: 'LIMIT_EXCEEDED',
                            message: `User limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                        }
                    };
                }
            }

            // Check email uniqueness
            const [existing] = await db
                .select({ id: schema.users.id })
                .from(schema.users)
                .where(eq(schema.users.email, body.email.toLowerCase()))
                .limit(1);

            if (existing) {
                set.status = 409;
                return {
                    success: false,
                    error: { code: 'CONFLICT', message: 'Email already exists' },
                };
            }

            // Hash password
            const passwordHash = await hashPassword(body.password);

            // Create user
            const [newUser] = await db
                .insert(schema.users)
                .values({
                    tenantId: targetTenantId,
                    name: body.name,
                    email: body.email.toLowerCase(),
                    passwordHash,
                    role: body.role,
                    phone: body.phone || null,
                    supervisorId: body.supervisorId || null,
                })
                .returning({
                    id: schema.users.id, // Return ID for confirmation
                    name: schema.users.name,
                    email: schema.users.email,
                    role: schema.users.role,
                    tenantId: schema.users.tenantId, // Needed for fetching tenant name
                    createdAt: schema.users.createdAt,
                });

            // Notify Super Admin via Telegram
            try {
                let tenantName = undefined;
                if (targetTenantId) {
                    const [tenant] = await db
                        .select({ name: schema.tenants.name })
                        .from(schema.tenants)
                        .where(eq(schema.tenants.id, targetTenantId));
                    tenantName = tenant?.name;
                }

                const { notifyNewUser } = await import('../lib/telegram');
                notifyNewUser({
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role,
                    tenantName
                });
            } catch (err) {
                console.error('Failed to send Telegram notification:', err);
            }

            return {
                success: true,
                data: newUser,
            };
        },
        {
            body: t.Object({
                name: t.String({ minLength: 2 }),
                email: t.String({ format: 'email' }),
                password: t.String({ minLength: 8 }),
                role: t.String(),
                phone: t.Optional(t.String()),
                supervisorId: t.Optional(t.String()),
                tenantId: t.Optional(t.String()),
            }),
        }
    )

    // Get user by ID
    .get(
        '/:id',
        async (ctx) => {
            const { user, isAuthenticated, params, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            const [targetUser] = await db
                .select({
                    id: schema.users.id,
                    name: schema.users.name,
                    email: schema.users.email,
                    role: schema.users.role,
                    phone: schema.users.phone,
                    telegramChatId: schema.users.telegramChatId,
                    isActive: schema.users.isActive,
                    lastLoginAt: schema.users.lastLoginAt,
                    createdAt: schema.users.createdAt,
                })
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.id, params.id),
                        user.role !== 'super_admin' && user.tenantId ? eq(schema.users.tenantId, user.tenantId) : sql`true`
                    )
                )
                .limit(1);

            if (!targetUser) {
                set.status = 404;
                return { success: false, error: { code: 'NOT_FOUND' } };
            }

            return { success: true, data: targetUser };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        }
    )

    // Update user
    .patch(
        '/:id',
        async (ctx) => {
            const { user, isAuthenticated, params, body, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!['tenant_admin', 'super_admin'].includes(user.role)) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            // Update user
            const [updated] = await db
                .update(schema.users)
                .set({
                    ...body,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.users.id, params.id),
                        user.role !== 'super_admin' && user.tenantId ? eq(schema.users.tenantId, user.tenantId) : sql`true`
                    )
                )
                .returning({
                    id: schema.users.id,
                    name: schema.users.name,
                    email: schema.users.email,
                    role: schema.users.role,
                    isActive: schema.users.isActive,
                });

            if (!updated) {
                set.status = 404;
                return { success: false, error: { code: 'NOT_FOUND' } };
            }

            return { success: true, data: updated };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                name: t.Optional(t.String({ minLength: 2 })),
                email: t.Optional(t.String({ format: 'email' })),
                phone: t.Optional(t.String()),
                role: t.Optional(t.String()),
                isActive: t.Optional(t.Boolean()),
                supervisorId: t.Optional(t.String()),
            }),
        }
    )

    // Assign territories
    .put(
        '/:id/territories',
        async (ctx) => {
            const { user, isAuthenticated, params, body, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!['tenant_admin', 'super_admin'].includes(user.role)) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            const { territoryIds } = body;

            // Delete existing assignments
            await db
                .delete(schema.userTerritories)
                .where(eq(schema.userTerritories.userId, params.id));

            // Insert new assignments
            if (territoryIds.length > 0) {
                await db.insert(schema.userTerritories).values(
                    territoryIds.map((territoryId: string) => ({
                        userId: params.id,
                        territoryId,
                    }))
                );
            }

            return { success: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                territoryIds: t.Array(t.String()),
            }),
        }
    )

    // Assign brands
    .put(
        '/:id/brands',
        async (ctx) => {
            const { user, isAuthenticated, params, body, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!['tenant_admin', 'super_admin'].includes(user.role)) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            const { brandIds } = body;

            // Delete existing assignments
            await db
                .delete(schema.userBrands)
                .where(eq(schema.userBrands.userId, params.id));

            // Insert new assignments
            if (brandIds.length > 0) {
                await db.insert(schema.userBrands).values(
                    brandIds.map((brandId: string) => ({
                        userId: params.id,
                        brandId,
                    }))
                );
            }

            return { success: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                brandIds: t.Array(t.String()),
            }),
        }
    )

    // Delete user
    .delete(
        '/:id',
        async (ctx) => {
            const { user, isAuthenticated, params, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (!['tenant_admin', 'super_admin'].includes(user.role)) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            // Check if user is deleting themselves
            if (user.id === params.id) {
                set.status = 400;
                return { success: false, error: { code: 'BAD_REQUEST', message: 'Cannot delete yourself' } };
            }

            try {
                const [deleted] = await db
                    .delete(schema.users)
                    .where(
                        and(
                            eq(schema.users.id, params.id),
                            user.role !== 'super_admin' && user.tenantId ? eq(schema.users.tenantId, user.tenantId) : sql`true`
                        )
                    )
                    .returning();

                if (!deleted) {
                    set.status = 404;
                    return { success: false, error: { code: 'NOT_FOUND' } };
                }

                return { success: true, data: deleted };
            } catch (err: any) {
                // Check for foreign key constraints (e.g. assigned as sales rep or supervisor)
                if (err.code === '23503') {
                    set.status = 409;
                    return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete user with associated records (orders, customers, etc).' } };
                }
                throw err;
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        }
    );
