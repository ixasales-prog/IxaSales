import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, count, and, gte, lte, sql } from 'drizzle-orm';

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

const UpdatePaymentSettingsBodySchema = Type.Object({
    paymentPortalEnabled: Type.Optional(Type.Boolean()),
    clickMerchantId: Type.Optional(Type.String()),
    clickServiceId: Type.Optional(Type.String()),
    clickSecretKey: Type.Optional(Type.String()),
    paymeMerchantId: Type.Optional(Type.String()),
    paymeSecretKey: Type.Optional(Type.String()),
});

type UpdateProfileBody = Static<typeof UpdateProfileBodySchema>;
type UpdateSettingsBody = Static<typeof UpdateSettingsBodySchema>;
type UpdateTelegramBody = Static<typeof UpdateTelegramBodySchema>;
type ValidateTelegramBody = Static<typeof ValidateTelegramBodySchema>;
type UpdatePaymentSettingsBody = Static<typeof UpdatePaymentSettingsBodySchema>;

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
        const [tenant] = await db.select({
            id: schema.tenants.id, name: schema.tenants.name, subdomain: schema.tenants.subdomain, plan: schema.tenants.plan,
            planStatus: schema.tenants.planStatus, currency: schema.tenants.currency, timezone: schema.tenants.timezone,
            telegramEnabled: schema.tenants.telegramEnabled, subscriptionEndAt: schema.tenants.subscriptionEndAt,
            maxUsers: schema.tenants.maxUsers, maxProducts: schema.tenants.maxProducts, maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
            address: schema.tenants.address, city: schema.tenants.city, country: schema.tenants.country,
            phone: schema.tenants.phone, email: schema.tenants.email, website: schema.tenants.website,
            taxId: schema.tenants.taxId, logo: schema.tenants.logo,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const [userCount] = await db.select({ count: count() }).from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
        const [productCount] = await db.select({ count: count() }).from(schema.products).where(eq(schema.products.tenantId, user.tenantId));

        return {
            success: true, data: {
                ...tenant, usage: {
                    users: { current: userCount?.count || 0, max: tenant.maxUsers || 5 },
                    products: { current: productCount?.count || 0, max: tenant.maxProducts || 100 },
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
        const [tenant] = await db.select({
            currency: schema.tenants.currency, timezone: schema.tenants.timezone, defaultTaxRate: schema.tenants.defaultTaxRate,
            orderNumberPrefix: schema.tenants.orderNumberPrefix, invoiceNumberPrefix: schema.tenants.invoiceNumberPrefix,
            defaultPaymentTerms: schema.tenants.defaultPaymentTerms, yandexGeocoderApiKey: schema.tenants.yandexGeocoderApiKey,
            openWeatherApiKey: schema.tenants.openWeatherApiKey,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        return {
            success: true, data: {
                currency: tenant?.currency ?? 'UZS', timezone: tenant?.timezone ?? 'Asia/Tashkent',
                defaultTaxRate: parseFloat(String(tenant?.defaultTaxRate ?? '0')) || 0,
                orderNumberPrefix: tenant?.orderNumberPrefix ?? 'ORD-', invoiceNumberPrefix: tenant?.invoiceNumberPrefix ?? 'INV-',
                defaultPaymentTerms: tenant?.defaultPaymentTerms ?? 7, yandexGeocoderApiKey: tenant?.yandexGeocoderApiKey ?? '',
                openWeatherApiKey: tenant?.openWeatherApiKey ?? '',
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

        if (body.currency) updates.currency = body.currency;
        if (body.timezone) updates.timezone = body.timezone;
        if (body.defaultTaxRate !== undefined) updates.defaultTaxRate = String(body.defaultTaxRate);
        if (body.orderNumberPrefix !== undefined) updates.orderNumberPrefix = body.orderNumberPrefix;
        if (body.invoiceNumberPrefix !== undefined) updates.invoiceNumberPrefix = body.invoiceNumberPrefix;
        if (body.defaultPaymentTerms !== undefined) updates.defaultPaymentTerms = parseInt(String(body.defaultPaymentTerms)) || 7;
        if (body.yandexGeocoderApiKey !== undefined) updates.yandexGeocoderApiKey = body.yandexGeocoderApiKey;
        if (body.openWeatherApiKey !== undefined) updates.openWeatherApiKey = body.openWeatherApiKey;

        const [updated] = await db.update(schema.tenants).set(updates).where(eq(schema.tenants.id, user.tenantId)).returning();
        return { success: true, data: updated };
    });

    // Get subscription info
    fastify.get('/subscription', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({
            plan: schema.tenants.plan, planStatus: schema.tenants.planStatus, subscriptionEndAt: schema.tenants.subscriptionEndAt,
            maxUsers: schema.tenants.maxUsers, maxProducts: schema.tenants.maxProducts, maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const [userCount] = await db.select({ count: count() }).from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
        const [productCount] = await db.select({ count: count() }).from(schema.products).where(eq(schema.products.tenantId, user.tenantId));

        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const [orderCount] = await db.select({ count: count() }).from(schema.orders)
            .where(and(eq(schema.orders.tenantId, user.tenantId), gte(schema.orders.createdAt, startOfMonth), lte(schema.orders.createdAt, endOfMonth)));

        return {
            success: true, data: {
                plan: tenant.plan || 'free', planStatus: tenant.planStatus || 'active',
                subscriptionEndAt: tenant.subscriptionEndAt?.toISOString() || null,
                usage: {
                    users: { current: userCount?.count || 0, max: tenant.maxUsers || 5 },
                    products: { current: productCount?.count || 0, max: tenant.maxProducts || 100 },
                    ordersThisMonth: { current: orderCount?.count || 0, max: tenant.maxOrdersPerMonth || 500 },
                }
            }
        };
    });

    // Get Telegram config
    fastify.get('/telegram', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({
            telegramEnabled: schema.tenants.telegramEnabled, telegramBotToken: schema.tenants.telegramBotToken,
            telegramWebhookSecret: schema.tenants.telegramWebhookSecret,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        const [linkedCount] = await db.select({ count: count() }).from(schema.customers)
            .where(and(eq(schema.customers.tenantId, user.tenantId), sql`${schema.customers.telegramChatId} IS NOT NULL`));

        return {
            success: true, data: {
                telegramEnabled: tenant?.telegramEnabled || false, hasBotToken: !!tenant?.telegramBotToken,
                hasWebhookSecret: !!tenant?.telegramWebhookSecret, linkedCustomersCount: linkedCount?.count || 0,
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
        const updates: any = { updatedAt: new Date() };

        if (body.botToken !== undefined && body.botToken !== '') {
            const { validateBotToken } = await import('../lib/telegram');
            const validation = await validateBotToken(body.botToken);
            if (!validation.valid) {
                return reply.code(400).send({ success: false, error: { code: 'INVALID_BOT_TOKEN', message: validation.error || 'Invalid bot token' } });
            }
            updates.telegramBotToken = body.botToken;
        } else if (body.botToken === '') {
            updates.telegramBotToken = null;
        }

        if (body.webhookSecret !== undefined) updates.telegramWebhookSecret = body.webhookSecret || null;

        await db.update(schema.tenants).set(updates).where(eq(schema.tenants.id, user.tenantId)).returning();
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

    // Get payment settings
    fastify.get('/payment-settings', { preHandler: [fastify.authenticate, requireTenantAdmin] }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({
            paymentPortalEnabled: schema.tenants.paymentPortalEnabled, clickMerchantId: schema.tenants.clickMerchantId,
            clickServiceId: schema.tenants.clickServiceId, clickSecretKey: schema.tenants.clickSecretKey,
            paymeMerchantId: schema.tenants.paymeMerchantId, paymeSecretKey: schema.tenants.paymeSecretKey,
        }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!tenant) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

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

    // Create a new export
    fastify.post<{
        Body: {
            format?: 'json' | 'csv';
            includeProducts?: boolean;
            includeCustomers?: boolean;
            includeOrders?: boolean;
            includePayments?: boolean;
            includeInventory?: boolean;
            dateFrom?: string;
            dateTo?: string;
        }
    }>('/export', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body || {};

        const { createTenantExport } = await import('../lib/tenant-export');
        const result = await createTenantExport(user.tenantId, user.id, {
            format: body.format || 'json',
            includeProducts: body.includeProducts ?? true,
            includeCustomers: body.includeCustomers ?? true,
            includeOrders: body.includeOrders ?? true,
            includePayments: body.includePayments ?? true,
            includeInventory: body.includeInventory ?? true,
            dateFrom: body.dateFrom ? new Date(body.dateFrom) : undefined,
            dateTo: body.dateTo ? new Date(body.dateTo) : undefined,
        });

        if (!result.success) {
            return reply.code(500).send({ success: false, error: { message: result.error } });
        }

        return { success: true, data: { exportId: result.exportId } };
    });

    // List exports
    fastify.get('/exports', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const { listTenantExports } = await import('../lib/tenant-export');
        const exports = await listTenantExports(user.tenantId);
        return { success: true, data: exports };
    });

    // Download export file
    fastify.get<{ Params: { id: string } }>('/exports/:id/download', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        // Find the export
        const [exportRecord] = await db.select()
            .from(schema.tenantExports)
            .where(and(
                eq(schema.tenantExports.id, id),
                eq(schema.tenantExports.tenantId, user.tenantId)
            ))
            .limit(1);

        if (!exportRecord) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (exportRecord.status !== 'completed' || !exportRecord.filename) {
            return reply.code(400).send({ success: false, error: { code: 'EXPORT_NOT_READY', message: 'Export is not ready for download' } });
        }

        const { getExportPath, markExportDownloaded } = await import('../lib/tenant-export');
        const { createReadStream } = await import('fs');
        const { stat } = await import('fs/promises');

        const filePath = getExportPath(exportRecord.filename);

        try {
            const stats = await stat(filePath);
            const stream = createReadStream(filePath);

            // Mark as downloaded
            await markExportDownloaded(id, user.tenantId);

            const contentType = exportRecord.format === 'csv'
                ? 'text/csv'
                : 'application/json';

            return reply
                .header('Content-Type', contentType)
                .header('Content-Length', stats.size.toString())
                .header('Content-Disposition', `attachment; filename="${encodeURIComponent(exportRecord.filename)}"`)
                .send(stream);
        } catch {
            return reply.code(404).send({ success: false, error: { code: 'FILE_NOT_FOUND' } });
        }
    });

    // Get export settings
    fastify.get('/export-settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const { getExportSettings } = await import('../lib/tenant-export');
        const settings = await getExportSettings(user.tenantId);
        return { success: true, data: settings };
    });

    // Update export settings (schedule)
    fastify.put<{
        Body: {
            frequency?: 'never' | 'daily' | 'weekly' | 'monthly';
            format?: 'json' | 'csv';
            includeProducts?: boolean;
            includeCustomers?: boolean;
            includeOrders?: boolean;
            includePayments?: boolean;
            includeInventory?: boolean;
            retentionDays?: number;
        }
    }>('/export-settings', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body || {};

        const { updateExportSettings } = await import('../lib/tenant-export');
        const settings = await updateExportSettings(user.tenantId, body);
        return { success: true, data: settings };
    });

    // Import data from file
    fastify.post<{
        Body: {
            data: string; // JSON string of exported data
            importProducts?: boolean;
            importCustomers?: boolean;
            skipExisting?: boolean;
        }
    }>('/import', {
        preHandler: [fastify.authenticate, requireTenantAdmin],
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!body?.data) {
            return reply.code(400).send({ success: false, error: { code: 'MISSING_DATA' } });
        }

        const { importTenantData } = await import('../lib/tenant-export');
        const result = await importTenantData(user.tenantId, body.data, {
            importProducts: body.importProducts ?? true,
            importCustomers: body.importCustomers ?? true,
            skipExisting: body.skipExisting ?? true,
        });

        return {
            success: result.success,
            data: {
                imported: result.imported,
                errors: result.errors.length > 0 ? result.errors : undefined,
            },
        };
    });
};
