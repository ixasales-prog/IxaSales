import { pgTable, uuid, varchar, timestamp, boolean, integer, decimal, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './core';

// ============================================================================
// ENUMS
// ============================================================================

export const discountTypeEnum = pgEnum('discount_type', [
    'percentage',
    'fixed',
    'buy_x_get_y',
    'volume'
]);

export const discountScopeTypeEnum = pgEnum('discount_scope_type', [
    'all',
    'category',
    'subcategory',
    'brand',
    'product',
    'customer',
    'customer_tier',
    'territory'
]);

// ============================================================================
// DISCOUNTS
// ============================================================================

export const discounts = pgTable('discounts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: discountTypeEnum('type').notNull(),
    value: decimal('value', { precision: 15, scale: 2 }),
    minQty: integer('min_qty'),
    freeQty: integer('free_qty'),
    minOrderAmount: decimal('min_order_amount', { precision: 15, scale: 2 }),
    maxDiscountAmount: decimal('max_discount_amount', { precision: 15, scale: 2 }),
    isActive: boolean('is_active').default(true),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// DISCOUNT SCOPES
// ============================================================================

export const discountScopes = pgTable('discount_scopes', {
    id: uuid('id').primaryKey().defaultRandom(),
    discountId: uuid('discount_id').references(() => discounts.id).notNull(),
    scopeType: discountScopeTypeEnum('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// VOLUME TIERS
// ============================================================================

export const volumeTiers = pgTable('volume_tiers', {
    id: uuid('id').primaryKey().defaultRandom(),
    discountId: uuid('discount_id').references(() => discounts.id).notNull(),
    minQty: integer('min_qty').notNull(),
    discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
