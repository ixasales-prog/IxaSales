/**
 * GPS Tracking Routes (Fastify)
 * 
 * Handles location updates from sales reps/drivers and provides
 * location viewing for supervisors/admins.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, desc, sql, inArray, gte, lte } from 'drizzle-orm';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

const UpdateLocationBodySchema = Type.Object({
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    accuracy: Type.Optional(Type.Number({ minimum: 0 })),
    heading: Type.Optional(Type.Number({ minimum: 0, maximum: 360 })),
    speed: Type.Optional(Type.Number({ minimum: 0 })),
});

const GetCurrentLocationsQuerySchema = Type.Object({
    userId: Type.Optional(Type.String()),
});

const GetHistoryQuerySchema = Type.Object({
    userId: Type.String(),
    startDate: Type.Optional(Type.String({ format: 'date' })),
    endDate: Type.Optional(Type.String({ format: 'date' })),
    limit: Type.Optional(Type.String()),
});

const UpdateGPSTrackingSettingsBodySchema = Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    movementThreshold: Type.Optional(Type.Number({ minimum: 20, maximum: 200 })),
    fallbackInterval: Type.Optional(Type.Number({ minimum: 120, maximum: 600 })),
    historyRetentionDays: Type.Optional(Type.Number({ minimum: 7, maximum: 90 })),
    minAccuracy: Type.Optional(Type.Number({ minimum: 10, maximum: 100 })),
});

const UpdateUserGPSTrackingBodySchema = Type.Object({
    enabled: Type.Boolean(),
});

type UpdateLocationBody = Static<typeof UpdateLocationBodySchema>;
type GetCurrentLocationsQuery = Static<typeof GetCurrentLocationsQuerySchema>;
type GetHistoryQuery = Static<typeof GetHistoryQuerySchema>;
type UpdateGPSTrackingSettingsBody = Static<typeof UpdateGPSTrackingSettingsBodySchema>;
type UpdateUserGPSTrackingBody = Static<typeof UpdateUserGPSTrackingBodySchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getTenantGPSSettings(tenantId: string) {
    const settings = await db
        .select()
        .from(schema.tenantSettings)
        .where(
            and(
                eq(schema.tenantSettings.tenantId, tenantId),
                inArray(schema.tenantSettings.key, [
                    'gps_tracking_enabled',
                    'gps_movement_threshold_meters',
                    'gps_fallback_interval_seconds',
                    'gps_history_retention_days',
                    'gps_min_accuracy_meters',
                ])
            )
        );

    const settingsMap: Record<string, any> = {};
    settings.forEach(s => {
        settingsMap[s.key] = s.value;
    });

    return {
        enabled: settingsMap['gps_tracking_enabled'] === 'true',
        movementThreshold: parseInt(settingsMap['gps_movement_threshold_meters'] || '50'),
        fallbackInterval: parseInt(settingsMap['gps_fallback_interval_seconds'] || '300'),
        historyRetentionDays: parseInt(settingsMap['gps_history_retention_days'] || '30'),
        minAccuracy: parseInt(settingsMap['gps_min_accuracy_meters'] || '50'),
    };
}

async function setTenantGPSSetting(tenantId: string, key: string, value: string) {
    // Check if setting exists
    const [existing] = await db
        .select()
        .from(schema.tenantSettings)
        .where(
            and(
                eq(schema.tenantSettings.tenantId, tenantId),
                eq(schema.tenantSettings.key, key)
            )
        )
        .limit(1);

    if (existing) {
        await db
            .update(schema.tenantSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(schema.tenantSettings.id, existing.id));
    } else {
        await db
            .insert(schema.tenantSettings)
            .values({
                tenantId,
                key,
                value,
            });
    }
}

// ============================================================================
// ROUTES
// ============================================================================

export const gpsTrackingRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // UPDATE LOCATION (Sales Rep / Driver only)
    // ----------------------------------------------------------------
    fastify.post<{ Body: UpdateLocationBody }>('/update', {
        preHandler: [fastify.authenticate],
        schema: { body: UpdateLocationBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        // Check user role - only sales_rep and driver can update location
        if (user.role !== 'sales_rep' && user.role !== 'driver') {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only sales reps and drivers can update location' }
            });
        }

        // Check if user has tracking enabled
        const [userRecord] = await db
            .select({ gpsTrackingEnabled: schema.users.gpsTrackingEnabled })
            .from(schema.users)
            .where(eq(schema.users.id, user.id))
            .limit(1);

        if (!userRecord || !userRecord.gpsTrackingEnabled) {
            return reply.code(403).send({
                success: false,
                error: { code: 'TRACKING_DISABLED', message: 'GPS tracking is disabled for this user' }
            });
        }

        // Check tenant GPS tracking settings
        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TENANT', message: 'User must belong to a tenant' }
            });
        }

        const tenantSettings = await getTenantGPSSettings(user.tenantId);
        if (!tenantSettings.enabled) {
            return reply.code(403).send({
                success: false,
                error: { code: 'TRACKING_DISABLED', message: 'GPS tracking is disabled for this tenant' }
            });
        }

        // Validate GPS accuracy
        if (body.accuracy && body.accuracy > tenantSettings.minAccuracy) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'LOW_ACCURACY',
                    message: `GPS accuracy (${body.accuracy}m) is below minimum threshold (${tenantSettings.minAccuracy}m)`
                }
            });
        }

        // Rate limiting: Check last update (max 1 per 10 seconds)
        const [lastUpdate] = await db
            .select({ createdAt: schema.userLocations.createdAt })
            .from(schema.userLocations)
            .where(eq(schema.userLocations.userId, user.id))
            .orderBy(desc(schema.userLocations.createdAt))
            .limit(1);

        if (lastUpdate && lastUpdate.createdAt) {
            const timeSinceLastUpdate = Date.now() - new Date(lastUpdate.createdAt).getTime();
            if (timeSinceLastUpdate < 10000) { // 10 seconds
                return reply.code(429).send({
                    success: false,
                    error: { code: 'RATE_LIMIT', message: 'Location updates are limited to once per 10 seconds' }
                });
            }
        }

        // Insert location update
        const now = new Date();
        await db.insert(schema.userLocations).values({
            userId: user.id,
            tenantId: user.tenantId,
            latitude: body.latitude.toString(),
            longitude: body.longitude.toString(),
            accuracy: body.accuracy?.toString(),
            heading: body.heading?.toString(),
            speed: body.speed?.toString(),
            timestamp: now,
        });

        // Update user's last known location
        await db
            .update(schema.users)
            .set({
                lastLocationUpdateAt: now,
                lastKnownLatitude: body.latitude.toString(),
                lastKnownLongitude: body.longitude.toString(),
            })
            .where(eq(schema.users.id, user.id));

        return { success: true, data: { timestamp: now } };
    });

    // ----------------------------------------------------------------
    // GET CURRENT LOCATIONS (Supervisor / Admin only)
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: GetCurrentLocationsQuery }>('/current', {
        preHandler: [fastify.authenticate],
        schema: { querystring: GetCurrentLocationsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const query = request.query;

        // Check user role - only supervisor, tenant_admin, and super_admin can view
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only supervisors and admins can view locations' }
            });
        }

        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TENANT', message: 'User must belong to a tenant' }
            });
        }

        // Build query conditions
        const conditions: any[] = [
            eq(schema.userLocations.tenantId, user.tenantId),
        ];

        if (query.userId) {
            conditions.push(eq(schema.userLocations.userId, query.userId));
        }

        // Get most recent location for each user using subquery
        // First, get all users with tracking enabled
        const trackedUsers = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                role: schema.users.role,
                lastLocationUpdateAt: schema.users.lastLocationUpdateAt,
            })
            .from(schema.users)
            .where(
                and(
                    eq(schema.users.tenantId, user.tenantId),
                    inArray(schema.users.role, ['sales_rep', 'driver']),
                    eq(schema.users.gpsTrackingEnabled, true)
                )
            );

        // Get most recent location for each user
        const locations = await Promise.all(
            trackedUsers.map(async (trackedUser) => {
                const userConditions = [
                    ...conditions,
                    eq(schema.userLocations.userId, trackedUser.id),
                ];

                const [latestLocation] = await db
                    .select({
                        latitude: schema.userLocations.latitude,
                        longitude: schema.userLocations.longitude,
                        accuracy: schema.userLocations.accuracy,
                        heading: schema.userLocations.heading,
                        speed: schema.userLocations.speed,
                        timestamp: schema.userLocations.timestamp,
                    })
                    .from(schema.userLocations)
                    .where(and(...userConditions))
                    .orderBy(desc(schema.userLocations.timestamp))
                    .limit(1);

                if (!latestLocation) return null;

                return {
                    userId: trackedUser.id,
                    name: trackedUser.name,
                    role: trackedUser.role,
                    latitude: parseFloat(latestLocation.latitude || '0'),
                    longitude: parseFloat(latestLocation.longitude || '0'),
                    accuracy: latestLocation.accuracy ? parseFloat(latestLocation.accuracy) : null,
                    heading: latestLocation.heading ? parseFloat(latestLocation.heading) : null,
                    speed: latestLocation.speed ? parseFloat(latestLocation.speed) : null,
                    timestamp: latestLocation.timestamp,
                    lastUpdateAt: trackedUser.lastLocationUpdateAt,
                };
            })
        );

        // Filter out nulls (users with no location data)
        const validLocations = locations.filter((loc): loc is NonNullable<typeof loc> => loc !== null);

        return {
            success: true,
            data: validLocations,
        };
    });

    // ----------------------------------------------------------------
    // GET LOCATION HISTORY (Supervisor / Admin only)
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: GetHistoryQuery }>('/history', {
        preHandler: [fastify.authenticate],
        schema: { querystring: GetHistoryQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const query = request.query;

        // Check user role
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only supervisors and admins can view location history' }
            });
        }

        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TENANT', message: 'User must belong to a tenant' }
            });
        }

        // Verify the requested user belongs to the same tenant
        const [targetUser] = await db
            .select({ tenantId: schema.users.tenantId, role: schema.users.role })
            .from(schema.users)
            .where(eq(schema.users.id, query.userId))
            .limit(1);

        if (!targetUser || targetUser.tenantId !== user.tenantId) {
            return reply.code(404).send({
                success: false,
                error: { code: 'USER_NOT_FOUND', message: 'User not found' }
            });
        }

        // Build date range (default to last 24 hours, max 7 days)
        const endDate = query.endDate ? new Date(query.endDate) : new Date();
        const startDate = query.startDate
            ? new Date(query.startDate)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Validate date range (max 7 days)
        const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 7) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_DATE_RANGE', message: 'Date range cannot exceed 7 days' }
            });
        }

        const limit = query.limit ? parseInt(query.limit) : 1000;

        const history = await db
            .select({
                id: schema.userLocations.id,
                latitude: schema.userLocations.latitude,
                longitude: schema.userLocations.longitude,
                accuracy: schema.userLocations.accuracy,
                heading: schema.userLocations.heading,
                speed: schema.userLocations.speed,
                timestamp: schema.userLocations.timestamp,
            })
            .from(schema.userLocations)
            .where(
                and(
                    eq(schema.userLocations.userId, query.userId),
                    eq(schema.userLocations.tenantId, user.tenantId),
                    gte(schema.userLocations.timestamp, startDate),
                    lte(schema.userLocations.timestamp, endDate)
                )
            )
            .orderBy(desc(schema.userLocations.timestamp))
            .limit(limit);

        return {
            success: true,
            data: history.map(h => ({
                id: h.id,
                latitude: parseFloat(h.latitude || '0'),
                longitude: parseFloat(h.longitude || '0'),
                accuracy: h.accuracy ? parseFloat(h.accuracy) : null,
                heading: h.heading ? parseFloat(h.heading) : null,
                speed: h.speed ? parseFloat(h.speed) : null,
                timestamp: h.timestamp,
            })),
        };
    });

    // ----------------------------------------------------------------
    // GET GPS TRACKING SETTINGS
    // - Read access: All authenticated users (sales_rep, driver, supervisor, tenant_admin, super_admin)
    // - Write access: Only tenant_admin and super_admin (see PUT /settings)
    // ----------------------------------------------------------------
    fastify.get('/settings', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        // Allow all authenticated users to read GPS settings
        // (needed for sales_rep/driver to check if tracking is enabled and get parameters)
        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TENANT', message: 'User must belong to a tenant' }
            });
        }

        const settings = await getTenantGPSSettings(user.tenantId);
        return { success: true, data: settings };
    });

    // ----------------------------------------------------------------
    // UPDATE GPS TRACKING SETTINGS (Tenant Admin / Super Admin)
    // ----------------------------------------------------------------
    fastify.put<{ Body: UpdateGPSTrackingSettingsBody }>('/settings', {
        preHandler: [fastify.authenticate],
        schema: { body: UpdateGPSTrackingSettingsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only tenant admins and super admins can update GPS settings' }
            });
        }

        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_TENANT', message: 'User must belong to a tenant' }
            });
        }

        // Update settings
        if (body.enabled !== undefined) {
            await setTenantGPSSetting(user.tenantId, 'gps_tracking_enabled', body.enabled.toString());
        }
        if (body.movementThreshold !== undefined) {
            await setTenantGPSSetting(user.tenantId, 'gps_movement_threshold_meters', body.movementThreshold.toString());
        }
        if (body.fallbackInterval !== undefined) {
            await setTenantGPSSetting(user.tenantId, 'gps_fallback_interval_seconds', body.fallbackInterval.toString());
        }
        if (body.historyRetentionDays !== undefined) {
            await setTenantGPSSetting(user.tenantId, 'gps_history_retention_days', body.historyRetentionDays.toString());
        }
        if (body.minAccuracy !== undefined) {
            await setTenantGPSSetting(user.tenantId, 'gps_min_accuracy_meters', body.minAccuracy.toString());
        }

        const updatedSettings = await getTenantGPSSettings(user.tenantId);
        return { success: true, data: updatedSettings };
    });

    // ----------------------------------------------------------------
    // UPDATE USER GPS TRACKING STATUS (User can update own, Admin can update any)
    // ----------------------------------------------------------------
    fastify.put<{ Params: { id: string }; Body: UpdateUserGPSTrackingBody }>('/users/:id/tracking', {
        preHandler: [fastify.authenticate],
        schema: {
            params: Type.Object({ id: Type.String() }),
            body: UpdateUserGPSTrackingBodySchema,
        },
    }, async (request, reply) => {
        const user = request.user!;
        const { id: targetUserId } = request.params;
        const body = request.body;

        // User can update own, admin can update any
        if (targetUserId !== user.id && !['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You can only update your own GPS tracking status' }
            });
        }

        // Verify target user exists and belongs to same tenant (if not super_admin)
        const [targetUser] = await db
            .select({ tenantId: schema.users.tenantId, role: schema.users.role })
            .from(schema.users)
            .where(eq(schema.users.id, targetUserId))
            .limit(1);

        if (!targetUser) {
            return reply.code(404).send({
                success: false,
                error: { code: 'USER_NOT_FOUND', message: 'User not found' }
            });
        }

        // Only sales_rep and driver can have GPS tracking
        if (!['sales_rep', 'driver'].includes(targetUser.role)) {
            return reply.code(400).send({
                success: false,
                error: { code: 'INVALID_ROLE', message: 'GPS tracking is only available for sales reps and drivers' }
            });
        }

        // Check tenant isolation (unless super_admin)
        if (user.role !== 'super_admin' && targetUser.tenantId !== user.tenantId) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot update user from different tenant' }
            });
        }

        await db
            .update(schema.users)
            .set({ gpsTrackingEnabled: body.enabled })
            .where(eq(schema.users.id, targetUserId));

        return { success: true, data: { enabled: body.enabled } };
    });
};
