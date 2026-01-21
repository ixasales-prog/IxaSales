/**
 * Migration: Add business settings fields to tenants table
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function up() {
    console.log('[Migration] Adding business settings fields to tenants table...');

    await db.execute(sql`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS order_number_prefix VARCHAR(20) DEFAULT 'ORD-',
        ADD COLUMN IF NOT EXISTS invoice_number_prefix VARCHAR(20) DEFAULT 'INV-',
        ADD COLUMN IF NOT EXISTS default_payment_terms INTEGER DEFAULT 7
    `);

    console.log('[Migration] Business settings fields added successfully');
}

export async function down() {
    console.log('[Migration] Removing business settings fields from tenants table...');
    await db.execute(sql`
        ALTER TABLE tenants 
        DROP COLUMN IF EXISTS order_number_prefix,
        DROP COLUMN IF EXISTS invoice_number_prefix,
        DROP COLUMN IF EXISTS default_payment_terms
    `);
    console.log('[Migration] Business settings fields removed');
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
