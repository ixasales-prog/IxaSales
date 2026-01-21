import { pgTable, uuid, text, timestamp, boolean, integer, decimal, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { orders, orderItems } from './orders';
import { products } from './products';

// ============================================================================
// ENUMS
// ============================================================================

export const returnReasonEnum = pgEnum('return_reason', [
    'damaged',
    'expired',
    'wrong_item',
    'customer_refused',
    'other'
]);

export const returnConditionEnum = pgEnum('return_condition', [
    'resellable',
    'damaged',
    'expired',
    'disposed'
]);

// ============================================================================
// RETURNS
// ============================================================================

export const returns = pgTable('returns', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    orderId: uuid('order_id').references(() => orders.id).notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    qtyReturned: integer('qty_returned').notNull(),
    reason: returnReasonEnum('reason').notNull(),
    reasonNotes: text('reason_notes'),
    condition: returnConditionEnum('condition'),
    restock: boolean('restock').default(false),
    refundAmount: decimal('refund_amount', { precision: 15, scale: 2 }).default('0'),
    processedBy: uuid('processed_by').references(() => users.id),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
