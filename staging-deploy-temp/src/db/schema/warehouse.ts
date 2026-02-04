import { pgTable, uuid, varchar, text, timestamp, integer, json, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { products } from './products';

// ============================================================================
// ENUMS
// ============================================================================

export const scanActionEnum = pgEnum('scan_action', [
    'receiving',
    'picking',
    'packing',
    'counting',
    'search',
    'verification'
]);

export const stockCountStatusEnum = pgEnum('stock_count_status', [
    'in_progress',
    'completed',
    'cancelled'
]);

export const packingStatusEnum = pgEnum('packing_status', [
    'started',
    'in_progress',
    'completed',
    'cancelled'
]);

// ============================================================================
// SCAN LOGS (Audit Trail)
// ============================================================================

export const scanLogs = pgTable('scan_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    productId: uuid('product_id').references(() => products.id),
    action: scanActionEnum('action').notNull(),
    barcode: varchar('barcode', { length: 200 }),
    details: json('details'), // Flexible JSON field for context
    deviceInfo: varchar('device_info', { length: 500 }),
    scannedAt: timestamp('scanned_at').defaultNow().notNull(),
});

// ============================================================================
// STOCK COUNTS
// ============================================================================

export const stockCounts = pgTable('stock_counts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: stockCountStatusEnum('status').default('in_progress').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    notes: text('notes'),
});

export const stockCountItems = pgTable('stock_count_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    countId: uuid('count_id').references(() => stockCounts.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    expectedQty: integer('expected_qty').notNull(), // From system
    countedQty: integer('counted_qty'), // Actual counted  
    variance: integer('variance'), // countedQty - expectedQty
    scannedAt: timestamp('scanned_at'),
    countedByUserId: uuid('counted_by_user_id').references(() => users.id),
    notes: text('notes'),
});

// ============================================================================
// PACKING SESSIONS
// ============================================================================

export const packingSessions = pgTable('packing_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    orderId: uuid('order_id').notNull(), // References orders table
    status: packingStatusEnum('status').default('started').notNull(),
    packedByUserId: uuid('packed_by_user_id').references(() => users.id).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    itemsScanned: integer('items_scanned').default(0),
    totalItems: integer('total_items').notNull(),
    notes: text('notes'),
});

export const packingItems = pgTable('packing_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => packingSessions.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    qtyOrdered: integer('qty_ordered').notNull(),
    qtyScanned: integer('qty_scanned').default(0),
    scannedAt: timestamp('scanned_at'),
    isVerified: integer('is_verified').default(0), // 0 = not scanned, 1 = scanned
});
