/**
 * Migration: Add foreign key constraints for payment_tokens table
 * This addresses the missing foreign key constraints for orderId and customerId
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

interface MigrationResult {
    success: boolean;
    message: string;
    details?: any;
}

async function addPaymentTokensForeignKeys(): Promise<MigrationResult> {
    console.log('[Migration] Adding foreign key constraints to payment_tokens table...');
    
    try {
        // Check if orderId constraint already exists
        const orderIdConstraintCheck = await db.execute(sql`
            SELECT constraint_name
            FROM information_schema.table_constraints 
            WHERE table_name = 'payment_tokens' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name = 'payment_tokens_order_id_orders_id_fk'
        `);
        
        if (Array.isArray(orderIdConstraintCheck) && orderIdConstraintCheck.length === 0) {
            // Add orderId foreign key constraint
            await db.execute(sql`
                ALTER TABLE payment_tokens 
                ADD CONSTRAINT payment_tokens_order_id_orders_id_fk 
                FOREIGN KEY (order_id) REFERENCES orders(id) 
                ON DELETE CASCADE 
                ON UPDATE CASCADE
            `);
            console.log('[Migration] Added orderId foreign key constraint');
        } else {
            console.log('[Migration] orderId foreign key constraint already exists');
        }
        
        // Check if customerId constraint already exists
        const customerIdConstraintCheck = await db.execute(sql`
            SELECT constraint_name
            FROM information_schema.table_constraints 
            WHERE table_name = 'payment_tokens' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name = 'payment_tokens_customer_id_customers_id_fk'
        `);
        
        if (Array.isArray(customerIdConstraintCheck) && customerIdConstraintCheck.length === 0) {
            // Add customerId foreign key constraint
            await db.execute(sql`
                ALTER TABLE payment_tokens 
                ADD CONSTRAINT payment_tokens_customer_id_customers_id_fk 
                FOREIGN KEY (customer_id) REFERENCES customers(id) 
                ON DELETE CASCADE 
                ON UPDATE CASCADE
            `);
            console.log('[Migration] Added customerId foreign key constraint');
        } else {
            console.log('[Migration] customerId foreign key constraint already exists');
        }
        
        return {
            success: true,
            message: 'Successfully added payment_tokens foreign key constraints'
        };
    } catch (error: any) {
        console.error('[Migration] Error adding payment_tokens foreign keys:', error.message);
        return {
            success: false,
            message: 'Failed to add payment_tokens foreign key constraints',
            details: error.message
        };
    }
}

async function removePaymentTokensForeignKeys(): Promise<MigrationResult> {
    console.log('[Migration] Removing foreign key constraints from payment_tokens table...');
    
    try {
        // Drop foreign key constraints
        await db.execute(sql`
            ALTER TABLE payment_tokens 
            DROP CONSTRAINT IF EXISTS payment_tokens_order_id_orders_id_fk
        `);
        
        await db.execute(sql`
            ALTER TABLE payment_tokens 
            DROP CONSTRAINT IF EXISTS payment_tokens_customer_id_customers_id_fk
        `);
        
        console.log('[Migration] Removed payment_tokens foreign key constraints');
        
        return {
            success: true,
            message: 'Successfully removed payment_tokens foreign key constraints'
        };
    } catch (error: any) {
        console.error('[Migration] Error removing payment_tokens foreign keys:', error.message);
        return {
            success: false,
            message: 'Failed to remove payment_tokens foreign key constraints',
            details: error.message
        };
    }
}

// For direct execution
if (require.main === module) {
    const operation = process.argv[2]; // Expecting 'up' or 'down'

    if (operation === 'down') {
        removePaymentTokensForeignKeys()
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
        addPaymentTokensForeignKeys()
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

export { addPaymentTokensForeignKeys, removePaymentTokensForeignKeys };