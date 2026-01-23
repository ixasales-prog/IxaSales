/**
 * Migration: Create system_settings table
 * 
 * This table stores platform-wide settings that persist across server restarts.
 * Previously these were stored in-memory and lost on restart.
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function up() {
    console.log('[Migration] Creating system_settings table...');

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS system_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT,
            description VARCHAR(500),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Create index for faster key lookups
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key)
    `);

    console.log('[Migration] system_settings table created successfully');
}

export async function down() {
    console.log('[Migration] Dropping system_settings table...');
    await db.execute(sql`DROP TABLE IF EXISTS system_settings`);
    console.log('[Migration] system_settings table dropped');
}

// Run migration if called directly (CommonJS-safe)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isMain = typeof require !== 'undefined' && (require as any).main === module;
if (_isMain) {
    up()
        .then(() => {
            console.log('Migration complete');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}
