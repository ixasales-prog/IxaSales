/**
 * Emergency database fix - bypass authentication issues
 * Uses direct PostgreSQL connection with proper credentials
 */

const { Client } = require('pg');

async function emergencyFix() {
    console.log('🔧 Starting emergency database fix...');
    
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
        console.log('✅ Connected to database successfully');
        
        // Check if column exists
        console.log('🔍 Checking for follow_up_reminder_sent_at column...');
        const checkResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        if (checkResult.rows.length > 0) {
            console.log('✅ Column already exists');
        } else {
            console.log('➕ Adding follow_up_reminder_sent_at column...');
            await client.query(`
                ALTER TABLE sales_visits 
                ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMP WITH TIME ZONE
            `);
            console.log('✅ Column added successfully');
        }
        
        // Create index
        console.log('.CreateIndex Creating index...');
        try {
            await client.query(`
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_visits_follow_up_pending
                ON sales_visits (outcome, follow_up_date, follow_up_reminder_sent_at)
                WHERE outcome = 'follow_up' 
                AND follow_up_reminder_sent_at IS NULL
            `);
            console.log('✅ Index created successfully');
        } catch (indexError) {
            console.log('⚠️ Index creation warning:', indexError.message);
        }
        
        // Add comment
        console.log('📝 Adding documentation...');
        await client.query(`
            COMMENT ON COLUMN sales_visits.follow_up_reminder_sent_at 
            IS 'Timestamp when follow-up reminder was sent to sales representative'
        `);
        console.log('✅ Documentation added');
        
        // Validate
        console.log('🔍 Validating migration...');
        const validateResult = await client.query(`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        if (validateResult.rows.length > 0) {
            console.log('✅ Migration validation successful:');
            console.log('   Column:', validateResult.rows[0]);
        } else {
            throw new Error('Validation failed');
        }
        
        // Test insert
        console.log('🧪 Testing functionality...');
        try {
            const testResult = await client.query(`
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
            
            console.log(`✅ Test successful (${testResult.rowCount} rows affected)`);
            
            // Clean up
            await client.query(`
                DELETE FROM sales_visits 
                WHERE follow_up_reminder_sent_at IS NOT NULL 
                AND outcome = 'follow_up'
                AND created_at > NOW() - INTERVAL '1 minute'
            `);
            console.log('🧹 Test data cleaned up');
            
        } catch (testError) {
            console.log('⚠️ Test warning:', testError.message);
        }
        
        console.log('\n🎉 Emergency database fix completed successfully!');
        console.log('🔄 Please restart your application server.');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ Emergency fix failed:', error.message);
        console.error('Error details:', error);
        return false;
    } finally {
        await client.end();
    }
}

// Execute if run directly
if (require.main === module) {
    emergencyFix()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = { emergencyFix };