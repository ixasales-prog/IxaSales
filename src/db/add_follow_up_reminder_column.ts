import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running manual migration for follow-up reminders...');

    try {
        // Add follow_up_reminder_sent_at column to sales_visits table
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "follow_up_reminder_sent_at" TIMESTAMP;
        `);
        
        console.log('Added follow_up_reminder_sent_at column');
        
        // Create index for better performance on follow-up reminder queries
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "idx_sales_visits_follow_up_reminder" 
            ON "sales_visits" ("outcome", "follow_up_date", "follow_up_reminder_sent_at")
            WHERE "outcome" = 'follow_up' AND "follow_up_reminder_sent_at" IS NULL;
        `);
        
        console.log('Created index for follow-up reminders');
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();