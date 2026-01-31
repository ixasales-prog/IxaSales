import { db } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration to remove 'not_available' from visit_outcome enum
 * 
 * This migration:
 * 1. Updates any existing visits with outcome='not_available' to 'no_order'
 * 2. Updates the no_order_reason field to indicate the customer was not available
 * 3. Note: PostgreSQL doesn't support removing enum values directly, so we keep
 *    the enum value in the database but remove it from application code
 */

async function main() {
    console.log('Running migration: Remove not_available from visit_outcome...');

    try {
        // Step 1: Update all visits with outcome='not_available' to 'no_order'
        const updateResult = await db.execute(sql`
            UPDATE sales_visits 
            SET 
                outcome = 'no_order',
                no_order_reason = COALESCE(no_order_reason, 'customer_not_available'),
                updated_at = NOW()
            WHERE outcome = 'not_available'
        `);

        console.log(`Updated ${(updateResult as any).rowCount || 0} visits from 'not_available' to 'no_order'`);

        // Note: We cannot drop the enum value from PostgreSQL enum
        // PostgreSQL doesn't support ALTER TYPE ... DROP VALUE
        // The enum value will remain in the database but won't be used by the application
        // If you need to completely remove it, you would need to:
        // 1. Create a new enum type without the value
        // 2. Update all columns using the old enum
        // 3. Drop the old enum
        // This is complex and risky for production data

        console.log('Migration completed successfully!');
        console.log('Note: The not_available enum value remains in the database but is no longer used by the application.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
