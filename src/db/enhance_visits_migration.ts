import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running migration: enhance sales_visits with additional indexes...');

    try {
        // Add additional indexes for better performance
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "idx_sales_visits_status" ON "sales_visits" ("status");
        `);
        console.log('Index "idx_sales_visits_status" created');

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "idx_sales_visits_tenant_status_date" ON "sales_visits" ("tenant_id", "status", "planned_date");
        `);
        console.log('Index "idx_sales_visits_tenant_status_date" created');

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "idx_sales_visits_started_at" ON "sales_visits" ("started_at");
        `);
        console.log('Index "idx_sales_visits_started_at" created');

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "idx_sales_visits_completed_at" ON "sales_visits" ("completed_at");
        `);
        console.log('Index "idx_sales_visits_completed_at" created');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();