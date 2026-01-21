/**
 * Tenant Self-Service Routes
 * 
 * These endpoints allow tenant admins to manage their own tenant configuration.
 * All routes are tenant-scoped based on the authenticated user's tenantId.
 */

import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { eq, count, and, gte, lte, sql } from 'drizzle-orm';

export const tenantSelfRoutes = new Elysia({ prefix: '/tenant' })

    // Only tenant admins can access these routes
    .onBeforeHandle(({ user, set }: any) => {
        if (!user) {
            set.status = 401;
            return { success: false, error: { code: 'UNAUTHORIZED' } };
        }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'Tenant admin access required' } };
        }
        return;
    })

    // ========================================================================
    // PROFILE
    // ========================================================================

    /**
     * Get tenant profile
     */
    .get('/profile', async ({ user }: any) => {
        const [tenant] = await db
            .select({
                id: schema.tenants.id,
                name: schema.tenants.name,
                subdomain: schema.tenants.subdomain,
                plan: schema.tenants.plan,
                planStatus: schema.tenants.planStatus,
                currency: schema.tenants.currency,
                timezone: schema.tenants.timezone,
                telegramEnabled: schema.tenants.telegramEnabled,
                subscriptionEndAt: schema.tenants.subscriptionEndAt,
                maxUsers: schema.tenants.maxUsers,
                maxProducts: schema.tenants.maxProducts,
                maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
                // Profile fields
                address: schema.tenants.address,
                city: schema.tenants.city,
                country: schema.tenants.country,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                website: schema.tenants.website,
                taxId: schema.tenants.taxId,
                logo: schema.tenants.logo,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        if (!tenant) {
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        // Get usage counts
        const [userCount] = await db
            .select({ count: count() })
            .from(schema.users)
            .where(eq(schema.users.tenantId, user.tenantId));

        const [productCount] = await db
            .select({ count: count() })
            .from(schema.products)
            .where(eq(schema.products.tenantId, user.tenantId));

        return {
            success: true,
            data: {
                ...tenant,
                usage: {
                    users: { current: userCount?.count || 0, max: tenant.maxUsers || 5 },
                    products: { current: productCount?.count || 0, max: tenant.maxProducts || 100 },
                }
            }
        };
    })

    /**
     * Update tenant profile
     */
    .put('/profile', async ({ user, body }: any) => {
        const updates: Partial<typeof schema.tenants.$inferInsert> = {};

        if (body.name && body.name.length >= 2) updates.name = body.name;
        if (body.address !== undefined) updates.address = body.address;
        if (body.city !== undefined) updates.city = body.city;
        if (body.country !== undefined) updates.country = body.country;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.email !== undefined) updates.email = body.email;
        if (body.website !== undefined) updates.website = body.website;
        if (body.taxId !== undefined) updates.taxId = body.taxId;
        if (body.logo !== undefined) updates.logo = body.logo;

        updates.updatedAt = new Date();

        const [updated] = await db
            .update(schema.tenants)
            .set(updates)
            .where(eq(schema.tenants.id, user.tenantId))
            .returning();

        return { success: true, data: updated };
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            address: t.Optional(t.String()),
            city: t.Optional(t.String()),
            country: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            email: t.Optional(t.String()),
            website: t.Optional(t.String()),
            taxId: t.Optional(t.String()),
            logo: t.Optional(t.String()),
        })
    })

    // ========================================================================
    // BUSINESS SETTINGS
    // ========================================================================

    /**
     * Get tenant business settings
     */
    .get('/settings', async ({ user }: any) => {
        const [tenant] = await db
            .select({
                currency: schema.tenants.currency,
                timezone: schema.tenants.timezone,
                defaultTaxRate: schema.tenants.defaultTaxRate,
                orderNumberPrefix: schema.tenants.orderNumberPrefix,
                invoiceNumberPrefix: schema.tenants.invoiceNumberPrefix,
                defaultPaymentTerms: schema.tenants.defaultPaymentTerms,
                yandexGeocoderApiKey: schema.tenants.yandexGeocoderApiKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        return {
            success: true,
            data: {
                currency: tenant?.currency ?? 'UZS',
                timezone: tenant?.timezone ?? 'Asia/Tashkent',
                defaultTaxRate: parseFloat(String(tenant?.defaultTaxRate ?? '0')) || 0,
                // Use ?? instead of || to allow empty strings
                orderNumberPrefix: tenant?.orderNumberPrefix ?? 'ORD-',
                invoiceNumberPrefix: tenant?.invoiceNumberPrefix ?? 'INV-',
                defaultPaymentTerms: tenant?.defaultPaymentTerms ?? 7,
                yandexGeocoderApiKey: tenant?.yandexGeocoderApiKey ?? '',
            }
        };
    })

    /**
     * Update tenant business settings
     */
    .put('/settings', async ({ user, body }: any) => {
        const updates: Partial<typeof schema.tenants.$inferInsert> = {};

        if (body.currency) updates.currency = body.currency;
        if (body.timezone) updates.timezone = body.timezone;
        if (body.defaultTaxRate !== undefined) updates.defaultTaxRate = String(body.defaultTaxRate);
        if (body.orderNumberPrefix !== undefined) updates.orderNumberPrefix = body.orderNumberPrefix;
        if (body.invoiceNumberPrefix !== undefined) updates.invoiceNumberPrefix = body.invoiceNumberPrefix;
        if (body.defaultPaymentTerms !== undefined) updates.defaultPaymentTerms = parseInt(String(body.defaultPaymentTerms)) || 7;
        if (body.yandexGeocoderApiKey !== undefined) updates.yandexGeocoderApiKey = body.yandexGeocoderApiKey || null;

        updates.updatedAt = new Date();

        const [updated] = await db
            .update(schema.tenants)
            .set(updates)
            .where(eq(schema.tenants.id, user.tenantId))
            .returning();

        return { success: true, data: updated };
    }, {
        body: t.Object({
            currency: t.Optional(t.String()),
            timezone: t.Optional(t.String()),
            defaultTaxRate: t.Optional(t.Union([t.Number(), t.String()])),
            orderNumberPrefix: t.Optional(t.String()),
            invoiceNumberPrefix: t.Optional(t.String()),
            defaultPaymentTerms: t.Optional(t.Union([t.Number(), t.String()])),
            yandexGeocoderApiKey: t.Optional(t.String()),
        })
    })

    // ========================================================================
    // SUBSCRIPTION & USAGE
    // ========================================================================

    /**
     * Get subscription and usage info
     */
    .get('/subscription', async ({ user }: any) => {
        const [tenant] = await db
            .select({
                plan: schema.tenants.plan,
                planStatus: schema.tenants.planStatus,
                subscriptionEndAt: schema.tenants.subscriptionEndAt,
                maxUsers: schema.tenants.maxUsers,
                maxProducts: schema.tenants.maxProducts,
                maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        if (!tenant) {
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        // Get usage counts
        const [userCount] = await db
            .select({ count: count() })
            .from(schema.users)
            .where(eq(schema.users.tenantId, user.tenantId));

        const [productCount] = await db
            .select({ count: count() })
            .from(schema.products)
            .where(eq(schema.products.tenantId, user.tenantId));

        // Get orders this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const [orderCount] = await db
            .select({ count: count() })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.tenantId, user.tenantId),
                gte(schema.orders.createdAt, startOfMonth),
                lte(schema.orders.createdAt, endOfMonth)
            ));

        return {
            success: true,
            data: {
                plan: tenant.plan || 'free',
                planStatus: tenant.planStatus || 'active',
                subscriptionEndAt: tenant.subscriptionEndAt?.toISOString() || null,
                usage: {
                    users: { current: userCount?.count || 0, max: tenant.maxUsers || 5 },
                    products: { current: productCount?.count || 0, max: tenant.maxProducts || 100 },
                    ordersThisMonth: { current: orderCount?.count || 0, max: tenant.maxOrdersPerMonth || 500 },
                }
            }
        };
    })

    // ========================================================================
    // TELEGRAM BOT CONFIG
    // ========================================================================

    /**
     * Get tenant Telegram config
     */
    .get('/telegram', async ({ user }: any) => {
        const [tenant] = await db
            .select({
                telegramEnabled: schema.tenants.telegramEnabled,
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramWebhookSecret: schema.tenants.telegramWebhookSecret,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        // Count linked customers (only those with telegramChatId set)
        const [linkedCount] = await db
            .select({ count: count() })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.tenantId, user.tenantId),
                sql`${schema.customers.telegramChatId} IS NOT NULL`
            ));

        return {
            success: true,
            data: {
                telegramEnabled: tenant?.telegramEnabled || false,
                hasBotToken: !!tenant?.telegramBotToken,
                hasWebhookSecret: !!tenant?.telegramWebhookSecret,
                linkedCustomersCount: linkedCount?.count || 0,
            }
        };
    })

    /**
     * Update tenant Telegram bot token and webhook secret
     * Validates bot token with Telegram API before saving
     */
    .put('/telegram', async ({ user, body, set }: any) => {
        const updates: any = { updatedAt: new Date() };

        // Validate bot token if provided
        if (body.botToken !== undefined && body.botToken !== '') {
            const { validateBotToken } = await import('../lib/telegram');
            const validation = await validateBotToken(body.botToken);

            if (!validation.valid) {
                set.status = 400;
                return {
                    success: false,
                    error: {
                        code: 'INVALID_BOT_TOKEN',
                        message: validation.error || 'Invalid bot token'
                    }
                };
            }

            updates.telegramBotToken = body.botToken;

            // Return bot info for display
            console.log(`[Tenant ${user.tenantId}] Validated bot: @${validation.botInfo?.username}`);
        } else if (body.botToken === '') {
            // Clear the token
            updates.telegramBotToken = null;
        }

        if (body.webhookSecret !== undefined) {
            updates.telegramWebhookSecret = body.webhookSecret || null;
        }

        const [updated] = await db
            .update(schema.tenants)
            .set(updates)
            .where(eq(schema.tenants.id, user.tenantId))
            .returning();

        return { success: true, data: { updated: true } };
    }, {
        body: t.Object({
            botToken: t.Optional(t.String()),
            webhookSecret: t.Optional(t.String()),
        })
    })

    /**
     * Validate a bot token without saving
     */
    .post('/telegram/validate', async ({ body, set }: any) => {
        if (!body.botToken) {
            set.status = 400;
            return { success: false, error: { code: 'MISSING_TOKEN' } };
        }

        const { validateBotToken } = await import('../lib/telegram');
        const result = await validateBotToken(body.botToken);

        return {
            success: result.valid,
            data: result.valid ? {
                botUsername: result.botInfo?.username,
                botName: result.botInfo?.first_name,
            } : null,
            error: result.valid ? undefined : { message: result.error }
        };
    }, {
        body: t.Object({
            botToken: t.String()
        })
    })

    // ========================================================================
    // PAYMENT SETTINGS
    // ========================================================================

    /**
     * Get tenant payment settings
     */
    .get('/payment-settings', async ({ user }: any) => {
        const [tenant] = await db
            .select({
                paymentPortalEnabled: schema.tenants.paymentPortalEnabled,
                clickMerchantId: schema.tenants.clickMerchantId,
                clickServiceId: schema.tenants.clickServiceId,
                clickSecretKey: schema.tenants.clickSecretKey,
                paymeMerchantId: schema.tenants.paymeMerchantId,
                paymeSecretKey: schema.tenants.paymeSecretKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        if (!tenant) {
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        return {
            success: true,
            data: {
                paymentPortalEnabled: tenant.paymentPortalEnabled || false,
                clickMerchantId: tenant.clickMerchantId || '',
                clickServiceId: tenant.clickServiceId || '',
                clickSecretKey: tenant.clickSecretKey || '',
                paymeMerchantId: tenant.paymeMerchantId || '',
                paymeSecretKey: tenant.paymeSecretKey || '',
            }
        };
    })

    /**
     * Update tenant payment settings
     */
    .put('/payment-settings', async ({ user, body }: any) => {
        const updates: Partial<typeof schema.tenants.$inferInsert> = {};

        if (body.paymentPortalEnabled !== undefined) updates.paymentPortalEnabled = body.paymentPortalEnabled;
        if (body.clickMerchantId !== undefined) updates.clickMerchantId = body.clickMerchantId;
        if (body.clickServiceId !== undefined) updates.clickServiceId = body.clickServiceId;
        if (body.clickSecretKey !== undefined) updates.clickSecretKey = body.clickSecretKey;
        if (body.paymeMerchantId !== undefined) updates.paymeMerchantId = body.paymeMerchantId;
        if (body.paymeSecretKey !== undefined) updates.paymeSecretKey = body.paymeSecretKey;

        const [updated] = await db
            .update(schema.tenants)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(schema.tenants.id, user.tenantId))
            .returning();

        return { success: true, data: updated };
    }, {
        body: t.Object({
            paymentPortalEnabled: t.Optional(t.Boolean()),
            clickMerchantId: t.Optional(t.String()),
            clickServiceId: t.Optional(t.String()),
            clickSecretKey: t.Optional(t.String()),
            paymeMerchantId: t.Optional(t.String()),
            paymeSecretKey: t.Optional(t.String()),
        })
    });
