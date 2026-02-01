import { sql } from "drizzle-orm";

export async function up(db: any) {
    // Add follow_up_reminder_sent_at column to sales_visits table
    await db.execute(sql`
        ALTER TABLE "sales_visits" 
        ADD COLUMN IF NOT EXISTS "follow_up_reminder_sent_at" TIMESTAMP;
    `);
    
    // Create index for better performance on follow-up reminder queries
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "idx_sales_visits_follow_up_reminder" 
        ON "sales_visits" ("outcome", "follow_up_date", "follow_up_reminder_sent_at")
        WHERE "outcome" = 'follow_up' AND "follow_up_reminder_sent_at" IS NULL;
    `);
    
    console.log('[Migration] Added follow_up_reminder_sent_at column and index');
}

export async function down(db: any) {
    // Drop index first
    await db.execute(sql`
        DROP INDEX IF EXISTS "idx_sales_visits_follow_up_reminder";
    `);
    
    // Drop column
    await db.execute(sql`
        ALTER TABLE "sales_visits" 
        DROP COLUMN IF EXISTS "follow_up_reminder_sent_at";
    `);
    
    console.log('[Migration] Removed follow_up_reminder_sent_at column and index');
}