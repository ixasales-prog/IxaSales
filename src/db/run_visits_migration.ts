
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running manual migration for sales_visits...');

    try {
        // Create enums
        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE visit_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled', 'missed');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        console.log('visit_status enum created/verified');

        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE visit_type AS ENUM ('scheduled', 'ad_hoc', 'phone_call');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        console.log('visit_type enum created/verified');

        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE visit_outcome AS ENUM ('order_placed', 'no_order', 'follow_up');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        console.log('visit_outcome enum created/verified');

        // Create sales_visits table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "sales_visits" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
                "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
                "sales_rep_id" uuid NOT NULL REFERENCES "users"("id"),
                "visit_type" visit_type DEFAULT 'scheduled',
                "status" visit_status DEFAULT 'planned',
                "outcome" visit_outcome,
                "planned_date" date NOT NULL,
                "planned_time" time,
                "started_at" timestamp,
                "completed_at" timestamp,
                "start_latitude" decimal(10, 8),
                "start_longitude" decimal(11, 8),
                "end_latitude" decimal(10, 8),
                "end_longitude" decimal(11, 8),
                "notes" text,
                "outcome_notes" text,
                "photos" json DEFAULT '[]'::json,
                "order_id" uuid REFERENCES "orders"("id"),
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now()
            );
        `);
        console.log('sales_visits table created');

        // Create indexes
        await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_tenant_id" ON "sales_visits" ("tenant_id");`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_customer_id" ON "sales_visits" ("customer_id");`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_sales_rep_id" ON "sales_visits" ("sales_rep_id");`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_planned_date" ON "sales_visits" ("planned_date");`);
        console.log('Indexes created');

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
