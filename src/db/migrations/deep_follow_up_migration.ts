/**
 * Deep fix for follow-up reminders - proper database migration
 * This addresses the root cause of schema inconsistencies
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface MigrationResult {
    success: boolean;
    message: string;
    details?: any;
}

async function addFollowUpReminderColumn(): Promise<MigrationResult> {
    console.log('[Migration] Starting deep fix for follow-up reminders...');
    
    try {
        // Check if column already exists
        const columnExists = await db.execute(sql`
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'sales_visits' 
            AND column_name = 'follow_up_reminder_sent_at'
        `);
        
        if (columnExists.rows.length > 0) {
            console.log('[Migration] Column already exists, skipping creation');
            return {
                success: true,
                message: 'Column already exists'
            };
        }
        
        // Add the column with proper constraints
        await db.execute(sql`
            ALTER TABLE sales_visits 
            ADD COLUMN follow_up_reminder_sent_at TIMESTAMP WITH TIME ZONE
        `);
        
        console.log('[Migration] Added follow_up_reminder_sent_at column');
        
        // Create optimized index for follow-up queries
        await db.execute(sql`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_visits_follow_up_pending
            ON sales_visits (outcome, follow_up_date, follow_up_reminder_sent_at)
            WHERE outcome = 'follow_up' 
            AND follow_up_reminder_sent_at IS NULL
        `);
        
        console.log('[Migration] Created optimized index for follow-up reminders');
        
        // Add comment for documentation
        await db.execute(sql`
            COMMENT ON COLUMN sales_visits.follow_up_reminder_sent_at 
            IS 'Timestamp when follow-up reminder was sent to sales representative'
        `);
        
        console.log('[Migration] Added column documentation');
        
        return {
            success: true,
            message: 'Successfully added follow-up reminder column and index',
            details: {
                column: 'follow_up_reminder_sent_at',
                index: 'idx_sales_visits_follow_up_pending',
                type: 'TIMESTAMP WITH TIME ZONE'
            }
        };
        
    } catch (error: any) {
        console.error('[Migration] Failed to add follow-up reminder column:', error);
        
        // Provide specific error handling
        if (error.code === '42701') {
            // Column already exists (duplicate_column error)
            return {
                success: true,
                message: 'Column already exists (no action needed)',
                details: { error: 'DUPLICATE_COLUMN' }
            };
        }
        
        return {
            success: false,
            message: 'Failed to migrate database',
            details: {
                error: error.message,
                code: error.code,
                hint: error.hint
            }
        };
    }
}

async function validateMigration(): Promise<MigrationResult> {
    try {
        // Verify column exists and has correct type
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
        
        if (validation.rows.length === 0) {
            return {
                success: false,
                message: 'Column validation failed - column does not exist'
            };
        }
        
        const columnInfo = validation.rows[0];
        console.log('[Migration] Column validation successful:', columnInfo);
        
        // Test insert capability
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
        
        console.log('[Migration] Test insert successful, rows affected:', testInsert.rowCount);
        
        // Clean up test data
        await db.execute(sql`
            DELETE FROM sales_visits 
            WHERE follow_up_reminder_sent_at IS NOT NULL 
            AND outcome = 'follow_up'
            AND created_at > NOW() - INTERVAL '1 minute'
        `);
        
        return {
            success: true,
            message: 'Migration validation successful',
            details: {
                columnInfo,
                testRowsAffected: testInsert.rowCount
            }
        };
        
    } catch (error: any) {
        console.error('[Migration] Validation failed:', error);
        return {
            success: false,
            message: 'Migration validation failed',
            details: {
                error: error.message,
                code: error.code
            }
        };
    }
}

export async function executeDeepMigration(): Promise<MigrationResult> {
    console.log('[Migration] Executing deep database migration for follow-up reminders');
    
    // Step 1: Add column and index
    const migrationResult = await addFollowUpReminderColumn();
    if (!migrationResult.success) {
        return migrationResult;
    }
    
    // Step 2: Validate the migration
    const validationResult = await validateMigration();
    if (!validationResult.success) {
        return validationResult;
    }
    
    console.log('[Migration] Deep migration completed successfully');
    
    return {
        success: true,
        message: 'Deep migration completed successfully',
        details: {
            migration: migrationResult.details,
            validation: validationResult.details
        }
    };
}

// For manual execution
if (require.main === module) {
    executeDeepMigration()
        .then(result => {
            console.log('Migration result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Migration failed with unhandled error:', error);
            process.exit(1);
        });
}