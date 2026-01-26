import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { VisitsService } from '../services/visits.service';

// Create service instance
const visitsService = new VisitsService();

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

        try {
            const { data: visits, meta } = await visitsService.listVisits(
                user.tenantId,
                user.id,
                user.role,
                { page, limit, startDate, endDate, status, customerId }
            );

            return {
                success: true,
                data: visits,
                meta,
            };
        } catch (error: any) {
            console.error('List visits error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
    });

    // ----------------------------------------------------------------
    // GET TODAY'S VISITS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: TodayVisitsQuery }>('/today', {
        preHandler: [fastify.authenticate],
        schema: { querystring: TodayVisitsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const date = request.query.date;

        try {
            const { data: visits, stats } = await visitsService.getTodayVisits(
                user.tenantId,
                user.id,
                user.role,
                date
            );

            return {
                success: true,
                data: visits,
                stats,
            };
        } catch (error: any) {
            console.error('Get today\'s visits error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
    });

    // ----------------------------------------------------------------
    // GET FOLLOW-UP SUMMARY (for dashboard)
    // ----------------------------------------------------------------
    fastify.get('/followups/summary', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        try {
            const summary = await visitsService.getFollowUpSummary(user.tenantId, user.id, user.role);

            return {
                success: true,
                data: summary
            };
        } catch (error: any) {
            console.error('Get follow-up summary error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const visit = await visitsService.getVisitById(id, user.tenantId, user.id, user.role);

            if (!visit) {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            }

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Get visit by ID error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const visit = await visitsService.createVisit(body, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Create visit error:', error);
            if (error.message === 'Customer not found') {
                return reply.code(404).send({ success: false, error: { code: 'CUSTOMER_NOT_FOUND' } });
            } else if (error.message === 'Planned date cannot be in the past') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_DATE', 
                        message: error.message
                    } 
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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
            const visit = await visitsService.createQuickVisit(body, user.tenantId, user.id);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Quick visit error:', error);
            if (error.message === 'Customer not found') {
                return reply.code(404).send({ success: false, error: { code: 'CUSTOMER_NOT_FOUND' } });
            } else if (error.message === 'Planned date cannot be in the past') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_DATE', 
                        message: error.message
                    } 
                });
            }
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

        try {
            const visit = await visitsService.startVisit(id, body, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Start visit error:', error);
            if (error.message === 'Visit not found') {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            } else if (error.message === 'Forbidden') {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            } else if (error.name === 'InvalidStatusTransitionError') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_STATUS_TRANSITION', 
                        message: error.message
                    } 
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const visit = await visitsService.completeVisit(id, body, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Complete visit error:', error);
            if (error.message === 'Visit not found') {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            } else if (error.message === 'Forbidden') {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            } else if (error.name === 'InvalidStatusTransitionError') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_STATUS_TRANSITION', 
                        message: error.message
                    } 
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const visit = await visitsService.cancelVisit(id, body, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Cancel visit error:', error);
            if (error.message === 'Visit not found') {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            } else if (error.message === 'Forbidden') {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            } else if (error.name === 'InvalidStatusTransitionError') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_STATUS_TRANSITION', 
                        message: error.message
                    } 
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const visit = await visitsService.updateVisit(id, body, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Update visit error:', error);
            if (error.message === 'Visit not found') {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            } else if (error.message === 'Forbidden') {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            } else if (error.name === 'InvalidStatusTransitionError') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_STATUS_TRANSITION', 
                        message: error.message
                    } 
                });
            } else if (error.message === 'Planned date cannot be in the past') {
                return reply.code(400).send({ 
                    success: false, 
                    error: { 
                        code: 'INVALID_DATE', 
                        message: error.message
                    } 
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
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

        try {
            const result = await visitsService.markMissedVisits(user.tenantId);

            return { success: true, data: result };
        } catch (error: any) {
            console.error('Mark missed visits error:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
    });
};