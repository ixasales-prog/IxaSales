import { pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './core';

// ============================================================================
// EXPORT ENUMS
// ============================================================================

export const exportStatusEnum = pgEnum('export_status', ['pending', 'processing', 'completed', 'failed']);
export const exportFormatEnum = pgEnum('export_format', ['json', 'csv', 'xlsx']);
export const exportFrequencyEnum = pgEnum('export_frequency', ['never', 'daily', 'weekly', 'monthly']);

// ============================================================================
// TENANT EXPORTS - Individual export jobs/files
// ============================================================================

export const tenantExports = pgTable('tenant_exports', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),

    // Export configuration
    format: exportFormatEnum('format').default('json'),
    status: exportStatusEnum('status').default('pending'),

    // What data to include
    includeProducts: boolean('include_products').default(true),
    includeCustomers: boolean('include_customers').default(true),
    includeOrders: boolean('include_orders').default(true),
    includePayments: boolean('include_payments').default(true),
    includeInventory: boolean('include_inventory').default(true),

    // Date range filter (optional)
    dateFrom: timestamp('date_from'),
    dateTo: timestamp('date_to'),

    // Result
    filename: varchar('filename', { length: 255 }),
    fileSize: integer('file_size'),
    errorMessage: text('error_message'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    expiresAt: timestamp('expires_at'), // Auto-cleanup after expiry
    downloadedAt: timestamp('downloaded_at'),

    // Who created it
    createdById: uuid('created_by_id'),
});

// ============================================================================
// TENANT EXPORT SETTINGS - Scheduled export configuration
// ============================================================================

export const tenantExportSettings = pgTable('tenant_export_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull().unique(),

    // Schedule
    frequency: exportFrequencyEnum('frequency').default('never'),
    format: exportFormatEnum('format').default('json'),
    scheduleTime: varchar('schedule_time', { length: 5 }).default('03:00'), // HH:MM format

    // Delivery options
    sendToTelegram: boolean('send_to_telegram').default(false), // Send export file to admin Telegram

    // What to include in scheduled exports
    includeProducts: boolean('include_products').default(true),
    includeCustomers: boolean('include_customers').default(true),
    includeOrders: boolean('include_orders').default(true),
    includePayments: boolean('include_payments').default(true),
    includeInventory: boolean('include_inventory').default(true),

    // Retention
    retentionDays: integer('retention_days').default(30),

    // Last run
    lastExportAt: timestamp('last_export_at'),
    nextExportAt: timestamp('next_export_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
