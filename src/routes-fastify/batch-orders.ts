/**
 * Batch Order Operations API
 * 
 * Provides endpoints for performing bulk actions on multiple orders:
 * - Batch status change
 * - Batch driver assignment
 * - Batch sales rep assignment
 * - Batch cancellation
 */

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, inArray } from 'drizzle-orm';
import { VALID_ORDER_TRANSITIONS, CANCELLABLE_ORDER_STATUSES, DRIVER_ASSIGNABLE_STATUSES } from '../lib/constants';
import { transitionOrderStatus, handleOrderStatusTransitionEffects } from '../services/order-workflow.service';
import { canAssignBatchDriver, canManageBatchOrders } from '../lib/order-policy';
import { sendApiError } from '../lib/api-errors';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../lib/idempotency';

// ============================================================================
// SCHEMAS
// ============================================================================

const BatchStatusChangeSchema = Type.Object({
    orderIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    newStatus: Type.String(),
    notes: Type.Optional(Type.String()),
    notifyCustomers: Type.Optional(Type.Boolean({ default: false })),
});

const BatchAssignDriverSchema = Type.Object({
    orderIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    driverId: Type.String(),
});

const BatchAssignSalesRepSchema = Type.Object({
    orderIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    salesRepId: Type.String(),
});

const BatchCancelSchema = Type.Object({
    orderIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    reason: Type.Optional(Type.String()),
    notifyCustomers: Type.Optional(Type.Boolean({ default: false })),
});

type BatchStatusChangeBody = Static<typeof BatchStatusChangeSchema>;
type BatchAssignDriverBody = Static<typeof BatchAssignDriverSchema>;
type BatchAssignSalesRepBody = Static<typeof BatchAssignSalesRepSchema>;
type BatchCancelBody = Static<typeof BatchCancelSchema>;

// ============================================================================
// TYPES
// ============================================================================

interface BatchOperationResult {
    orderId: string;
    orderNumber: string;
    success: boolean;
    error?: string;
    previousStatus?: string;
}

interface BatchResponse {
    success: boolean;
    data: {
        processed: number;
        succeeded: number;
        failed: number;
        results: BatchOperationResult[];
    };
}

// Status transitions, cancellable statuses, and driver-assignable statuses
// are imported from '../lib/constants' (single source of truth)

// ============================================================================
// ROUTES
// ============================================================================

export const batchOrderRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // BATCH STATUS CHANGE
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchStatusChangeBody }>('/status', {
        preHandler: [fastify.authenticate, fastify.requirePermission('orders.batch_manage')],
        schema: {
            body: BatchStatusChangeSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, newStatus, notes, notifyCustomers } = request.body;
        const idempotency = await beginIdempotentRequest(request, 'batch-orders.status');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        const policy = canManageBatchOrders(user);
        if (!policy.allowed) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', policy.message || 'Access denied');
        }

        const results: BatchOperationResult[] = [];
        let succeeded = 0;
        let failed = 0;

        // Process in a transaction
        await db.transaction(async (tx) => {
            // Fetch all orders at once (include financial fields for side effects)
            const orders = await tx
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    status: schema.orders.status,
                    tenantId: schema.orders.tenantId,
                    customerId: schema.orders.customerId,
                    totalAmount: schema.orders.totalAmount,
                    paidAmount: schema.orders.paidAmount,
                    paymentStatus: schema.orders.paymentStatus,
                })
                .from(schema.orders)
                .where(and(
                    inArray(schema.orders.id, orderIds),
                    eq(schema.orders.tenantId, user.tenantId)
                ));

            // Create a map for quick lookup
            const orderMap = new Map(orders.map(o => [o.id, o]));

            // Process each order
            for (const orderId of orderIds) {
                const order = orderMap.get(orderId);

                // Order not found or wrong tenant
                if (!order) {
                    results.push({
                        orderId,
                        orderNumber: 'N/A',
                        success: false,
                        error: 'Order not found'
                    });
                    failed++;
                    continue;
                }

                // Check valid transition
                const currentStatus = order.status || 'pending';
                const validTransitions = VALID_ORDER_TRANSITIONS[currentStatus] || [];

                if (!validTransitions.includes(newStatus)) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: `Cannot change from '${currentStatus}' to '${newStatus}'`,
                        previousStatus: currentStatus
                    });
                    failed++;
                    continue;
                }

                try {
                    await transitionOrderStatus({
                        tx,
                        tenantId: user.tenantId,
                        orderId,
                        newStatus,
                        changedBy: user.id,
                        notes: notes || `Batch status change to ${newStatus}`,
                    });

                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: true,
                        previousStatus: currentStatus
                    });
                    succeeded++;
                } catch (error: any) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: error.message || 'Failed to update order',
                        previousStatus: currentStatus
                    });
                    failed++;
                }
            }
        });

        for (const result of results) {
            if (!result.success) continue;
            await handleOrderStatusTransitionEffects({
                tenantId: user.tenantId,
                orderId: result.orderId,
                newStatus,
                notes: notes || `Batch status change to ${newStatus}`,
                actorName: user.name,
            });
        }

        // Send notifications if requested (after transaction commits)
        if (notifyCustomers && succeeded > 0) {
            try {
                // Notify customers in background - don't await
                notifyBatchStatusChange(user.tenantId, results.filter(r => r.success), newStatus);
            } catch (e) {
                console.error('Failed to send batch notifications:', e);
            }
        }

        const response: BatchResponse = {
            success: true,
            data: {
                processed: orderIds.length,
                succeeded,
                failed,
                results
            }
        };

        await finishIdempotentRequest(idempotency, 200, response);
        return response;
    });

    // ----------------------------------------------------------------
    // BATCH ASSIGN DRIVER
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchAssignDriverBody }>('/assign-driver', {
        preHandler: [fastify.authenticate, fastify.requirePermission('orders.assign_driver')],
        schema: {
            body: BatchAssignDriverSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, driverId } = request.body;
        const idempotency = await beginIdempotentRequest(request, 'batch-orders.assign-driver');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        const policy = canAssignBatchDriver(user);
        if (!policy.allowed) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', policy.message || 'Access denied');
        }

        // Validate driver exists and is active
        const [driver] = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                role: schema.users.role,
                isActive: schema.users.isActive,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.id, driverId),
                eq(schema.users.tenantId, user.tenantId),
                eq(schema.users.role, 'driver')
            ))
            .limit(1);

        if (!driver) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 404, 'NOT_FOUND', 'Driver not found');
        }

        if (!driver.isActive) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_DRIVER', 'Driver is not active');
        }

        const results: BatchOperationResult[] = [];
        let succeeded = 0;
        let failed = 0;

        await db.transaction(async (tx) => {
            const orders = await tx
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    status: schema.orders.status,
                    tenantId: schema.orders.tenantId,
                    driverId: schema.orders.driverId,
                })
                .from(schema.orders)
                .where(and(
                    inArray(schema.orders.id, orderIds),
                    eq(schema.orders.tenantId, user.tenantId)
                ));

            const orderMap = new Map(orders.map(o => [o.id, o]));

            for (const orderId of orderIds) {
                const order = orderMap.get(orderId);

                if (!order) {
                    results.push({
                        orderId,
                        orderNumber: 'N/A',
                        success: false,
                        error: 'Order not found'
                    });
                    failed++;
                    continue;
                }

                // Check if order is in a status that allows driver assignment
                const currentStatus = order.status || 'pending';
                if (!(DRIVER_ASSIGNABLE_STATUSES as readonly string[]).includes(currentStatus)) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: `Cannot assign driver to order with status '${currentStatus}'`,
                        previousStatus: currentStatus
                    });
                    failed++;
                    continue;
                }

                try {
                    await tx
                        .update(schema.orders)
                        .set({
                            driverId: driverId,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.orders.id, orderId));

                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: true,
                        previousStatus: currentStatus
                    });
                    succeeded++;
                } catch (error: any) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: error.message || 'Failed to assign driver',
                        previousStatus: currentStatus
                    });
                    failed++;
                }
            }
        });

        const response: BatchResponse = {
            success: true,
            data: {
                processed: orderIds.length,
                succeeded,
                failed,
                results
            }
        };

        await finishIdempotentRequest(idempotency, 200, response);
        return response;
    });

    // ----------------------------------------------------------------
    // BATCH ASSIGN SALES REP
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchAssignSalesRepBody }>('/assign-sales-rep', {
        preHandler: [fastify.authenticate, fastify.requirePermission('orders.batch_manage')],
        schema: {
            body: BatchAssignSalesRepSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, salesRepId } = request.body;
        const idempotency = await beginIdempotentRequest(request, 'batch-orders.assign-sales-rep');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        const policy = canManageBatchOrders(user);
        if (!policy.allowed) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', policy.message || 'Access denied');
        }

        // Validate sales rep exists
        const [salesRep] = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                role: schema.users.role,
                isActive: schema.users.isActive,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.id, salesRepId),
                eq(schema.users.tenantId, user.tenantId),
                eq(schema.users.role, 'sales_rep')
            ))
            .limit(1);

        if (!salesRep) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 404, 'NOT_FOUND', 'Sales rep not found');
        }

        if (!salesRep.isActive) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_SALES_REP', 'Sales rep is not active');
        }

        const results: BatchOperationResult[] = [];
        let succeeded = 0;
        let failed = 0;

        // Terminal statuses - can't reassign
        const terminalStatuses = ['delivered', 'cancelled', 'returned'];

        await db.transaction(async (tx) => {
            const orders = await tx
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    status: schema.orders.status,
                    tenantId: schema.orders.tenantId,
                })
                .from(schema.orders)
                .where(and(
                    inArray(schema.orders.id, orderIds),
                    eq(schema.orders.tenantId, user.tenantId)
                ));

            const orderMap = new Map(orders.map(o => [o.id, o]));

            for (const orderId of orderIds) {
                const order = orderMap.get(orderId);

                if (!order) {
                    results.push({
                        orderId,
                        orderNumber: 'N/A',
                        success: false,
                        error: 'Order not found'
                    });
                    failed++;
                    continue;
                }

                const currentStatus = order.status || 'pending';
                if (terminalStatuses.includes(currentStatus)) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: `Cannot reassign sales rep for order with status '${currentStatus}'`,
                        previousStatus: currentStatus
                    });
                    failed++;
                    continue;
                }

                try {
                    await tx
                        .update(schema.orders)
                        .set({
                            salesRepId: salesRepId,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.orders.id, orderId));

                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: true,
                        previousStatus: currentStatus
                    });
                    succeeded++;
                } catch (error: any) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: error.message || 'Failed to assign sales rep',
                        previousStatus: currentStatus
                    });
                    failed++;
                }
            }
        });

        const response: BatchResponse = {
            success: true,
            data: {
                processed: orderIds.length,
                succeeded,
                failed,
                results
            }
        };

        await finishIdempotentRequest(idempotency, 200, response);
        return response;
    });

    // ----------------------------------------------------------------
    // BATCH CANCEL
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchCancelBody }>('/cancel', {
        preHandler: [fastify.authenticate, fastify.requirePermission('orders.batch_manage')],
        schema: {
            body: BatchCancelSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, reason, notifyCustomers } = request.body;
        const idempotency = await beginIdempotentRequest(request, 'batch-orders.cancel');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        const policy = canManageBatchOrders(user);
        if (!policy.allowed) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', policy.message || 'Access denied');
        }

        const results: BatchOperationResult[] = [];
        let succeeded = 0;
        let failed = 0;

        await db.transaction(async (tx) => {
            const orders = await tx
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    status: schema.orders.status,
                    tenantId: schema.orders.tenantId,
                    customerId: schema.orders.customerId,
                    totalAmount: schema.orders.totalAmount,
                    paidAmount: schema.orders.paidAmount,
                })
                .from(schema.orders)
                .where(and(
                    inArray(schema.orders.id, orderIds),
                    eq(schema.orders.tenantId, user.tenantId)
                ));

            const orderMap = new Map(orders.map(o => [o.id, o]));

            for (const orderId of orderIds) {
                const order = orderMap.get(orderId);

                if (!order) {
                    results.push({
                        orderId,
                        orderNumber: 'N/A',
                        success: false,
                        error: 'Order not found'
                    });
                    failed++;
                    continue;
                }

                const currentStatus = order.status || 'pending';
                if (!(CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(currentStatus)) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: `Cannot cancel order with status '${currentStatus}'`,
                        previousStatus: currentStatus
                    });
                    failed++;
                    continue;
                }

                try {
                    await transitionOrderStatus({
                        tx,
                        tenantId: user.tenantId,
                        orderId,
                        newStatus: 'cancelled',
                        changedBy: user.id,
                        notes: reason || 'Batch cancellation',
                    });

                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: true,
                        previousStatus: currentStatus
                    });
                    succeeded++;
                } catch (error: any) {
                    results.push({
                        orderId,
                        orderNumber: order.orderNumber,
                        success: false,
                        error: error.message || 'Failed to cancel order',
                        previousStatus: currentStatus
                    });
                    failed++;
                }
            }
        });

        // Send notifications if requested
        if (notifyCustomers && succeeded > 0) {
            try {
                notifyBatchCancellation(user.tenantId, results.filter(r => r.success), reason);
            } catch (e) {
                console.error('Failed to send cancellation notifications:', e);
            }
        }

        const response: BatchResponse = {
            success: true,
            data: {
                processed: orderIds.length,
                succeeded,
                failed,
                results
            }
        };

        await finishIdempotentRequest(idempotency, 200, response);
        return response;
    });

    // ----------------------------------------------------------------
    // GET BATCH OPERATION PREVIEW
    // ----------------------------------------------------------------
    fastify.post<{ Body: { orderIds: string[]; operation: string; targetStatus?: string } }>('/preview', {
        preHandler: [fastify.authenticate, fastify.requirePermission('orders.batch_manage')],
        schema: {
            body: Type.Object({
                orderIds: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
                operation: Type.String(),
                targetStatus: Type.Optional(Type.String()),
            })
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, operation, targetStatus } = request.body;
        const policy = canManageBatchOrders(user);
        if (!policy.allowed) {
            return sendApiError(reply, 403, 'FORBIDDEN', policy.message || 'Access denied');
        }

        // Fetch orders
        const orders = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                status: schema.orders.status,
                customerName: schema.customers.name,
                totalAmount: schema.orders.totalAmount,
            })
            .from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(
                inArray(schema.orders.id, orderIds),
                eq(schema.orders.tenantId, user.tenantId)
            ));

        const preview = orders.map(order => {
            const currentStatus = order.status || 'pending';
            let canProcess = true;
            let reason = '';

            if (operation === 'status_change' && targetStatus) {
                const validTransitions = VALID_ORDER_TRANSITIONS[currentStatus] || [];
                if (!validTransitions.includes(targetStatus)) {
                    canProcess = false;
                    reason = `Cannot change from '${currentStatus}' to '${targetStatus}'`;
                }
            } else if (operation === 'cancel') {
                if (!(CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(currentStatus)) {
                    canProcess = false;
                    reason = `Cannot cancel order with status '${currentStatus}'`;
                }
            } else if (operation === 'assign_driver') {
                if (!(DRIVER_ASSIGNABLE_STATUSES as readonly string[]).includes(currentStatus)) {
                    canProcess = false;
                    reason = `Cannot assign driver to order with status '${currentStatus}'`;
                }
            }

            return {
                orderId: order.id,
                orderNumber: order.orderNumber,
                currentStatus,
                customerName: order.customerName,
                totalAmount: order.totalAmount,
                canProcess,
                reason
            };
        });

        const canProcessCount = preview.filter(p => p.canProcess).length;
        const cannotProcessCount = preview.filter(p => !p.canProcess).length;

        return {
            success: true,
            data: {
                total: orders.length,
                canProcess: canProcessCount,
                cannotProcess: cannotProcessCount,
                preview
            }
        };
    });
};

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

async function notifyBatchStatusChange(
    tenantId: string,
    successfulResults: BatchOperationResult[],
    newStatus: string
) {
    try {
        const {
            canSendTenantNotification,
            getTenantAdminsWithTelegram,
            sendTelegramMessage
        } = await import('../lib/telegram');

        const { canSend } = await canSendTenantNotification(tenantId, 'notifyOrderApproved');
        if (!canSend) return;

        const admins = await getTenantAdminsWithTelegram(tenantId);
        const orderNumbers = successfulResults.map(r => r.orderNumber).join(', ');
        const message = `📦 Batch Status Update\n\n${successfulResults.length} orders changed to '${newStatus}':\n${orderNumbers}`;

        for (const admin of admins) {
            // Send a simple text notification for batch operations
            await sendTelegramMessage({
                chatId: admin.telegramChatId,
                text: message,
                parseMode: 'HTML'
            });
        }
    } catch (e) {
        console.error('Batch notification error:', e);
    }
}

async function notifyBatchCancellation(
    tenantId: string,
    successfulResults: BatchOperationResult[],
    reason?: string
) {
    try {
        const {
            canSendTenantNotification,
            getTenantAdminsWithTelegram,
            sendTelegramMessage
        } = await import('../lib/telegram');

        const { canSend } = await canSendTenantNotification(tenantId, 'notifyOrderCancelled');
        if (!canSend) return;

        const admins = await getTenantAdminsWithTelegram(tenantId);
        const orderNumbers = successfulResults.map(r => r.orderNumber).join(', ');
        const message = `❌ Batch Cancellation\n\n${successfulResults.length} orders cancelled:\n${orderNumbers}${reason ? `\n\nReason: ${reason}` : ''}`;

        for (const admin of admins) {
            await sendTelegramMessage({
                chatId: admin.telegramChatId,
                text: message,
                parseMode: 'HTML'
            });
        }
    } catch (e) {
        console.error('Batch cancellation notification error:', e);
    }
}

export default batchOrderRoutes;

