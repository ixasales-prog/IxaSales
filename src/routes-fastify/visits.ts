import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

// Schemas
const ListVisitsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    customerId: Type.Optional(Type.String()),
});

const TodayVisitsQuerySchema = Type.Object({
    date: Type.Optional(Type.String()),
});

const VisitIdParamsSchema = Type.Object({
    id: Type.String(),
});

const CreateVisitBodySchema = Type.Object({
    customerId: Type.String(),
    salesRepId: Type.Optional(Type.String()),
    visitType: Type.Optional(Type.String()),
    plannedDate: Type.String(),
    plannedTime: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
});

const QuickVisitBodySchema = Type.Object({
    customerId: Type.String(),
    outcome: Type.String(),
    plannedDate: Type.Optional(Type.String()),
    plannedTime: Type.Optional(Type.String()),
    photo: Type.Optional(Type.String()),
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
    outcomeNotes: Type.Optional(Type.String()),
    noOrderReason: Type.Optional(Type.String()),
    followUpReason: Type.Optional(Type.String()),
    followUpDate: Type.Optional(Type.String()),
    followUpTime: Type.Optional(Type.String()),
});

const StartVisitBodySchema = Type.Object({
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
});

const CompleteVisitBodySchema = Type.Object({
    outcome: Type.String(),
    outcomeNotes: Type.Optional(Type.String()),
    photos: Type.Optional(Type.Array(Type.String())),
    orderId: Type.Optional(Type.String()),
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
});

const CancelVisitBodySchema = Type.Object({
    reason: Type.Optional(Type.String()),
});

const UpdateVisitBodySchema = Type.Object({
    plannedDate: Type.Optional(Type.String()),
    plannedTime: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    visitType: Type.Optional(Type.String()),
});

type ListVisitsQuery = Static<typeof ListVisitsQuerySchema>;
type TodayVisitsQuery = Static<typeof TodayVisitsQuerySchema>;
type CreateVisitBody = Static<typeof CreateVisitBodySchema>;
type QuickVisitBody = Static<typeof QuickVisitBodySchema>;
type StartVisitBody = Static<typeof StartVisitBodySchema>;
type CompleteVisitBody = Static<typeof CompleteVisitBodySchema>;
type CancelVisitBody = Static<typeof CancelVisitBodySchema>;
type UpdateVisitBody = Static<typeof UpdateVisitBodySchema>;

export const visitRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // LIST VISITS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: ListVisitsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListVisitsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', startDate, endDate, status, customerId } = request.query;

        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.salesVisits.tenantId, user.tenantId)];

        // Sales rep can only see their own visits
        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        // Date filters
        if (startDate) conditions.push(gte(schema.salesVisits.plannedDate, startDate));
        if (endDate) conditions.push(lte(schema.salesVisits.plannedDate, endDate));
        if (status) conditions.push(eq(schema.salesVisits.status, status as any));
        if (customerId) conditions.push(eq(schema.salesVisits.customerId, customerId));

        const visits = await db
            .select({
                id: schema.salesVisits.id,
                customerId: schema.salesVisits.customerId,
                customerName: schema.customers.name,
                customerAddress: schema.customers.address,
                salesRepId: schema.salesVisits.salesRepId,
                salesRepName: schema.users.name,
                visitType: schema.salesVisits.visitType,
                status: schema.salesVisits.status,
                outcome: schema.salesVisits.outcome,
                plannedDate: schema.salesVisits.plannedDate,
                plannedTime: schema.salesVisits.plannedTime,
                startedAt: schema.salesVisits.startedAt,
                completedAt: schema.salesVisits.completedAt,
                notes: schema.salesVisits.notes,
                outcomeNotes: schema.salesVisits.outcomeNotes,
                orderId: schema.salesVisits.orderId,
                createdAt: schema.salesVisits.createdAt,
            })
            .from(schema.salesVisits)
            .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.salesVisits.plannedDate))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.salesVisits)
            .where(and(...conditions));

        return {
            success: true,
            data: visits,
            meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) },
        };
    });

    // ----------------------------------------------------------------
    // GET TODAY'S VISITS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: TodayVisitsQuery }>('/today', {
        preHandler: [fastify.authenticate],
        schema: { querystring: TodayVisitsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const date = request.query.date || new Date().toISOString().split('T')[0];

        const conditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            eq(schema.salesVisits.plannedDate, date),
        ];

        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        const visits = await db
            .select({
                id: schema.salesVisits.id,
                customerId: schema.salesVisits.customerId,
                customerName: schema.customers.name,
                customerAddress: schema.customers.address,
                customerPhone: schema.customers.phone,
                visitType: schema.salesVisits.visitType,
                status: schema.salesVisits.status,
                outcome: schema.salesVisits.outcome,
                plannedTime: schema.salesVisits.plannedTime,
                startedAt: schema.salesVisits.startedAt,
                completedAt: schema.salesVisits.completedAt,
                notes: schema.salesVisits.notes,
                orderId: schema.salesVisits.orderId,
            })
            .from(schema.salesVisits)
            .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .where(and(...conditions))
            .orderBy(desc(schema.salesVisits.plannedTime));

        // Calculate stats
        const completed = visits.filter(v => v.status === 'completed').length;
        const inProgress = visits.filter(v => v.status === 'in_progress').length;
        const planned = visits.filter(v => v.status === 'planned').length;

        return {
            success: true,
            data: visits,
            stats: { total: visits.length, completed, inProgress, planned }
        };
    });

    // ----------------------------------------------------------------
    // GET VISIT STATS (for dashboard)
    // ----------------------------------------------------------------
    fastify.get('/stats', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        const today = new Date().toISOString().split('T')[0];
        const conditions: any[] = [eq(schema.salesVisits.tenantId, user.tenantId)];

        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        // Today's visits
        const todayConditions = [...conditions, eq(schema.salesVisits.plannedDate, today)];
        const [todayStats] = await db
            .select({
                total: sql<number>`count(*)`,
                completed: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                inProgress: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'in_progress')`,
            })
            .from(schema.salesVisits)
            .where(and(...todayConditions));

        // This week's stats
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekConditions = [...conditions, gte(schema.salesVisits.plannedDate, weekStart.toISOString().split('T')[0])];
        const [weekStats] = await db
            .select({
                total: sql<number>`count(*)`,
                completed: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                ordersPlaced: sql<number>`count(*) filter (where ${schema.salesVisits.outcome} = 'order_placed')`,
            })
            .from(schema.salesVisits)
            .where(and(...weekConditions));

        return {
            success: true,
            data: {
                today: {
                    total: Number(todayStats?.total || 0),
                    completed: Number(todayStats?.completed || 0),
                    inProgress: Number(todayStats?.inProgress || 0),
                },
                thisWeek: {
                    total: Number(weekStats?.total || 0),
                    completed: Number(weekStats?.completed || 0),
                    ordersPlaced: Number(weekStats?.ordersPlaced || 0),
                }
            }
        };
    });

    // ----------------------------------------------------------------
    // GET VISIT BY ID
    // ----------------------------------------------------------------
    fastify.get<{ Params: Static<typeof VisitIdParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: VisitIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [visit] = await db
            .select({
                id: schema.salesVisits.id,
                customerId: schema.salesVisits.customerId,
                customerName: schema.customers.name,
                customerAddress: schema.customers.address,
                customerPhone: schema.customers.phone,
                salesRepId: schema.salesVisits.salesRepId,
                salesRepName: schema.users.name,
                visitType: schema.salesVisits.visitType,
                status: schema.salesVisits.status,
                outcome: schema.salesVisits.outcome,
                plannedDate: schema.salesVisits.plannedDate,
                plannedTime: schema.salesVisits.plannedTime,
                startedAt: schema.salesVisits.startedAt,
                completedAt: schema.salesVisits.completedAt,
                startLatitude: schema.salesVisits.startLatitude,
                startLongitude: schema.salesVisits.startLongitude,
                endLatitude: schema.salesVisits.endLatitude,
                endLongitude: schema.salesVisits.endLongitude,
                notes: schema.salesVisits.notes,
                outcomeNotes: schema.salesVisits.outcomeNotes,
                orderId: schema.salesVisits.orderId,
                createdAt: schema.salesVisits.createdAt,
            })
            .from(schema.salesVisits)
            .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
            .where(and(
                eq(schema.salesVisits.id, id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Sales rep can only see their own visits
        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        return { success: true, data: visit };
    });

    // ----------------------------------------------------------------
    // CREATE VISIT
    // ----------------------------------------------------------------
    fastify.post<{ Body: CreateVisitBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        // Verify customer exists and belongs to tenant
        const [customer] = await db
            .select({ id: schema.customers.id })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.id, body.customerId),
                eq(schema.customers.tenantId, user.tenantId)
            ));

        if (!customer) {
            return reply.code(404).send({ success: false, error: { code: 'CUSTOMER_NOT_FOUND' } });
        }

        const [visit] = await db
            .insert(schema.salesVisits)
            .values({
                tenantId: user.tenantId,
                customerId: body.customerId,
                salesRepId: user.role === 'sales_rep' ? user.id : (body.salesRepId || user.id),
                visitType: (body.visitType || 'scheduled') as any,
                status: 'planned',
                plannedDate: body.plannedDate,
                plannedTime: body.plannedTime,
                notes: body.notes,
            })
            .returning();

        return { success: true, data: visit };
    });

    // ----------------------------------------------------------------
    // QUICK VISIT (Create and complete in one step)
    // ----------------------------------------------------------------
    fastify.post<{ Body: QuickVisitBody }>('/quick', {
        preHandler: [fastify.authenticate],
        schema: { body: QuickVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        try {
            // Verify customer exists and belongs to tenant
            const [customer] = await db
                .select({ id: schema.customers.id })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.id, body.customerId),
                    eq(schema.customers.tenantId, user.tenantId)
                ));

            if (!customer) {
                return reply.code(404).send({ success: false, error: { code: 'CUSTOMER_NOT_FOUND' } });
            }

            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().slice(0, 5);

            // Build insert values, handling optional fields
            const insertValues: any = {
                tenantId: user.tenantId,
                customerId: body.customerId,
                salesRepId: user.id,
                visitType: 'ad_hoc',
                status: 'completed',
                outcome: body.outcome,
                plannedDate: body.plannedDate || today,
                plannedTime: body.plannedTime || currentTime,
                startedAt: now,
                completedAt: now,
            };

            // Optional fields
            if (body.latitude !== undefined) {
                insertValues.startLatitude = body.latitude.toString();
                insertValues.startLongitude = body.longitude?.toString();
                insertValues.endLatitude = body.latitude.toString();
                insertValues.endLongitude = body.longitude?.toString();
            }
            if (body.photo) {
                insertValues.photos = [body.photo];
            }
            if (body.outcomeNotes) {
                insertValues.outcomeNotes = body.outcomeNotes;
            }
            if (body.noOrderReason) {
                insertValues.noOrderReason = body.noOrderReason;
            }
            if (body.followUpReason) {
                insertValues.followUpReason = body.followUpReason;
            }
            if (body.followUpDate) {
                insertValues.followUpDate = body.followUpDate;
            }
            if (body.followUpTime) {
                insertValues.followUpTime = body.followUpTime;
            }

            // Create visit with completed status
            const [visit] = await db
                .insert(schema.salesVisits)
                .values(insertValues)
                .returning();

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Quick visit error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
    });

    // ----------------------------------------------------------------
    // START VISIT
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof VisitIdParamsSchema>; Body: StartVisitBody }>('/:id/start', {
        preHandler: [fastify.authenticate],
        schema: { params: VisitIdParamsSchema, body: StartVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const body = request.body;

        // Get visit
        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Sales rep can only start their own visits
        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (visit.status !== 'planned') {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: 'Visit must be planned to start' } });
        }

        const [updated] = await db
            .update(schema.salesVisits)
            .set({
                status: 'in_progress',
                startedAt: new Date(),
                startLatitude: body.latitude?.toString(),
                startLongitude: body.longitude?.toString(),
                updatedAt: new Date(),
            })
            .where(eq(schema.salesVisits.id, id))
            .returning();

        return { success: true, data: updated };
    });

    // ----------------------------------------------------------------
    // COMPLETE VISIT
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof VisitIdParamsSchema>; Body: CompleteVisitBody }>('/:id/complete', {
        preHandler: [fastify.authenticate],
        schema: { params: VisitIdParamsSchema, body: CompleteVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const body = request.body;

        // Get visit
        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (visit.status !== 'in_progress') {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: 'Visit must be in progress to complete' } });
        }

        const [updated] = await db
            .update(schema.salesVisits)
            .set({
                status: 'completed',
                completedAt: new Date(),
                outcome: body.outcome as any,
                outcomeNotes: body.outcomeNotes,
                photos: body.photos,
                orderId: body.orderId,
                endLatitude: body.latitude?.toString(),
                endLongitude: body.longitude?.toString(),
                updatedAt: new Date(),
            })
            .where(eq(schema.salesVisits.id, id))
            .returning();

        return { success: true, data: updated };
    });

    // ----------------------------------------------------------------
    // CANCEL VISIT
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof VisitIdParamsSchema>; Body: CancelVisitBody }>('/:id/cancel', {
        preHandler: [fastify.authenticate],
        schema: { params: VisitIdParamsSchema, body: CancelVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const body = request.body;

        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (visit.status === 'completed') {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot cancel completed visit' } });
        }

        const [updated] = await db
            .update(schema.salesVisits)
            .set({
                status: 'cancelled',
                outcomeNotes: body.reason,
                updatedAt: new Date(),
            })
            .where(eq(schema.salesVisits.id, id))
            .returning();

        return { success: true, data: updated };
    });

    // ----------------------------------------------------------------
    // UPDATE/RESCHEDULE VISIT
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof VisitIdParamsSchema>; Body: UpdateVisitBody }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: VisitIdParamsSchema, body: UpdateVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const body = request.body;

        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        // Can only reschedule planned visits
        if (visit.status !== 'planned') {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only reschedule planned visits' } });
        }

        const updateData: any = { updatedAt: new Date() };
        if (body.plannedDate) updateData.plannedDate = body.plannedDate;
        if (body.plannedTime !== undefined) updateData.plannedTime = body.plannedTime;
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.visitType) updateData.visitType = body.visitType;

        const [updated] = await db
            .update(schema.salesVisits)
            .set(updateData)
            .where(eq(schema.salesVisits.id, id))
            .returning();

        return { success: true, data: updated };
    });

    // ----------------------------------------------------------------
    // MARK MISSED VISITS (for scheduled job or manual trigger)
    // ----------------------------------------------------------------
    fastify.post('/mark-missed', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        // Only admins/managers can trigger this
        if (!['admin', 'tenant_admin', 'manager'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Mark all planned visits from yesterday as missed
        const result = await db
            .update(schema.salesVisits)
            .set({
                status: 'missed',
                updatedAt: new Date(),
            })
            .where(and(
                eq(schema.salesVisits.tenantId, user.tenantId),
                eq(schema.salesVisits.status, 'planned'),
                lte(schema.salesVisits.plannedDate, yesterdayStr)
            ))
            .returning({ id: schema.salesVisits.id });

        return { success: true, data: { markedAsMissed: result.length } };
    });
};
