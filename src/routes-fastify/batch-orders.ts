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
import { eq, and, inArray, sql } from 'drizzle-orm';
import { ordersService } from '../services/orders.service';

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

// ============================================================================
// VALID STATUS TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ['confirmed', 'approved', 'cancelled'],
    confirmed: ['approved', 'picking', 'cancelled'],
    approved: ['picking', 'cancelled'],
    picking: ['picked'],
    picked: ['loaded'],
    loaded: ['delivering'],
    delivering: ['delivered', 'partial', 'returned'],
    delivered: [],
    partial: ['delivered', 'returned'],
    returned: [],
    cancelled: [],
};

// Statuses that can be cancelled
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

// Statuses that allow driver assignment
const DRIVER_ASSIGNABLE_STATUSES = ['pending', 'confirmed', 'approved', 'picked', 'loaded'];

// ============================================================================
// ROUTES
// ============================================================================

export const batchOrderRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // BATCH STATUS CHANGE
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchStatusChangeBody }>('/status', {
        preHandler: [fastify.authenticate],
        schema: {
            body: BatchStatusChangeSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, newStatus, notes, notifyCustomers } = request.body;

        // Only tenant_admin and super_admin can batch change status
        const allowedRoles = ['tenant_admin', 'super_admin'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only administrators can batch update order status'
                }
            });
        }

        const results: BatchOperationResult[] = [];
        let succeeded = 0;
        let failed = 0;

        // Process in a transaction
        await db.transaction(async (tx) => {
            // Fetch all orders at once
            const orders = await tx
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    status: schema.orders.status,
                    tenantId: schema.orders.tenantId,
                    customerId: schema.orders.customerId,
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
                const validTransitions = VALID_TRANSITIONS[currentStatus] || [];

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

                // Perform the update
                try {
                    await tx
                        .update(schema.orders)
                        .set({
                            status: newStatus as any,
                            deliveredAt: newStatus === 'delivered' ? new Date() : undefined,
                            cancelledAt: newStatus === 'cancelled' ? new Date() : undefined,
                            cancelledBy: newStatus === 'cancelled' ? user.id : undefined,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.orders.id, orderId));

                    // Log status change
                    await tx.insert(schema.orderStatusHistory).values({
                        orderId: orderId,
                        fromStatus: currentStatus,
                        toStatus: newStatus,
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

        return response;
    });

    // ----------------------------------------------------------------
    // BATCH ASSIGN DRIVER
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchAssignDriverBody }>('/assign-driver', {
        preHandler: [fastify.authenticate],
        schema: {
            body: BatchAssignDriverSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, driverId } = request.body;

        // Only tenant_admin and super_admin can batch assign drivers
        const allowedRoles = ['tenant_admin', 'super_admin'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only administrators can batch assign drivers'
                }
            });
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
            return reply.code(404).send({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Driver not found'
                }
            });
        }

        if (!driver.isActive) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'INVALID_DRIVER',
                    message: 'Driver is not active'
                }
            });
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
                if (!DRIVER_ASSIGNABLE_STATUSES.includes(currentStatus)) {
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

        return response;
    });

    // ----------------------------------------------------------------
    // BATCH ASSIGN SALES REP
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchAssignSalesRepBody }>('/assign-sales-rep', {
        preHandler: [fastify.authenticate],
        schema: {
            body: BatchAssignSalesRepSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, salesRepId } = request.body;

        // Only tenant_admin and super_admin can batch assign sales reps
        const allowedRoles = ['tenant_admin', 'super_admin'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only administrators can batch assign sales reps'
                }
            });
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
            return reply.code(404).send({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Sales rep not found'
                }
            });
        }

        if (!salesRep.isActive) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'INVALID_SALES_REP',
                    message: 'Sales rep is not active'
                }
            });
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

        return response;
    });

    // ----------------------------------------------------------------
    // BATCH CANCEL
    // ----------------------------------------------------------------
    fastify.post<{ Body: BatchCancelBody }>('/cancel', {
        preHandler: [fastify.authenticate],
        schema: {
            body: BatchCancelSchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { orderIds, reason, notifyCustomers } = request.body;

        // Only tenant_admin and super_admin can batch cancel
        const allowedRoles = ['tenant_admin', 'super_admin'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only administrators can batch cancel orders'
                }
            });
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
                if (!CANCELLABLE_STATUSES.includes(currentStatus)) {
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
                    // Get order items for stock release
                    const items = await tx
                        .select({
                            productId: schema.orderItems.productId,
                            qtyOrdered: schema.orderItems.qtyOrdered,
                        })
                        .from(schema.orderItems)
                        .where(eq(schema.orderItems.orderId, orderId));

                    // Release reserved stock
                    for (const item of items) {
                        await tx
                            .update(schema.products)
                            .set({
                                reservedQuantity: sql`GREATEST(0, ${schema.products.reservedQuantity} - ${item.qtyOrdered})`,
                            })
                            .where(eq(schema.products.id, item.productId));
                    }

                    // Reduce customer debt
                    await tx
                        .update(schema.customers)
                        .set({
                            debtBalance: sql`GREATEST(0, ${schema.customers.debtBalance} - ${order.totalAmount})`,
                            updatedAt: new Date(),
                        })
                        .where(eq(schema.customers.id, order.customerId));

                    // Update order status
                    await tx
                        .update(schema.orders)
                        .set({
                            status: 'cancelled',
                            cancelledAt: new Date(),
                            cancelledBy: user.id,
                            cancelReason: reason || 'Batch cancellation',
                            updatedAt: new Date()
                        })
                        .where(eq(schema.orders.id, orderId));

                    // Log status change
                    await tx.insert(schema.orderStatusHistory).values({
                        orderId: orderId,
                        fromStatus: currentStatus,
                        toStatus: 'cancelled',
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

        return response;
    });

    // ----------------------------------------------------------------
    // GET BATCH OPERATION PREVIEW
    // ----------------------------------------------------------------
    fastify.post<{ Body: { orderIds: string[]; operation: string; targetStatus?: string } }>('/preview', {
        preHandler: [fastify.authenticate],
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

        // Only admins can preview batch operations
        const allowedRoles = ['tenant_admin', 'super_admin'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Only administrators can perform batch operations' }
            });
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
                const validTransitions = VALID_TRANSITIONS[currentStatus] || [];
                if (!validTransitions.includes(targetStatus)) {
                    canProcess = false;
                    reason = `Cannot change from '${currentStatus}' to '${targetStatus}'`;
                }
            } else if (operation === 'cancel') {
                if (!CANCELLABLE_STATUSES.includes(currentStatus)) {
                    canProcess = false;
                    reason = `Cannot cancel order with status '${currentStatus}'`;
                }
            } else if (operation === 'assign_driver') {
                if (!DRIVER_ASSIGNABLE_STATUSES.includes(currentStatus)) {
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

