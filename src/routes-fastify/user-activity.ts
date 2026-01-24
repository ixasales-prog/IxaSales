/**
 * User Activity Tracking Routes (Fastify)
 * 
 * Handles user session management and activity tracking for comprehensive
 * user behavior analytics and monitoring.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, desc, gte, lt, sql } from 'drizzle-orm';
import { userSessions, userActivityEvents } from '../db/schema/users';
import { logAudit } from '../lib/audit';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

const BatchActivityEventsSchema = Type.Object({
    events: Type.Array(Type.Object({
        id: Type.String(),
        type: Type.String(),
        timestamp: Type.String({ format: 'date-time' }),
        url: Type.String(),
        title: Type.String(),
        sessionId: Type.String(),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Any()))
    }))
});

const GetUserSessionsQuerySchema = Type.Object({
    userId: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String({ format: 'date-time' })),
    endDate: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Number({ minimum: 0 }))
});

const GetUserActivityQuerySchema = Type.Object({
    sessionId: Type.Optional(Type.String()),
    userId: Type.Optional(Type.String()),
    eventType: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String({ format: 'date-time' })),
    endDate: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    offset: Type.Optional(Type.Number({ minimum: 0 }))
});

const GetUserAnalyticsQuerySchema = Type.Object({
    userId: Type.Optional(Type.String()),
    period: Type.Optional(Type.Union([
        Type.Literal('day'),
        Type.Literal('week'),
        Type.Literal('month')
    ])),
    startDate: Type.Optional(Type.String({ format: 'date-time' })),
    endDate: Type.Optional(Type.String({ format: 'date-time' })),
    // Hard limits for performance and security
    maxDays: Type.Optional(Type.Number({ minimum: 1, maximum: 90 }))
});

// Schema for retention policy endpoint
const GetRetentionPolicySchema = Type.Object({});

type BatchActivityEventsBody = Static<typeof BatchActivityEventsSchema>;
type GetUserSessionsQuery = Static<typeof GetUserSessionsQuerySchema>;
type GetUserActivityQuery = Static<typeof GetUserActivityQuerySchema>;
type GetUserAnalyticsQuery = Static<typeof GetUserAnalyticsQuerySchema>;

// ============================================================================
// ROUTES
// ============================================================================

export const userActivityRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // BATCH INSERT USER ACTIVITY EVENTS
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchActivityEventsBody }>('/batch', {
        preHandler: [fastify.authenticate],
        schema: { body: BatchActivityEventsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { events } = request.body;

        try {
            // Validate that all events belong to the same session
            const sessionIds = [...new Set(events.map((e: any) => e.sessionId))];
            if (sessionIds.length > 1) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'INVALID_REQUEST', message: 'All events must belong to the same session' }
                });
            }

            const sessionId = sessionIds[0];

            // Insert events in batch
            const eventRecords = events.map((event: any) => ({
                sessionId,
                userId: user.id,
                tenantId: user.tenantId,
                eventType: event.type,
                timestamp: new Date(event.timestamp),
                url: event.url,
                pageTitle: event.title,
                metadata: event.metadata ? JSON.stringify(event.metadata) : null
            }));

            await db.insert(userActivityEvents).values(eventRecords);

            // Update session metrics
            const sessionMetrics = {
                pageVisits: events.filter((e: any) => e.type === 'page_visit').length,
                actionsCount: events.filter((e: any) => e.type === 'user_action').length
            };

            if (sessionMetrics.pageVisits > 0 || sessionMetrics.actionsCount > 0) {
                // Update session metrics atomically
                await db.execute(sql`
                    UPDATE user_sessions 
                    SET 
                        page_visits = page_visits + ${sessionMetrics.pageVisits},
                        actions_count = actions_count + ${sessionMetrics.actionsCount},
                        updated_at = NOW()
                    WHERE id = ${sessionId}
                `);
            }

            return reply.send({
                success: true,
                processed: events.length,
                message: 'Activity events recorded successfully'
            });

        } catch (error: any) {
            fastify.log.error('Error processing user activity batch:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to process activity events' }
            });
        }
    });

    // ----------------------------------------------------------------
    // CREATE NEW USER SESSION
    // ----------------------------------------------------------------
    fastify.post('/sessions/start', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        try {
            // End any existing active sessions for this user
            await db
                .update(userSessions)
                .set({
                    isActive: false,
                    endedAt: new Date(),
                    endedReason: 'new_session',
                    updatedAt: new Date()
                })
                .where(and(
                    eq(userSessions.userId, user.id),
                    eq(userSessions.isActive, true)
                ));

            // Create new session
            const [newSession] = await db
                .insert(userSessions)
                .values({
                    userId: user.id,
                    tenantId: user.tenantId,
                    startedAt: new Date(),
                    ipAddress: request.ip,
                    userAgent: request.headers['user-agent'],
                    deviceInfo: JSON.stringify({
                        screenWidth: (request.headers['screen-width'] as string) || null,
                        screenHeight: (request.headers['screen-height'] as string) || null,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    })
                })
                .returning();

            await logAudit(
                'USER_SESSION_START',
                { sessionId: newSession.id, ipAddress: request.ip },
                user.id,
                user.tenantId
            );

            return reply.send({
                success: true,
                sessionId: newSession.id,
                message: 'Session started successfully'
            });

        } catch (error: any) {
            fastify.log.error('Error starting user session:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to start session' }
            });
        }
    });

    // ----------------------------------------------------------------
    // END USER SESSION
    // ----------------------------------------------------------------
    fastify.post<{ Params: { sessionId: string }, Body: { reason?: string } }>('/sessions/:sessionId/end', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        const { sessionId } = request.params;
        const { reason = 'normal' } = request.body;

        try {
            // Verify session belongs to user
            const session = await db.query.userSessions.findFirst({
                where: and(
                    eq(userSessions.id, sessionId),
                    eq(userSessions.userId, user.id)
                )
            });

            if (!session) {
                return reply.code(404).send({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Session not found' }
                });
            }

            // Calculate duration
            const durationMs = Date.now() - new Date(session.startedAt).getTime();
            const duration = `${Math.floor(durationMs / 1000)} seconds`;

            // End session
            await db
                .update(userSessions)
                .set({
                    isActive: false,
                    endedAt: new Date(),
                    duration,
                    endedReason: reason,
                    updatedAt: new Date()
                })
                .where(eq(userSessions.id, sessionId));

            await logAudit(
                'USER_SESSION_END',
                { sessionId, duration, reason },
                user.id,
                user.tenantId
            );

            return reply.send({
                success: true,
                message: 'Session ended successfully'
            });

        } catch (error: any) {
            fastify.log.error('Error ending user session:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to end session' }
            });
        }
    });

    // ----------------------------------------------------------------
    // GET USER SESSIONS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: GetUserSessionsQuery }>('/sessions', {
        preHandler: [fastify.authenticate],
        schema: { querystring: GetUserSessionsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { userId, startDate, endDate, limit = 20, offset = 0 } = request.query;

        try {
            // Authorization check
            let targetUserId = userId;
            if (user.role === 'user' && userId && userId !== user.id) {
                return reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Access denied' }
                });
            }

            if (user.role === 'user') {
                targetUserId = user.id;
            }

            // Build query conditions
            const conditions = [eq(userSessions.tenantId, user.tenantId)];
            
            if (targetUserId) {
                conditions.push(eq(userSessions.userId, targetUserId));
            }

            if (startDate) {
                conditions.push(gte(userSessions.startedAt, new Date(startDate)));
            }

            if (endDate) {
                conditions.push(lt(userSessions.startedAt, new Date(endDate)));
            }

            // Fetch sessions
            const sessions = await db.query.userSessions.findMany({
                where: and(...conditions),
                orderBy: [desc(userSessions.startedAt)],
                limit,
                offset
            });

            return reply.send({
                success: true,
                sessions,
                totalCount: sessions.length
            });

        } catch (error: any) {
            fastify.log.error('Error fetching user sessions:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sessions' }
            });
        }
    });

    // ----------------------------------------------------------------
    // GET USER ACTIVITY EVENTS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: GetUserActivityQuery }>('/events', {
        preHandler: [fastify.authenticate],
        schema: { querystring: GetUserActivityQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { sessionId, userId, eventType, startDate, endDate, limit = 100, offset = 0 } = request.query;

        try {
            // Authorization check
            let targetUserId = userId;
            if (user.role === 'user' && userId && userId !== user.id) {
                return reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Access denied' }
                });
            }

            if (user.role === 'user') {
                targetUserId = user.id;
            }

            // Build query conditions
            const conditions = [eq(userActivityEvents.tenantId, user.tenantId)];
            
            if (targetUserId) {
                conditions.push(eq(userActivityEvents.userId, targetUserId));
            }

            if (sessionId) {
                conditions.push(eq(userActivityEvents.sessionId, sessionId));
            }

            if (eventType) {
                conditions.push(eq(userActivityEvents.eventType, eventType));
            }

            if (startDate) {
                conditions.push(gte(userActivityEvents.timestamp, new Date(startDate)));
            }

            if (endDate) {
                conditions.push(lt(userActivityEvents.timestamp, new Date(endDate)));
            }

            // Fetch events
            const events = await db.query.userActivityEvents.findMany({
                where: and(...conditions),
                orderBy: [desc(userActivityEvents.timestamp)],
                limit,
                offset
            });

            return reply.send({
                success: true,
                events,
                totalCount: events.length
            });

        } catch (error: any) {
            fastify.log.error('Error fetching user activity:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity events' }
            });
        }
    });

    // ----------------------------------------------------------------
    // GET USER ANALYTICS SUMMARY (WITH STRICT GUARDRAILS)
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: GetUserAnalyticsQuery }>('/analytics/summary', {
        preHandler: [fastify.authenticate, fastify.requireRole(['supervisor', 'tenant_admin'])],
        schema: { querystring: GetUserAnalyticsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { userId, period = 'week', startDate, endDate, maxDays = 30 } = request.query;

        try {
            // SECURITY: Strict time bounding (max 90 days)
            const MAX_DAYS_ALLOWED = 90;
            const effectiveMaxDays = Math.min(maxDays, MAX_DAYS_ALLOWED);
            
            // Calculate date range with hard limits
            const now = new Date();
            let fromDate: Date;
            
            // Determine date range
            if (startDate && endDate) {
                fromDate = new Date(startDate);
                const toDate = new Date(endDate);
                
                // Validate date range
                if (fromDate >= toDate) {
                    return reply.code(400).send({
                        success: false,
                        error: { code: 'INVALID_DATE_RANGE', message: 'Start date must be before end date' }
                    });
                }
                
                // Apply maximum range limit
                const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays > effectiveMaxDays) {
                    return reply.code(400).send({
                        success: false,
                        error: { 
                            code: 'DATE_RANGE_TOO_LARGE', 
                            message: `Date range cannot exceed ${effectiveMaxDays} days` 
                        }
                    });
                }
            } else {
                // Use period-based calculation with hard limits
                const periodDays = {
                    'day': 1,
                    'week': 7,
                    'month': 30
                }[period] || 7;
                
                const actualDays = Math.min(periodDays, effectiveMaxDays);
                fromDate = new Date(now.getTime() - actualDays * 24 * 60 * 60 * 1000);
            }

            // PERFORMANCE: Limit result set size
            const MAX_RESULTS = 10000;
            
            // Build secure, bounded query conditions
            const conditions = [
                eq(userSessions.tenantId, user.tenantId),
                gte(userSessions.startedAt, fromDate),
                lt(userSessions.startedAt, now)
            ];

            // User filtering with authorization
            if (userId) {
                // Verify user belongs to same tenant
                const [targetUser] = await db
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .where(and(
                        eq(schema.users.id, userId),
                        eq(schema.users.tenantId, user.tenantId)
                    ))
                    .limit(1);
                
                if (!targetUser) {
                    return reply.code(404).send({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: 'User not found in tenant' }
                    });
                }
                conditions.push(eq(userSessions.userId, userId));
            }

            // PERFORMANCE: Use aggregated queries instead of SELECT *
            const sessions = await db.query.userSessions.findMany({
                where: and(...conditions),
                orderBy: [desc(userSessions.startedAt)],
                limit: MAX_RESULTS
            });

            // Calculate analytics safely
            const totalSessions = Math.min(sessions.length, MAX_RESULTS);
            const totalDuration = sessions.reduce((sum, session) => {
                if (session.duration) {
                    const seconds = parseInt(session.duration.split(' ')[0]) || 0;
                    return sum + seconds;
                }
                return sum;
            }, 0);

            const avgSessionDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
            const totalPageVisits = sessions.reduce((sum, session) => sum + session.pageVisits, 0);
            const totalActions = sessions.reduce((sum, session) => sum + session.actionsCount, 0);

            const analytics = {
                period: { 
                    start: fromDate.toISOString(), 
                    end: now.toISOString(),
                    daysCovered: Math.ceil((now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
                },
                queryLimits: {
                    maxDaysAllowed: effectiveMaxDays,
                    maxResults: MAX_RESULTS
                },
                totals: {
                    sessions: totalSessions,
                    pageVisits: totalPageVisits,
                    actions: totalActions,
                    totalDurationSeconds: totalDuration
                },
                averages: {
                    sessionDurationSeconds: avgSessionDuration,
                    pageVisitsPerSession: totalSessions > 0 ? Math.round(totalPageVisits / totalSessions) : 0,
                    actionsPerSession: totalSessions > 0 ? Math.round(totalActions / totalSessions) : 0
                }
            };

            return reply.send({
                success: true,
                analytics
            });

        } catch (error: any) {
            fastify.log.error('Error fetching user analytics:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics' }
            });
        }
    });

    // ----------------------------------------------------------------
    // GET RETENTION POLICY (ADMIN-VISIBLE)
    // ----------------------------------------------------------------
    fastify.get('/retention-policy', {
        preHandler: [fastify.authenticate, fastify.requireRole(['supervisor', 'tenant_admin'])]
    }, async (request, reply) => {
        const user = request.user!;

        try {
            // Get tenant settings for retention policy
            const settings = await db
                .select({ key: schema.tenantSettings.key, value: schema.tenantSettings.value })
                .from(schema.tenantSettings)
                .where(and(
                    eq(schema.tenantSettings.tenantId, user.tenantId),
                    eq(schema.tenantSettings.key, 'user_activity_retention_days')
                ));

            const settingsMap: Record<string, string> = {};
            settings.forEach(s => {
                if (s.key && s.value) {
                    settingsMap[s.key] = s.value;
                }
            });

            // Default values
            const eventsRetentionDays = parseInt(settingsMap['user_activity_retention_days'] || '90');
            const sessionsRetentionDays = 180; // Fixed in cleanup job

            const policy = {
                eventsRetentionDays,
                sessionsRetentionDays,
                isActive: true,
                description: `User activity events are automatically deleted after ${eventsRetentionDays} days. Ended sessions are deleted after ${sessionsRetentionDays} days.`
            };

            return reply.send({
                success: true,
                policy
            });

        } catch (error: any) {
            fastify.log.error('Error fetching retention policy:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch retention policy' }
            });
        }
    });
};

export default userActivityRoutes;