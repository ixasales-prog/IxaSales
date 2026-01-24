/**
 * Migration: Add unique constraint and index to tenant_settings table
 * 
 * This ensures that each tenant can only have one setting per key,
 * and improves query performance for settings lookups.
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function up() {
    console.log('[Migration] Adding unique constraint to tenant_settings...');

    // First, remove any duplicate entries (keep the most recent one)
    await db.execute(sql`
        DELETE FROM tenant_settings t1
        USING tenant_settings t2
        WHERE t1.id < t2.id
        AND t1.tenant_id = t2.tenant_id
        AND t1.key = t2.key
    `);

    // Add unique constraint on (tenant_id, key)
    await db.execute(sql`
        ALTER TABLE tenant_settings
        ADD CONSTRAINT tenant_settings_tenant_key_unique UNIQUE (tenant_id, key)
    `);

    // Add index for faster lookups
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_key 
        ON tenant_settings(tenant_id, key)
    `);

    console.log('[Migration] Unique constraint added successfully');
}

export async function down() {
    console.log('[Migration] Removing unique constraint from tenant_settings...');
    
    await db.execute(sql`
        ALTER TABLE tenant_settings
        DROP CONSTRAINT IF EXISTS tenant_settings_tenant_key_unique
    `);

    await db.execute(sql`
        DROP INDEX IF EXISTS idx_tenant_settings_tenant_key
    `);

    console.log('[Migration] Unique constraint removed');
}
