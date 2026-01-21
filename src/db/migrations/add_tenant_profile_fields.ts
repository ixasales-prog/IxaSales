/**
 * Migration: Add company profile fields to tenants table
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function up() {
    console.log('[Migration] Adding company profile fields to tenants table...');

    await db.execute(sql`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS address VARCHAR(500),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS country VARCHAR(100),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS website VARCHAR(255),
        ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS logo VARCHAR(500)
    `);

    console.log('[Migration] Company profile fields added successfully');
}

export async function down() {
    console.log('[Migration] Removing company profile fields from tenants table...');
    await db.execute(sql`
        ALTER TABLE tenants 
        DROP COLUMN IF EXISTS address,
        DROP COLUMN IF EXISTS city,
        DROP COLUMN IF EXISTS country,
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS email,
        DROP COLUMN IF EXISTS website,
        DROP COLUMN IF EXISTS tax_id,
        DROP COLUMN IF EXISTS logo
    `);
    console.log('[Migration] Company profile fields removed');
}

if (import.meta.main) {
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
