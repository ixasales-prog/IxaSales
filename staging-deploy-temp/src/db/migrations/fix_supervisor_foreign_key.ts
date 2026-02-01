/**
 * Migration: Add foreign key constraint for users.supervisor_id
 * This addresses the missing self-referencing foreign key constraint
 */

import { sql } from 'drizzle-orm';
import { db } from '../index';

interface MigrationResult {
    success: boolean;
    message: string;
    details?: any;
}

async function addSupervisorForeignKey(): Promise<MigrationResult> {
    console.log('[Migration] Adding supervisor_id foreign key constraint to users table...');
    
    try {
        // Check if constraint already exists
        const constraintCheck = await db.execute(sql`
            SELECT constraint_name
            FROM information_schema.table_constraints 
            WHERE table_name = 'users' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name = 'users_supervisor_id_fkey'
        `);
        
        if (Array.isArray(constraintCheck) && constraintCheck.length > 0) {
            console.log('[Migration] Supervisor foreign key constraint already exists');
            return {
                success: true,
                message: 'Constraint already exists'
            };
        }
        
        // Add the foreign key constraint
        await db.execute(sql`
            ALTER TABLE users 
            ADD CONSTRAINT users_supervisor_id_fkey 
            FOREIGN KEY (supervisor_id) REFERENCES users(id) 
            ON DELETE SET NULL 
            ON UPDATE CASCADE
        `);
        
        console.log('[Migration] Added supervisor_id foreign key constraint');
        
        return {
            success: true,
            message: 'Successfully added supervisor_id foreign key constraint'
        };
    } catch (error: any) {
        console.error('[Migration] Error adding supervisor_id foreign key:', error.message);
        return {
            success: false,
            message: 'Failed to add supervisor_id foreign key constraint',
            details: error.message
        };
    }
}

async function removeSupervisorForeignKey(): Promise<MigrationResult> {
    console.log('[Migration] Removing supervisor_id foreign key constraint from users table...');
    
    try {
        // Drop the foreign key constraint
        await db.execute(sql`
            ALTER TABLE users 
            DROP CONSTRAINT IF EXISTS users_supervisor_id_fkey
        `);
        
        console.log('[Migration] Removed supervisor_id foreign key constraint');
        
        return {
            success: true,
            message: 'Successfully removed supervisor_id foreign key constraint'
        };
    } catch (error: any) {
        console.error('[Migration] Error removing supervisor_id foreign key:', error.message);
        return {
            success: false,
            message: 'Failed to remove supervisor_id foreign key constraint',
            details: error.message
        };
    }
}

// For direct execution
if (require.main === module) {
    const operation = process.argv[2]; // Expecting 'up' or 'down'

    if (operation === 'down') {
        removeSupervisorForeignKey()
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
        addSupervisorForeignKey()
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

export { addSupervisorForeignKey, removeSupervisorForeignKey };