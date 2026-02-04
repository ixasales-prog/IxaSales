import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

// ============================================================================
// USER TELEGRAM LINKING CODES
// ============================================================================

/**
 * Temporary linking codes for users to connect their Telegram accounts.
 * When a user wants to link their Telegram:
 * 1. System generates a unique code
 * 2. User sends this code to the tenant's Telegram bot
 * 3. Bot validates the code and links the chat ID to the user
 * 4. Code is deleted after use or expiration
 */
export const userTelegramLinkCodes = pgTable('user_telegram_link_codes', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

    // The linking code (6-character alphanumeric for easy typing)
    code: varchar('code', { length: 20 }).notNull(),

    // Expiration (codes should be short-lived for security, e.g., 15 minutes)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueCode: unique('unique_link_code').on(table.tenantId, table.code),
    uniqueUserPending: unique('unique_user_pending_link').on(table.userId),
}));
