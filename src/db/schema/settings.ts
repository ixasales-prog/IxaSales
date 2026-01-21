import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// ============================================================================
// SYSTEM SETTINGS (Super Admin level, persisted settings)
// ============================================================================

export const systemSettings = pgTable('system_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 100 }).unique().notNull(),
    value: text('value'),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Predefined keys:
 * - telegram.enabled (boolean as string)
 * - telegram.botToken (encrypted or plain)
 * - telegram.defaultChatId (string)
 * - telegram.webhookSecret (for webhook validation)
 * - email.enabled
 * - email.smtpHost
 * - email.smtpPort
 * - email.smtpUsername
 * - email.smtpPassword
 * - email.fromEmail
 * - email.fromName
 * - branding.platformName
 * - branding.primaryColor
 * - security.sessionTimeoutMinutes
 * - security.maxLoginAttempts
 * - defaults.currency
 * - defaults.timezone
 */
