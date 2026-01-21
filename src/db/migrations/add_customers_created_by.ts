import { sql } from 'drizzle-orm';
import { db } from '../index';

/**
 * Migration: Add created_by_user_id to customers table
 * Run with: bun run src/db/migrations/add_customers_created_by.ts
 */
async function migrate() {
    console.log('Adding created_by_user_id column to customers...');

    try {
        await db.execute(sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id)
        `);
        console.log('✓ Column added successfully');

        // Update existing customers to set createdByUserId = assignedSalesRepId
        await db.execute(sql`
            UPDATE customers 
            SET created_by_user_id = assigned_sales_rep_id 
            WHERE created_by_user_id IS NULL AND assigned_sales_rep_id IS NOT NULL
        `);
        console.log('✓ Existing data migrated (createdByUserId = assignedSalesRepId)');

        // Add index for performance
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id 
            ON customers (created_by_user_id)
        `);
        console.log('✓ Index added');

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
