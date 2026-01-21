import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, pgEnum } from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'enterprise']);
export const paymentTokenStatusEnum = pgEnum('payment_token_status', ['pending', 'paid', 'expired', 'cancelled']);

// ============================================================================
// TENANTS
// ============================================================================

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  subdomain: varchar('subdomain', { length: 100 }).unique().notNull(),
  plan: planEnum('plan').default('free'),
  maxUsers: integer('max_users').default(5),
  maxProducts: integer('max_products').default(100),
  maxOrdersPerMonth: integer('max_orders_per_month').default(500),
  currency: varchar('currency', { length: 3 }).default('USD'),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  defaultTaxRate: decimal('default_tax_rate', { precision: 5, scale: 2 }).default('0'),
  isActive: boolean('is_active').default(true),
  telegramEnabled: boolean('telegram_enabled').default(false), // Super Admin controls this

  // Payment Gateway Configuration
  paymentPortalEnabled: boolean('payment_portal_enabled').default(false),
  clickMerchantId: varchar('click_merchant_id', { length: 100 }),
  clickServiceId: varchar('click_service_id', { length: 100 }),
  clickSecretKey: varchar('click_secret_key', { length: 255 }),
  paymeMerchantId: varchar('payme_merchant_id', { length: 100 }),
  paymeSecretKey: varchar('payme_secret_key', { length: 255 }),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TENANT SETTINGS
// ============================================================================

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  key: varchar('key', { length: 100 }).notNull(),
  value: text('value'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Example settings keys:
// order_number_prefix, po_number_prefix, payment_number_prefix
// require_order_approval, allow_partial_delivery, auto_reserve_stock
// low_stock_notification_threshold, debt_warning_threshold

// ============================================================================
// PAYMENT TOKENS (for secure payment portal links)
// ============================================================================

export const paymentTokens = pgTable('payment_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  orderId: uuid('order_id').notNull(), // References orders table
  customerId: uuid('customer_id').notNull(), // References customers table
  token: varchar('token', { length: 64 }).unique().notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('UZS'),
  status: paymentTokenStatusEnum('status').default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  paidAt: timestamp('paid_at'),
  paidVia: varchar('paid_via', { length: 20 }), // 'click' | 'payme'
  providerTransactionId: varchar('provider_transaction_id', { length: 100 }),
});
