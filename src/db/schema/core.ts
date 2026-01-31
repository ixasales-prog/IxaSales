import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, pgEnum, unique } from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'enterprise']);
export const paymentTokenStatusEnum = pgEnum('payment_token_status', ['pending', 'paid', 'expired', 'cancelled']);

export const userRoleEnum = pgEnum('user_role', [
    'super_admin',
    'tenant_admin',
    'supervisor',
    'sales_rep',
    'warehouse',
    'driver'
]);

export const userTypeEnum = pgEnum('user_type', ['user', 'customer_user']);

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
    currency: varchar('currency', { length: 3 }).default('UZS'),
    timezone: varchar('timezone', { length: 50 }).default('Asia/Tashkent'),
    defaultTaxRate: decimal('default_tax_rate', { precision: 5, scale: 2 }).default('0'),

    // Business Settings
    orderNumberPrefix: varchar('order_number_prefix', { length: 20 }).default('ORD-'),
    invoiceNumberPrefix: varchar('invoice_number_prefix', { length: 20 }).default('INV-'),
    defaultPaymentTerms: integer('default_payment_terms').default(7),

    // Company Profile
    address: varchar('address', { length: 500 }),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 100 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 255 }),
    taxId: varchar('tax_id', { length: 100 }),
    logo: varchar('logo', { length: 500 }), // URL to logo

    // Subscription fields
    subscriptionEndAt: timestamp('subscription_end_at'),
    planStatus: varchar('plan_status', { length: 20 }).default('active'), // active, trial, past_due, cancelled

    // Super Admin controls
    telegramEnabled: boolean('telegram_enabled').default(false),
    telegramBotToken: varchar('telegram_bot_token', { length: 100 }), // Tenant's own bot token
    telegramBotUsername: varchar('telegram_bot_username', { length: 100 }), // e.g. "MyStoreBot"
    telegramWebhookSecret: varchar('telegram_webhook_secret', { length: 100 }), // Per-tenant webhook secret for security

    // Payment Gateway Configuration
    paymentPortalEnabled: boolean('payment_portal_enabled').default(false),
    clickMerchantId: varchar('click_merchant_id', { length: 100 }),
    clickServiceId: varchar('click_service_id', { length: 100 }),
    clickSecretKey: varchar('click_secret_key', { length: 255 }),
    paymeMerchantId: varchar('payme_merchant_id', { length: 100 }),
    paymeSecretKey: varchar('payme_secret_key', { length: 255 }),

    // Location Services
    yandexGeocoderApiKey: varchar('yandex_geocoder_api_key', { length: 100 }),

    // Weather Services
    openWeatherApiKey: varchar('open_weather_api_key', { length: 100 }),

    isActive: boolean('is_active').default(true),
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
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TENANT NOTIFICATION SETTINGS (Tenant Admin Controls)
// ============================================================================

export const tenantNotificationSettings = pgTable('tenant_notification_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull().unique(),

    // ============================================================================
    // ADMIN NOTIFICATIONS (sent to tenant admins via their telegramChatId)
    // ============================================================================

    // Order lifecycle - Admin
    notifyNewOrder: boolean('notify_new_order').default(true),
    notifyOrderApproved: boolean('notify_order_approved').default(true),
    notifyOrderCancelled: boolean('notify_order_cancelled').default(true),
    notifyOrderDelivered: boolean('notify_order_delivered').default(true),
    notifyOrderPartialDelivery: boolean('notify_order_partial_delivery').default(true),
    notifyOrderReturned: boolean('notify_order_returned').default(true),
    notifyOrderPartialReturn: boolean('notify_order_partial_return').default(true),
    notifyOrderCompleted: boolean('notify_order_completed').default(true),

    // Payment - Admin
    notifyPaymentReceived: boolean('notify_payment_received').default(true),
    notifyPaymentPartial: boolean('notify_payment_partial').default(true),
    notifyPaymentComplete: boolean('notify_payment_complete').default(true),

    // Stock & Debt - Admin
    notifyLowStock: boolean('notify_low_stock').default(true),
    notifyDueDebt: boolean('notify_due_debt').default(false),

    // ============================================================================
    // CUSTOMER NOTIFICATIONS (sent to customers via their telegramChatId)
    // ============================================================================

    // Order lifecycle - Customer
    customerNotifyOrderConfirmed: boolean('customer_notify_order_confirmed').default(true),
    customerNotifyOrderApproved: boolean('customer_notify_order_approved').default(true),
    customerNotifyOrderCancelled: boolean('customer_notify_order_cancelled').default(true),
    customerNotifyOutForDelivery: boolean('customer_notify_out_for_delivery').default(true),
    customerNotifyDelivered: boolean('customer_notify_delivered').default(true),
    customerNotifyPartialDelivery: boolean('customer_notify_partial_delivery').default(true),
    customerNotifyReturned: boolean('customer_notify_returned').default(false),

    // Payment - Customer
    customerNotifyPaymentReceived: boolean('customer_notify_payment_received').default(true),
    customerNotifyPaymentDue: boolean('customer_notify_payment_due').default(true),

    // ============================================================================
    // THRESHOLDS
    // ============================================================================
    lowStockThreshold: integer('low_stock_threshold').default(10),
    dueDebtDaysThreshold: integer('due_debt_days_threshold').default(7),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});



// ============================================================================
// USERS
// ============================================================================

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    supervisorId: uuid('supervisor_id'), // Self-reference handled separately
    role: userRoleEnum('role').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    telegramChatId: varchar('telegram_chat_id', { length: 100 }),
    isActive: boolean('is_active').default(true),
    lastLoginAt: timestamp('last_login_at'),
    
    // GPS Tracking preferences
    gpsTrackingEnabled: boolean('gps_tracking_enabled').default(true), // User opt-in/opt-out
    lastLocationUpdateAt: timestamp('last_location_update_at'), // Last successful GPS update
    lastKnownLatitude: decimal('last_known_latitude', { precision: 10, scale: 8 }), // Most recent location
    lastKnownLongitude: decimal('last_known_longitude', { precision: 11, scale: 8 }), // Most recent location
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// SESSIONS
// ============================================================================

export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    userType: userTypeEnum('user_type').notNull(),
    token: varchar('token', { length: 500 }).unique().notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});
// ============================================================================
// NOTIFICATION ROLE SETTINGS (Which roles receive which notifications)
// ============================================================================

export const notificationRoleSettings = pgTable('notification_role_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    notificationType: varchar('notification_type', { length: 100 }).notNull(), // e.g., 'notifyNewOrder'
    role: userRoleEnum('role').notNull(), // 'tenant_admin', 'supervisor', 'sales_rep', 'warehouse', 'driver'
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    uniqueRoleSetting: unique('unique_role_setting').on(table.tenantId, table.notificationType, table.role),
}));

// ============================================================================
// PAYMENT TOKENS (for secure payment portal links)
// ============================================================================

export const paymentTokens = pgTable('payment_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    orderId: uuid('order_id').notNull(), // References orders table - foreign key added via migration
    customerId: uuid('customer_id').notNull(), // References customers table - foreign key added via migration
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
