
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running migration: add photos to sales_visits...');

    try {
        await db.execute(sql`
            ALTER TABLE "sales_visits" 
            ADD COLUMN IF NOT EXISTS "photos" json DEFAULT '[]'::json;
        `);
        console.log('Column "photos" added to sales_visits successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
