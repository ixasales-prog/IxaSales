import { pgTable, uuid, varchar, text, timestamp, boolean, decimal, pgEnum, integer } from 'drizzle-orm/pg-core';
import { tenants, users, userRoleEnum, userTypeEnum } from './core';



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
