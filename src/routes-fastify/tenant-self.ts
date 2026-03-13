import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, count, and, gte, lte, sql, desc, inArray, or } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { logAudit } from '../lib/audit';

// Schemas
const UpdateProfileBodySchema = Type.Object({
    name: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    website: Type.Optional(Type.String()),
    taxId: Type.Optional(Type.String()),
    logo: Type.Optional(Type.String()),
});

const UpdateSettingsBodySchema = Type.Object({
    currency: Type.Optional(Type.String()),
    timezone: Type.Optional(Type.String()),
    defaultTaxRate: Type.Optional(Type.Union([Type.Number(), Type.String()])),
    orderNumberPrefix: Type.Optional(Type.String()),
    invoiceNumberPrefix: Type.Optional(Type.String()),
    defaultPaymentTerms: Type.Optional(Type.Union([Type.Number(), Type.String()])),
    yandexGeocoderApiKey: Type.Optional(Type.String()),
    openWeatherApiKey: Type.Optional(Type.String()),
});

const UpdateTelegramBodySchema = Type.Object({
    botToken: Type.Optional(Type.String()),
    webhookSecret: Type.Optional(Type.String()),
});

const ValidateTelegramBodySchema = Type.Object({ botToken: Type.String() });

const SalesdocConnectionKeySchema = Type.String({ minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9_-]+$' });

const UpdateSalesdocBodySchema = Type.Object({
    connectionKey: Type.Optional(SalesdocConnectionKeySchema),
    connectionName: Type.Optional(Type.String()),
    enabled: Type.Optional(Type.Boolean()),
    portalUrl: Type.Optional(Type.String()),
    apiUrl: Type.Optional(Type.String()),
    filialId: Type.Optional(Type.String()),
    workspaceId: Type.Optional(Type.String()),
    login: Type.Optional(Type.String()),
    password: Type.Optional(Type.String()),
    webhookSecret: Type.Optional(Type.String()),
});

const ValidateSalesdocBodySchema = Type.Object({
    connectionKey: Type.Optional(SalesdocConnectionKeySchema),
    apiUrl: Type.String(),
    login: Type.String(),
    password: Type.String(),
});

const GetSalesdocQuerySchema = Type.Object({
    connectionKey: Type.Optional(SalesdocConnectionKeySchema),
});

const CreateSalesdocConnectionBodySchema = Type.Object({
    connectionName: Type.String({ minLength: 2, maxLength: 100 }),
});

const ImportSalesdocOrdersBodySchema = Type.Object({
    connectionKey: Type.Optional(SalesdocConnectionKeySchema),
    page: Type.Optional(Type.Number({ minimum: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    statuses: Type.Optional(Type.Array(Type.Number())),
    dryRun: Type.Optional(Type.Boolean()),
});

const UpdatePaymentSettingsBodySchema = Type.Object({
    paymentPortalEnabled: Type.Optional(Type.Boolean()),
    clickMerchantId: Type.Optional(Type.String()),
    clickServiceId: Type.Optional(Type.String()),
    clickSecretKey: Type.Optional(Type.String()),
    paymeMerchantId: Type.Optional(Type.String()),
    paymeSecretKey: Type.Optional(Type.String()),
});

const UpgradeRequestBodySchema = Type.Object({
    desiredPlan: Type.Optional(Type.Union([
        Type.Literal('starter'),
        Type.Literal('pro'),
        Type.Literal('enterprise'),
    ])),
    reason: Type.Optional(Type.String({ maxLength: 1000 })),
});
const TenantBackupBodySchema = Type.Object({
    format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
});
const TenantBackupScheduleBodySchema = Type.Object({
    frequency: Type.Optional(Type.Union([Type.Literal('never'), Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')])),
    format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
    scheduleTime: Type.Optional(Type.String({ pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' })),
    sendToTelegram: Type.Optional(Type.Boolean()),
    includeProducts: Type.Optional(Type.Boolean()),
    includeCustomers: Type.Optional(Type.Boolean()),
    includeOrders: Type.Optional(Type.Boolean()),
    includePayments: Type.Optional(Type.Boolean()),
    includeInventory: Type.Optional(Type.Boolean()),
    retentionDays: Type.Optional(Type.Number({ minimum: 1, maximum: 365 })),
});

const TenantBackupFilenameParamsSchema = Type.Object({
    filename: Type.String(),
});
const TenantBackupRestoreBodySchema = Type.Object({});

type UpdateProfileBody = Static<typeof UpdateProfileBodySchema>;
type UpdateSettingsBody = Static<typeof UpdateSettingsBodySchema>;
type UpdateTelegramBody = Static<typeof UpdateTelegramBodySchema>;
type ValidateTelegramBody = Static<typeof ValidateTelegramBodySchema>;
type UpdateSalesdocBody = Static<typeof UpdateSalesdocBodySchema>;
type ValidateSalesdocBody = Static<typeof ValidateSalesdocBodySchema>;
type GetSalesdocQuery = Static<typeof GetSalesdocQuerySchema>;
type CreateSalesdocConnectionBody = Static<typeof CreateSalesdocConnectionBodySchema>;
type ImportSalesdocOrdersBody = Static<typeof ImportSalesdocOrdersBodySchema>;
type UpdatePaymentSettingsBody = Static<typeof UpdatePaymentSettingsBodySchema>;
type UpgradeRequestBody = Static<typeof UpgradeRequestBodySchema>;
type TenantBackupBody = Static<typeof TenantBackupBodySchema>;
type TenantBackupScheduleBody = Static<typeof TenantBackupScheduleBodySchema>;
type TenantBackupFilenameParams = Static<typeof TenantBackupFilenameParamsSchema>;
type TenantBackupRestoreBody = Static<typeof TenantBackupRestoreBodySchema>;

const planRank: Record<string, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    enterprise: 3,
};

const nextPlan = (plan: string | null | undefined): 'starter' | 'pro' | 'enterprise' => {
    if (plan === 'free') return 'starter';
    if (plan === 'starter') return 'pro';
    return 'enterprise';
};

// Tenant admin check middleware
const requireTenantAdmin = async (request: any, reply: any) => {
    const user = request.user;
    if (!user || !['tenant_admin', 'super_admin'].includes(user.role)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant admin access required' } });
    }
};

export const tenantSelfRoutes: FastifyPluginAsync = async (fastify) => {
    // Get tenant profile
    fastify.get('/profile', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const { getTenantLimits } = await import('../lib/planLimits');
        const [tenant] = await db.select({
            id: schema.tenants.id, name: schema.tenants.name, subdomain: schema.tenants.subdomain, plan: schema.tenants.plan,
            planStatus: schema.tenants.planStatus, currency: schema.tenants.currency, timezone: schema.tenants.timezone,
            subscriptionEndAt: schema.tenants.subscriptionEndAt,
            address: schema.tenants.address, city: schema.tenants.city, country: schema.tenants.country,
            phone: schema.tenants.phone, email: schema.tenants.email, website: schema.tenants.website,
            taxId: schema.tenants.taxId, logo: schema.tenants.logo,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const telegram = await getTelegramIntegration(user.tenantId, false);

        const [userCount] = await db.select({ count: count() }).from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
        const [productCount] = await db.select({ count: count() }).from(schema.products).where(eq(schema.products.tenantId, user.tenantId));
        const limits = await getTenantLimits(user.tenantId);

        return {
            success: true, data: {
                ...tenant,
                telegramEnabled: telegram.enabled,
                usage: {
                    users: { current: userCount?.count || 0, max: limits.maxUsers },
                    products: { current: productCount?.count || 0, max: limits.maxProducts },
                }
            }
        };
    });

    // Update tenant profile
    fastify.put<{ Body: UpdateProfileBody }>('/profile', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpdateProfileBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const updates: any = { updatedAt: new Date() };

        if (body.name && body.name.length >= 2) updates.name = body.name;
        if (body.address !== undefined) updates.address = body.address;
        if (body.city !== undefined) updates.city = body.city;
        if (body.country !== undefined) updates.country = body.country;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.email !== undefined) updates.email = body.email;
        if (body.website !== undefined) updates.website = body.website;
        if (body.taxId !== undefined) updates.taxId = body.taxId;
        if (body.logo !== undefined) updates.logo = body.logo;

        const [updated] = await db.update(schema.tenants).set(updates).where(eq(schema.tenants.id, user.tenantId)).returning();
        return { success: true, data: updated };
    });

    // Get business settings
    fastify.get('/settings', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const { getOpenWeatherIntegration, getYandexMapsIntegration } = await import('../lib/tenant-integrations');
        const [tenant] = await db.select({
            currency: schema.tenants.currency, timezone: schema.tenants.timezone, defaultTaxRate: schema.tenants.defaultTaxRate,
            orderNumberPrefix: schema.tenants.orderNumberPrefix, invoiceNumberPrefix: schema.tenants.invoiceNumberPrefix,
            defaultPaymentTerms: schema.tenants.defaultPaymentTerms,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);
        const [openWeather, yandexMaps] = await Promise.all([
            getOpenWeatherIntegration(user.tenantId),
            getYandexMapsIntegration(user.tenantId),
        ]);

        return {
            success: true, data: {
                currency: tenant?.currency ?? 'UZS', timezone: tenant?.timezone ?? 'Asia/Tashkent',
                defaultTaxRate: parseFloat(String(tenant?.defaultTaxRate ?? '0')) || 0,
                orderNumberPrefix: tenant?.orderNumberPrefix ?? 'ORD-', invoiceNumberPrefix: tenant?.invoiceNumberPrefix ?? 'INV-',
                defaultPaymentTerms: tenant?.defaultPaymentTerms ?? 7,
                yandexGeocoderApiKey: yandexMaps.apiKey || '',
                openWeatherApiKey: openWeather.apiKey || '',
            }
        };
    });

    // Update business settings
    fastify.put<{ Body: UpdateSettingsBody }>('/settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpdateSettingsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const updates: any = { updatedAt: new Date() };
        const { setOpenWeatherIntegration, setYandexMapsIntegration } = await import('../lib/tenant-integrations');

        if (body.currency) updates.currency = body.currency;
        if (body.timezone) updates.timezone = body.timezone;
        if (body.defaultTaxRate !== undefined) updates.defaultTaxRate = String(body.defaultTaxRate);
        if (body.orderNumberPrefix !== undefined) updates.orderNumberPrefix = body.orderNumberPrefix;
        if (body.invoiceNumberPrefix !== undefined) updates.invoiceNumberPrefix = body.invoiceNumberPrefix;
        if (body.defaultPaymentTerms !== undefined) updates.defaultPaymentTerms = parseInt(String(body.defaultPaymentTerms)) || 7;
        if (body.yandexGeocoderApiKey !== undefined) updates.yandexGeocoderApiKey = body.yandexGeocoderApiKey;
        if (body.openWeatherApiKey !== undefined) updates.openWeatherApiKey = body.openWeatherApiKey;

        const [updated] = await db.update(schema.tenants).set(updates).where(eq(schema.tenants.id, user.tenantId)).returning();
        if (body.openWeatherApiKey !== undefined) {
            await setOpenWeatherIntegration(user.tenantId, body.openWeatherApiKey || '');
        }
        if (body.yandexGeocoderApiKey !== undefined) {
            await setYandexMapsIntegration(user.tenantId, body.yandexGeocoderApiKey || '');
        }
        return { success: true, data: updated };
    });

    // Get subscription info
    fastify.get('/subscription', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const { getTenantLimitsDetailed } = await import('../lib/planLimits');
        const { evaluateTenantAccess } = await import('../lib/tenant-access');
        const [tenant] = await db.select({
            plan: schema.tenants.plan,
            planStatus: schema.tenants.planStatus,
            subscriptionEndAt: schema.tenants.subscriptionEndAt,
            isActive: schema.tenants.isActive,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const telegram = await getTelegramIntegration(user.tenantId, false);

        const [userCount] = await db.select({ count: count() }).from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
        const [productCount] = await db.select({ count: count() }).from(schema.products).where(eq(schema.products.tenantId, user.tenantId));

        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const [orderCount] = await db.select({ count: count() }).from(schema.orders)
            .where(and(eq(schema.orders.tenantId, user.tenantId), gte(schema.orders.createdAt, startOfMonth), lte(schema.orders.createdAt, endOfMonth)));
        const limits = await getTenantLimitsDetailed(user.tenantId);
        const [latestUpgradeRequest] = await db.select({
            id: schema.auditLogs.id,
            details: schema.auditLogs.details,
            createdAt: schema.auditLogs.createdAt,
        })
            .from(schema.auditLogs)
            .where(and(
                eq(schema.auditLogs.tenantId, user.tenantId),
                eq(schema.auditLogs.action, 'subscription.upgrade_request')
            ))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(1);

        const usageUsers = Number(userCount?.count || 0);
        const usageProducts = Number(productCount?.count || 0);
        const usageOrders = Number(orderCount?.count || 0);
        const access = evaluateTenantAccess({
            isActive: tenant.isActive,
            planStatus: tenant.planStatus,
            subscriptionEndAt: tenant.subscriptionEndAt,
        });

        const now = Date.now();
        const endAtMs = tenant.subscriptionEndAt ? tenant.subscriptionEndAt.getTime() : null;
        const daysUntilExpiry = endAtMs ? Math.ceil((endAtMs - now) / (1000 * 60 * 60 * 24)) : null;
        const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

        const percent = (current: number, max: number) => Math.min(100, Math.round((current / Math.max(1, max)) * 100));
        const classify = (p: number) => (p >= 95 ? 'critical' : p >= 85 ? 'high' : p >= 70 ? 'warning' : 'ok');

        const usersPercent = percent(usageUsers, limits.effective.maxUsers);
        const productsPercent = percent(usageProducts, limits.effective.maxProducts);
        const ordersPercent = percent(usageOrders, limits.effective.maxOrdersPerMonth);

        let parsedUpgradeRequest: any = null;
        if (latestUpgradeRequest) {
            try {
                const d = latestUpgradeRequest.details ? JSON.parse(latestUpgradeRequest.details) : {};
                parsedUpgradeRequest = {
                    id: latestUpgradeRequest.id,
                    desiredPlan: d.desiredPlan || null,
                    reason: d.reason || null,
                    status: d.status || 'submitted',
                    submittedAt: latestUpgradeRequest.createdAt?.toISOString?.() || null,
                };
            } catch {
                parsedUpgradeRequest = {
                    id: latestUpgradeRequest.id,
                    desiredPlan: null,
                    reason: null,
                    status: 'submitted',
                    submittedAt: latestUpgradeRequest.createdAt?.toISOString?.() || null,
                };
            }
        }

        return {
            success: true, data: {
                plan: tenant.plan || 'free', planStatus: tenant.planStatus || 'active',
                subscriptionEndAt: tenant.subscriptionEndAt?.toISOString() || null,
                daysUntilExpiry,
                isExpiringSoon,
                access,
                usage: {
                    users: { current: usageUsers, max: limits.effective.maxUsers, percent: usersPercent, status: classify(usersPercent) },
                    products: { current: usageProducts, max: limits.effective.maxProducts, percent: productsPercent, status: classify(productsPercent) },
                    ordersThisMonth: { current: usageOrders, max: limits.effective.maxOrdersPerMonth, percent: ordersPercent, status: classify(ordersPercent) },
                },
                limits: {
                    source: limits.source,
                    planDefaults: limits.planDefaults,
                },
                latestUpgradeRequest: parsedUpgradeRequest,
            }
        };
    });

    // Submit upgrade request for super admin review
    fastify.post<{ Body: UpgradeRequestBody }>('/subscription/upgrade-request', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpgradeRequestBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({
            id: schema.tenants.id,
            plan: schema.tenants.plan,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        }

        const body = request.body || {};
        const currentPlan = tenant.plan || 'free';
        const desiredPlan = body.desiredPlan || nextPlan(currentPlan);

        if ((planRank[desiredPlan] ?? 0) <= (planRank[currentPlan] ?? 0)) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'INVALID_PLAN_TRANSITION',
                    message: 'Upgrade request must target a higher plan than current plan.',
                },
            });
        }

        const payload = {
            tenantId: user.tenantId,
            tenantPlan: currentPlan,
            desiredPlan,
            reason: body.reason?.trim() || null,
            status: 'submitted',
            requestedBy: {
                userId: user.id,
                name: user.name || null,
                email: user.email || null,
            },
        };

        const [requestRow] = await db.insert(schema.auditLogs).values({
            userId: user.id,
            tenantId: user.tenantId,
            action: 'subscription.upgrade_request',
            entityId: user.tenantId,
            entityType: 'tenant',
            details: JSON.stringify(payload),
            ipAddress: request.ip || null,
            userAgent: (request.headers['user-agent'] as string) || null,
        }).returning({
            id: schema.auditLogs.id,
            createdAt: schema.auditLogs.createdAt,
        });

        return {
            success: true,
            data: {
                requestId: requestRow?.id || null,
                submittedAt: requestRow?.createdAt?.toISOString?.() || new Date().toISOString(),
                desiredPlan,
            },
        };
    });

    // Get Telegram config
    fastify.get('/telegram', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const tenant = await getTelegramIntegration(user.tenantId, false);

        const [linkedCount] = await db.select({ count: count() }).from(schema.customers)
            .where(and(eq(schema.customers.tenantId, user.tenantId), sql`${schema.customers.telegramChatId} IS NOT NULL`));

        return {
            success: true, data: {
                telegramEnabled: tenant.enabled,
                hasBotToken: tenant.hasBotToken,
                hasWebhookSecret: tenant.webhookSecretConfigured,
                botUsername: tenant.botUsername || null,
                linkedCustomersCount: linkedCount?.count || 0,
            }
        };
    });

    // Update Telegram config
    fastify.put<{ Body: UpdateTelegramBody }>('/telegram', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpdateTelegramBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const { getTelegramIntegration, setTelegramIntegration } = await import('../lib/tenant-integrations');
        const current = await getTelegramIntegration(user.tenantId, true);
        let nextBotToken = current.botToken || null;
        let nextBotUsername = current.botUsername || null;
        let nextWebhookSecret = current.webhookSecret || null;
        let nextEnabled = current.enabled;

        if (body.botToken !== undefined && body.botToken !== '') {
            const { validateBotToken } = await import('../lib/telegram');
            const validation = await validateBotToken(body.botToken);
            if (!validation.valid) {
                return reply.code(400).send({ success: false, error: { code: 'INVALID_BOT_TOKEN', message: validation.error || 'Invalid bot token' } });
            }
            nextBotToken = body.botToken;
            nextBotUsername = validation.botInfo?.username || null;
            nextEnabled = true;
        } else if (body.botToken === '') {
            nextBotToken = null;
            nextBotUsername = null;
            nextEnabled = false;
        }

        if (body.webhookSecret !== undefined) nextWebhookSecret = body.webhookSecret || null;

        await setTelegramIntegration({
            tenantId: user.tenantId,
            enabled: nextEnabled,
            botToken: nextBotToken,
            botUsername: nextBotUsername,
            webhookSecret: nextWebhookSecret,
        });
        return { success: true, data: { updated: true } };
    });

    // Validate Telegram bot token
    fastify.post<{ Body: ValidateTelegramBody }>('/telegram/validate', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: ValidateTelegramBodySchema },
    }, async (request, reply) => {
        const { botToken } = request.body;
        if (!botToken) return reply.code(400).send({ success: false, error: { code: 'MISSING_TOKEN' } });

        const { validateBotToken } = await import('../lib/telegram');
        const result = await validateBotToken(botToken);

        return {
            success: result.valid, data: result.valid ? { botUsername: result.botInfo?.username, botName: result.botInfo?.first_name } : null,
            error: result.valid ? undefined : { message: result.error }
        };
    });

    // List Salesdoc connections
    fastify.get('/salesdoc/connections', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const { listSalesdocIntegrations } = await import('../lib/tenant-integrations');
        const connections = await listSalesdocIntegrations(user.tenantId, false);
        return {
            success: true,
            data: connections.map((item) => ({
                key: item.key,
                connectionName: item.connectionName,
                enabled: item.enabled,
                hasCredentials: item.hasCredentials,
                hasSessionAuth: item.hasSessionAuth,
                status: item.status,
                lastValidatedAt: item.lastValidatedAt?.toISOString?.() || null,
                lastError: item.lastError || null,
            })),
        };
    });

    // Create a new Salesdoc connection
    fastify.post<{ Body: CreateSalesdocConnectionBody }>('/salesdoc/connections', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: CreateSalesdocConnectionBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { connectionName } = request.body;
        const { createSalesdocIntegrationConnection } = await import('../lib/tenant-integrations');
        const created = await createSalesdocIntegrationConnection(user.tenantId, connectionName);
        return { success: true, data: created };
    });

    // Get Salesdoc integration config by connection
    fastify.get<{ Querystring: GetSalesdocQuery }>('/salesdoc', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { querystring: GetSalesdocQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { getSalesdocIntegration, normalizeSalesdocConnectionKey } = await import('../lib/tenant-integrations');
        const connectionKey = normalizeSalesdocConnectionKey(request.query?.connectionKey);
        const salesdoc = await getSalesdocIntegration(user.tenantId, false, connectionKey);

        return {
            success: true,
            data: {
                key: salesdoc.key,
                connectionName: salesdoc.connectionName,
                enabled: salesdoc.enabled,
                portalUrl: salesdoc.portalUrl || '',
                apiUrl: salesdoc.apiUrl || '',
                filialId: salesdoc.filialId || '',
                workspaceId: salesdoc.workspaceId || '',
                hasCredentials: salesdoc.hasCredentials,
                hasSessionAuth: salesdoc.hasSessionAuth,
                hasWebhookSecret: salesdoc.webhookSecretConfigured,
                status: salesdoc.status,
                lastValidatedAt: salesdoc.lastValidatedAt?.toISOString?.() || null,
                lastError: salesdoc.lastError || null,
            },
        };
    });

    // Update Salesdoc integration config
    fastify.put<{ Body: UpdateSalesdocBody }>('/salesdoc', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpdateSalesdocBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined;
        const { getSalesdocIntegration, normalizeSalesdocConnectionKey, setSalesdocIntegration } = await import('../lib/tenant-integrations');
        const { normalizeSalesdocApiUrl, normalizeSalesdocBaseUrl } = await import('../lib/salesdoc');
        const connectionKey = normalizeSalesdocConnectionKey(body.connectionKey);
        const current = await getSalesdocIntegration(user.tenantId, true, connectionKey);

        const portalUrlInput = body.portalUrl !== undefined ? body.portalUrl.trim() : (current.portalUrl || '');
        const apiUrlInput = body.apiUrl !== undefined ? body.apiUrl.trim() : (current.apiUrl || '');
        const nextPortalUrl = portalUrlInput ? normalizeSalesdocBaseUrl(portalUrlInput) : null;
        const nextApiUrl = apiUrlInput ? normalizeSalesdocApiUrl(apiUrlInput) : null;
        const nextFilialId = body.filialId !== undefined ? (body.filialId.trim() || null) : (current.filialId || null);
        const nextWorkspaceId = body.workspaceId !== undefined ? (body.workspaceId.trim() || null) : (current.workspaceId || null);
        const nextLogin = body.login !== undefined ? (body.login.trim() || null) : (current.login || null);
        const nextPassword = body.password !== undefined ? (body.password.trim() || null) : (current.password || null);
        const nextWebhookSecret = body.webhookSecret !== undefined ? (body.webhookSecret.trim() || null) : (current.webhookSecret || null);
        const enabledCandidate = body.enabled !== undefined ? body.enabled : current.enabled;
        const hasRequired = Boolean(nextApiUrl && nextLogin && nextPassword);
        const nextEnabled = Boolean(enabledCandidate && hasRequired);
        const currentApiUrl = current.apiUrl?.trim() || null;
        const currentLogin = current.login?.trim() || null;
        const currentPassword = current.password?.trim() || null;
        const authContextChanged = (
            nextApiUrl !== currentApiUrl
            || nextLogin !== currentLogin
            || nextPassword !== currentPassword
        );
        const nextUserId = hasRequired && !authContextChanged ? (current.userId || null) : null;
        const nextToken = hasRequired && !authContextChanged ? (current.token || null) : null;
        const status = !hasRequired
            ? 'unconfigured'
            : (nextUserId && nextToken && current.status === 'valid' ? 'valid' : 'invalid');
        const nextLastValidatedAt = status === 'valid' ? current.lastValidatedAt : null;

        await setSalesdocIntegration({
            tenantId: user.tenantId,
            connectionKey,
            connectionName: body.connectionName !== undefined ? body.connectionName : current.connectionName,
            enabled: nextEnabled,
            portalUrl: nextPortalUrl,
            apiUrl: nextApiUrl,
            filialId: nextFilialId,
            workspaceId: nextWorkspaceId,
            login: nextLogin,
            password: nextPassword,
            userId: nextUserId,
            token: nextToken,
            webhookSecret: nextWebhookSecret,
            status,
            lastError: status === 'valid' ? null : (authContextChanged ? null : current.lastError || null),
            lastValidatedAt: nextLastValidatedAt,
        });
        await logAudit(
            'integration.salesdoc.update',
            {
                connectionKey,
                enabled: nextEnabled,
                status,
                authContextChanged,
                hasCredentials: Boolean(nextLogin && nextPassword),
                hasSessionAuth: Boolean(nextUserId && nextToken),
            },
            user.id,
            user.tenantId,
            connectionKey,
            'salesdoc_connection',
            request.ip,
            userAgent,
        );

        return { success: true, data: { updated: true, enabled: nextEnabled } };
    });

    // Validate Salesdoc credentials
    fastify.post<{ Body: ValidateSalesdocBody }>('/salesdoc/validate', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: ValidateSalesdocBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined;
        const { getSalesdocIntegration, normalizeSalesdocConnectionKey, setSalesdocIntegration } = await import('../lib/tenant-integrations');
        const connectionKey = normalizeSalesdocConnectionKey(request.body.connectionKey);
        const current = await getSalesdocIntegration(user.tenantId, true, connectionKey);
        const { normalizeSalesdocApiUrl, validateSalesdocCredentials } = await import('../lib/salesdoc');
        const normalizedApiUrl = normalizeSalesdocApiUrl(request.body.apiUrl);
        const normalizedLogin = request.body.login.trim();
        const normalizedPassword = request.body.password.trim();

        const result = await validateSalesdocCredentials({
            apiUrl: normalizedApiUrl,
            login: normalizedLogin,
            password: normalizedPassword,
        });

        if (!result.valid) {
            await logAudit(
                'integration.salesdoc.validate.failed',
                { connectionKey, error: result.error || 'Salesdoc validation failed' },
                user.id,
                user.tenantId,
                connectionKey,
                'salesdoc_connection',
                request.ip,
                userAgent,
            );
            return reply.code(400).send({
                success: false,
                error: { code: 'SALESDOC_VALIDATION_FAILED', message: result.error || 'Salesdoc validation failed' },
            });
        }

        const hasRequired = Boolean(normalizedApiUrl && normalizedLogin && normalizedPassword);
        await setSalesdocIntegration({
            tenantId: user.tenantId,
            connectionKey,
            connectionName: current.connectionName,
            enabled: Boolean(current.enabled && hasRequired),
            portalUrl: current.portalUrl,
            apiUrl: normalizedApiUrl,
            filialId: current.filialId,
            workspaceId: current.workspaceId,
            login: normalizedLogin,
            password: normalizedPassword,
            userId: result.userId || null,
            token: result.token || null,
            webhookSecret: current.webhookSecret || null,
            status: 'valid',
            lastError: null,
            lastValidatedAt: new Date(),
        });
        await logAudit(
            'integration.salesdoc.validate',
            {
                connectionKey,
                enabled: Boolean(current.enabled && hasRequired),
                hasSessionAuth: Boolean(result.userId && result.token),
            },
            user.id,
            user.tenantId,
            connectionKey,
            'salesdoc_connection',
            request.ip,
            userAgent,
        );

        return { success: true, data: { valid: true } };
    });

    // Import orders from Salesdoc API
    fastify.post<{ Body: ImportSalesdocOrdersBody }>('/salesdoc/import-orders', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: ImportSalesdocOrdersBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined;
        const body = request.body || {};
        const page = body.page ?? 1;
        const limit = body.limit ?? 100;
        const statuses = Array.isArray(body.statuses) ? body.statuses : [];
        const dryRun = Boolean(body.dryRun);
        const { getSalesdocIntegration, normalizeSalesdocConnectionKey } = await import('../lib/tenant-integrations');
        const connectionKey = normalizeSalesdocConnectionKey(body.connectionKey);

        const salesdoc = await getSalesdocIntegration(user.tenantId, true, connectionKey);
        if (!salesdoc.enabled) {
            await logAudit(
                'integration.salesdoc.import.failed',
                { connectionKey, reason: 'disabled' },
                user.id,
                user.tenantId,
                connectionKey,
                'salesdoc_connection',
                request.ip,
                userAgent,
            );
            return reply.code(400).send({ success: false, error: { code: 'SALESDOC_DISABLED', message: 'Salesdoc integration is disabled' } });
        }
        if (!salesdoc.apiUrl || !salesdoc.userId || !salesdoc.token) {
            await logAudit(
                'integration.salesdoc.import.failed',
                { connectionKey, reason: 'not_configured' },
                user.id,
                user.tenantId,
                connectionKey,
                'salesdoc_connection',
                request.ip,
                userAgent,
            );
            return reply.code(400).send({ success: false, error: { code: 'SALESDOC_NOT_CONFIGURED', message: 'Validate Salesdoc credentials first' } });
        }

        const { salesdocApiRequest } = await import('../lib/salesdoc');
        const params: Record<string, unknown> = { page, limit };
        if (statuses.length > 0) {
            params.filter = { status: statuses };
        }

        const source = await salesdocApiRequest({
            apiUrl: salesdoc.apiUrl,
            auth: { userId: salesdoc.userId, token: salesdoc.token },
            filialId: salesdoc.filialId || 0,
            method: 'getOrder',
            params,
        });

        if (!source.ok) {
            await logAudit(
                'integration.salesdoc.import.failed',
                { connectionKey, reason: 'fetch_failed', error: source.error || 'Failed to fetch Salesdoc orders' },
                user.id,
                user.tenantId,
                connectionKey,
                'salesdoc_connection',
                request.ip,
                userAgent,
            );
            return reply.code(502).send({
                success: false,
                error: { code: 'SALESDOC_FETCH_FAILED', message: source.error || 'Failed to fetch Salesdoc orders' },
            });
        }

        const incomingOrders: any[] = Array.isArray(source.payload?.result?.order) ? source.payload.result.order : [];
        if (incomingOrders.length === 0) {
            return { success: true, data: { fetched: 0, created: 0, skipped: 0, failed: 0, dryRun } };
        }

        const customerCodes = Array.from(new Set(
            incomingOrders
                .map((order: any) => String(order?.client?.code_1C || '').trim())
                .filter((code: string) => code.length > 0),
        ));
        const customerNames = Array.from(new Set(
            incomingOrders
                .map((order: any) => String(order?.client?.clientName || order?.client?.clientLegalName || order?.client?.name || '').trim())
                .filter((name: string) => name.length > 0),
        ));
        const customerPhones = Array.from(new Set(
            incomingOrders
                .map((order: any) => String(order?.client?.phone || order?.client?.phoneNumber || order?.client?.tel || '').trim())
                .filter((phone: string) => phone.length > 0),
        ));
        const productCodes = Array.from(new Set(
            incomingOrders.flatMap((order: any) => Array.isArray(order?.orderProducts) ? order.orderProducts : [])
                .map((item: any) => String(item?.product?.code_1C || '').trim())
                .filter((code: string) => code.length > 0),
        ));

        const customerConditions: any[] = [];
        if (customerCodes.length > 0) customerConditions.push(inArray(schema.customers.code, customerCodes));
        if (customerNames.length > 0) customerConditions.push(inArray(schema.customers.name, customerNames));
        if (customerPhones.length > 0) customerConditions.push(inArray(schema.customers.phone, customerPhones));

        const customerRows = customerConditions.length > 0
            ? await db.select({ id: schema.customers.id, code: schema.customers.code, name: schema.customers.name, phone: schema.customers.phone })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.tenantId, user.tenantId),
                    or(...customerConditions),
                ))
            : [];

        const productRows = productCodes.length > 0
            ? await db.select({ id: schema.products.id, sku: schema.products.sku })
                .from(schema.products)
                .where(and(
                    eq(schema.products.tenantId, user.tenantId),
                    inArray(schema.products.sku, productCodes),
                ))
            : [];

        const customerByCode = new Map(customerRows.map((row) => [String(row.code || '').trim(), row]));
        const customerByName = new Map(customerRows.map((row) => [String(row.name || '').trim().toLowerCase(), row]));
        const normalizePhone = (raw: string): string => raw.replace(/[^\d+]/g, '');
        const customerByPhone = new Map(
            customerRows
                .map((row) => [normalizePhone(String(row.phone || '').trim()), row] as const)
                .filter(([phone]) => phone.length > 0),
        );
        const productBySku = new Map(productRows.map((row) => [String(row.sku || '').trim(), row]));

        const connectionOrderPrefix = connectionKey === 'default' ? 'SD' : `SD-${connectionKey.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)}`;
        const makeOrderNumber = (externalId: string): string => {
            const clean = externalId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 46);
            return `${connectionOrderPrefix}-${clean || 'UNKNOWN'}`;
        };

        const orderNumbers = Array.from(new Set(
            incomingOrders.map((order: any) => {
                const key = String(order?.code_1C || order?.SD_id || order?.CS_id || '').trim();
                return makeOrderNumber(key);
            }),
        ));

        const existingRows = orderNumbers.length > 0
            ? await db.select({ orderNumber: schema.orders.orderNumber })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.tenantId, user.tenantId),
                    inArray(schema.orders.orderNumber, orderNumbers),
                ))
            : [];
        const existingOrderNumbers = new Set(existingRows.map((row) => row.orderNumber));

        let created = 0;
        let skipped = 0;
        let failed = 0;
        const details: Array<{ sourceOrderId: string; action: string; reason?: string }> = [];
        const { ordersCommandService } = await import('../services/orders-command.service');

        for (const sourceOrder of incomingOrders) {
            const sourceOrderId = String(sourceOrder?.code_1C || sourceOrder?.SD_id || sourceOrder?.CS_id || '').trim();
            const orderNumber = makeOrderNumber(sourceOrderId);

            if (!sourceOrderId) {
                skipped += 1;
                details.push({ sourceOrderId: 'unknown', action: 'skipped', reason: 'missing source order identifier' });
                continue;
            }
            if (existingOrderNumbers.has(orderNumber)) {
                skipped += 1;
                details.push({ sourceOrderId, action: 'skipped', reason: 'already imported' });
                continue;
            }

            const customerCode = String(sourceOrder?.client?.code_1C || '').trim();
            const customerName = String(sourceOrder?.client?.clientName || sourceOrder?.client?.clientLegalName || sourceOrder?.client?.name || '').trim();
            const customerPhone = normalizePhone(String(sourceOrder?.client?.phone || sourceOrder?.client?.phoneNumber || sourceOrder?.client?.tel || '').trim());

            let customer = customerByCode.get(customerCode)
                || customerByPhone.get(customerPhone)
                || customerByName.get(customerName.toLowerCase());

            if (!customer) {
                if (!customerName) {
                    skipped += 1;
                    details.push({ sourceOrderId, action: 'skipped', reason: `customer not found by code '${customerCode || 'empty'}' and missing customer name for auto-create` });
                    continue;
                }

                try {
                    await db.execute(sql`
                        insert into customers
                        (tenant_id, name, code, contact_person, phone, address, notes, created_by_user_id, is_active, updated_at)
                        values
                        (
                            ${user.tenantId},
                            ${customerName},
                            ${customerCode || null},
                            ${String(sourceOrder?.client?.clientLegalName || '').trim() || null},
                            ${customerPhone || null},
                            ${String(sourceOrder?.client?.address || '').trim() || null},
                            ${`Auto-created from Salesdoc import (sourceOrderId=${sourceOrderId})`},
                            ${user.id},
                            true,
                            now()
                        )
                    `);
                    const [createdCustomer] = await db
                        .select({ id: schema.customers.id, code: schema.customers.code, name: schema.customers.name, phone: schema.customers.phone })
                        .from(schema.customers)
                        .where(and(
                            eq(schema.customers.tenantId, user.tenantId),
                            eq(schema.customers.name, customerName),
                            customerPhone ? eq(schema.customers.phone, customerPhone) : sql`true`,
                        ))
                        .orderBy(desc(schema.customers.createdAt))
                        .limit(1);
                    customer = createdCustomer;
                    if (!customer) {
                        throw new Error(`customer insert succeeded but lookup failed for '${customerName}'`);
                    }
                    if (customerCode) customerByCode.set(customerCode, customer);
                    if (customerName) customerByName.set(customerName.toLowerCase(), customer);
                    if (customerPhone) customerByPhone.set(customerPhone, customer);
                } catch (e: any) {
                    // Handle unique conflicts by re-resolving without relying only on code.
                    const [existingCustomer] = await db
                        .select({ id: schema.customers.id, code: schema.customers.code, name: schema.customers.name, phone: schema.customers.phone })
                        .from(schema.customers)
                        .where(and(
                            eq(schema.customers.tenantId, user.tenantId),
                            or(
                                customerCode ? eq(schema.customers.code, customerCode) : sql`false`,
                                customerPhone ? eq(schema.customers.phone, customerPhone) : sql`false`,
                                eq(schema.customers.name, customerName),
                            ),
                        ))
                        .limit(1);
                    if (!existingCustomer) {
                        skipped += 1;
                        details.push({ sourceOrderId, action: 'skipped', reason: `failed to auto-create customer '${customerName}': ${String(e?.message || e)}` });
                        continue;
                    }
                    customer = existingCustomer;
                    if (customerCode) customerByCode.set(customerCode, customer);
                    if (customerName) customerByName.set(customerName.toLowerCase(), customer);
                    if (customerPhone) customerByPhone.set(customerPhone, customer);
                }
            }

            const rawItems = Array.isArray(sourceOrder?.orderProducts) ? sourceOrder.orderProducts : [];
            const mappedItems: Array<{ productId: string; qtyOrdered: number; unitPrice: number; lineTotal: number }> = [];
            for (const sourceItem of rawItems) {
                const productCode = String(sourceItem?.product?.code_1C || '').trim();
                const localProduct = productBySku.get(productCode);
                const qty = Math.floor(Number(sourceItem?.quantity || 0));
                if (!localProduct || qty <= 0) continue;

                const unitPrice = Number(sourceItem?.price || 0);
                const lineTotal = Number(sourceItem?.summa ?? unitPrice * qty);
                mappedItems.push({
                    productId: localProduct.id,
                    qtyOrdered: qty,
                    unitPrice,
                    lineTotal,
                });
            }

            if (mappedItems.length === 0) {
                skipped += 1;
                details.push({ sourceOrderId, action: 'skipped', reason: 'no order items mapped by product code_1C -> product.sku' });
                continue;
            }

            const subtotalAmount = mappedItems.reduce((sum, item) => sum + item.lineTotal, 0);
            const totalAmount = Number(sourceOrder?.totalSummaAfterDiscount ?? sourceOrder?.totalSumma ?? subtotalAmount);
            const discountAmountRaw = sourceOrder?.discountSumma;
            const discountAmount = Number(discountAmountRaw ?? Math.max(0, subtotalAmount - totalAmount));
            const notes = [
                'Imported from Salesdoc',
                `sourceOrderId=${sourceOrderId}`,
                `sourceStatus=${String(sourceOrder?.status ?? '')}`,
            ].join('\n');

            if (dryRun) {
                created += 1;
                details.push({ sourceOrderId, action: 'would_create' });
                existingOrderNumbers.add(orderNumber);
                continue;
            }

            const createResult = await ordersCommandService.createOrder(user, {
                customerId: customer.id,
                subtotalAmount,
                discountAmount: Number.isFinite(discountAmount) ? discountAmount : 0,
                taxAmount: 0,
                totalAmount,
                notes,
                items: mappedItems.map((item) => ({
                    productId: item.productId,
                    qtyOrdered: item.qtyOrdered,
                })),
            }, {
                requestId: request.id,
                route: '/api/tenant/salesdoc/import-orders',
                actorIp: request.ip,
            });

            if (createResult.error || !createResult.data?.order?.id) {
                failed += 1;
                details.push({ sourceOrderId, action: 'failed', reason: createResult.error?.message || 'order create failed' });
                continue;
            }

            try {
                await db.update(schema.orders)
                    .set({ orderNumber, updatedAt: new Date() })
                    .where(eq(schema.orders.id, createResult.data.order.id));
                created += 1;
                existingOrderNumbers.add(orderNumber);
                details.push({ sourceOrderId, action: 'created' });
            } catch {
                failed += 1;
                details.push({ sourceOrderId, action: 'failed', reason: `failed to set orderNumber '${orderNumber}'` });
            }
        }

        const payload = {
            success: true,
            data: {
                fetched: incomingOrders.length,
                created,
                skipped,
                failed,
                dryRun,
                details,
            },
        };
        await logAudit(
            'integration.salesdoc.import',
            {
                connectionKey,
                fetched: payload.data.fetched,
                created: payload.data.created,
                skipped: payload.data.skipped,
                failed: payload.data.failed,
                dryRun: payload.data.dryRun,
            },
            user.id,
            user.tenantId,
            connectionKey,
            'salesdoc_connection',
            request.ip,
            userAgent,
        );
        return payload;
    });

    // Get payment settings
    fastify.get('/payment-settings', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({
            paymentPortalEnabled: schema.tenants.paymentPortalEnabled, clickMerchantId: schema.tenants.clickMerchantId,
            clickServiceId: schema.tenants.clickServiceId, clickSecretKey: schema.tenants.clickSecretKey,
            paymeMerchantId: schema.tenants.paymeMerchantId, paymeSecretKey: schema.tenants.paymeSecretKey,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const { getTelegramIntegration } = await import('../lib/tenant-integrations');
        const telegram = await getTelegramIntegration(user.tenantId, false);

        return {
            success: true, data: {
                paymentPortalEnabled: tenant.paymentPortalEnabled || false, clickMerchantId: tenant.clickMerchantId || '',
                clickServiceId: tenant.clickServiceId || '', clickSecretKey: tenant.clickSecretKey || '',
                paymeMerchantId: tenant.paymeMerchantId || '', paymeSecretKey: tenant.paymeSecretKey || '',
            }
        };
    });

    // Update payment settings
    fastify.put<{ Body: UpdatePaymentSettingsBody }>('/payment-settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: UpdatePaymentSettingsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const updates: any = { updatedAt: new Date() };

        if (body.paymentPortalEnabled !== undefined) updates.paymentPortalEnabled = body.paymentPortalEnabled;
        if (body.clickMerchantId !== undefined) updates.clickMerchantId = body.clickMerchantId;
        if (body.clickServiceId !== undefined) updates.clickServiceId = body.clickServiceId;
        if (body.clickSecretKey !== undefined) updates.clickSecretKey = body.clickSecretKey;
        if (body.paymeMerchantId !== undefined) updates.paymeMerchantId = body.paymeMerchantId;
        if (body.paymeSecretKey !== undefined) updates.paymeSecretKey = body.paymeSecretKey;

        const [updated] = await db.update(schema.tenants).set(updates).where(eq(schema.tenants.id, user.tenantId)).returning();
        return { success: true, data: updated };
    });

    // ========== DATA EXPORT/IMPORT ==========
    fastify.get('/backup-settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
        }
        const { getExportSettings, getTenantScheduledBackupFormat } = await import('../lib/tenant-export');
        const settings = await getExportSettings(user.tenantId);
        const scheduledBackupFormat = await getTenantScheduledBackupFormat(user.tenantId);
        return { success: true, data: { ...settings, format: scheduledBackupFormat } };
    });

    fastify.put<{ Body: TenantBackupScheduleBody }>('/backup-settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: TenantBackupScheduleBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
        }
        const { updateExportSettings, getTenantScheduledBackupFormat } = await import('../lib/tenant-export');
        const updated = await updateExportSettings(user.tenantId, {
            ...request.body,
            // tenant_export_settings.format only supports json/csv/xlsx; scheduled backups use tenant setting below.
            format: 'json',
            scheduledBackupFormat: request.body.format,
        });
        const scheduledBackupFormat = await getTenantScheduledBackupFormat(user.tenantId);

        await logAudit(
            'backup.tenant_schedule.update',
            {
                tenantId: user.tenantId,
                updates: request.body,
            },
            user.id,
            user.tenantId,
            user.tenantId,
            'tenant_export_settings',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        return { success: true, data: { ...updated, format: scheduledBackupFormat } };
    });

    fastify.post<{ Body: TenantBackupBody }>('/backup-file', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { body: TenantBackupBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
        }
        const { createTenantScopedBackup } = await import('../lib/backup');
        const result = await createTenantScopedBackup(user.tenantId, request.body.format || 'json');

        await logAudit(
            result.success ? 'backup.tenant_self_create' : 'backup.tenant_self_create.failed',
            {
                tenantId: user.tenantId,
                format: request.body.format || 'json',
                filename: result.filename || null,
                error: result.error || null,
            },
            user.id,
            user.tenantId,
            result.filename || undefined,
            'tenant_backup_file',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!result.success) {
            const status = result.code === 'BACKUP_IN_PROGRESS' ? 409 : 400;
            return reply.code(status).send({ success: false, error: { message: result.error } });
        }
        return { success: true, data: { filename: result.filename } };
    });

    fastify.get('/backup-files', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
        }
        const { listTenantScopedBackups } = await import('../lib/backup');
        const list = await listTenantScopedBackups(user.tenantId);
        return { success: true, data: list };
    });

    fastify.get<{ Params: TenantBackupFilenameParams }>('/backup-files/:filename/download', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: { params: TenantBackupFilenameParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
        }
        const { filename } = request.params;
        if (!filename.startsWith(`tenant-${user.tenantId}-`)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied for backup file' } });
        }

        const { getBackupPath } = await import('../lib/backup');
        const filePath = getBackupPath(filename);

        try {
            const fileStats = await stat(filePath);
            const stream = createReadStream(filePath);
            return reply
                .header('Content-Type', 'application/octet-stream')
                .header('Content-Length', fileStats.size.toString())
                .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
                .send(stream);
        } catch {
            return reply.code(404).send({ success: false, error: { code: 'FILE_NOT_FOUND' } });
        }
    });

    fastify.post<{ Params: TenantBackupFilenameParams; Body: TenantBackupRestoreBody }>('/backup-files/:filename/restore', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
        schema: {
            params: TenantBackupFilenameParamsSchema,
            body: TenantBackupRestoreBodySchema,
        },
    }, async (request, reply) => {
        try {
            const user = request.user!;
            // Preserve the currently authenticated tenant admin account through restore.
            const [restoreInitiator] = await db.select({
                id: schema.users.id,
                tenantId: schema.users.tenantId,
                role: schema.users.role,
                name: schema.users.name,
                email: schema.users.email,
                passwordHash: schema.users.passwordHash,
                phone: schema.users.phone,
                isActive: schema.users.isActive,
            }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
            if (!user.tenantId) {
                return reply.code(400).send({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context is required' } });
            }
            const { filename } = request.params;
            if (!filename.startsWith(`tenant-${user.tenantId}-`)) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied for backup file' } });
            }

            const { readTenantScopedBackupFile } = await import('../lib/backup');
            const loaded = await readTenantScopedBackupFile(filename, user.tenantId);
            if (!loaded.success) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'TENANT_BACKUP_INVALID', message: loaded.error },
                });
            }
            const content = loaded.content;

            const { restoreTenantDataReplace } = await import('../lib/tenant-export');
            const { withBackupOperationLock } = await import('../lib/backup');
            const locked = await withBackupOperationLock(() => restoreTenantDataReplace(user.tenantId, content));
            if (!locked.success) {
                const status = locked.code === 'BACKUP_IN_PROGRESS' ? 409 : 400;
                await logAudit(
                    'backup.tenant_self_restore.failed',
                    {
                        tenantId: user.tenantId,
                        sourceFilename: filename,
                        restoreMode: 'replace',
                        error: locked.error,
                    },
                    user.id,
                    user.tenantId,
                    filename,
                    'tenant_backup_file',
                    request.ip || undefined,
                    (request.headers['user-agent'] as string) || undefined,
                );
                return reply.code(status).send({
                    success: false,
                    error: { code: 'TENANT_BACKUP_RESTORE_FAILED', message: locked.error },
                });
            }
            const result = locked.data;

            if (!result.success) {
                await logAudit(
                    'backup.tenant_self_restore.failed',
                    {
                        tenantId: user.tenantId,
                        sourceFilename: filename,
                        restoreMode: 'replace',
                        imported: result.imported,
                        errors: result.errors,
                    },
                    user.id,
                    user.tenantId,
                    filename,
                    'tenant_backup_file',
                    request.ip || undefined,
                    (request.headers['user-agent'] as string) || undefined,
                );
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'TENANT_BACKUP_RESTORE_FAILED',
                        message: result.errors?.[0] || 'Tenant backup restore failed',
                    },
                    data: {
                        imported: result.imported,
                        errors: result.errors.length > 0 ? result.errors : undefined,
                        restoreMode: 'replace',
                        sourceFilename: filename,
                    },
                });
            }

            if (restoreInitiator) {
                const restoreInitiatorTenantId = restoreInitiator.tenantId || user.tenantId;
                if (!restoreInitiatorTenantId) {
                    throw new Error('Restore initiator tenant context is missing');
                }
                const [existingInitiatorById] = await db.select({ id: schema.users.id })
                    .from(schema.users)
                    .where(eq(schema.users.id, restoreInitiator.id))
                    .limit(1);

                if (existingInitiatorById) {
                    await db.update(schema.users).set({
                        tenantId: restoreInitiatorTenantId,
                        role: restoreInitiator.role,
                        name: restoreInitiator.name,
                        email: restoreInitiator.email,
                        passwordHash: restoreInitiator.passwordHash,
                        phone: restoreInitiator.phone,
                        isActive: restoreInitiator.isActive ?? true,
                        updatedAt: new Date(),
                    }).where(eq(schema.users.id, restoreInitiator.id));
                } else {
                    const [existingInitiatorByEmail] = await db.select({ id: schema.users.id })
                        .from(schema.users)
                        .where(and(
                            eq(schema.users.tenantId, restoreInitiatorTenantId),
                            sql`lower(${schema.users.email}) = lower(${restoreInitiator.email})`,
                        ))
                        .limit(1);

                    if (existingInitiatorByEmail) {
                        await db.update(schema.users).set({
                            role: restoreInitiator.role,
                            name: restoreInitiator.name,
                            passwordHash: restoreInitiator.passwordHash,
                            phone: restoreInitiator.phone,
                            isActive: restoreInitiator.isActive ?? true,
                            updatedAt: new Date(),
                        }).where(eq(schema.users.id, existingInitiatorByEmail.id));
                    } else {
                        await db.insert(schema.users).values({
                            id: restoreInitiator.id,
                            tenantId: restoreInitiatorTenantId,
                            role: restoreInitiator.role,
                            name: restoreInitiator.name,
                            email: restoreInitiator.email,
                            passwordHash: restoreInitiator.passwordHash,
                            phone: restoreInitiator.phone,
                            isActive: restoreInitiator.isActive ?? true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }
                }
            }

            await logAudit(
                'backup.tenant_self_restore',
                {
                    tenantId: user.tenantId,
                    sourceFilename: filename,
                    restoreMode: 'replace',
                    imported: result.imported,
                    errorCount: result.errors.length,
                },
                user.id,
                user.tenantId,
                filename,
                'tenant_backup_file',
                request.ip || undefined,
                (request.headers['user-agent'] as string) || undefined,
            );

            return {
                success: result.success,
                data: {
                    imported: result.imported,
                    errors: result.errors.length > 0 ? result.errors : undefined,
                    restoreMode: 'replace',
                    sourceFilename: filename,
                },
            };
        } catch (err: any) {
            return reply.code(500).send({
                success: false,
                error: {
                    code: 'TENANT_BACKUP_RESTORE_FAILED',
                    message: err?.message || 'Tenant backup restore failed',
                },
            });
        }
    });

};

