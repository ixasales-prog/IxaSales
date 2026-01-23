import { Elysia, t } from 'elysia';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, count, sum, desc, or, ilike } from 'drizzle-orm';
import { getAllPlanLimits, updatePlanLimits } from '../lib/planLimits';
import * as settings from '../lib/systemSettings';

import { logAudit } from '../lib/audit';
import { getSystemHealth } from '../lib/health';
import { getRequestMetrics } from '../lib/request-logger';

// Basic in-memory rate limit for subscription checks (once per day per worker)
let lastSubscriptionCheck = 0;

export const superRoutes = new Elysia({ prefix: '/super' })
    // .use(authPlugin) - Already used in index.ts group

    .onBeforeHandle(({ user, set }: any) => {
        if (!user) {
            set.status = 401;
            return { success: false, error: { code: 'UNAUTHORIZED' } };
        }
        if (user.role !== 'super_admin') {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }
        return; // Allow request to proceed
    })

    .get('/stats', async () => {
        // --- LAZY SUBSCRIPTION CHECK ---
        const now = Date.now();
        if (now - lastSubscriptionCheck > 24 * 60 * 60 * 1000) {
            lastSubscriptionCheck = now;
            // Check for expiring subscriptions (next 3 days)
            const threeDaysFromNow = new Date(now + 3 * 24 * 60 * 60 * 1000);

            try {
                // Find tenants expiring soon
                // Note: Assuming subscriptionEndAt is a Date object in schema
                const { gt, lt, and } = await import('drizzle-orm');
                const expiringTenants = await db.select()
                    .from(schema.tenants)
                    .where(and(
                        eq(schema.tenants.isActive, true),
                        gt(schema.tenants.subscriptionEndAt, new Date()),
                        lt(schema.tenants.subscriptionEndAt, threeDaysFromNow)
                    ));

                if (expiringTenants.length > 0) {
                    const { notifySubscriptionExpiring } = await import('../lib/telegram');
                    for (const tenant of expiringTenants) {
                        const daysLeft = Math.ceil((tenant.subscriptionEndAt!.getTime() - now) / (1000 * 60 * 60 * 24));
                        notifySubscriptionExpiring({
                            name: tenant.name,
                            plan: tenant.plan || 'Unknown',
                            daysLeft
                        });
                    }
                }
            } catch (err) {
                console.error('Subscription check failed:', err);
            }
        }

        const [revenueResult, ordersResult, tenantsResult, activeTenantsResult] = await Promise.all([
            db.select({ value: sum(schema.orders.totalAmount) })
                .from(schema.orders)
                .where(eq(schema.orders.status, 'delivered')),
            db.select({ value: count(schema.orders.id) })
                .from(schema.orders)
                .where(eq(schema.orders.status, 'delivered')),
            db.select({ value: count(schema.tenants.id) })
                .from(schema.tenants),
            db.select({ value: count(schema.tenants.id) })
                .from(schema.tenants)
                .where(eq(schema.tenants.isActive, true))
        ]);

        return {
            success: true,
            data: {
                totalSystemRevenue: revenueResult[0]?.value || 0,
                totalSystemOrders: ordersResult[0]?.value || 0,
                totalTenants: tenantsResult[0]?.value || 0,
                activeTenants: activeTenantsResult[0]?.value || 0
            }
        };
    })

    // ========== PLAN LIMITS ==========
    .get('/plan-limits', () => ({ success: true, data: getAllPlanLimits() }))
    .put('/plan-limits', (ctx: any) => {
        updatePlanLimits(ctx.body.limits);
        return { success: true, data: getAllPlanLimits() };
    }, {
        body: t.Object({
            limits: t.Record(t.String(), t.Object({
                maxUsers: t.Number({ minimum: 1 }),
                maxProducts: t.Number({ minimum: 1 }),
                maxOrdersPerMonth: t.Number({ minimum: 1 })
            }))
        })
    })

    // ========== DEFAULT TENANT SETTINGS ==========
    .get('/settings/defaults', () => ({ success: true, data: settings.getDefaultTenantSettings() }))
    .put('/settings/defaults', (ctx: any) => ({
        success: true,
        data: settings.updateDefaultTenantSettings(ctx.body)
    }), {
        body: t.Object({
            defaultCurrency: t.Optional(t.String()),
            defaultTimezone: t.Optional(t.String()),
            defaultTaxRate: t.Optional(t.Number({ minimum: 0, maximum: 100 }))
        })
    })

    // ========== SECURITY SETTINGS ==========
    .get('/settings/security', () => ({ success: true, data: settings.getSecuritySettings() }))
    .put('/settings/security', (ctx: any) => ({
        success: true,
        data: settings.updateSecuritySettings(ctx.body)
    }), {
        body: t.Object({
            sessionTimeoutMinutes: t.Optional(t.Number({ minimum: 5, maximum: 1440 })),
            passwordMinLength: t.Optional(t.Number({ minimum: 6, maximum: 32 })),
            maxLoginAttempts: t.Optional(t.Number({ minimum: 1, maximum: 20 }))
        })
    })

    // ========== ANNOUNCEMENT SETTINGS ==========
    .get('/settings/announcement', () => ({ success: true, data: settings.getAnnouncementSettings() }))
    .put('/settings/announcement', (ctx: any) => ({
        success: true,
        data: settings.updateAnnouncementSettings(ctx.body)
    }), {
        body: t.Object({
            enabled: t.Optional(t.Boolean()),
            message: t.Optional(t.String()),
            type: t.Optional(t.Union([t.Literal('info'), t.Literal('warning'), t.Literal('critical')])),
            targetRoles: t.Optional(t.Array(t.String()))
        })
    })

    // ========== EMAIL (SMTP) SETTINGS ==========
    .get('/settings/email', () => ({ success: true, data: settings.getEmailSettings() }))
    .put('/settings/email', (ctx: any) => ({
        success: true,
        data: settings.updateEmailSettings(ctx.body)
    }), {
        body: t.Object({
            enabled: t.Optional(t.Boolean()),
            smtpHost: t.Optional(t.String()),
            smtpPort: t.Optional(t.Number()),
            smtpUsername: t.Optional(t.String()),
            smtpPassword: t.Optional(t.String()),
            fromEmail: t.Optional(t.String()),
            fromName: t.Optional(t.String()),
            tlsEnabled: t.Optional(t.Boolean())
        })
    })

    // ========== TELEGRAM SETTINGS ==========
    .get('/settings/telegram', () => ({ success: true, data: settings.getTelegramSettings() }))
    .put('/settings/telegram', (ctx: any) => ({
        success: true,
        data: settings.updateTelegramSettings(ctx.body)
    }), {
        body: t.Object({
            enabled: t.Optional(t.Boolean()),
            botToken: t.Optional(t.String()),
            defaultChatId: t.Optional(t.String()),
            webhookSecret: t.Optional(t.String())
        })
    })

    // ========== BRANDING SETTINGS ==========
    .get('/settings/branding', () => ({ success: true, data: settings.getBrandingSettings() }))
    .put('/settings/branding', (ctx: any) => ({
        success: true,
        data: settings.updateBrandingSettings(ctx.body)
    }), {
        body: t.Object({
            platformName: t.Optional(t.String()),
            primaryColor: t.Optional(t.String()),
            logoUrl: t.Optional(t.String())
        })
    })

    // ========== MASTER PRODUCTS ==========
    .get('/master-products', async ({ query }: any) => {
        const limit = Number(query.limit) || 50;
        const offset = Number(query.offset) || 0;
        const search = query.search || '';

        let whereClause = undefined;
        if (search) {
            whereClause = or(
                ilike(schema.masterProducts.name, `%${search}%`),
                ilike(schema.masterProducts.sku, `%${search}%`),
                ilike(schema.masterProducts.barcode, `%${search}%`)
            );
        }

        const products = await db.select()
            .from(schema.masterProducts)
            .where(whereClause)
            .limit(limit)
            .offset(offset)
            .orderBy(desc(schema.masterProducts.createdAt));

        return { success: true, data: products };
    })

    .post('/master-products', async ({ body, user }: any) => {
        const newProduct = await db.insert(schema.masterProducts).values(body).returning();

        await logAudit(
            'master_product.create',
            { name: body.name, sku: body.sku },
            user.id,
            null,
            newProduct[0].id,
            'master_product'
        );

        return { success: true, data: newProduct[0] };
    }, {
        body: t.Object({
            name: t.String(),
            sku: t.String(),
            barcode: t.Optional(t.String()),
            category: t.Optional(t.String()),
            description: t.Optional(t.String()),
            imageUrl: t.Optional(t.String())
        })
    })

    .put('/master-products/:id', async ({ params, body, user }: any) => {
        const updated = await db.update(schema.masterProducts)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(eq(schema.masterProducts.id, params.id))
            .returning();

        await logAudit(
            'master_product.update',
            { id: params.id, updates: Object.keys(body) },
            user.id,
            null,
            params.id,
            'master_product'
        );

        return { success: true, data: updated[0] };
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            sku: t.Optional(t.String()),
            barcode: t.Optional(t.String()),
            category: t.Optional(t.String()),
            description: t.Optional(t.String()),
            imageUrl: t.Optional(t.String())
        })
    })

    .delete('/master-products/:id', async ({ params, user }: any) => {
        await db.delete(schema.masterProducts)
            .where(eq(schema.masterProducts.id, params.id));

        await logAudit(
            'master_product.delete',
            { id: params.id },
            user.id,
            null,
            params.id,
            'master_product'
        );

        return { success: true };
    })

    // ========== SYSTEM HEALTH ==========
    .get('/health', async () => {
        return { success: true, data: await getSystemHealth() };
    })
    .get('/metrics', () => {
        return { success: true, data: getRequestMetrics() };
    })

    // ========== AUDIT LOGS ==========
    .get('/audit-logs', async (ctx: any) => {
        const { query } = ctx;
        const limit = Number(query.limit) || 50;
        const offset = Number(query.offset) || 0;

        const logs = await db
            .select({
                id: schema.auditLogs.id,
                action: schema.auditLogs.action,
                details: schema.auditLogs.details,
                createdAt: schema.auditLogs.createdAt,
                ipAddress: schema.auditLogs.ipAddress,
                user: {
                    name: schema.users.name,
                    email: schema.users.email,
                    role: schema.users.role
                },
                tenant: {
                    name: schema.tenants.name
                }
            })
            .from(schema.auditLogs)
            .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
            .leftJoin(schema.tenants, eq(schema.auditLogs.tenantId, schema.tenants.id))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(limit)
            .offset(offset);

        return { success: true, data: logs };
    })

    // ========== BACKUP SETTINGS ==========
    .get('/settings/backup', () => ({ success: true, data: settings.getBackupSettings() }))
    .put('/settings/backup', (ctx: any) => ({
        success: true,
        data: settings.updateBackupSettings(ctx.body)
    }), {
        body: t.Object({
            frequency: t.Optional(t.Union([t.Literal('daily'), t.Literal('weekly'), t.Literal('monthly')])),
            retentionDays: t.Optional(t.Number({ minimum: 1, maximum: 365 }))
        })
    })

    // ========== TELEGRAM ==========
    // Test Telegram
    .post('/test-telegram', async ({ body }: any) => {
        const { testTelegram } = await import('../lib/telegram');
        const result = await testTelegram();
        if (!result.success) {
            return { success: false, message: result.message };
        }
        return { success: true, message: 'Message sent!' };
    })

    // ============================================
    // SCHEDULED JOBS (Manual Trigger)
    // ============================================

    // Trigger a scheduled job manually
    .post('/jobs/:jobName', async ({ params, set }) => {
        const { triggerJob } = await import('../lib/scheduler');
        const result = await triggerJob(params.jobName);

        if (!result.success) {
            set.status = 400;
        }

        return result;
    }, {
        params: t.Object({
            jobName: t.String()
        })
    })

    // List available jobs
    .get('/jobs', () => ({
        success: true,
        data: [
            { name: 'overdue-debt', description: 'Send overdue debt notifications to admins' },
            { name: 'subscription-expiration', description: 'Send subscription expiring notifications' },
            { name: 'customer-payment-reminder', description: 'Send payment reminders to customers' },
        ]
    }))

    // ============================================
    // BACKUP MANAGEMENT
    // ============================================

    // Create immediate backup
    .post('/backup/now', async ({ set }) => {
        const { createBackup } = await import('../lib/backup');
        const result = await createBackup();

        if (!result.success) {
            set.status = 500;
            return { success: false, message: result.error };
        }

        return { success: true, filename: result.filename };
    })
    .post('/backup/restore', async ({ body, set }) => {
        const { restoreBackup } = await import('../lib/backup');
        const result = await restoreBackup(body.filename);

        if (!result.success) {
            set.status = 400;
            return { success: false, message: result.error };
        }

        return { success: true, message: result.message };
    }, {
        body: t.Object({
            filename: t.String()
        })
    })

    // List backups
    .get('/backups', async () => {
        const { listBackups } = await import('../lib/backup');
        const backups = await listBackups();
        return { success: true, data: backups };
    })

    // Download backup
    .get('/backups/:filename', async ({ params, set }) => {
        const { getBackupPath } = await import('../lib/backup');
        const { filename } = params;

        const path = getBackupPath(filename);
        try {
            const stats = await stat(path);
            const stream = createReadStream(path);
            const body = Readable.toWeb(stream) as unknown as ReadableStream;
            return new Response(body, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': stats.size.toString(),
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
                },
            });
        } catch {
            set.status = 404;
            return 'File not found';
        }
    });
