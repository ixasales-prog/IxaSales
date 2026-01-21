import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, sql, desc, and } from 'drizzle-orm';
import { logAudit } from '../lib/audit';

export const tenantRoutes = new Elysia({ prefix: '/super/tenants' })
    .use(authPlugin)

    // List all tenants (Super Admin only)
    .get(
        '/',
        async (ctx) => {
            const { user, isAuthenticated, query, set } = ctx as any;

            if (!isAuthenticated || !user) {
                set.status = 401;
                return { success: false, error: { code: 'UNAUTHORIZED' } };
            }

            if (user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            const { page = 1, limit = 20, search, plan, isActive } = query;
            const offset = (page - 1) * limit;

            // Build conditions
            const conditions: any[] = [];

            if (search) {
                conditions.push(
                    sql`(${schema.tenants.name} ILIKE ${`%${search}%`} OR ${schema.tenants.subdomain} ILIKE ${`%${search}%`})`
                );
            }

            if (plan) {
                conditions.push(eq(schema.tenants.plan, plan));
            }

            if (isActive !== undefined) {
                conditions.push(eq(schema.tenants.isActive, isActive === 'true'));
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            // Get tenants
            const tenants = await db
                .select({
                    id: schema.tenants.id,
                    name: schema.tenants.name,
                    subdomain: schema.tenants.subdomain,
                    plan: schema.tenants.plan,
                    maxUsers: schema.tenants.maxUsers,
                    maxProducts: schema.tenants.maxProducts,
                    currency: schema.tenants.currency,
                    timezone: schema.tenants.timezone,
                    isActive: schema.tenants.isActive,
                    defaultTaxRate: schema.tenants.defaultTaxRate,
                    telegramEnabled: schema.tenants.telegramEnabled,
                    telegramBotToken: schema.tenants.telegramBotToken,
                    subscriptionEndAt: schema.tenants.subscriptionEndAt,
                    planStatus: schema.tenants.planStatus,
                    createdAt: schema.tenants.createdAt,
                })
                .from(schema.tenants)
                .where(whereClause)
                .orderBy(desc(schema.tenants.createdAt))
                .limit(limit)
                .offset(offset);

            // Get total count
            const [{ count }] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.tenants)
                .where(whereClause);

            return {
                success: true,
                data: tenants,
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
                plan: t.Optional(t.String()),
                isActive: t.Optional(t.String()),
            }),
        }
    )

    // Create tenant
    .post(
        '/',
        async (ctx) => {
            const { user, isAuthenticated, body, set } = ctx as any;

            if (!isAuthenticated || !user || user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            // Check subdomain uniqueness
            const [existing] = await db
                .select({ id: schema.tenants.id })
                .from(schema.tenants)
                .where(eq(schema.tenants.subdomain, body.subdomain.toLowerCase()))
                .limit(1);

            if (existing) {
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Subdomain already exists' } };
            }

            // Get plan limits from dynamic configuration
            const { getPlanLimits } = await import('../lib/planLimits');
            const { getDefaultTenantSettings } = await import('../lib/systemSettings');
            const limits = getPlanLimits(body.plan || 'starter');
            const defaults = getDefaultTenantSettings();

            // Create tenant (apply platform defaults if not specified)
            const [newTenant] = await db
                .insert(schema.tenants)
                .values({
                    name: body.name,
                    subdomain: body.subdomain.toLowerCase(),
                    plan: body.plan,
                    maxUsers: limits.maxUsers,
                    maxProducts: limits.maxProducts,
                    maxOrdersPerMonth: limits.maxOrdersPerMonth,
                    currency: body.currency || defaults.defaultCurrency,
                    timezone: body.timezone || defaults.defaultTimezone,
                    defaultTaxRate: body.defaultTaxRate?.toString() || defaults.defaultTaxRate.toString(),
                    isActive: body.isActive ?? true,
                    telegramEnabled: body.telegramEnabled ?? false,
                    telegramBotToken: body.telegramBotToken,
                    subscriptionEndAt: body.subscriptionEndAt ? new Date(body.subscriptionEndAt) : null,
                    planStatus: body.planStatus || 'active',
                })
                .returning();

            // Log creation
            await logAudit(
                'tenant.create',
                { name: newTenant.name, subdomain: newTenant.subdomain, plan: newTenant.plan },
                user.id,
                null,
                newTenant.id,
                'tenant',
                '::1',
                'SuperAdmin Console'
            );

            // Notify Super Admin via Telegram
            try {
                const { notifyNewTenant } = await import('../lib/telegram');
                notifyNewTenant({
                    name: newTenant.name,
                    subdomain: newTenant.subdomain,
                    plan: newTenant.plan || 'free',
                });
            } catch (e) {
                console.error('[Telegram] Error notifying new tenant:', e);
            }

            return { success: true, data: newTenant };
        },
        {
            body: t.Object({
                name: t.String({ minLength: 2 }),
                subdomain: t.String({ minLength: 3, maxLength: 50 }),
                plan: t.Optional(t.String()),
                maxUsers: t.Optional(t.Number({ minimum: 1 })),
                maxProducts: t.Optional(t.Number({ minimum: 1 })),
                maxOrdersPerMonth: t.Optional(t.Number({ minimum: 1 })),
                currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
                timezone: t.Optional(t.String()),
                defaultTaxRate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
                isActive: t.Optional(t.Boolean()),
                telegramEnabled: t.Optional(t.Boolean()),
                telegramBotToken: t.Optional(t.Nullable(t.String())),
                subscriptionEndAt: t.Optional(t.Nullable(t.String())),
                planStatus: t.Optional(t.String()),
            }),
        }
    )

    // Get tenant by ID
    .get(
        '/:id',
        async (ctx) => {
            const { user, isAuthenticated, params, set } = ctx as any;

            if (!isAuthenticated || !user || user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            const [tenant] = await db
                .select()
                .from(schema.tenants)
                .where(eq(schema.tenants.id, params.id))
                .limit(1);

            if (!tenant) {
                set.status = 404;
                return { success: false, error: { code: 'NOT_FOUND' } };
            }

            // Get user count
            const [{ userCount }] = await db
                .select({ userCount: sql<number>`count(*)` })
                .from(schema.users)
                .where(eq(schema.users.tenantId, params.id));

            // Get product count
            const [{ productCount }] = await db
                .select({ productCount: sql<number>`count(*)` })
                .from(schema.products)
                .where(eq(schema.products.tenantId, params.id));

            return {
                success: true,
                data: {
                    ...tenant,
                    stats: {
                        userCount: Number(userCount),
                        productCount: Number(productCount),
                    },
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        }
    )

    // Update tenant
    .patch(
        '/:id',
        async (ctx) => {
            const { user, isAuthenticated, params, body, set } = ctx as any;

            if (!isAuthenticated || !user || user.role !== 'super_admin') {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN' } };
            }

            const updateData: any = { ...body, updatedAt: new Date() };

            if (body.subdomain) {
                const [existing] = await db
                    .select({ id: schema.tenants.id })
                    .from(schema.tenants)
                    .where(and(
                        eq(schema.tenants.subdomain, body.subdomain.toLowerCase()),
                        sql`${schema.tenants.id} != ${params.id}`
                    ))
                    .limit(1);

                if (existing) {
                    set.status = 409;
                    return { success: false, error: { code: 'CONFLICT', message: 'Subdomain already exists' } };
                }
                updateData.subdomain = body.subdomain.toLowerCase();
            }

            if (body.defaultTaxRate !== undefined) {
                updateData.defaultTaxRate = body.defaultTaxRate.toString();
            }

            // If plan is changing, update limits to plan defaults
            // (Unless specific limits are provided in the update payload to override them)
            if (body.plan) {
                const { getPlanLimits } = await import('../lib/planLimits');
                const limits = getPlanLimits(body.plan);

                if (body.maxUsers === undefined) updateData.maxUsers = limits.maxUsers;
                if (body.maxProducts === undefined) updateData.maxProducts = limits.maxProducts;
                if (body.maxOrdersPerMonth === undefined) updateData.maxOrdersPerMonth = limits.maxOrdersPerMonth;
            }

            // Handle subscriptionEndAt specifically
            if (body.subscriptionEndAt === null) {
                updateData.subscriptionEndAt = null;
            } else if (body.subscriptionEndAt) {
                updateData.subscriptionEndAt = new Date(body.subscriptionEndAt);
            }

            const [updated] = await db
                .update(schema.tenants)
                .set(updateData)
                .where(eq(schema.tenants.id, params.id))
                .returning();

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
                subdomain: t.Optional(t.String({ minLength: 3, maxLength: 50 })),
                plan: t.Optional(t.String()),
                maxUsers: t.Optional(t.Number({ minimum: 1 })),
                maxProducts: t.Optional(t.Number({ minimum: 1 })),
                maxOrdersPerMonth: t.Optional(t.Number({ minimum: 1 })),
                currency: t.Optional(t.String()),
                timezone: t.Optional(t.String()),
                defaultTaxRate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
                isActive: t.Optional(t.Boolean()),
                telegramEnabled: t.Optional(t.Boolean()),
                telegramBotToken: t.Optional(t.Nullable(t.String())),
                subscriptionEndAt: t.Optional(t.Nullable(t.String())), // ISO date string or null
                planStatus: t.Optional(t.String()),
            }),
        }
    );
