import { pgTable, uuid, varchar, text, timestamp, boolean, decimal } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { orders } from './orders';
import { customers } from './customers';
import { suppliers } from './products';
import { purchaseOrders } from './procurement';

// ============================================================================
// PAYMENT METHODS
// ============================================================================

export const paymentMethods = pgTable('payment_methods', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// PAYMENTS (Customer payments)
// ============================================================================

export const payments = pgTable('payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    paymentNumber: varchar('payment_number', { length: 50 }).unique().notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    collectedBy: uuid('collected_by').references(() => users.id),
    referenceNumber: varchar('reference_number', { length: 100 }),
    notes: text('notes'),
    collectedAt: timestamp('collected_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// SUPPLIER PAYMENTS
// ============================================================================

export const supplierPayments = pgTable('supplier_payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    paymentNumber: varchar('payment_number', { length: 50 }).unique().notNull(),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
    supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    paidBy: uuid('paid_by').references(() => users.id),
    referenceNumber: varchar('reference_number', { length: 100 }),
    notes: text('notes'),
    paidAt: timestamp('paid_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
