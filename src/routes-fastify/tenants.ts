import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, sql, desc, and } from 'drizzle-orm';
import { logAudit } from '../lib/audit';

// Schemas
const ListTenantsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    plan: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
});

const TenantIdParamsSchema = Type.Object({ id: Type.String() });
const PlanSchema = Type.Union([
    Type.Literal('free'),
    Type.Literal('starter'),
    Type.Literal('pro'),
    Type.Literal('enterprise'),
]);
const PlanStatusSchema = Type.Union([
    Type.Literal('active'),
    Type.Literal('trial'),
    Type.Literal('past_due'),
    Type.Literal('cancelled'),
]);
const SubscriptionEndAtSchema = Type.Union([
    Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    Type.Null(),
]);

const CreateTenantBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    subdomain: Type.String({ minLength: 3, maxLength: 50 }),
    plan: Type.Optional(PlanSchema),
    maxUsers: Type.Optional(Type.Number({ minimum: 1 })),
    maxProducts: Type.Optional(Type.Number({ minimum: 1 })),
    maxOrdersPerMonth: Type.Optional(Type.Number({ minimum: 1 })),
    currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
    timezone: Type.Optional(Type.String()),
    defaultTaxRate: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    isActive: Type.Optional(Type.Boolean()),
    telegramEnabled: Type.Optional(Type.Boolean()),
    telegramBotToken: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    subscriptionEndAt: Type.Optional(SubscriptionEndAtSchema),
    planStatus: Type.Optional(PlanStatusSchema),
});

const UpdateTenantBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    subdomain: Type.Optional(Type.String({ minLength: 3, maxLength: 50 })),
    plan: Type.Optional(PlanSchema),
    maxUsers: Type.Optional(Type.Number({ minimum: 1 })),
    maxProducts: Type.Optional(Type.Number({ minimum: 1 })),
    maxOrdersPerMonth: Type.Optional(Type.Number({ minimum: 1 })),
    currency: Type.Optional(Type.String()),
    timezone: Type.Optional(Type.String()),
    defaultTaxRate: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    isActive: Type.Optional(Type.Boolean()),
    telegramEnabled: Type.Optional(Type.Boolean()),
    telegramBotToken: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    subscriptionEndAt: Type.Optional(SubscriptionEndAtSchema),
    planStatus: Type.Optional(PlanStatusSchema),
});

type ListTenantsQuery = Static<typeof ListTenantsQuerySchema>;
type CreateTenantBody = Static<typeof CreateTenantBodySchema>;
type UpdateTenantBody = Static<typeof UpdateTenantBodySchema>;

// Super admin check middleware
const requireSuperAdmin = async (request: any, reply: any) => {
    const user = request.user;
    if (!user || user.role !== 'super_admin') {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
    }
};

export const tenantRoutes: FastifyPluginAsync = async (fastify) => {
    // List tenants
    fastify.get<{ Querystring: ListTenantsQuery }>('/', {
        preHandler: [fastify.authenticate, requireSuperAdmin],
        schema: { querystring: ListTenantsQuerySchema },
    }, async (request, reply) => {
        const { page: pageStr = '1', limit: limitStr = '20', search, plan, isActive } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [];
        if (search) conditions.push(sql`(${schema.tenants.name} ILIKE ${`%${search}%`} OR ${schema.tenants.subdomain} ILIKE ${`%${search}%`})`);
        if (plan) conditions.push(eq(schema.tenants.plan, plan as any));
        if (isActive !== undefined) conditions.push(eq(schema.tenants.isActive, isActive === 'true'));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const tenants = await db.select({
            id: schema.tenants.id, name: schema.tenants.name, subdomain: schema.tenants.subdomain, plan: schema.tenants.plan,
            maxUsers: schema.tenants.maxUsers, maxProducts: schema.tenants.maxProducts, currency: schema.tenants.currency,
            timezone: schema.tenants.timezone, isActive: schema.tenants.isActive, defaultTaxRate: schema.tenants.defaultTaxRate,
            telegramEnabled: schema.tenants.telegramEnabled,
            hasTelegramBotToken: sql<boolean>`false`,
            subscriptionEndAt: schema.tenants.subscriptionEndAt, planStatus: schema.tenants.planStatus, createdAt: schema.tenants.createdAt,
        }).from(schema.tenants).where(whereClause).orderBy(desc(schema.tenants.createdAt)).limit(limit).offset(offset);

        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const tenantsWithIntegration = await Promise.all(
            tenants.map(async (tenant) => {
                const telegram = await getTelegramIntegration(tenant.id, false);
                return {
                    ...tenant,
                    telegramEnabled: telegram.enabled,
                    hasTelegramBotToken: telegram.hasBotToken,
                };
            })
        );

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.tenants).where(whereClause);
        return { success: true, data: tenantsWithIntegration, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create tenant
    fastify.post<{ Body: CreateTenantBody }>('/', {
        preHandler: [fastify.authenticate, requireSuperAdmin],
        schema: { body: CreateTenantBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        let validatedBotUsername: string | null = null;
        if (body.telegramBotToken && body.telegramBotToken.trim() !== '') {
            const { validateBotToken } = await import('../lib/telegram');
            const validation = await validateBotToken(body.telegramBotToken);
            if (!validation.valid) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'INVALID_BOT_TOKEN', message: validation.error || 'Invalid Telegram bot token' }
                });
            }
            validatedBotUsername = validation.botInfo?.username || null;
        }

        const [existing] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
            .where(eq(schema.tenants.subdomain, body.subdomain.toLowerCase())).limit(1);
        if (existing) return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Subdomain already exists' } });

        const { getPlanLimits, ensurePlanLimitsLoaded } = await import('../lib/planLimits');
        const { getDefaultTenantSettings } = await import('../lib/systemSettings');
        await ensurePlanLimitsLoaded();
        const limits = getPlanLimits(body.plan || 'starter');
        const defaults = getDefaultTenantSettings();

        const [newTenant] = await db.insert(schema.tenants).values({
            name: body.name, subdomain: body.subdomain.toLowerCase(), plan: (body.plan || 'starter') as any,
            maxUsers: limits.maxUsers, maxProducts: limits.maxProducts, maxOrdersPerMonth: limits.maxOrdersPerMonth,
            currency: body.currency || defaults.defaultCurrency, timezone: body.timezone || defaults.defaultTimezone,
            defaultTaxRate: body.defaultTaxRate?.toString() || defaults.defaultTaxRate.toString(),
            isActive: body.isActive ?? true, telegramEnabled: body.telegramEnabled ?? false, telegramBotToken: null,
            subscriptionEndAt: body.subscriptionEndAt ? new Date(body.subscriptionEndAt) : null, planStatus: (body.planStatus || 'active') as any,
        }).returning();

        if (body.telegramBotToken !== undefined) {
            const { setTelegramIntegration } = await import('../lib/tenant-integrations');
            await setTelegramIntegration({
                tenantId: newTenant.id,
                enabled: Boolean(body.telegramEnabled && body.telegramBotToken),
                botToken: body.telegramBotToken || null,
                botUsername: validatedBotUsername,
                webhookSecret: null,
            });
        }

        await logAudit('tenant.create', { name: newTenant.name, subdomain: newTenant.subdomain, plan: newTenant.plan },
            user.id, null, newTenant.id, 'tenant', '::1', 'SuperAdmin Console');

        try {
            const { notifyNewTenant } = await import('../lib/telegram');
            notifyNewTenant({ name: newTenant.name, subdomain: newTenant.subdomain, plan: newTenant.plan || 'free' });
        } catch (e) { console.error('Telegram notification error:', e); }

        return { success: true, data: newTenant };
    });

    // Get tenant by ID
    fastify.get<{ Params: Static<typeof TenantIdParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate, requireSuperAdmin],
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { id } = request.params;

        const [tenant] = await db.select({
            id: schema.tenants.id,
            name: schema.tenants.name,
            subdomain: schema.tenants.subdomain,
            plan: schema.tenants.plan,
            maxUsers: schema.tenants.maxUsers,
            maxProducts: schema.tenants.maxProducts,
            maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
            currency: schema.tenants.currency,
            timezone: schema.tenants.timezone,
            defaultTaxRate: schema.tenants.defaultTaxRate,
            isActive: schema.tenants.isActive,
            telegramEnabled: schema.tenants.telegramEnabled,
            hasTelegramBotToken: sql<boolean>`false`,
            subscriptionEndAt: schema.tenants.subscriptionEndAt,
            planStatus: schema.tenants.planStatus,
            createdAt: schema.tenants.createdAt,
            updatedAt: schema.tenants.updatedAt,
        }).from(schema.tenants).where(eq(schema.tenants.id, id)).limit(1);
        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const telegram = await getTelegramIntegration(id, false);

        const [{ userCount }] = await db.select({ userCount: sql<number>`count(*)` })
            .from(schema.users).where(eq(schema.users.tenantId, id));
        const [{ productCount }] = await db.select({ productCount: sql<number>`count(*)` })
            .from(schema.products).where(eq(schema.products.tenantId, id));

        return {
            success: true,
            data: {
                ...tenant,
                telegramEnabled: telegram.enabled,
                hasTelegramBotToken: telegram.hasBotToken,
                stats: { userCount: Number(userCount), productCount: Number(productCount) }
            }
        };
    });

    // Update tenant
    fastify.patch<{ Params: Static<typeof TenantIdParamsSchema>; Body: UpdateTenantBody }>('/:id', {
        preHandler: [fastify.authenticate, requireSuperAdmin],
        schema: { params: TenantIdParamsSchema, body: UpdateTenantBodySchema },
    }, async (request, reply) => {
        const { id } = request.params;
        const [existingTenant] = await db.select({
            id: schema.tenants.id,
            telegramEnabled: schema.tenants.telegramEnabled,
        }).from(schema.tenants).where(eq(schema.tenants.id, id)).limit(1);
        if (!existingTenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const body = request.body;

        const updateData: any = { ...body, updatedAt: new Date() };
        let validatedBotUsername: string | null = null;
        let botTokenProvided = false;
        if (body.telegramBotToken !== undefined) {
            botTokenProvided = true;
            if (body.telegramBotToken && body.telegramBotToken.trim() !== '') {
                const { validateBotToken } = await import('../lib/telegram');
                const validation = await validateBotToken(body.telegramBotToken);
                if (!validation.valid) {
                    return reply.code(400).send({
                        success: false,
                        error: { code: 'INVALID_BOT_TOKEN', message: validation.error || 'Invalid Telegram bot token' }
                    });
                }
                validatedBotUsername = validation.botInfo?.username || null;
            }
            delete updateData.telegramBotToken;
        }

        if (body.subdomain) {
            const [existing] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
                .where(and(eq(schema.tenants.subdomain, body.subdomain.toLowerCase()), sql`${schema.tenants.id} != ${id}`)).limit(1);
            if (existing) return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Subdomain already exists' } });
            updateData.subdomain = body.subdomain.toLowerCase();
        }

        if (body.defaultTaxRate !== undefined) updateData.defaultTaxRate = body.defaultTaxRate.toString();

        if (body.plan) {
            const { getPlanLimits, ensurePlanLimitsLoaded } = await import('../lib/planLimits');
            await ensurePlanLimitsLoaded();
            const limits = getPlanLimits(body.plan);
            if (body.maxUsers === undefined) updateData.maxUsers = limits.maxUsers;
            if (body.maxProducts === undefined) updateData.maxProducts = limits.maxProducts;
            if (body.maxOrdersPerMonth === undefined) updateData.maxOrdersPerMonth = limits.maxOrdersPerMonth;
        }

        if (body.subscriptionEndAt === null) updateData.subscriptionEndAt = null;
        else if (body.subscriptionEndAt) updateData.subscriptionEndAt = new Date(body.subscriptionEndAt);

        const [updated] = await db.update(schema.tenants).set(updateData).where(eq(schema.tenants.id, id)).returning();
        if (!updated) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        if (botTokenProvided || body.telegramEnabled !== undefined) {
            const { getTelegramIntegration, setTelegramIntegration } = await import('../lib/tenant-integrations');
            const currentIntegration = await getTelegramIntegration(id, true);
            const nextEnabled = body.telegramEnabled !== undefined ? body.telegramEnabled : currentIntegration.enabled;
            const cleared = botTokenProvided && !body.telegramBotToken;
            const nextBotToken = botTokenProvided
                ? (body.telegramBotToken || null)
                : (currentIntegration.botToken || null);
            const nextBotUsername = cleared
                ? null
                : botTokenProvided
                    ? validatedBotUsername
                    : (currentIntegration.botUsername || null);
            const nextWebhookSecret = cleared ? null : (currentIntegration.webhookSecret || null);

            await setTelegramIntegration({
                tenantId: id,
                enabled: Boolean(nextEnabled && nextBotToken),
                botToken: nextBotToken,
                botUsername: nextBotUsername,
                webhookSecret: nextWebhookSecret,
            });
        }

        return { success: true, data: updated };
    });
};
