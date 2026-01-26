import { db } from '../db';
import { sql } from 'drizzle-orm';

async function inspectDatabase() {
    console.log('Inspecting database structure...');
    
    try {
        // Check if follow_up_reminder_sent_at column exists
        const columnCheck = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        console.log('follow_up_reminder_sent_at column exists:', columnCheck.rows.length > 0);
        if (columnCheck.rows.length > 0) {
            console.log('Column details:', columnCheck.rows[0]);
        }
        
        // Check current sales_visits table structure
        const tableStructure = await db.execute(sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            ORDER BY ordinal_position
        `);
        
        console.log('\nCurrent sales_visits table structure:');
        tableStructure.rows.forEach((row: any) => {
            console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        // Check for any existing follow-up visits
        const followUpVisits = await db.execute(sql`
            SELECT COUNT(*) as count 
            FROM sales_visits 
            WHERE outcome = 'follow_up'
        `);
        
        console.log(`\nExisting follow-up visits: ${followUpVisits.rows[0].count}`);
        
        // Check if any follow-up reminders have been sent
        const sentReminders = await db.execute(sql`
            SELECT COUNT(*) as count 
            FROM sales_visits 
            WHERE follow_up_reminder_sent_at IS NOT NULL
        `);
        
        console.log(`Follow-up reminders already sent: ${sentReminders.rows[0].count}`);
        
    } catch (error) {
        console.error('Database inspection failed:', error);
    }
    
    process.exit(0);
}

inspectDatabase();