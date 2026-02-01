/**
 * Migration: Add Notification Role Settings
 * 
 * This migration adds role-based notification assignment.
 * Allows tenant admins to choose which roles receive each notification type.
 */

import { sql } from 'drizzle-orm';
import { db } from '../index';

export async function up(): Promise<void> {
    console.log('Adding notification role settings...');

    // Create table to store which roles receive each notification type
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "notification_role_settings" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
            "notification_type" varchar(100) NOT NULL, -- e.g., 'notifyNewOrder', 'notifyPaymentReceived'
            "role" varchar(50) NOT NULL, -- e.g., 'tenant_admin', 'supervisor', 'sales_rep', 'warehouse', 'driver'
            "enabled" boolean DEFAULT true,
            "created_at" timestamp DEFAULT NOW(),
            "updated_at" timestamp DEFAULT NOW(),
            UNIQUE("tenant_id", "notification_type", "role")
        );
    `);

    // Create index for faster lookups
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "idx_notification_role_settings_tenant" 
        ON "notification_role_settings"("tenant_id");
    `);

    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "idx_notification_role_settings_type" 
        ON "notification_role_settings"("notification_type");
    `);

    // Seed default role settings for existing tenants
    // By default, only tenant_admin receives admin notifications
    const adminNotificationTypes = [
        'notifyNewOrder',
        'notifyOrderApproved',
        'notifyOrderCancelled',
        'notifyOrderDelivered',
        'notifyOrderPartialDelivery',
        'notifyOrderReturned',
        'notifyOrderPartialReturn',
        'notifyOrderCompleted',
        'notifyPaymentReceived',
        'notifyPaymentPartial',
        'notifyPaymentComplete',
        'notifyLowStock',
        'notifyDueDebt'
    ];

    const tenants = await db.execute(sql`SELECT id FROM tenants`);
    
    for (const tenant of tenants || []) {
        for (const notificationType of adminNotificationTypes) {
            await db.execute(sql`
                INSERT INTO "notification_role_settings" ("tenant_id", "notification_type", "role", "enabled")
                VALUES (${tenant.id}, ${notificationType}, 'tenant_admin', true)
                ON CONFLICT ("tenant_id", "notification_type", "role") DO NOTHING;
            `);
        }
    }

    console.log('Notification role settings added successfully');
}

export async function down(): Promise<void> {
    console.log('Removing notification role settings...');
    
    await db.execute(sql`DROP TABLE IF EXISTS "notification_role_settings" CASCADE;`);
    
    console.log('Notification role settings removed');
}

// Run migration if called directly
if (require.main === module) {
    up().then(() => {
        console.log('Migration completed');
        process.exit(0);
    }).catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}
