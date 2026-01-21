import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, jsonb, integer } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

// ============================================================================
// ENUMS
// ============================================================================

export const notificationChannelEnum = pgEnum('notification_channel', [
    'telegram',
    'email',
    'push'
]);

export const notificationStatusEnum = pgEnum('notification_status', [
    'pending',
    'sent',
    'failed'
]);

export const auditActionEnum = pgEnum('audit_action', [
    'create',
    'update',
    'delete',
    'login',
    'logout',
    'approve',
    'cancel'
]);

export const auditUserTypeEnum = pgEnum('audit_user_type', [
    'user',
    'customer_user',
    'system'
]);

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

export const notificationSettings = pgTable('notification_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    telegramEnabled: boolean('telegram_enabled').default(false),
    emailEnabled: boolean('email_enabled').default(false),
    pushEnabled: boolean('push_enabled').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// NOTIFICATION LOGS
// ============================================================================

export const notificationLogs = pgTable('notification_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    userId: uuid('user_id').references(() => users.id), // Admin user recipient (nullable)

    // Recipient type: who this notification was sent to
    recipientType: varchar('recipient_type', { length: 20 }).default('admin'), // 'admin', 'customer', 'super_admin'
    recipientId: uuid('recipient_id'), // customerId if recipientType is 'customer'
    recipientChatId: varchar('recipient_chat_id', { length: 50 }), // The actual Telegram chat ID used

    // Notification details
    channel: notificationChannelEnum('channel').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(), // e.g., 'order.created', 'payment.received'
    message: text('message'),

    // Reference to the entity that triggered this notification
    referenceType: varchar('reference_type', { length: 50 }), // 'order', 'payment', 'delivery', etc.
    referenceId: uuid('reference_id'), // The order ID, payment ID, etc.

    // Delivery status
    status: notificationStatusEnum('status').default('pending'),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),

    // Metadata (JSON for additional context)
    metadata: jsonb('metadata'), // { orderNumber, amount, customerName, etc. }

    // Timestamps
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id), // Nullable (system actions)
    tenantId: uuid('tenant_id').references(() => tenants.id), // Nullable (global actions)
    action: varchar('action', { length: 100 }).notNull(), // e.g., 'user.create', 'order.delete'
    entityId: varchar('entity_id', { length: 255 }), // ID of the affected object
    entityType: varchar('entity_type', { length: 50 }), // 'user', 'order', 'product'
    details: text('details'), // JSON string or description
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
});
