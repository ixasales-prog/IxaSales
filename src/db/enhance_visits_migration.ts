import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running migration: enhance sales_visits for quick visit flow...');

    try {
        // Add no_order_reason column
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "no_order_reason" text;
        `);
        console.log('Column "no_order_reason" added');

        // Add follow_up_reason column
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "follow_up_reason" text;
        `);
        console.log('Column "follow_up_reason" added');

        // Add follow_up_date column
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "follow_up_date" date;
        `);
        console.log('Column "follow_up_date" added');

        // Add follow_up_time column
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "follow_up_time" time;
        `);
        console.log('Column "follow_up_time" added');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
