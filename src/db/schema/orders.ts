import { pgTable, uuid, varchar, text, timestamp, integer, decimal, date, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { customers, customerUsers } from './customers';
import { products } from './products';
import { discounts } from './discounts';

// ============================================================================
// ENUMS
// ============================================================================

export const orderStatusEnum = pgEnum('order_status', [
    'pending',
    'confirmed',
    'approved',
    'picking',
    'picked',
    'loaded',
    'delivering',
    'delivered',
    'returned',
    'partial',
    'cancelled'
]);

export const paymentStatusEnum = pgEnum('payment_status', [
    'unpaid',
    'partial',
    'paid'
]);

// ============================================================================
// ORDERS
// ============================================================================

export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    orderNumber: varchar('order_number', { length: 50 }).unique().notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    salesRepId: uuid('sales_rep_id').references(() => users.id),
    driverId: uuid('driver_id').references(() => users.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdByCustomerId: uuid('created_by_customer_id').references(() => customerUsers.id),
    status: orderStatusEnum('status').default('pending'),
    paymentStatus: paymentStatusEnum('payment_status').default('unpaid'),
    subtotalAmount: decimal('subtotal_amount', { precision: 15, scale: 2 }).notNull(),
    discountId: uuid('discount_id').references(() => discounts.id),
    discountAmount: decimal('discount_amount', { precision: 15, scale: 2 }).default('0'),
    taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 15, scale: 2 }).default('0'),
    notes: text('notes'),
    deliveryNotes: text('delivery_notes'),
    requestedDeliveryDate: date('requested_delivery_date'),
    deliveredAt: timestamp('delivered_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    // Composite indexes for multi-column lookups and filtering
    idxOrdersTenantCustomer: index('idx_orders_tenant_customer').on(table.tenantId, table.customerId),
    idxOrdersTenantStatus: index('idx_orders_tenant_status').on(table.tenantId, table.status),
    idxOrdersTenantCreatedAt: index('idx_orders_tenant_created_at').on(table.tenantId, table.createdAt),
    idxOrdersCustomerDate: index('idx_orders_customer_date').on(table.customerId, table.createdAt),
    idxOrdersSalesRep: index('idx_orders_sales_rep').on(table.salesRepId),
}));

// ============================================================================
// ORDER ITEMS
// ============================================================================

export const orderItems = pgTable('order_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
    qtyOrdered: integer('qty_ordered').notNull(),
    qtyPicked: integer('qty_picked').default(0),
    qtyDelivered: integer('qty_delivered').default(0),
    qtyReturned: integer('qty_returned').default(0),
    discountId: uuid('discount_id').references(() => discounts.id),
    discountAmount: decimal('discount_amount', { precision: 15, scale: 2 }).default('0'),
    taxAmount: decimal('tax_amount', { precision: 15, scale: 2 }).default('0'),
    lineTotal: decimal('line_total', { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    idxOrderItemsOrderId: index('idx_order_items_order_id').on(table.orderId),
    idxOrderItemsProductId: index('idx_order_items_product_id').on(table.productId),
}));

// ============================================================================
// ORDER STATUS HISTORY
// ============================================================================

export const orderStatusHistory = pgTable('order_status_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    idxOrderStatusHistoryOrderId: index('idx_order_status_history_order_id').on(table.orderId),
    idxOrderStatusHistoryCreatedAt: index('idx_order_status_history_created_at').on(table.createdAt),
}));
