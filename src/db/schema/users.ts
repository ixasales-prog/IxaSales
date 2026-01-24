import { pgTable, uuid, varchar, text, timestamp, boolean, decimal, pgEnum, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { customers } from './customers';

// ============================================================================
// ENUMS
// ============================================================================

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
// USERS
// ============================================================================

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    supervisorId: uuid('supervisor_id').references((): any => users.id),
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
    
    // User Activity Tracking preferences
    activityTrackingEnabled: boolean('activity_tracking_enabled').default(true), // User opt-in/opt-out
    lastActivityUpdateAt: timestamp('last_activity_update_at'), // Last successful activity update
    
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
// USER SESSIONS & ACTIVITY TRACKING
// ============================================================================

// User sessions table for tracking user activity sessions
export const userSessions = pgTable('user_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    
    // Session timing
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    duration: varchar('duration'), // Store as text for interval
    
    // Activity metrics
    pageVisits: integer('page_visits').default(0).notNull(),
    actionsCount: integer('actions_count').default(0).notNull(),
    idleTime: varchar('idle_time'), // Store as text for interval
    
    // Session context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    deviceInfo: text('device_info'), // JSON string
    
    // Session status
    isActive: boolean('is_active').default(true).notNull(),
    endedReason: text('ended_reason'), // normal, timeout, logout, error
    
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// User activity events table for detailed tracking
export const userActivityEvents = pgTable('user_activity_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => userSessions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    
    // Event details
    eventType: text('event_type').notNull(), // page_visit, user_action, form_interaction, etc.
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    url: text('url'),
    pageTitle: text('page_title'),
    
    // Event metadata
    metadata: text('metadata'), // JSON string for flexible storage
    
    // Performance metrics
    loadTime: integer('load_time'), // milliseconds
    interactionDelay: integer('interaction_delay'), // milliseconds
    
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
