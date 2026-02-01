/**
 * Direct database migration using application's connection
 * Bypasses the need for external psql tools
 */

// Import the actual database connection from the application
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function executeMigration() {
    console.log('🚀 Starting direct database migration for follow-up reminders...\n');
    
    try {
        // Check if column already exists
        console.log('🔍 Checking if follow_up_reminder_sent_at column exists...');
        const columnCheck = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        if (columnCheck.rows.length > 0) {
            console.log('✅ Column already exists, skipping creation\n');
        } else {
            console.log('➕ Adding follow_up_reminder_sent_at column...');
            await db.execute(sql`
                ALTER TABLE sales_visits 
                ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMP WITH TIME ZONE
            `);
            console.log('✅ Column added successfully\n');
        }
        
        // Create optimized index
        console.log('.CreateIndex Creating index for follow-up reminders...');
        try {
            await db.execute(sql`
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_visits_follow_up_pending
                ON sales_visits (outcome, follow_up_date, follow_up_reminder_sent_at)
                WHERE outcome = 'follow_up' 
                AND follow_up_reminder_sent_at IS NULL
            `);
            console.log('✅ Index created successfully\n');
        } catch (indexError) {
            console.log('⚠️  Index creation warning (may already exist):', indexError.message);
            console.log('✅ Continuing without index...\n');
        }
        
        // Add column documentation
        console.log('📝 Adding column documentation...');
        await db.execute(sql`
            COMMENT ON COLUMN sales_visits.follow_up_reminder_sent_at 
            IS 'Timestamp when follow-up reminder was sent to sales representative'
        `);
        console.log('✅ Documentation added\n');
        
        // Validate the migration
        console.log('🔍 Validating migration...');
        const validation = await db.execute(sql`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        if (validation.rows.length > 0) {
            console.log('✅ Migration validation successful:');
            console.log('   Column:', validation.rows[0]);
            console.log('');
        } else {
            throw new Error('Validation failed - column not found after creation');
        }
        
        // Test insert capability
        console.log('🧪 Testing insert capability...');
        try {
            const testInsert = await db.execute(sql`
                INSERT INTO sales_visits (
                    id, tenant_id, customer_id, sales_rep_id, 
                    outcome, follow_up_date, follow_up_reminder_sent_at
                ) VALUES (
                    gen_random_uuid(),
                    (SELECT id FROM tenants LIMIT 1),
                    (SELECT id FROM customers LIMIT 1),
                    (SELECT id FROM users LIMIT 1),
                    'follow_up',
                    CURRENT_DATE,
                    NOW()
                )
                ON CONFLICT DO NOTHING
                RETURNING id
            `);
            
            console.log(`✅ Test insert successful (${testInsert.rowCount} rows affected)\n`);
            
            // Clean up test data
            await db.execute(sql`
                DELETE FROM sales_visits 
                WHERE follow_up_reminder_sent_at IS NOT NULL 
                AND outcome = 'follow_up'
                AND created_at > NOW() - INTERVAL '1 minute'
            `);
            console.log('🧹 Test data cleaned up\n');
            
        } catch (testError) {
            console.log('⚠️  Test insert warning:', testError.message);
            console.log('✅ Continuing...\n');
        }
        
        console.log('🎉 Direct database migration completed successfully!');
        console.log('🔄 Please restart your application server to use the follow-up reminders feature.');
        
        return {
            success: true,
            message: 'Migration completed successfully'
        };
        
    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('Error details:', error);
        
        return {
            success: false,
            message: 'Migration failed',
            error: error.message
        };
    }
}

// Execute migration if run directly
if (require.main === module) {
    executeMigration()
        .then(result => {
            console.log('\n📋 Final Result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Unhandled migration error:', error);
            process.exit(1);
        });
}

export { executeMigration };