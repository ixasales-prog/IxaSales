const { Client } = require('pg');

async function checkFollowUps() {
    console.log('🔍 Checking for existing follow-up visits...');
    
    // Use DATABASE_URL from environment variables
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL environment variable is required');
        console.error('💡 Example: DATABASE_URL=postgresql://user:password@localhost:5432/database');
        process.exit(1);
    }

    const client = new Client({
        connectionString: databaseUrl,
    });
    
    try {
        await client.connect();
        
        // Check for follow-up visits
        const result = await client.query(`
            SELECT 
                sv.id,
                sv.outcome,
                sv.follow_up_date,
                sv.follow_up_time,
                sv.follow_up_reason,
                sv.follow_up_reminder_sent_at,
                c.name as customer_name,
                u.name as sales_rep_name
            FROM sales_visits sv
            LEFT JOIN customers c ON sv.customer_id = c.id
            LEFT JOIN users u ON sv.sales_rep_id = u.id
            WHERE sv.outcome = 'follow_up'
            ORDER BY sv.follow_up_date ASC
            LIMIT 10
        `);
        
        console.log(`\n📊 Found ${result.rowCount} follow-up visits:`);
        
        if (result.rows.length === 0) {
            console.log('No follow-up visits found in the database.');
            console.log('The system is ready - it will send reminders when follow-up visits are created.');
        } else {
            result.rows.forEach((visit, index) => {
                console.log(`\n${index + 1}. Visit ID: ${visit.id}`);
                console.log(`   Customer: ${visit.customer_name || 'Unknown'}`);
                console.log(`   Sales Rep: ${visit.sales_rep_name || 'Unknown'}`);
                console.log(`   Follow-up Date: ${visit.follow_up_date}`);
                console.log(`   Follow-up Time: ${visit.follow_up_time || 'Not specified'}`);
                console.log(`   Reason: ${visit.follow_up_reason || 'Not specified'}`);
                console.log(`   Reminder Sent: ${visit.follow_up_reminder_sent_at ? 'Yes' : 'No'}`);
            });
        }
        
        // Check if reminders have been sent
        const sentReminders = await client.query(`
            SELECT COUNT(*) as count
            FROM sales_visits
            WHERE follow_up_reminder_sent_at IS NOT NULL
        `);
        
        console.log(`\n📈 Total reminders sent: ${sentReminders.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Error checking follow-ups:', error.message);
    } finally {
        await client.end();
    }
}

checkFollowUps();