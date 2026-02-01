import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { products } from './products';

// ============================================================================
// ENUMS
// ============================================================================

export const movementTypeEnum = pgEnum('movement_type', [
    'in',
    'out',
    'adjust',
    'reserve',
    'unreserve',
    'return'
]);

export const referenceTypeEnum = pgEnum('reference_type', [
    'purchase_order',
    'order',
    'return',
    'adjustment',
    'initial'
]);

export const adjustmentTypeEnum = pgEnum('adjustment_type', [
    'count',
    'damage',
    'loss',
    'found',
    'correction'
]);

// ============================================================================
// STOCK MOVEMENTS
// ============================================================================

export const stockMovements = pgTable('stock_movements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    movementType: movementTypeEnum('movement_type').notNull(),
    quantity: integer('quantity').notNull(),
    quantityBefore: integer('quantity_before').notNull(),
    quantityAfter: integer('quantity_after').notNull(),
    referenceType: referenceTypeEnum('reference_type'),
    referenceId: uuid('reference_id'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// STOCK ADJUSTMENTS
// ============================================================================

export const stockAdjustments = pgTable('stock_adjustments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    adjustmentNumber: varchar('adjustment_number', { length: 50 }).unique().notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    adjustmentType: adjustmentTypeEnum('adjustment_type').notNull(),
    qtyBefore: integer('qty_before').notNull(),
    qtyAfter: integer('qty_after').notNull(),
    reason: text('reason').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
