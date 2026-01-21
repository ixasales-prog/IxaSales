import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Applying audit_logs migration...');

    // Create Table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "audit_logs" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "user_id" uuid,
            "tenant_id" uuid,
            "action" varchar(100) NOT NULL,
            "entity_id" varchar(255),
            "entity_type" varchar(50),
            "details" text,
            "ip_address" varchar(45),
            "user_agent" text,
            "created_at" timestamp DEFAULT now()
        );
    `);

    // Add FK Constraints
    await db.execute(sql`
        DO $$ BEGIN
         ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
        EXCEPTION
         WHEN duplicate_object THEN null;
        END $$;
    `);

    await db.execute(sql`
        DO $$ BEGIN
         ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
        EXCEPTION
         WHEN duplicate_object THEN null;
        END $$;
    `);

    console.log('Migration applied.');
    process.exit(0);
}

main();
