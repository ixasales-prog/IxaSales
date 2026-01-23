import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { db, schema } from '../db';
import { eq, count, sum, desc, or, ilike, gt, lt, and } from 'drizzle-orm';
import { getAllPlanLimits, updatePlanLimits } from '../lib/planLimits';
import * as settings from '../lib/systemSettings';
import { logAudit } from '../lib/audit';
import { getSystemHealth } from '../lib/health';
import { getRequestMetrics } from '../lib/request-logger';

// Basic in-memory rate limit for subscription checks (once per day per worker)
let lastSubscriptionCheck = 0;

// Schemas
const MasterProductBodySchema = Type.Object({
    name: Type.String(),
    sku: Type.String(),
    barcode: Type.Optional(Type.String()),
    category: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    imageUrl: Type.Optional(Type.String()),
});

const MasterProductUpdateSchema = Type.Object({
    name: Type.Optional(Type.String()),
    sku: Type.Optional(Type.String()),
    barcode: Type.Optional(Type.String()),
    category: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    imageUrl: Type.Optional(Type.String()),
});

const PlanLimitsBodySchema = Type.Object({
    limits: Type.Record(Type.String(), Type.Object({
        maxUsers: Type.Number({ minimum: 1 }),
        maxProducts: Type.Number({ minimum: 1 }),
        maxOrdersPerMonth: Type.Number({ minimum: 1 }),
    })),
});

const DefaultSettingsSchema = Type.Object({
    defaultCurrency: Type.Optional(Type.String()),
    defaultTimezone: Type.Optional(Type.String()),
    defaultTaxRate: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

const SecuritySettingsSchema = Type.Object({
    sessionTimeoutMinutes: Type.Optional(Type.Number({ minimum: 5, maximum: 1440 })),
    passwordMinLength: Type.Optional(Type.Number({ minimum: 6, maximum: 32 })),
    maxLoginAttempts: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
});

const AnnouncementSettingsSchema = Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    message: Type.Optional(Type.String()),
    type: Type.Optional(Type.Union([Type.Literal('info'), Type.Literal('warning'), Type.Literal('critical')])),
    targetRoles: Type.Optional(Type.Array(Type.String())),
});

const EmailSettingsSchema = Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    smtpHost: Type.Optional(Type.String()),
    smtpPort: Type.Optional(Type.Number()),
    smtpUsername: Type.Optional(Type.String()),
    smtpPassword: Type.Optional(Type.String()),
    fromEmail: Type.Optional(Type.String()),
    fromName: Type.Optional(Type.String()),
    tlsEnabled: Type.Optional(Type.Boolean()),
});

const TelegramSettingsSchema = Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    botToken: Type.Optional(Type.String()),
    defaultChatId: Type.Optional(Type.String()),
    webhookSecret: Type.Optional(Type.String()),
});

const BrandingSettingsSchema = Type.Object({
    platformName: Type.Optional(Type.String()),
    primaryColor: Type.Optional(Type.String()),
    logoUrl: Type.Optional(Type.String()),
});

const BackupSettingsSchema = Type.Object({
    frequency: Type.Optional(Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')])),
    retentionDays: Type.Optional(Type.Number({ minimum: 1, maximum: 365 })),
});

const RestoreBackupBodySchema = Type.Object({
    filename: Type.String(),
});

const ListQuerySchema = Type.Object({
    limit: Type.Optional(Type.String()),
    offset: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
});

const IdParamsSchema = Type.Object({
    id: Type.String(),
});

const JobNameParamsSchema = Type.Object({
    jobName: Type.String(),
});

const FilenameParamsSchema = Type.Object({
    filename: Type.String(),
});

// Super admin preHandler
const requireSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
        return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    if (request.user.role !== 'super_admin') {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
    }
};

export const superRoutes: FastifyPluginAsync = async (fastify) => {
    // Apply super admin check to all routes
    fastify.addHook('preHandler', requireSuperAdmin);

    // ========== STATS ==========
    fastify.get('/stats', async (request, reply) => {
        // Lazy subscription check (once per 24 hours)
        const now = Date.now();
        if (now - lastSubscriptionCheck > 24 * 60 * 60 * 1000) {
            lastSubscriptionCheck = now;
            const threeDaysFromNow = new Date(now + 3 * 24 * 60 * 60 * 1000);

            try {
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
                            daysLeft,
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
                .where(eq(schema.tenants.isActive, true)),
        ]);

        return {
            success: true,
            data: {
                totalSystemRevenue: revenueResult[0]?.value || 0,
                totalSystemOrders: ordersResult[0]?.value || 0,
                totalTenants: tenantsResult[0]?.value || 0,
                activeTenants: activeTenantsResult[0]?.value || 0,
            },
        };
    });

    // ========== PLAN LIMITS ==========
    fastify.get('/plan-limits', async () => ({ success: true, data: getAllPlanLimits() }));

    fastify.put<{ Body: Static<typeof PlanLimitsBodySchema> }>('/plan-limits', {
        schema: { body: PlanLimitsBodySchema },
    }, async (request) => {
        updatePlanLimits(request.body.limits);
        return { success: true, data: getAllPlanLimits() };
    });

    // ========== DEFAULT TENANT SETTINGS ==========
    fastify.get('/settings/defaults', async () => ({ success: true, data: settings.getDefaultTenantSettings() }));

    fastify.put<{ Body: Static<typeof DefaultSettingsSchema> }>('/settings/defaults', {
        schema: { body: DefaultSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateDefaultTenantSettings(request.body),
    }));

    // ========== SECURITY SETTINGS ==========
    fastify.get('/settings/security', async () => ({ success: true, data: settings.getSecuritySettings() }));

    fastify.put<{ Body: Static<typeof SecuritySettingsSchema> }>('/settings/security', {
        schema: { body: SecuritySettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateSecuritySettings(request.body),
    }));

    // ========== ANNOUNCEMENT SETTINGS ==========
    fastify.get('/settings/announcement', async () => ({ success: true, data: settings.getAnnouncementSettings() }));

    fastify.put<{ Body: Static<typeof AnnouncementSettingsSchema> }>('/settings/announcement', {
        schema: { body: AnnouncementSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateAnnouncementSettings(request.body),
    }));

    // ========== EMAIL SETTINGS ==========
    fastify.get('/settings/email', async () => ({ success: true, data: settings.getEmailSettings() }));

    fastify.put<{ Body: Static<typeof EmailSettingsSchema> }>('/settings/email', {
        schema: { body: EmailSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateEmailSettings(request.body),
    }));

    // ========== TELEGRAM SETTINGS ==========
    fastify.get('/settings/telegram', async () => ({ success: true, data: settings.getTelegramSettings() }));

    fastify.put<{ Body: Static<typeof TelegramSettingsSchema> }>('/settings/telegram', {
        schema: { body: TelegramSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateTelegramSettings(request.body),
    }));

    // ========== BRANDING SETTINGS ==========
    fastify.get('/settings/branding', async () => ({ success: true, data: settings.getBrandingSettings() }));

    fastify.put<{ Body: Static<typeof BrandingSettingsSchema> }>('/settings/branding', {
        schema: { body: BrandingSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateBrandingSettings(request.body),
    }));

    // ========== MASTER PRODUCTS ==========
    fastify.get<{ Querystring: Static<typeof ListQuerySchema> }>('/master-products', {
        schema: { querystring: ListQuerySchema },
    }, async (request) => {
        const limit = Number(request.query.limit) || 50;
        const offset = Number(request.query.offset) || 0;
        const search = request.query.search || '';

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
    });

    fastify.post<{ Body: Static<typeof MasterProductBodySchema> }>('/master-products', {
        schema: { body: MasterProductBodySchema },
    }, async (request) => {
        const user = request.user!;
        const newProduct = await db.insert(schema.masterProducts).values(request.body).returning();

        await logAudit(
            'master_product.create',
            { name: request.body.name, sku: request.body.sku },
            user.id,
            null,
            newProduct[0].id,
            'master_product'
        );

        return { success: true, data: newProduct[0] };
    });

    fastify.put<{ Params: Static<typeof IdParamsSchema>; Body: Static<typeof MasterProductUpdateSchema> }>('/master-products/:id', {
        schema: { params: IdParamsSchema, body: MasterProductUpdateSchema },
    }, async (request) => {
        const user = request.user!;
        const updated = await db.update(schema.masterProducts)
            .set({
                ...request.body,
                updatedAt: new Date(),
            })
            .where(eq(schema.masterProducts.id, request.params.id))
            .returning();

        await logAudit(
            'master_product.update',
            { id: request.params.id, updates: Object.keys(request.body) },
            user.id,
            null,
            request.params.id,
            'master_product'
        );

        return { success: true, data: updated[0] };
    });

    fastify.delete<{ Params: Static<typeof IdParamsSchema> }>('/master-products/:id', {
        schema: { params: IdParamsSchema },
    }, async (request) => {
        const user = request.user!;
        await db.delete(schema.masterProducts)
            .where(eq(schema.masterProducts.id, request.params.id));

        await logAudit(
            'master_product.delete',
            { id: request.params.id },
            user.id,
            null,
            request.params.id,
            'master_product'
        );

        return { success: true };
    });

    // ========== SYSTEM HEALTH ==========
    fastify.get('/health', async () => ({ success: true, data: await getSystemHealth() }));
    fastify.get('/metrics', async () => ({ success: true, data: getRequestMetrics() }));

    // ========== AUDIT LOGS ==========
    fastify.get<{ Querystring: Static<typeof ListQuerySchema> }>('/audit-logs', {
        schema: { querystring: ListQuerySchema },
    }, async (request) => {
        const limit = Number(request.query.limit) || 50;
        const offset = Number(request.query.offset) || 0;

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
                    role: schema.users.role,
                },
                tenant: {
                    name: schema.tenants.name,
                },
            })
            .from(schema.auditLogs)
            .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
            .leftJoin(schema.tenants, eq(schema.auditLogs.tenantId, schema.tenants.id))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(limit)
            .offset(offset);

        return { success: true, data: logs };
    });

    // ========== BACKUP SETTINGS ==========
    fastify.get('/settings/backup', async () => ({ success: true, data: settings.getBackupSettings() }));

    fastify.put<{ Body: Static<typeof BackupSettingsSchema> }>('/settings/backup', {
        schema: { body: BackupSettingsSchema },
    }, async (request) => ({
        success: true,
        data: settings.updateBackupSettings(request.body),
    }));

    // ========== TELEGRAM TEST ==========
    fastify.post('/test-telegram', async (request, reply) => {
        const { testTelegram } = await import('../lib/telegram');
        const result = await testTelegram();
        if (!result.success) {
            return { success: false, message: result.message };
        }
        return { success: true, message: 'Message sent!' };
    });

    // ========== SCHEDULED JOBS ==========
    fastify.post<{ Params: Static<typeof JobNameParamsSchema> }>('/jobs/:jobName', {
        schema: { params: JobNameParamsSchema },
    }, async (request, reply) => {
        const { triggerJob } = await import('../lib/scheduler');
        const result = await triggerJob(request.params.jobName);

        if (!result.success) {
            return reply.code(400).send(result);
        }

        return result;
    });

    fastify.get('/jobs', async () => ({
        success: true,
        data: [
            { name: 'overdue-debt', description: 'Send overdue debt notifications to admins' },
            { name: 'subscription-expiration', description: 'Send subscription expiring notifications' },
            { name: 'customer-payment-reminder', description: 'Send payment reminders to customers' },
        ],
    }));

    // ========== BACKUP MANAGEMENT ==========
    fastify.post('/backup/now', async (request, reply) => {
        const { createBackup } = await import('../lib/backup');
        const result = await createBackup();

        if (!result.success) {
            return reply.code(500).send({ success: false, message: result.error });
        }

        return { success: true, filename: result.filename };
    });

    fastify.post<{ Body: Static<typeof RestoreBackupBodySchema> }>('/backup/restore', {
        schema: { body: RestoreBackupBodySchema },
    }, async (request, reply) => {
        const { restoreBackup } = await import('../lib/backup');
        const result = await restoreBackup(request.body.filename);

        if (!result.success) {
            return reply.code(400).send({ success: false, message: result.error });
        }

        return { success: true, message: result.message };
    });

    fastify.get('/backups', async () => {
        const { listBackups } = await import('../lib/backup');
        const backups = await listBackups();
        return { success: true, data: backups };
    });

    fastify.get<{ Params: Static<typeof FilenameParamsSchema> }>('/backups/:filename', {
        schema: { params: FilenameParamsSchema },
    }, async (request, reply) => {
        const { getBackupPath } = await import('../lib/backup');
        const { filename } = request.params;

        const filePath = getBackupPath(filename);
        try {
            const stats = await stat(filePath);
            const stream = createReadStream(filePath);

            return reply
                .header('Content-Type', 'application/octet-stream')
                .header('Content-Length', stats.size.toString())
                .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
                .send(stream);
        } catch {
            return reply.code(404).send('File not found');
        }
    });
};
