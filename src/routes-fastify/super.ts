import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { db, schema } from '../db';
import { eq, count, sum, desc, or, ilike, gt, lt, and, sql } from 'drizzle-orm';
import { ensurePlanLimitsLoaded, getAllPlanLimits, getPlanLimits, updatePlanLimits } from '../lib/planLimits';
import * as settings from '../lib/systemSettings';
import { logAudit } from '../lib/audit';
import { getSystemHealth } from '../lib/health';
import { getRequestMetrics } from '../lib/request-logger-fastify';

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
    frequency: Type.Optional(Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly'), Type.Literal('never')])),
    scheduleTime: Type.Optional(Type.String({ pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' })),
    timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    retentionDays: Type.Optional(Type.Number({ minimum: 0, maximum: 365 })),
});

const RestoreBackupBodySchema = Type.Object({
    filename: Type.String(),
    confirmInPlaceRestore: Type.Optional(Type.Boolean()),
});

const CreateTenantBackupBodySchema = Type.Object({
    tenantId: Type.String(),
    format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
});

const ExtractTenantBackupBodySchema = Type.Object({
    tenantId: Type.String(),
    filename: Type.String({ minLength: 1 }),
    format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
});

const VerifyBackupsBodySchema = Type.Object({
    filename: Type.Optional(Type.String()),
    maxFiles: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    runRestoreDrill: Type.Optional(Type.Boolean()),
});

const CreateBackupNowBodySchema = Type.Object({
    format: Type.Optional(Type.Union([Type.Literal('sql'), Type.Literal('custom')])),
});

const BackfillBackupManifestsBodySchema = Type.Object({
    maxFiles: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
});

const TenantScopedRestoreBodySchema = Type.Union([
    Type.Object({
        tenantId: Type.String(),
        data: Type.String({ minLength: 2 }),
        sourceExtractFormat: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
    }),
    Type.Object({
        tenantId: Type.String(),
        filename: Type.String({ minLength: 1 }),
        sourceExtractFormat: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
    }),
    Type.Object({
        tenantId: Type.String(),
        sourceBackupFilename: Type.String({ minLength: 1 }),
        sourceExtractFormat: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('sql')])),
    }),
]);

const ListQuerySchema = Type.Object({
    limit: Type.Optional(Type.String()),
    offset: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
});

const SubscriptionRequestListQuerySchema = Type.Object({
    limit: Type.Optional(Type.String()),
    offset: Type.Optional(Type.String()),
    tenantId: Type.Optional(Type.String()),
    status: Type.Optional(Type.Union([
        Type.Literal('submitted'),
        Type.Literal('approved'),
        Type.Literal('rejected'),
    ])),
    desiredPlan: Type.Optional(Type.Union([
        Type.Literal('starter'),
        Type.Literal('pro'),
        Type.Literal('enterprise'),
    ])),
});

const SubscriptionRequestReviewBodySchema = Type.Object({
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    note: Type.Optional(Type.String({ maxLength: 1000 })),
    applyPlan: Type.Optional(Type.Boolean()),
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

const DashboardWindowSchema = Type.Union([
    Type.Literal('24h'),
    Type.Literal('7d'),
    Type.Literal('30d'),
]);

const StatsQuerySchema = Type.Object({
    window: Type.Optional(DashboardWindowSchema),
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
    fastify.get<{ Querystring: Static<typeof StatsQuerySchema> }>('/stats', {
        schema: { querystring: StatsQuerySchema },
    }, async (request) => {
        const windowKey = request.query.window || '30d';
        const windowStart = new Date();
        if (windowKey === '24h') {
            windowStart.setHours(windowStart.getHours() - 24);
        } else if (windowKey === '7d') {
            windowStart.setDate(windowStart.getDate() - 7);
        } else {
            windowStart.setDate(windowStart.getDate() - 30);
        }

        const deliveredOrdersWindowClause = and(
            eq(schema.orders.status, 'delivered'),
            gt(schema.orders.createdAt, windowStart),
        );

        const [revenueResult, ordersResult, tenantsResult, activeTenantsResult] = await Promise.all([
            db.select({ value: sum(schema.orders.totalAmount) })
                .from(schema.orders)
                .where(deliveredOrdersWindowClause),
            db.select({ value: count(schema.orders.id) })
                .from(schema.orders)
                .where(deliveredOrdersWindowClause),
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
                window: windowKey,
            },
        };
    });

    fastify.get<{ Querystring: Static<typeof StatsQuerySchema> }>('/attention', {
        schema: { querystring: StatsQuerySchema },
    }, async (request) => {
        const windowKey = request.query.window || '30d';
        const now = new Date();
        const windowStart = new Date(now);
        if (windowKey === '24h') {
            windowStart.setHours(windowStart.getHours() - 24);
        } else if (windowKey === '7d') {
            windowStart.setDate(windowStart.getDate() - 7);
        } else {
            windowStart.setDate(windowStart.getDate() - 30);
        }
        const expiresUntil = new Date(now);
        expiresUntil.setDate(expiresUntil.getDate() + 7);

        const [expiringTenantsResult, backupFailureResult, latestBackupCreateAudit, latestBackupVerifyAudits] = await Promise.all([
            db.select({ value: count(schema.tenants.id) })
                .from(schema.tenants)
                .where(and(
                    eq(schema.tenants.isActive, true),
                    eq(schema.tenants.planStatus, 'active'),
                    gt(schema.tenants.subscriptionEndAt, now),
                    lt(schema.tenants.subscriptionEndAt, expiresUntil),
                )),
            db.select({ value: count(schema.auditLogs.id) })
                .from(schema.auditLogs)
                .where(and(
                    gt(schema.auditLogs.createdAt, windowStart),
                    or(
                        eq(schema.auditLogs.action, 'backup.verify.failed'),
                        eq(schema.auditLogs.action, 'backup.restore.failed'),
                        eq(schema.auditLogs.action, 'backup.tenant_restore.failed'),
                        eq(schema.auditLogs.action, 'backup.tenant_self_restore.failed'),
                    ),
                )),
            db.select({
                createdAt: schema.auditLogs.createdAt,
            })
                .from(schema.auditLogs)
                .where(eq(schema.auditLogs.action, 'backup.create'))
                .orderBy(desc(schema.auditLogs.createdAt))
                .limit(1),
            db.select({
                details: schema.auditLogs.details,
                createdAt: schema.auditLogs.createdAt,
            })
                .from(schema.auditLogs)
                .where(or(
                    eq(schema.auditLogs.action, 'backup.verify'),
                    eq(schema.auditLogs.action, 'backup.verify.failed'),
                ))
                .orderBy(desc(schema.auditLogs.createdAt))
                .limit(25),
        ]);

        let pendingUpgradeRequests = 0;
        try {
            const pendingUpgradeResult = await db.select({
                value: count(schema.auditLogs.id),
            })
                .from(schema.auditLogs)
                .where(and(
                    eq(schema.auditLogs.action, 'subscription.upgrade_request'),
                    sql`COALESCE((${schema.auditLogs.details})::jsonb ->> 'status', 'submitted') = 'submitted'`,
                ));
            pendingUpgradeRequests = Number(pendingUpgradeResult[0]?.value || 0);
        } catch {
            const allUpgradeRequests = await db.select({
                details: schema.auditLogs.details,
            })
                .from(schema.auditLogs)
                .where(eq(schema.auditLogs.action, 'subscription.upgrade_request'));
            pendingUpgradeRequests = allUpgradeRequests.reduce((acc, row) => {
                let details: any = null;
                try {
                    details = row.details ? JSON.parse(row.details) : {};
                } catch {
                    details = {};
                }
                const status = details?.status || 'submitted';
                return status === 'submitted' ? acc + 1 : acc;
            }, 0);
        }

        let newestBackupAtFromVerify: Date | null = null;
        for (const row of latestBackupVerifyAudits) {
            let details: any = null;
            try {
                details = row.details ? JSON.parse(row.details) : {};
            } catch {
                details = null;
            }
            const parsedNewest = details?.newestBackupAt ? new Date(details.newestBackupAt) : null;
            if (parsedNewest && !Number.isNaN(parsedNewest.getTime())) {
                newestBackupAtFromVerify = parsedNewest;
                break;
            }
        }

        const latestBackupCreateAt = latestBackupCreateAudit[0]?.createdAt || null;
        const latestBackupAt = latestBackupCreateAt && newestBackupAtFromVerify
            ? (latestBackupCreateAt > newestBackupAtFromVerify ? latestBackupCreateAt : newestBackupAtFromVerify)
            : (latestBackupCreateAt || newestBackupAtFromVerify);
        const staleBackup = !latestBackupAt || (now.getTime() - latestBackupAt.getTime()) > (24 * 60 * 60 * 1000);

        const alerts: Array<{
            id: string;
            severity: 'critical' | 'warning' | 'info';
            title: string;
            description: string;
            href: string;
        }> = [];

        const expiringTenants = Number(expiringTenantsResult[0]?.value || 0);
        const backupFailures = Number(backupFailureResult[0]?.value || 0);

        if (staleBackup) {
            alerts.push({
                id: 'backup-stale',
                severity: 'critical',
                title: 'Backup freshness risk',
                description: latestBackupAt
                    ? `Latest verified backup timestamp is older than 24 hours (${latestBackupAt.toISOString()}).`
                    : 'No full-system backup found.',
                href: '/super/backup/operations',
            });
        }

        if (backupFailures > 0) {
            alerts.push({
                id: 'backup-failures',
                severity: 'warning',
                title: 'Backup failures detected',
                description: `${backupFailures} backup-related failures in the selected time window.`,
                href: '/super/audit-logs',
            });
        }

        if (expiringTenants > 0) {
            alerts.push({
                id: 'subscriptions-expiring',
                severity: 'warning',
                title: 'Subscriptions expiring soon',
                description: `${expiringTenants} tenant subscriptions end within 7 days.`,
                href: '/super/tenants',
            });
        }

        if (pendingUpgradeRequests > 0) {
            alerts.push({
                id: 'pending-upgrades',
                severity: 'info',
                title: 'Pending upgrade requests',
                description: `${pendingUpgradeRequests} subscription upgrade requests await review.`,
                href: '/super/subscription-requests',
            });
        }

        if (alerts.length === 0) {
            alerts.push({
                id: 'all-clear',
                severity: 'info',
                title: 'All critical checks are healthy',
                description: 'No immediate operational risks were detected.',
                href: '/super/health',
            });
        }

        return {
            success: true,
            data: {
                window: windowKey,
                generatedAt: now.toISOString(),
                counts: {
                    expiringTenants,
                    pendingUpgradeRequests,
                    backupFailures,
                    staleBackup,
                    latestBackupAt: latestBackupAt ? latestBackupAt.toISOString() : null,
                },
                alerts,
            },
        };
    });

    // ========== PLAN LIMITS ==========
    fastify.get('/plan-limits', async () => {
        await ensurePlanLimitsLoaded();
        return { success: true, data: getAllPlanLimits() };
    });

    fastify.put<{ Body: Static<typeof PlanLimitsBodySchema> }>('/plan-limits', {
        schema: { body: PlanLimitsBodySchema },
    }, async (request) => {
        await updatePlanLimits(request.body.limits);
        return { success: true, data: getAllPlanLimits() };
    });

    // ========== SUBSCRIPTION REQUESTS ==========
    fastify.get<{ Querystring: Static<typeof SubscriptionRequestListQuerySchema> }>('/subscription-requests', {
        schema: { querystring: SubscriptionRequestListQuerySchema },
    }, async (request) => {
        const limit = Math.max(1, Math.min(200, Number(request.query.limit || 50)));
        const offset = Math.max(0, Number(request.query.offset || 0));
        const conditions: any[] = [eq(schema.auditLogs.action, 'subscription.upgrade_request')];

        if (request.query.tenantId) {
            conditions.push(eq(schema.auditLogs.tenantId, request.query.tenantId));
        }

        const rows = await db.select({
            id: schema.auditLogs.id,
            tenantId: schema.auditLogs.tenantId,
            userId: schema.auditLogs.userId,
            details: schema.auditLogs.details,
            createdAt: schema.auditLogs.createdAt,
        })
            .from(schema.auditLogs)
            .where(and(...conditions))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(limit)
            .offset(offset);

        const parsed = rows
            .map((row) => {
                let details: any = {};
                try {
                    details = row.details ? JSON.parse(row.details) : {};
                } catch {
                    details = {};
                }

                if (request.query.desiredPlan && details.desiredPlan !== request.query.desiredPlan) {
                    return null;
                }
                if (request.query.status && (details.status || 'submitted') !== request.query.status) {
                    return null;
                }

                return {
                    id: row.id,
                    tenantId: row.tenantId,
                    userId: row.userId,
                    tenantPlan: details.tenantPlan || null,
                    desiredPlan: details.desiredPlan || null,
                    reason: details.reason || null,
                    status: details.status || 'submitted',
                    requestedBy: details.requestedBy || null,
                    submittedAt: row.createdAt?.toISOString?.() || null,
                    reviewedAt: details.reviewedAt || null,
                    reviewedBy: details.reviewedBy || null,
                    reviewNote: details.reviewNote || null,
                };
            })
            .filter(Boolean);

        return { success: true, data: parsed };
    });

    fastify.patch<{
        Params: Static<typeof IdParamsSchema>;
        Body: Static<typeof SubscriptionRequestReviewBodySchema>;
    }>('/subscription-requests/:id/review', {
        schema: { params: IdParamsSchema, body: SubscriptionRequestReviewBodySchema },
    }, async (request, reply) => {
        const { id } = request.params;
        const { decision, note, applyPlan } = request.body;
        const reviewer = request.user!;

        const [reqLog] = await db.select({
            id: schema.auditLogs.id,
            tenantId: schema.auditLogs.tenantId,
            details: schema.auditLogs.details,
        })
            .from(schema.auditLogs)
            .where(and(
                eq(schema.auditLogs.id, id),
                eq(schema.auditLogs.action, 'subscription.upgrade_request')
            ))
            .limit(1);

        if (!reqLog) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Subscription request not found' } });
        }

        let details: any = {};
        try {
            details = reqLog.details ? JSON.parse(reqLog.details) : {};
        } catch {
            details = {};
        }

        if ((details.status || 'submitted') !== 'submitted') {
            return reply.code(409).send({
                success: false,
                error: { code: 'ALREADY_REVIEWED', message: 'This subscription request has already been reviewed.' },
            });
        }

        const desiredPlan = details.desiredPlan as 'starter' | 'pro' | 'enterprise' | undefined;
        const shouldApplyPlan = decision === 'approved' && (applyPlan ?? true) && !!desiredPlan;

        await db.transaction(async (tx) => {
            if (shouldApplyPlan && reqLog.tenantId) {
                await ensurePlanLimitsLoaded();
                const limits = getPlanLimits(desiredPlan!);
                await tx.update(schema.tenants)
                    .set({
                        plan: desiredPlan as any,
                        maxUsers: limits.maxUsers,
                        maxProducts: limits.maxProducts,
                        maxOrdersPerMonth: limits.maxOrdersPerMonth,
                        planStatus: 'active',
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.tenants.id, reqLog.tenantId));
            }

            const reviewMeta = {
                ...details,
                status: decision,
                reviewedAt: new Date().toISOString(),
                reviewedBy: {
                    id: reviewer.id,
                    name: reviewer.name,
                    email: reviewer.email,
                },
                reviewNote: note?.trim() || null,
                planApplied: !!shouldApplyPlan,
            };

            await tx.update(schema.auditLogs)
                .set({ details: JSON.stringify(reviewMeta) })
                .where(eq(schema.auditLogs.id, id));

            await tx.insert(schema.auditLogs).values({
                userId: reviewer.id,
                tenantId: reqLog.tenantId || null,
                action: 'subscription.upgrade_request.review',
                entityId: id,
                entityType: 'subscription_request',
                details: JSON.stringify({
                    decision,
                    note: note?.trim() || null,
                    desiredPlan: desiredPlan || null,
                    planApplied: !!shouldApplyPlan,
                }),
                ipAddress: request.ip || null,
                userAgent: (request.headers['user-agent'] as string) || null,
            });
        });

        return {
            success: true,
            data: {
                id,
                status: decision,
                planApplied: !!shouldApplyPlan,
            },
        };
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
    }, async (request) => {
        const updated = await settings.updateBackupSettings(request.body);
        const { runBackupSchedule } = await import('../lib/backup');
        runBackupSchedule();

        return {
            success: true,
            data: updated,
        };
    });

    // ========== TELEGRAM TEST ==========
    fastify.post('/test-telegram', async () => {
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
            { name: 'follow-up-reminders', description: 'Send follow-up reminders to sales representatives' },
            { name: 'notification-retry', description: 'Retry failed notifications' },
            { name: 'gps-cleanup', description: 'Clean up old GPS tracking data' },
            { name: 'backup-verify', description: 'Verify backup integrity and freshness' },
            { name: 'backup-verify-drill', description: 'Verify backups with restore drill (needs verification DB)' },
            { name: 'backup-verify-drill-nightly', description: 'Run nightly-style restore drill once with superadmin alerting on failure' },
            { name: 'backup-verify-tenant', description: 'Verify tenant backup integrity and freshness' },
        ],
    }));

    // ========== BACKUP MANAGEMENT ==========
    fastify.post<{ Body: Static<typeof CreateBackupNowBodySchema> }>('/backup/now', {
        schema: { body: CreateBackupNowBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { createBackup } = await import('../lib/backup');
        const result = await createBackup({ format: request.body.format });

        if (!result.success) {
            const statusCode = result.code === 'BACKUP_IN_PROGRESS' ? 409 : 500;
            return reply.code(statusCode).send({ success: false, message: result.error });
        }

        await logAudit(
            'backup.create',
            { filename: result.filename || null },
            user.id,
            null,
            result.filename || undefined,
            'backup_file',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        return { success: true, filename: result.filename };
    });

    fastify.post<{ Body: Static<typeof RestoreBackupBodySchema> }>('/backup/restore', {
        schema: { body: RestoreBackupBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { restoreBackup } = await import('../lib/backup');
        const result = await restoreBackup(request.body.filename, {
            confirmInPlaceRestore: request.body.confirmInPlaceRestore === true,
        });

        if (!result.success) {
            await logAudit(
                'backup.restore.failed',
                {
                    filename: request.body.filename,
                    error: result.error || null,
                    confirmInPlaceRestore: request.body.confirmInPlaceRestore === true,
                },
                user.id,
                null,
                request.body.filename,
                'backup_file',
                request.ip || undefined,
                (request.headers['user-agent'] as string) || undefined,
            );
            return reply.code(400).send({ success: false, message: result.error });
        }

        await logAudit(
            'backup.restore',
            {
                filename: request.body.filename,
                message: result.message || null,
                safetySnapshotFilename: result.safetySnapshotFilename || null,
                confirmInPlaceRestore: request.body.confirmInPlaceRestore === true,
            },
            user.id,
            null,
            request.body.filename,
            'backup_file',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        return {
            success: true,
            message: result.message,
            safetySnapshotFilename: result.safetySnapshotFilename,
        };
    });

    fastify.post<{ Body: Static<typeof CreateTenantBackupBodySchema> }>('/tenant-backup', {
        schema: { body: CreateTenantBackupBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({ id: schema.tenants.id })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, request.body.tenantId))
            .limit(1);
        if (!tenant) {
            return reply.code(404).send({ success: false, message: 'Tenant not found' });
        }
        const { createTenantScopedBackup } = await import('../lib/backup');
        const result = await createTenantScopedBackup(request.body.tenantId, request.body.format || 'json');

        await logAudit(
            result.success ? 'backup.tenant_create' : 'backup.tenant_create.failed',
            {
                tenantId: request.body.tenantId,
                format: request.body.format || 'json',
                filename: result.filename || null,
                error: result.error || null,
            },
            user.id,
            request.body.tenantId,
            result.filename || undefined,
            'tenant_backup_file',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!result.success) {
            const statusCode = result.code === 'BACKUP_IN_PROGRESS' ? 409 : 400;
            return reply.code(statusCode).send({ success: false, message: result.error });
        }

        return { success: true, filename: result.filename };
    });

    fastify.post<{ Body: Static<typeof ExtractTenantBackupBodySchema> }>('/backup/extract-tenant', {
        schema: { body: ExtractTenantBackupBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const [tenant] = await db.select({ id: schema.tenants.id })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, request.body.tenantId))
            .limit(1);
        if (!tenant) {
            return reply.code(404).send({ success: false, message: 'Tenant not found' });
        }

        const extractionFormat = request.body.format || 'json';
        const { extractTenantBackupFromFullBackup } = await import('../lib/backup');
        const extracted = await extractTenantBackupFromFullBackup(
            request.body.filename,
            request.body.tenantId,
            extractionFormat
        );

        await logAudit(
            extracted.success ? 'backup.extract_tenant' : 'backup.extract_tenant.failed',
            {
                sourceFilename: request.body.filename,
                tenantId: request.body.tenantId,
                format: extractionFormat,
                outputFilename: extracted.filename || null,
                error: extracted.error || null,
            },
            user.id,
            request.body.tenantId,
            extracted.filename || undefined,
            'tenant_backup_file',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!extracted.success || !extracted.filename) {
            return reply.code(extracted.code === 'BACKUP_IN_PROGRESS' ? 409 : 400).send({
                success: false,
                message: extracted.error || 'Failed to extract tenant backup from full-system backup',
            });
        }

        return {
            success: true,
            filename: extracted.filename,
            message: 'Tenant backup extracted successfully',
        };
    });

    fastify.get('/tenant-backups', async () => {
        const { listTenantScopedBackups } = await import('../lib/backup');
        const list = await listTenantScopedBackups();
        return { success: true, data: list };
    });

    fastify.post<{ Body: Static<typeof VerifyBackupsBodySchema> }>('/backup/verify', {
        schema: { body: VerifyBackupsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { verifyBackups } = await import('../lib/backup');
        const result = await verifyBackups({
            filename: request.body.filename,
            maxFiles: request.body.maxFiles,
            runRestoreDrill: request.body.runRestoreDrill,
        });

        const successfulDrillDurations = result.items
            .filter((item) => item.restoreDrillAttempted && item.restoreDrillSucceeded && typeof item.restoreDrillDurationMs === 'number')
            .map((item) => item.restoreDrillDurationMs as number);
        const lastRestoreDrillDurationMs = successfulDrillDurations.length > 0
            ? successfulDrillDurations[successfulDrillDurations.length - 1]
            : null;

        await logAudit(
            result.success ? 'backup.verify' : 'backup.verify.failed',
            {
                filename: request.body.filename || null,
                maxFiles: request.body.maxFiles || null,
                runRestoreDrill: request.body.runRestoreDrill ?? null,
                checked: result.checked,
                passed: result.passed,
                failed: result.failed,
                restoreDrillEnabled: result.restoreDrillEnabled,
                lastRestoreDrillDurationMs,
            },
            user.id,
            null,
            request.body.filename || undefined,
            'backup_verification',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!result.success) {
            return reply.code(400).send({ success: false, data: result });
        }

        return { success: true, data: result };
    });

    fastify.get('/backup/rto', async () => {
        const [lastSuccessfulRestore] = await db
            .select({
                createdAt: schema.auditLogs.createdAt,
            })
            .from(schema.auditLogs)
            .where(eq(schema.auditLogs.action, 'backup.restore'))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(1);

        const drillAuditLogs = await db
            .select({
                details: schema.auditLogs.details,
                createdAt: schema.auditLogs.createdAt,
            })
            .from(schema.auditLogs)
            .where(or(
                eq(schema.auditLogs.action, 'backup.verify'),
                eq(schema.auditLogs.action, 'backup.verify.failed'),
            ))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(100);

        let lastDrillDurationMs: number | null = null;
        let lastDrillAt: Date | null = null;
        for (const log of drillAuditLogs) {
            if (!log.details) continue;
            try {
                const parsed = JSON.parse(log.details);
                if (parsed?.restoreDrillEnabled !== true) continue;
                const value = Number(parsed?.lastRestoreDrillDurationMs);
                if (!Number.isFinite(value) || value <= 0) continue;
                lastDrillDurationMs = value;
                lastDrillAt = log.createdAt || null;
                break;
            } catch {
                // ignore malformed details
            }
        }

        return {
            success: true,
            data: {
                lastDrillDurationMs,
                lastDrillAt: lastDrillAt ? lastDrillAt.toISOString() : null,
                lastSuccessfulRestoreAt: lastSuccessfulRestore?.createdAt
                    ? lastSuccessfulRestore.createdAt.toISOString()
                    : null,
            },
        };
    });

    fastify.post<{ Body: Static<typeof BackfillBackupManifestsBodySchema> }>('/backup/manifests/backfill', {
        schema: { body: BackfillBackupManifestsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { backfillBackupManifests } = await import('../lib/backup');
        const result = await backfillBackupManifests({
            maxFiles: request.body.maxFiles,
        });

        await logAudit(
            result.success ? 'backup.manifest_backfill' : 'backup.manifest_backfill.failed',
            {
                maxFiles: request.body.maxFiles || null,
                scanned: result.scanned,
                created: result.created,
                skipped: result.skipped,
                errorCount: result.errors.length,
            },
            user.id,
            null,
            undefined,
            'backup_manifest',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!result.success) {
            return reply.code(400).send({ success: false, data: result });
        }

        return { success: true, data: result };
    });

    fastify.post<{ Body: Static<typeof TenantScopedRestoreBodySchema> }>('/tenant-restore', {
        schema: { body: TenantScopedRestoreBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body as Static<typeof TenantScopedRestoreBodySchema>;
        const bodyWithSource = body as {
            tenantId: string;
            data?: string;
            filename?: string;
            sourceBackupFilename?: string;
            sourceExtractFormat?: 'json' | 'sql';
        };
        const requestedFilename = bodyWithSource.filename || bodyWithSource.sourceBackupFilename;
        const targetTenantId = bodyWithSource.tenantId;

        const [tenant] = await db.select({
            id: schema.tenants.id,
            name: schema.tenants.name,
        }).from(schema.tenants).where(eq(schema.tenants.id, targetTenantId)).limit(1);

        if (!tenant) {
            return reply.code(404).send({ success: false, message: 'Tenant not found' });
        }

        let restoreContent: string;
        let generatedTenantBackupFilename: string | null = null;
        if (requestedFilename) {
            const filename = requestedFilename;
            if (filename.startsWith('tenant-')) {
                if (!filename.startsWith(`tenant-${targetTenantId}-`)) {
                    return reply.code(400).send({ success: false, message: 'Backup filename does not belong to target tenant' });
                }
                const { readTenantScopedBackupFile } = await import('../lib/backup');
                const loaded = await readTenantScopedBackupFile(filename, targetTenantId);
                if (!loaded.success) {
                    return reply.code(400).send({ success: false, message: loaded.error });
                }
                restoreContent = loaded.content;
            } else {
                const { extractTenantBackupFromFullBackup, readTenantScopedBackupFile } = await import('../lib/backup');
                const extractionFormat = bodyWithSource.sourceExtractFormat || 'json';
                const extracted = await extractTenantBackupFromFullBackup(filename, targetTenantId, extractionFormat);
                if (!extracted.success || !extracted.filename) {
                    return reply.code(extracted.code === 'BACKUP_IN_PROGRESS' ? 409 : 400).send({
                        success: false,
                        message: extracted.error || 'Failed to extract tenant backup from full-system backup',
                    });
                }
                generatedTenantBackupFilename = extracted.filename;
                const loaded = await readTenantScopedBackupFile(extracted.filename, targetTenantId);
                if (!loaded.success) {
                    return reply.code(400).send({ success: false, message: loaded.error });
                }
                restoreContent = loaded.content;
            }
        } else {
            restoreContent = bodyWithSource.data!;
        }

        const { restoreTenantDataReplace } = await import('../lib/tenant-export');
        const { withBackupOperationLock } = await import('../lib/backup');
        const locked = await withBackupOperationLock(() => restoreTenantDataReplace(targetTenantId, restoreContent));
        if (!locked.success) {
            const statusCode = locked.code === 'BACKUP_IN_PROGRESS' ? 409 : 400;
            return reply.code(statusCode).send({
                success: false,
                message: locked.error,
            });
        }
        const result = locked.data;

        await logAudit(
            result.success ? 'backup.tenant_restore' : 'backup.tenant_restore.failed',
            {
                tenantId: targetTenantId,
                tenantName: tenant.name,
                restoreMode: 'replace',
                imported: result.imported,
                errorCount: result.errors.length,
            },
            user.id,
            targetTenantId,
            targetTenantId,
            'tenant',
            request.ip || undefined,
            (request.headers['user-agent'] as string) || undefined,
        );

        if (!result.success) {
            const primaryError = result.errors?.[0];
            return reply.code(400).send({
                success: false,
                message: primaryError || 'Tenant restore failed',
                errors: result.errors,
                imported: result.imported,
            });
        }

        return {
            success: true,
            message: `Tenant restore finished for ${tenant.name}`,
            imported: result.imported,
            errors: result.errors,
            note: result.errors.length > 0 ? 'Restore completed with some warnings. Review errors for skipped records.' : null,
            generatedTenantBackupFilename,
        };
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
        if (filename.startsWith('tenant-')) {
            return reply.code(400).send({ success: false, message: 'Use tenant backup endpoints for tenant-scoped backup files' });
        }

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
