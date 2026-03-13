import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { updateOrderPaymentState } from '../services/order-financials.service';
import { transitionOrderStatus } from '../services/order-workflow.service';
import { sendApiError } from '../lib/api-errors';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../lib/idempotency';

const ListReturnsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
});

const ReturnIdParamsSchema = Type.Object({ id: Type.String() });

const CreateReturnBodySchema = Type.Object({
    orderId: Type.String(),
    orderItemId: Type.String(),
    productId: Type.String(),
    qtyReturned: Type.Number({ minimum: 1 }),
    reason: Type.String(),
    reasonNotes: Type.Optional(Type.String()),
});

const ProcessReturnBodySchema = Type.Object({
    condition: Type.String(),
    restock: Type.Boolean(),
    refundAmount: Type.Optional(Type.Number({ minimum: 0 })),
});

type ListReturnsQuery = Static<typeof ListReturnsQuerySchema>;
type CreateReturnBody = Static<typeof CreateReturnBodySchema>;
type ProcessReturnBody = Static<typeof ProcessReturnBodySchema>;

export const returnRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Querystring: ListReturnsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListReturnsQuerySchema },
    }, async (request) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', orderId } = request.query;
        const page = parseInt(pageStr, 10);
        const limit = parseInt(limitStr, 10);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.returns.tenantId, user.tenantId)];
        if (orderId) conditions.push(eq(schema.returns.orderId, orderId));

        if (user.role === 'driver') {
            conditions.push(sql`${schema.returns.orderId} IN (SELECT id FROM ${schema.orders} WHERE ${schema.orders.tenantId} = ${user.tenantId} AND ${schema.orders.driverId} = ${user.id})`);
        } else if (user.role === 'sales_rep') {
            conditions.push(sql`${schema.returns.orderId} IN (SELECT id FROM ${schema.orders} WHERE ${schema.orders.tenantId} = ${user.tenantId} AND ${schema.orders.createdByUserId} = ${user.id})`);
        }

        const returns = await db.select({
            id: schema.returns.id,
            orderId: schema.returns.orderId,
            productName: schema.products.name,
            qtyReturned: schema.returns.qtyReturned,
            reason: schema.returns.reason,
            processedAt: schema.returns.processedAt,
            status: sql<string>`CASE WHEN ${schema.returns.processedAt} IS NOT NULL THEN 'processed' ELSE 'pending' END`,
        }).from(schema.returns)
            .leftJoin(schema.products, eq(schema.returns.productId, schema.products.id))
            .where(and(...conditions))
            .orderBy(desc(schema.returns.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.returns)
            .where(and(...conditions));

        return {
            success: true,
            data: returns,
            meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) },
        };
    });

    fastify.post<{ Body: CreateReturnBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateReturnBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const idempotency = await beginIdempotentRequest(request, 'returns.create');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver', 'sales_rep'];
        if (!allowedRoles.includes(user.role)) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        const body = request.body;

        const [orderItem] = await db.select({
            qtyDelivered: schema.orderItems.qtyDelivered,
            qtyReturned: schema.orderItems.qtyReturned,
        }).from(schema.orderItems)
            .where(eq(schema.orderItems.id, body.orderItemId))
            .limit(1);

        if (!orderItem) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 404, 'NOT_FOUND', 'Order item not found');
        }

        const qtyDelivered = orderItem.qtyDelivered || 0;
        const alreadyReturned = orderItem.qtyReturned || 0;
        const maxReturnable = qtyDelivered - alreadyReturned;

        if (body.qtyReturned > maxReturnable) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(
                reply,
                400,
                'OVER_RETURN',
                `Cannot return ${body.qtyReturned} items. Maximum returnable: ${maxReturnable} (delivered: ${qtyDelivered}, already returned: ${alreadyReturned})`
            );
        }

        try {
            const [returnRecord] = await db.insert(schema.returns).values({
                tenantId: user.tenantId,
                orderId: body.orderId,
                orderItemId: body.orderItemId,
                productId: body.productId,
                qtyReturned: body.qtyReturned,
                reason: body.reason as any,
                reasonNotes: body.reasonNotes,
            }).returning();

            const responseBody = { success: true, data: returnRecord };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 500, 'INTERNAL_ERROR', 'Failed to create return');
        }
    });

    fastify.patch<{ Params: Static<typeof ReturnIdParamsSchema>; Body: ProcessReturnBody }>('/:id/process', {
        preHandler: [fastify.authenticate],
        schema: { params: ReturnIdParamsSchema, body: ProcessReturnBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const idempotency = await beginIdempotentRequest(request, 'returns.process');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        const { id } = request.params;
        const body = request.body;

        try {
            const result = await db.transaction(async (tx) => {
                const [returnRecord] = await tx
                    .select()
                    .from(schema.returns)
                    .where(and(eq(schema.returns.id, id), eq(schema.returns.tenantId, user.tenantId)))
                    .limit(1);

                if (!returnRecord) throw new Error('Return not found');
                if (returnRecord.processedAt) throw new Error('Return already processed');

                const [updatedReturn] = await tx
                    .update(schema.returns)
                    .set({
                        condition: body.condition as any,
                        restock: body.restock,
                        refundAmount: body.refundAmount?.toString(),
                        processedBy: user.id,
                        processedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.returns.id, id))
                    .returning();

                await tx.update(schema.orderItems).set({
                    qtyReturned: sql`COALESCE(${schema.orderItems.qtyReturned}, 0) + ${returnRecord.qtyReturned}`,
                    updatedAt: new Date(),
                }).where(eq(schema.orderItems.id, returnRecord.orderItemId));

                if (body.restock && returnRecord.productId) {
                    const [product] = await tx
                        .select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products)
                        .where(eq(schema.products.id, returnRecord.productId))
                        .limit(1);

                    if (product) {
                        const quantityBefore = product.stockQuantity || 0;
                        const quantityAfter = quantityBefore + returnRecord.qtyReturned;

                        await tx
                            .update(schema.products)
                            .set({ stockQuantity: quantityAfter })
                            .where(eq(schema.products.id, returnRecord.productId));

                        await tx.insert(schema.stockMovements).values({
                            tenantId: user.tenantId,
                            productId: returnRecord.productId,
                            movementType: 'return',
                            quantity: returnRecord.qtyReturned,
                            quantityBefore,
                            quantityAfter,
                            referenceType: 'return',
                            referenceId: returnRecord.id,
                            createdBy: user.id,
                            notes: `Return processed: ${body.condition}`,
                        });
                    }
                }

                const [order] = await tx.select({
                    id: schema.orders.id,
                    customerId: schema.orders.customerId,
                    totalAmount: schema.orders.totalAmount,
                    paidAmount: schema.orders.paidAmount,
                    paymentStatus: schema.orders.paymentStatus,
                    status: schema.orders.status,
                }).from(schema.orders)
                    .where(eq(schema.orders.id, returnRecord.orderId))
                    .limit(1);

                if (order && body.refundAmount && body.refundAmount > 0) {
                    const refund = body.refundAmount;
                    const oldTotal = Number(order.totalAmount || 0);
                    const paidAmount = Number(order.paidAmount || 0);
                    const unpaidPortion = oldTotal - paidAmount;
                    const newTotal = Math.max(0, oldTotal - refund);

                    await updateOrderPaymentState(tx, {
                        orderId: order.id,
                        totalAmount: newTotal,
                        paidAmount,
                        changedBy: user.id,
                        note: `[Payment] ${(order.paymentStatus || 'unpaid')} -> recalculated (return refund: ${refund})`,
                    });

                    const debtReduction = Math.min(refund, Math.max(0, unpaidPortion));
                    const creditAmount = refund - debtReduction;

                    if (debtReduction > 0) {
                        await tx.update(schema.customers).set({
                            debtBalance: sql`GREATEST(0, ${schema.customers.debtBalance} - ${debtReduction})`,
                            updatedAt: new Date(),
                        }).where(eq(schema.customers.id, order.customerId));
                    }

                    if (creditAmount > 0) {
                        await tx.update(schema.customers).set({
                            creditBalance: sql`${schema.customers.creditBalance} + ${creditAmount}`,
                            updatedAt: new Date(),
                        }).where(eq(schema.customers.id, order.customerId));
                    }
                }

                if (order) {
                    const allItems = await tx.select({
                        qtyDelivered: schema.orderItems.qtyDelivered,
                        qtyReturned: schema.orderItems.qtyReturned,
                    }).from(schema.orderItems)
                        .where(eq(schema.orderItems.orderId, returnRecord.orderId));

                    const allFullyReturned = allItems.every((item) => {
                        const delivered = item.qtyDelivered || 0;
                        const returned = item.qtyReturned || 0;
                        return delivered > 0 && returned >= delivered;
                    });

                    if (allFullyReturned && order.status !== 'returned') {
                        await transitionOrderStatus({
                            tx,
                            tenantId: user.tenantId,
                            orderId: order.id,
                            newStatus: 'returned',
                            changedBy: user.id,
                            notes: 'All items fully returned - status auto-updated',
                            validateTransition: false,
                        });
                    }
                }

                return updatedReturn;
            });

            try {
                const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyReturnProcessed } = await import('../lib/telegram');
                const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyOrderReturned');
                if (canSend) {
                    const orderInfo = await db.select({
                        orderNumber: schema.orders.orderNumber,
                        customerName: schema.customers.name,
                        currency: schema.tenants.currency,
                    }).from(schema.orders)
                        .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                        .leftJoin(schema.tenants, eq(schema.orders.tenantId, schema.tenants.id))
                        .where(eq(schema.orders.id, result.orderId))
                        .limit(1);

                    if (orderInfo.length > 0) {
                        const admins = await getTenantAdminsWithTelegram(user.tenantId);
                        for (const admin of admins) {
                            notifyReturnProcessed(admin.telegramChatId, {
                                orderNumber: orderInfo[0].orderNumber,
                                customerName: orderInfo[0].customerName || 'Unknown',
                                amount: body.refundAmount || 0,
                                currency: orderInfo[0].currency || 'USD',
                                reason: result.reason || undefined,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Telegram Notification Error:', error);
            }

            const responseBody = { success: true, data: result };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error: any) {
            if (error.message === 'Return not found') {
                await abortIdempotentRequest(idempotency);
                return sendApiError(reply, 404, 'NOT_FOUND', 'Return not found');
            }
            if (error.message === 'Return already processed') {
                await abortIdempotentRequest(idempotency);
                return sendApiError(reply, 400, 'ALREADY_PROCESSED', 'This return has already been processed');
            }
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 500, 'INTERNAL_ERROR', 'Failed to process return');
        }
    });
};
