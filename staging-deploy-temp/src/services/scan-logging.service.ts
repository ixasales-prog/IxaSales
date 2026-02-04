import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { scanLogs } from '../db/schema';

export type ScanAction = 'receiving' | 'picking' | 'packing' | 'counting' | 'search' | 'verification';

interface LogScanParams {
    tenantId: string;
    userId: string;
    productId?: string;
    action: ScanAction;
    barcode?: string;
    details?: Record<string, any>;
    deviceInfo?: string;
}

/**
 * Log a barcode scan to the audit trail
 * This is called automatically by warehouse operations
 */
export async function logScan(params: LogScanParams) {
    try {
        await db.insert(scanLogs).values({
            tenantId: params.tenantId,
            userId: params.userId,
            productId: params.productId || null,
            action: params.action,
            barcode: params.barcode || null,
            details: params.details || null,
            deviceInfo: params.deviceInfo || null,
        });
    } catch (error) {
        // Don't fail the operation if logging fails
        console.error('Failed to log scan:', error);
    }
}

/**
 * Get scan history for a product
 */
export async function getProductScanHistory(tenantId: string, productId: string, limit = 50) {
    return await db
        .select()
        .from(scanLogs)
        .where(eq(scanLogs.tenantId, tenantId) && eq(scanLogs.productId, productId))
        .orderBy(desc(scanLogs.scannedAt))
        .limit(limit);
}

/**
 * Get scan history for a user
 */
export async function getUserScanHistory(tenantId: string, userId: string, limit = 100) {
    return await db
        .select()
        .from(scanLogs)
        .where(eq(scanLogs.tenantId, tenantId) && eq(scanLogs.userId, userId))
        .orderBy(desc(scanLogs.scannedAt))
        .limit(limit);
}

/**
 * Get all scans for a specific action
 */
export async function getScansByAction(tenantId: string, action: ScanAction, limit = 100) {
    return await db
        .select()
        .from(scanLogs)
        .where(eq(scanLogs.tenantId, tenantId) && eq(scanLogs.action, action))
        .orderBy(desc(scanLogs.scannedAt))
        .limit(limit);
}
