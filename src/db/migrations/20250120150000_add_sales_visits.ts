import { sql } from "drizzle-orm";
import { pgEnum } from "drizzle-orm/pg-core";

export async function up(db: any) {
    // Create enums
    await db.execute(sql`
        DO $$ BEGIN
            CREATE TYPE visit_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled', 'missed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    `);

    await db.execute(sql`
        DO $$ BEGIN
            CREATE TYPE visit_type AS ENUM ('scheduled', 'ad_hoc', 'phone_call');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    `);

    await db.execute(sql`
        DO $$ BEGIN
            CREATE TYPE visit_outcome AS ENUM ('order_placed', 'no_order', 'follow_up', 'not_available');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    `);

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

    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_tenant_id" ON "sales_visits" ("tenant_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_customer_id" ON "sales_visits" ("customer_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_sales_rep_id" ON "sales_visits" ("sales_rep_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_sales_visits_planned_date" ON "sales_visits" ("planned_date");`);
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS "sales_visits";`);
    await db.execute(sql`DROP TYPE IF EXISTS "visit_status";`);
    await db.execute(sql`DROP TYPE IF EXISTS "visit_type";`);
    await db.execute(sql`DROP TYPE IF EXISTS "visit_outcome";`);
}
