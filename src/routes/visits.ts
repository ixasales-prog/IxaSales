import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

export const visitRoutes = new Elysia({ prefix: '/visits' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // LIST VISITS
    // ----------------------------------------------------------------

    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.salesVisits.tenantId, user.tenantId)];

        // Sales rep can only see their own visits
        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        // Date filters
        if (query.startDate) {
            conditions.push(gte(schema.salesVisits.plannedDate, query.startDate));
        }
        if (query.endDate) {
            conditions.push(lte(schema.salesVisits.plannedDate, query.endDate));
        }
        if (query.status) {
            conditions.push(eq(schema.salesVisits.status, query.status));
        }
        if (query.customerId) {
            conditions.push(eq(schema.salesVisits.customerId, query.customerId));
        }

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
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
            status: t.Optional(t.String()),
            customerId: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // GET TODAY'S VISITS
    // ----------------------------------------------------------------

    .get('/today', async (ctx) => {
        const { user, isAuthenticated, set, query } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const date = query.date || new Date().toISOString().split('T')[0];
        console.log('Fetching visits for date:', date, 'user:', user.id);

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

        console.log('Found visits:', visits.length);

        // Calculate stats
        const completed = visits.filter(v => v.status === 'completed').length;
        const inProgress = visits.filter(v => v.status === 'in_progress').length;
        const planned = visits.filter(v => v.status === 'planned').length;

        return {
            success: true,
            data: visits,
            stats: { total: visits.length, completed, inProgress, planned }
        };
    }, {
        query: t.Object({
            date: t.Optional(t.String())
        })
    })

    // ----------------------------------------------------------------
    // GET VISIT STATS (for dashboard)
    // ----------------------------------------------------------------

    .get('/stats', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

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
    })

    // ----------------------------------------------------------------
    // GET VISIT BY ID
    // ----------------------------------------------------------------

    .get('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

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
                eq(schema.salesVisits.id, params.id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        // Sales rep can only see their own visits
        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }

        return { success: true, data: visit };
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // CREATE VISIT
    // ----------------------------------------------------------------

    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Verify customer exists and belongs to tenant
        const [customer] = await db
            .select({ id: schema.customers.id })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.id, body.customerId),
                eq(schema.customers.tenantId, user.tenantId)
            ));

        if (!customer) {
            set.status = 404;
            return { success: false, error: { code: 'CUSTOMER_NOT_FOUND' } };
        }

        const [visit] = await db
            .insert(schema.salesVisits)
            .values({
                tenantId: user.tenantId,
                customerId: body.customerId,
                salesRepId: user.role === 'sales_rep' ? user.id : (body.salesRepId || user.id),
                visitType: body.visitType || 'scheduled',
                status: 'planned',
                plannedDate: body.plannedDate,
                plannedTime: body.plannedTime,
                notes: body.notes,
            })
            .returning();

        return { success: true, data: visit };
    }, {
        body: t.Object({
            customerId: t.String(),
            salesRepId: t.Optional(t.String()),
            visitType: t.Optional(t.String()),
            plannedDate: t.String(),
            plannedTime: t.Optional(t.String()),
            notes: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // QUICK VISIT (Create and complete in one step)
    // ----------------------------------------------------------------

    .post('/quick', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        try {
            console.log('Quick visit request:', JSON.stringify(body, null, 2));

            // Verify customer exists and belongs to tenant
            const [customer] = await db
                .select({ id: schema.customers.id })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.id, body.customerId),
                    eq(schema.customers.tenantId, user.tenantId)
                ));

            if (!customer) {
                set.status = 404;
                return { success: false, error: { code: 'CUSTOMER_NOT_FOUND' } };
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
            if (body.latitude) {
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

            console.log('Insert values:', JSON.stringify(insertValues, null, 2));

            // Create visit with completed status
            const [visit] = await db
                .insert(schema.salesVisits)
                .values(insertValues)
                .returning();

            console.log('Visit created:', visit.id);
            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Quick visit error:', error);
            set.status = 500;
            return { success: false, error: { code: 'SERVER_ERROR', message: error?.message } };
        }
    }, {
        body: t.Object({
            customerId: t.String(),
            outcome: t.String(),
            plannedDate: t.Optional(t.String()),
            plannedTime: t.Optional(t.String()),
            photo: t.Optional(t.String()),
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
            outcomeNotes: t.Optional(t.String()),
            noOrderReason: t.Optional(t.String()),
            followUpReason: t.Optional(t.String()),
            followUpDate: t.Optional(t.String()),
            followUpTime: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // START VISIT
    // ----------------------------------------------------------------

    .patch('/:id/start', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Get visit
        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, params.id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        // Sales rep can only start their own visits
        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }

        if (visit.status !== 'planned') {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_STATUS', message: 'Visit must be planned to start' } };
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
            .where(eq(schema.salesVisits.id, params.id))
            .returning();

        return { success: true, data: updated };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
        })
    })

    // ----------------------------------------------------------------
    // COMPLETE VISIT
    // ----------------------------------------------------------------

    .patch('/:id/complete', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Get visit
        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, params.id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }

        if (visit.status !== 'in_progress') {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_STATUS', message: 'Visit must be in progress to complete' } };
        }

        const [updated] = await db
            .update(schema.salesVisits)
            .set({
                status: 'completed',
                completedAt: new Date(),
                outcome: body.outcome,
                outcomeNotes: body.outcomeNotes,
                photos: body.photos,
                orderId: body.orderId,
                endLatitude: body.latitude?.toString(),
                endLongitude: body.longitude?.toString(),
                updatedAt: new Date(),
            })
            .where(eq(schema.salesVisits.id, params.id))
            .returning();

        return { success: true, data: updated };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            outcome: t.String(),
            outcomeNotes: t.Optional(t.String()),
            photos: t.Optional(t.Array(t.String())),
            orderId: t.Optional(t.String()),
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
        })
    })

    // ----------------------------------------------------------------
    // CANCEL VISIT
    // ----------------------------------------------------------------

    .patch('/:id/cancel', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, params.id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }

        if (visit.status === 'completed') {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_STATUS', message: 'Cannot cancel completed visit' } };
        }

        const [updated] = await db
            .update(schema.salesVisits)
            .set({
                status: 'cancelled',
                outcomeNotes: body.reason,
                updatedAt: new Date(),
            })
            .where(eq(schema.salesVisits.id, params.id))
            .returning();

        return { success: true, data: updated };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            reason: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // UPDATE/RESCHEDULE VISIT
    // ----------------------------------------------------------------

    .patch('/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [visit] = await db
            .select()
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.id, params.id),
                eq(schema.salesVisits.tenantId, user.tenantId)
            ));

        if (!visit) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        if (user.role === 'sales_rep' && visit.salesRepId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
        }

        // Can only reschedule planned visits
        if (visit.status !== 'planned') {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_STATUS', message: 'Can only reschedule planned visits' } };
        }

        const updateData: any = { updatedAt: new Date() };
        if (body.plannedDate) updateData.plannedDate = body.plannedDate;
        if (body.plannedTime !== undefined) updateData.plannedTime = body.plannedTime;
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.visitType) updateData.visitType = body.visitType;

        const [updated] = await db
            .update(schema.salesVisits)
            .set(updateData)
            .where(eq(schema.salesVisits.id, params.id))
            .returning();

        return { success: true, data: updated };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            plannedDate: t.Optional(t.String()),
            plannedTime: t.Optional(t.String()),
            notes: t.Optional(t.String()),
            visitType: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // MARK MISSED VISITS (for scheduled job or manual trigger)
    // ----------------------------------------------------------------

    .post('/mark-missed', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only admins/managers can trigger this
        if (!['admin', 'tenant_admin', 'manager'].includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN' } };
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
