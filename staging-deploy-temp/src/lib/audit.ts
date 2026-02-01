import { db, schema } from '../db';

export async function logAudit(
    action: string,
    details: string | object,
    userId?: string | null,
    tenantId?: string | null,
    entityId?: string,
    entityType?: string,
    ipAddress?: string,
    userAgent?: string
) {
    try {
        const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

        await db.insert(schema.auditLogs).values({
            action,
            details: detailsStr,
            userId: userId || null,
            tenantId: tenantId || null,
            entityId: entityId || null, // Ensure explicitly null if undefined
            entityType: entityType || null, // Ensure explicitly null if undefined
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });
    } catch (error) {
        console.error('[Audit] Failed to create audit log:', error);
        // Don't throw, we don't want to break the main flow if logging fails
    }
}
