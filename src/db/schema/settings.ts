import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// ========================================================================
// SYSTEM SETTINGS (Super Admin level, persisted settings)
// ========================================================================

export const systemSettings = pgTable('system_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 100 }).unique().notNull(),
    value: text('value'),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================================================
// TENANT SETTINGS KEYS (Predefined configuration keys)
// ========================================================================

export const tenantSettingsKeys = [
    'company_name',
    'company_email',
    'company_phone',
    'company_address',
    'currency',
    'timezone',
    'language',
    'theme',
    'logo_url',
    'favicon_url',
    'primary_color',
    'secondary_color',
    'enable_branding',
    'enable_notifications',
    'notification_email',
    'notification_sms',
    'notification_telegram',
    'gps_tracking_enabled',
    'gps_movement_threshold_meters',
    'gps_fallback_interval_seconds',
    'gps_history_retention_days',
    'gps_min_accuracy_meters',
    'user_activity_tracking_enabled',
    'user_activity_retention_days',
    'user_activity_roles_enabled',
    'openweather_api_key',
    'yandex_geocoder_api_key'
] as const;

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