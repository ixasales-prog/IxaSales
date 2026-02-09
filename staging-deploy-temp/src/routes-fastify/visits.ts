import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { VisitsService, UnifiedCreateVisitInput } from '../services/visits.service';

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

// Unified create visit schema - supports both scheduled and quick modes
const CreateVisitBodySchema = Type.Object({
    // Common fields
    customerId: Type.String(),
    plannedDate: Type.Optional(Type.String()),
    plannedTime: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    
    // Mode determines the workflow: 'scheduled' or 'quick'
    mode: Type.String({ default: 'scheduled' }),
    
    // Scheduled mode specific fields
    salesRepId: Type.Optional(Type.String()),
    visitType: Type.Optional(Type.String()),
    
    // Quick mode specific fields
    outcome: Type.Optional(Type.String()),
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
    noOrderReason: Type.Optional(Type.String()),
    followUpReason: Type.Optional(Type.String()),
    followUpDate: Type.Optional(Type.String()),
    followUpTime: Type.Optional(Type.String()),
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
    // CREATE QUICK VISIT (Legacy endpoint - redirects to unified method)
    // ----------------------------------------------------------------
    fastify.post<{ Body: CreateVisitBody }>('/quick', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        try {
            // Force mode to 'quick' for this endpoint
            if (!body.outcome) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELD',
                        message: 'outcome is required for quick visits'
                    }
                });
            }

            const input: UnifiedCreateVisitInput = {
                customerId: body.customerId,
                plannedDate: body.plannedDate,
                plannedTime: body.plannedTime,
                notes: body.notes,
                mode: 'quick',
                salesRepId: body.salesRepId,
                visitType: body.visitType,
                outcome: body.outcome,
                photo: body.photo,
                latitude: body.latitude,
                longitude: body.longitude,
                outcomeNotes: body.outcomeNotes,
                noOrderReason: body.noOrderReason,
                followUpReason: body.followUpReason,
                followUpDate: body.followUpDate,
                followUpTime: body.followUpTime,
            };

            const visit = await visitsService.createVisitUnified(input, user.tenantId, user.id, user.role);

            return { success: true, data: visit };
        } catch (error: any) {
            console.error('Create quick visit error:', error);
            if (error.message === 'Customer not found') {
                return reply.code(404).send({ success: false, error: { code: 'CUSTOMER_NOT_FOUND' } });
            } else if (error.message?.includes('Invalid outcome')) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_OUTCOME',
                        message: error.message
                    }
                });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error?.message } });
        }
    });

    // ----------------------------------------------------------------
    // CREATE VISIT (Unified - supports both scheduled and quick modes)
    // ----------------------------------------------------------------
    fastify.post<{ Body: CreateVisitBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateVisitBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        try {
            // Validate mode
            const mode = body.mode || 'scheduled';
            if (mode !== 'scheduled' && mode !== 'quick') {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_MODE',
                        message: 'Mode must be either "scheduled" or "quick"'
                    }
                });
            }

            // Validate required fields based on mode
            if (mode === 'scheduled' && !body.plannedDate) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELD',
                        message: 'plannedDate is required for scheduled visits'
                    }
                });
            }

            if (mode === 'quick' && !body.outcome) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELD',
                        message: 'outcome is required for quick visits'
                    }
                });
            }

            const input: UnifiedCreateVisitInput = {
                customerId: body.customerId,
                plannedDate: body.plannedDate,
                plannedTime: body.plannedTime,
                notes: body.notes,
                mode: mode as 'scheduled' | 'quick',
                salesRepId: body.salesRepId,
                visitType: body.visitType,
                outcome: body.outcome,
                photo: body.photo,
                latitude: body.latitude,
                longitude: body.longitude,
                outcomeNotes: body.outcomeNotes,
                noOrderReason: body.noOrderReason,
                followUpReason: body.followUpReason,
                followUpDate: body.followUpDate,
                followUpTime: body.followUpTime,
            };

            const visit = await visitsService.createVisitUnified(input, user.tenantId, user.id, user.role);

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
            } else if (error.message?.includes('Invalid outcome')) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_OUTCOME',
                        message: error.message
                    }
                });
            } else if (error.message?.includes('Invalid visit type')) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_VISIT_TYPE',
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
            } else if (error.message?.includes('Invalid outcome')) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_OUTCOME',
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
            } else if (error.message === 'orderId is required when outcome is order_placed') {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELD',
                        message: error.message
                    }
                });
            } else if (error.message === 'followUpDate is required when outcome is follow_up') {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'MISSING_REQUIRED_FIELD',
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
            } else if (error.message?.includes('Invalid visit type')) {
                return reply.code(400).send({
                    success: false,
                    error: {
                        code: 'INVALID_VISIT_TYPE',
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

        // Only admins/supervisors can trigger this
        if (!['admin', 'tenant_admin', 'supervisor'].includes(user.role)) {
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
