import { sql } from 'drizzle-orm';
import { db } from '../index';

/**
 * Migration: Add waymark column to customers table
 * Run with: npx tsx src/db/migrations/add_customers_waymark.ts
 */
async function migrate() {
    console.log('Adding waymark column to customers...');

    try {
        await db.execute(sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS waymark VARCHAR(255)
        `);
        console.log('✓ waymark column added successfully');

    } catch (error: any) {
        console.error('Migration failed:', error.message);
        throw error;
    }

    console.log('Done.');
}

migrate()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
