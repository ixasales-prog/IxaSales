import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, date, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { territories } from './territories';

// ============================================================================
// ENUMS
// ============================================================================

export const tierConditionTypeEnum = pgEnum('tier_condition_type', [
    'days_since_order',
    'debt_over_limit',
    'debt_overdue_days'
]);

// ============================================================================
// CUSTOMER TIERS
// ============================================================================

export const customerTiers = pgTable('customer_tiers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }),
    creditAllowed: boolean('credit_allowed').default(false),
    creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }).default('0'),
    maxOrderAmount: decimal('max_order_amount', { precision: 15, scale: 2 }),
    paymentTermsDays: integer('payment_terms_days').default(0),
    discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }).default('0'),
    canCreateOrders: boolean('can_create_orders').default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// CUSTOMERS
// ============================================================================

export const customers = pgTable('customers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    territoryId: uuid('territory_id').references(() => territories.id),
    tierId: uuid('tier_id').references(() => customerTiers.id),
    assignedSalesRepId: uuid('assigned_sales_rep_id').references(() => users.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    code: varchar('code', { length: 50 }).unique(),
    name: varchar('name', { length: 255 }).notNull(),
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    waymark: varchar('waymark', { length: 255 }), // Landmark/reference point (Mo'ljal)
    latitude: decimal('latitude', { precision: 10, scale: 8 }),
    longitude: decimal('longitude', { precision: 11, scale: 8 }),
    creditBalance: decimal('credit_balance', { precision: 15, scale: 2 }).default('0'),
    debtBalance: decimal('debt_balance', { precision: 15, scale: 2 }).default('0'),
    notes: text('notes'),
    lastOrderDate: date('last_order_date'),
    telegramChatId: varchar('telegram_chat_id', { length: 50 }), // For customer notifications

    // OTP for Customer Portal authentication
    otpCode: varchar('otp_code', { length: 6 }),
    otpExpiresAt: timestamp('otp_expires_at'),

    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// CUSTOMER USERS (B2B Portal)
// ============================================================================

export const customerUsers = pgTable('customer_users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TIER DOWNGRADE RULES
// ============================================================================

export const tierDowngradeRules = pgTable('tier_downgrade_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    fromTierId: uuid('from_tier_id').references(() => customerTiers.id).notNull(),
    toTierId: uuid('to_tier_id').references(() => customerTiers.id).notNull(),
    conditionType: tierConditionTypeEnum('condition_type').notNull(),
    conditionValue: integer('condition_value').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TIER UPGRADE RULES
// ============================================================================

export const upgradeConditionTypeEnum = pgEnum('upgrade_condition_type', [
    'orders_count',          // minimum number of orders in period
    'total_spend',           // minimum total spend in period (in base currency)
    'on_time_payment_pct',   // percentage of orders paid within payment terms
]);

export const tierUpgradeRules = pgTable('tier_upgrade_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    fromTierId: uuid('from_tier_id').references(() => customerTiers.id).notNull(),
    toTierId: uuid('to_tier_id').references(() => customerTiers.id).notNull(),
    conditionType: upgradeConditionTypeEnum('condition_type').notNull(),
    conditionValue: integer('condition_value').notNull(), // threshold value
    periodDays: integer('period_days').default(90).notNull(), // rolling window in days
    cooldownDays: integer('cooldown_days').default(30).notNull(), // minimum days between upgrades
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TIER CHANGE LOGS
// ============================================================================

export const tierChangeTypeEnum = pgEnum('tier_change_type', [
    'downgrade',
    'upgrade',
    'manual',
]);

export const tierChangeLogs = pgTable('tier_change_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    fromTierId: uuid('from_tier_id').references(() => customerTiers.id).notNull(),
    toTierId: uuid('to_tier_id').references(() => customerTiers.id).notNull(),
    changeType: tierChangeTypeEnum('change_type').default('downgrade'),
    ruleId: uuid('rule_id'), // references either downgrade or upgrade rule
    reason: text('reason'),
    executedAt: timestamp('executed_at').defaultNow(),
});

