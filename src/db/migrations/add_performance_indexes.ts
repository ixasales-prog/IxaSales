/**
 * Migration: Add performance indexes for better query optimization
 * This addresses missing composite indexes for frequently queried data
 */

import { sql } from 'drizzle-orm';
import { db } from '../index';

interface MigrationResult {
    success: boolean;
    message: string;
    details?: any;
}

async function addPerformanceIndexes(): Promise<MigrationResult> {
    console.log('[Migration] Adding performance indexes...');
    
    const indexes = [
        // Orders indexes - composite indexes for common queries
        `CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created ON orders (tenant_id, status, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer_status ON orders (tenant_id, customer_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_tenant_sales_rep_created ON orders (tenant_id, sales_rep_id, created_at DESC)`,
        
        // Customers indexes
        `CREATE INDEX IF NOT EXISTS idx_customers_tenant_assigned ON customers (tenant_id, assigned_sales_rep_id)`,
        
        // Sales Visits indexes - composite indexes for common queries
        `CREATE INDEX IF NOT EXISTS idx_sales_visits_tenant_date_status ON sales_visits (tenant_id, planned_date, status)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_visits_tenant_rep_date ON sales_visits (tenant_id, sales_rep_id, planned_date)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_visits_outcome_follow_up ON sales_visits (outcome, follow_up_date, follow_up_reminder_sent_at) WHERE outcome = 'follow_up'`,
        
        // Users indexes
        `CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role)`,
        
        // Products indexes
        `CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products (tenant_id, subcategory_id)`,
        `CREATE INDEX IF NOT EXISTS idx_products_tenant_brand ON products (tenant_id, brand_id)`,
    ];

    try {
        for (const indexSql of indexes) {
            try {
                await db.execute(sql.raw(indexSql));
                console.log(`✓ ${(indexSql.match(/CREATE INDEX IF NOT EXISTS ([^ ]+)/) || [])[1] || 'index'}`);
            } catch (error: any) {
                console.error(`✗ Failed: ${(indexSql.match(/CREATE INDEX IF NOT EXISTS ([^ ]+)/) || [])[1] || 'index'} - ${error.message}`);
            }
        }

        console.log('[Migration] Done adding performance indexes.');
        
        return {
            success: true,
            message: 'Successfully added performance indexes'
        };
    } catch (error: any) {
        console.error('[Migration] Error adding performance indexes:', error.message);
        return {
            success: false,
            message: 'Failed to add performance indexes',
            details: error.message
        };
    }
}

async function removePerformanceIndexes(): Promise<MigrationResult> {
    console.log('[Migration] Removing performance indexes...');
    
    const dropIndexes = [
        // Orders indexes
        `DROP INDEX IF EXISTS idx_orders_tenant_status_created`,
        `DROP INDEX IF EXISTS idx_orders_tenant_customer_status`,
        `DROP INDEX IF EXISTS idx_orders_tenant_sales_rep_created`,
        
        // Customers indexes
        `DROP INDEX IF EXISTS idx_customers_tenant_assigned`,
        
        // Sales Visits indexes
        `DROP INDEX IF EXISTS idx_sales_visits_tenant_date_status`,
        `DROP INDEX IF EXISTS idx_sales_visits_tenant_rep_date`,
        `DROP INDEX IF EXISTS idx_sales_visits_outcome_follow_up`,
        
        // Users indexes
        `DROP INDEX IF EXISTS idx_users_tenant_role`,
        
        // Products indexes
        `DROP INDEX IF EXISTS idx_products_tenant_category`,
        `DROP INDEX IF EXISTS idx_products_tenant_brand`,
    ];

    try {
        for (const dropSql of dropIndexes) {
            try {
                await db.execute(sql.raw(dropSql));
                console.log(`✓ ${(dropSql.match(/DROP INDEX IF EXISTS ([^ ]+)/) || [])[1] || 'index'}`);
            } catch (error: any) {
                console.error(`✗ Failed: ${(dropSql.match(/DROP INDEX IF EXISTS ([^ ]+)/) || [])[1] || 'index'} - ${error.message}`);
            }
        }

        console.log('[Migration] Done removing performance indexes.');
        
        return {
            success: true,
            message: 'Successfully removed performance indexes'
        };
    } catch (error: any) {
        console.error('[Migration] Error removing performance indexes:', error.message);
        return {
            success: false,
            message: 'Failed to remove performance indexes',
            details: error.message
        };
    }
}

// For direct execution
if (require.main === module) {
    const operation = process.argv[2]; // Expecting 'up' or 'down'

    if (operation === 'down') {
        removePerformanceIndexes()
            .then(result => {
                console.log(result);
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error('Migration failed:', error);
                process.exit(1);
            });
    } else {
        // Default to 'up' operation
        addPerformanceIndexes()
            .then(result => {
                console.log(result);
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error('Migration failed:', error);
                process.exit(1);
            });
    }
}

export { addPerformanceIndexes, removePerformanceIndexes };