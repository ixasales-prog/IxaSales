/**
 * GPS Tracking Cleanup Job
 * 
 * Scheduled job to clean up old location data based on tenant retention settings.
 * Should be run daily via cron job.
 */

import { db, schema } from '../db';
import { eq, sql, lt, and } from 'drizzle-orm';

interface TenantRetentionSettings {
    tenantId: string;
    retentionDays: number;
}

/**
 * Get GPS retention settings for all tenants
 */
async function getTenantRetentionSettings(): Promise<TenantRetentionSettings[]> {
    const settings = await db
        .select({
            tenantId: schema.tenantSettings.tenantId,
            value: schema.tenantSettings.value,
        })
        .from(schema.tenantSettings)
        .where(eq(schema.tenantSettings.key, 'gps_history_retention_days'));

    return settings.map(s => ({
        tenantId: s.tenantId,
        retentionDays: parseInt(s.value || '30'), // Default 30 days
    }));
}

/**
 * Clean up old location data for a specific tenant
 */
async function cleanupTenantLocations(tenantId: string, retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get count before deletion for reporting
    const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.userLocations)
        .where(
            and(
                eq(schema.userLocations.tenantId, tenantId),
                lt(schema.userLocations.createdAt, cutoffDate)
            )
        );

    const countToDelete = countResult?.count || 0;

    if (countToDelete > 0) {
        await db
            .delete(schema.userLocations)
            .where(
                and(
                    eq(schema.userLocations.tenantId, tenantId),
                    lt(schema.userLocations.createdAt, cutoffDate)
                )
            );
    }

    return countToDelete;
}

/**
 * Run cleanup for all tenants
 */
export async function runGPSTrackingCleanup(): Promise<void> {
    console.log('[GPS Cleanup] Starting GPS tracking data cleanup...');

    try {
        const tenantSettings = await getTenantRetentionSettings();
        let totalDeleted = 0;

        for (const setting of tenantSettings) {
            const deleted = await cleanupTenantLocations(setting.tenantId, setting.retentionDays);
            totalDeleted += deleted;
            if (deleted > 0) {
                console.log(`[GPS Cleanup] Deleted ${deleted} old location records for tenant ${setting.tenantId}`);
            }
        }

        // Also clean up locations for tenants without explicit settings (use default 30 days)
        const allTenants = await db
            .select({ id: schema.tenants.id })
            .from(schema.tenants);

        const tenantsWithSettings = new Set(tenantSettings.map(s => s.tenantId));
        const tenantsWithoutSettings = allTenants.filter(t => !tenantsWithSettings.has(t.id));

        for (const tenant of tenantsWithoutSettings) {
            const deleted = await cleanupTenantLocations(tenant.id, 30); // Default 30 days
            totalDeleted += deleted;
            if (deleted > 0) {
                console.log(`[GPS Cleanup] Deleted ${deleted} old location records for tenant ${tenant.id} (default retention)`);
            }
        }

        console.log(`[GPS Cleanup] Cleanup completed. Total records deleted: ${totalDeleted}`);
    } catch (error) {
        console.error('[GPS Cleanup] Error during cleanup:', error);
        throw error;
    }
}

/**
 * Initialize cleanup job (call from scheduler)
 */
export function initGPSTrackingCleanup(): void {
    // This should be called from your scheduler (e.g., cron job)
    // Example: Run daily at 2 AM
    // cron.schedule('0 2 * * *', runGPSTrackingCleanup);
    
    console.log('[GPS Cleanup] GPS tracking cleanup job initialized');
    console.log('[GPS Cleanup] To schedule cleanup, call runGPSTrackingCleanup() from your cron scheduler');
}
