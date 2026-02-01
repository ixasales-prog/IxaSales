import { pgTable, uuid, varchar, text, timestamp, integer, decimal, date, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { suppliers, products } from './products';

// ============================================================================
// ENUMS
// ============================================================================

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
    'draft',
    'pending',
    'approved',
    'ordered',
    'partial_received',
    'received',
    'cancelled'
]);

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

export const purchaseOrders = pgTable('purchase_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    poNumber: varchar('po_number', { length: 50 }).unique().notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
    createdBy: uuid('created_by').references(() => users.id).notNull(),
    status: purchaseOrderStatusEnum('status').default('draft'),
    subtotalAmount: decimal('subtotal_amount', { precision: 15, scale: 2 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 15, scale: 2 }).default('0'),
    expectedDate: date('expected_date'),
    receivedAt: timestamp('received_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// PURCHASE ORDER ITEMS
// ============================================================================

export const purchaseOrderItems = pgTable('purchase_order_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    qtyOrdered: integer('qty_ordered').notNull(),
    qtyReceived: integer('qty_received').default(0),
    unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),
    lineTotal: decimal('line_total', { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
