import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';

// Schemas
const ListNotificationsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
});

const NotificationIdParamsSchema = Type.Object({ id: Type.String() });

const PushSubscriptionBodySchema = Type.Object({
    endpoint: Type.String(),
    keys: Type.Object({ p256dh: Type.String(), auth: Type.String() }),
});

const UpdateSettingsBodySchema = Type.Object({
    eventType: Type.String(),
    telegramEnabled: Type.Boolean(),
    emailEnabled: Type.Boolean(),
    pushEnabled: Type.Boolean(),
});

const TenantSettingsBodySchema = Type.Object({
    notifyNewOrder: Type.Optional(Type.Boolean()),
    notifyOrderApproved: Type.Optional(Type.Boolean()),
    notifyOrderCancelled: Type.Optional(Type.Boolean()),
    notifyOrderDelivered: Type.Optional(Type.Boolean()),
    notifyOrderPartialDelivery: Type.Optional(Type.Boolean()),
    notifyOrderReturned: Type.Optional(Type.Boolean()),
    notifyOrderPartialReturn: Type.Optional(Type.Boolean()),
    notifyOrderCompleted: Type.Optional(Type.Boolean()),
    notifyPaymentReceived: Type.Optional(Type.Boolean()),
    notifyPaymentPartial: Type.Optional(Type.Boolean()),
    notifyPaymentComplete: Type.Optional(Type.Boolean()),
    notifyLowStock: Type.Optional(Type.Boolean()),
    notifyDueDebt: Type.Optional(Type.Boolean()),
    customerNotifyOrderConfirmed: Type.Optional(Type.Boolean()),
    customerNotifyOrderApproved: Type.Optional(Type.Boolean()),
    customerNotifyOrderCancelled: Type.Optional(Type.Boolean()),
    customerNotifyOutForDelivery: Type.Optional(Type.Boolean()),
    customerNotifyDelivered: Type.Optional(Type.Boolean()),
    customerNotifyPartialDelivery: Type.Optional(Type.Boolean()),
    customerNotifyReturned: Type.Optional(Type.Boolean()),
    customerNotifyPaymentReceived: Type.Optional(Type.Boolean()),
    customerNotifyPaymentDue: Type.Optional(Type.Boolean()),
    lowStockThreshold: Type.Optional(Type.Number({ minimum: 1 })),
    dueDebtDaysThreshold: Type.Optional(Type.Number({ minimum: 1 })),
});

type ListNotificationsQuery = Static<typeof ListNotificationsQuerySchema>;
type PushSubscriptionBody = Static<typeof PushSubscriptionBodySchema>;
type UpdateSettingsBody = Static<typeof UpdateSettingsBodySchema>;
type TenantSettingsBody = Static<typeof TenantSettingsBodySchema>;

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
    // List notifications
    fastify.get<{ Querystring: ListNotificationsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListNotificationsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', status } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [
            eq(schema.notificationLogs.tenantId, user.tenantId),
            eq(schema.notificationLogs.userId, user.id)
        ];
        if (status) conditions.push(eq(schema.notificationLogs.status, status as any));

        const notifications = await db.select().from(schema.notificationLogs)
            .where(and(...conditions)).orderBy(desc(schema.notificationLogs.createdAt)).limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.notificationLogs).where(and(...conditions));

        return { success: true, data: notifications, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Mark as read
    fastify.patch<{ Params: Static<typeof NotificationIdParamsSchema> }>('/:id/read', {
        preHandler: [fastify.authenticate],
        schema: { params: NotificationIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [notification] = await db.update(schema.notificationLogs)
            .set({ status: 'sent', sentAt: new Date() })
            .where(and(eq(schema.notificationLogs.id, id), eq(schema.notificationLogs.userId, user.id)))
            .returning();

        return { success: true, data: notification };
    });

    // Push subscription (mock)
    fastify.post<{ Body: PushSubscriptionBody }>('/push-subscription', {
        preHandler: [fastify.authenticate],
        schema: { body: PushSubscriptionBodySchema },
    }, async (request, reply) => {
        return { success: true, message: 'Subscription saved (mock)' };
    });

    // Get user settings
    fastify.get('/settings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const settings = await db.select().from(schema.notificationSettings)
            .where(eq(schema.notificationSettings.userId, user.id));
        return { success: true, data: settings };
    });

    // Update user settings
    fastify.put<{ Body: UpdateSettingsBody }>('/settings', {
        preHandler: [fastify.authenticate],
        schema: { body: UpdateSettingsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        const [setting] = await db.insert(schema.notificationSettings).values({
            userId: user.id, eventType: body.eventType, telegramEnabled: body.telegramEnabled,
            emailEnabled: body.emailEnabled, pushEnabled: body.pushEnabled,
        }).onConflictDoUpdate({
            target: [schema.notificationSettings.userId, schema.notificationSettings.eventType],
            set: { telegramEnabled: body.telegramEnabled, emailEnabled: body.emailEnabled, pushEnabled: body.pushEnabled, updatedAt: new Date() }
        }).returning();

        return { success: true, data: setting };
    });

    // Get tenant notification settings
    fastify.get('/tenant-settings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const [settings] = await db.select().from(schema.tenantNotificationSettings)
            .where(eq(schema.tenantNotificationSettings.tenantId, user.tenantId)).limit(1);

        const [tenant] = await db.select({ telegramEnabled: schema.tenants.telegramEnabled })
            .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

        if (!settings) {
            return {
                success: true, data: {
                    telegramEnabledByAdmin: tenant?.telegramEnabled ?? false,
                    notifyNewOrder: true, notifyOrderApproved: true, notifyOrderCancelled: true, notifyOrderDelivered: true,
                    notifyOrderPartialDelivery: true, notifyOrderReturned: true, notifyOrderPartialReturn: true, notifyOrderCompleted: true,
                    notifyPaymentReceived: true, notifyPaymentPartial: true, notifyPaymentComplete: true, notifyLowStock: true, notifyDueDebt: false,
                    customerNotifyOrderConfirmed: true, customerNotifyOrderApproved: true, customerNotifyOrderCancelled: true,
                    customerNotifyOutForDelivery: true, customerNotifyDelivered: true, customerNotifyPartialDelivery: true,
                    customerNotifyReturned: false, customerNotifyPaymentReceived: true, customerNotifyPaymentDue: true,
                    lowStockThreshold: 10, dueDebtDaysThreshold: 7,
                }
            };
        }

        return { success: true, data: { ...settings, telegramEnabledByAdmin: tenant?.telegramEnabled ?? false } };
    });

    // Update tenant notification settings
    fastify.put<{ Body: TenantSettingsBody }>('/tenant-settings', {
        preHandler: [fastify.authenticate],
        schema: { body: TenantSettingsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const body = request.body;
        const [settings] = await db.insert(schema.tenantNotificationSettings).values({
            tenantId: user.tenantId,
            notifyNewOrder: body.notifyNewOrder ?? true, notifyOrderApproved: body.notifyOrderApproved ?? true,
            notifyOrderCancelled: body.notifyOrderCancelled ?? true, notifyOrderDelivered: body.notifyOrderDelivered ?? true,
            notifyOrderPartialDelivery: body.notifyOrderPartialDelivery ?? true, notifyOrderReturned: body.notifyOrderReturned ?? true,
            notifyOrderPartialReturn: body.notifyOrderPartialReturn ?? true, notifyOrderCompleted: body.notifyOrderCompleted ?? true,
            notifyPaymentReceived: body.notifyPaymentReceived ?? true, notifyPaymentPartial: body.notifyPaymentPartial ?? true,
            notifyPaymentComplete: body.notifyPaymentComplete ?? true, notifyLowStock: body.notifyLowStock ?? true,
            notifyDueDebt: body.notifyDueDebt ?? false, customerNotifyOrderConfirmed: body.customerNotifyOrderConfirmed ?? true,
            customerNotifyOrderApproved: body.customerNotifyOrderApproved ?? true, customerNotifyOrderCancelled: body.customerNotifyOrderCancelled ?? true,
            customerNotifyOutForDelivery: body.customerNotifyOutForDelivery ?? true, customerNotifyDelivered: body.customerNotifyDelivered ?? true,
            customerNotifyPartialDelivery: body.customerNotifyPartialDelivery ?? true, customerNotifyReturned: body.customerNotifyReturned ?? false,
            customerNotifyPaymentReceived: body.customerNotifyPaymentReceived ?? true, customerNotifyPaymentDue: body.customerNotifyPaymentDue ?? true,
            lowStockThreshold: body.lowStockThreshold ?? 10, dueDebtDaysThreshold: body.dueDebtDaysThreshold ?? 7,
        }).onConflictDoUpdate({
            target: schema.tenantNotificationSettings.tenantId,
            set: { ...body, updatedAt: new Date() } as any,
        }).returning();

        return { success: true, data: settings };
    });
};
