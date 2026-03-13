import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { buildSalesCustomerAssignmentCondition } from '../lib/sales-scope';
import { eq, and, sql, desc } from 'drizzle-orm';
import { criticalEndpointLimiter } from '../lib/advanced-rate-limiting';
import { updateOrderPaymentState } from '../services/order-financials.service';
import { applyCustomerPaymentBalance } from '../services/customer-balance.service';
import { sendApiError } from '../lib/api-errors';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../lib/idempotency';

const ListPaymentsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    customerId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
});

const CreatePaymentMethodBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
});

const CreatePaymentBodySchema = Type.Object({
    customerId: Type.String(),
    orderId: Type.Optional(Type.String()),
    paymentMethodId: Type.String(),
    amount: Type.Number({ exclusiveMinimum: 0 }),
    referenceNumber: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
});

const SupplierPaymentsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    supplierId: Type.Optional(Type.String()),
    purchaseOrderId: Type.Optional(Type.String()),
});

const CreateSupplierPaymentBodySchema = Type.Object({
    supplierId: Type.String(),
    purchaseOrderId: Type.Optional(Type.String()),
    paymentMethodId: Type.String(),
    amount: Type.Number({ exclusiveMinimum: 0 }),
    referenceNumber: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
});

type ListPaymentsQuery = Static<typeof ListPaymentsQuerySchema>;
type CreatePaymentMethodBody = Static<typeof CreatePaymentMethodBodySchema>;
type CreatePaymentBody = Static<typeof CreatePaymentBodySchema>;
type SupplierPaymentsQuery = Static<typeof SupplierPaymentsQuerySchema>;
type CreateSupplierPaymentBody = Static<typeof CreateSupplierPaymentBodySchema>;

function parsePositiveInt(value: string, fallback: number, max: number): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/methods', { preHandler: [fastify.authenticate] }, async (request) => {
        const user = request.user!;
        const methods = await db.select().from(schema.paymentMethods)
            .where(and(eq(schema.paymentMethods.tenantId, user.tenantId), eq(schema.paymentMethods.isActive, true)))
            .orderBy(schema.paymentMethods.name);
        return { success: true, data: methods };
    });

    fastify.post<{ Body: CreatePaymentMethodBody }>('/methods', {
        preHandler: [fastify.authenticate, fastify.requirePermission('payments.manage')],
        schema: { body: CreatePaymentMethodBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const [method] = await db.insert(schema.paymentMethods).values({
            tenantId: user.tenantId,
            name: request.body.name,
            isActive: true,
        }).returning();
        return { success: true, data: method };
    });

    fastify.get<{ Querystring: ListPaymentsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListPaymentsQuerySchema },
    }, async (request) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', customerId, orderId } = request.query;
        const page = parsePositiveInt(pageStr, 1, 1000000);
        const limit = parsePositiveInt(limitStr, 20, 100);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.payments.tenantId, user.tenantId)];
        if (customerId) conditions.push(eq(schema.payments.customerId, customerId));
        if (orderId) conditions.push(eq(schema.payments.orderId, orderId));
        if (user.role === 'sales_rep') {
            conditions.push(buildSalesCustomerAssignmentCondition(schema.payments.customerId, user.tenantId, user.id));
        } else if (user.role === 'driver') {
            conditions.push(eq(schema.payments.collectedBy, user.id));
        }

        const paymentsList = await db.select({
            id: schema.payments.id,
            paymentNumber: schema.payments.paymentNumber,
            customerName: schema.customers.name,
            amount: schema.payments.amount,
            methodName: schema.paymentMethods.name,
            orderNumber: schema.orders.orderNumber,
            collectedAt: schema.payments.collectedAt,
            collectedBy: schema.users.name,
        }).from(schema.payments)
            .leftJoin(schema.customers, eq(schema.payments.customerId, schema.customers.id))
            .leftJoin(schema.paymentMethods, eq(schema.payments.paymentMethodId, schema.paymentMethods.id))
            .leftJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
            .leftJoin(schema.users, eq(schema.payments.collectedBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.payments.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.payments)
            .where(and(...conditions));

        return {
            success: true,
            data: paymentsList,
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit)
            }
        };
    });

    fastify.post<{ Body: CreatePaymentBody }>('/', {
        preHandler: [fastify.authenticate, fastify.requirePermission('payments.collect'), criticalEndpointLimiter.payment],
        schema: { body: CreatePaymentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const idempotency = await beginIdempotentRequest(request, 'payments.collect');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        if (!Number.isFinite(body.amount) || body.amount <= 0) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_AMOUNT', 'amount must be greater than 0');
        }

        const [customerExists] = await db.select({ id: schema.customers.id })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.id, body.customerId),
                eq(schema.customers.tenantId, user.tenantId)
            ))
            .limit(1);
        if (!customerExists) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_CUSTOMER', 'customerId is invalid for this tenant');
        }

        const [paymentMethod] = await db.select({ id: schema.paymentMethods.id, isActive: schema.paymentMethods.isActive })
            .from(schema.paymentMethods)
            .where(and(
                eq(schema.paymentMethods.id, body.paymentMethodId),
                eq(schema.paymentMethods.tenantId, user.tenantId)
            ))
            .limit(1);
        if (!paymentMethod || !paymentMethod.isActive) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_PAYMENT_METHOD', 'paymentMethodId is invalid or inactive');
        }

        if (user.role === 'sales_rep') {
            const [customer] = await db.select({ assignedSalesRepId: schema.customers.assignedSalesRepId })
                .from(schema.customers)
                .where(eq(schema.customers.id, body.customerId))
                .limit(1);
            if (!customer || customer.assignedSalesRepId !== user.id) {
                await abortIdempotentRequest(idempotency);
                return sendApiError(reply, 403, 'FORBIDDEN', 'Access denied');
            }
        }

        let orderForPayment: {
            id: string;
            totalAmount: string;
            paidAmount: string | null;
            paymentStatus: string | null;
        } | null = null;
        if (body.orderId) {
            const [order] = await db.select({
                id: schema.orders.id,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                paymentStatus: schema.orders.paymentStatus,
            }).from(schema.orders).where(and(
                eq(schema.orders.id, body.orderId),
                eq(schema.orders.tenantId, user.tenantId),
                eq(schema.orders.customerId, body.customerId)
            )).limit(1);

            if (!order) {
                await abortIdempotentRequest(idempotency);
                return sendApiError(reply, 400, 'INVALID_ORDER', 'orderId does not belong to this tenant/customer');
            }

            orderForPayment = order;
        }

        const paymentNumber = `PAY-${Date.now()}`;

        try {
            const result = await db.transaction(async (tx) => {
                const [payment] = await tx.insert(schema.payments).values({
                    tenantId: user.tenantId,
                    paymentNumber,
                    customerId: body.customerId,
                    orderId: body.orderId,
                    paymentMethodId: body.paymentMethodId,
                    amount: body.amount.toString(),
                    collectedBy: user.id,
                    referenceNumber: body.referenceNumber,
                    notes: body.notes,
                    collectedAt: new Date(),
                }).returning();

                if (body.orderId && orderForPayment) {
                    const newPaidAmount = Number(orderForPayment.paidAmount || 0) + body.amount;
                    await updateOrderPaymentState(tx, {
                        orderId: body.orderId,
                        paidAmount: newPaidAmount,
                        totalAmount: Number(orderForPayment.totalAmount),
                        changedBy: user.id,
                        note: `[Payment] ${(orderForPayment.paymentStatus || 'unpaid')} -> recalculated (received ${body.amount})`,
                    });
                }

                await applyCustomerPaymentBalance(tx, {
                    customerId: body.customerId,
                    amount: body.amount,
                });

                return payment;
            });

            try {
                const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyPaymentReceived } = await import('../lib/telegram');
                const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyPaymentReceived');
                if (canSend) {
                    const [customer] = await db.select({ name: schema.customers.name, telegramChatId: schema.customers.telegramChatId })
                        .from(schema.customers)
                        .where(eq(schema.customers.id, body.customerId))
                        .limit(1);
                    const [tenant] = await db.select({ currency: schema.tenants.currency })
                        .from(schema.tenants)
                        .where(eq(schema.tenants.id, user.tenantId))
                        .limit(1);
                    const currency = tenant?.currency || 'USD';
                    const admins = await getTenantAdminsWithTelegram(user.tenantId);
                    let orderNumber: string | undefined;
                    if (body.orderId) {
                        const [orderInfo] = await db.select({ orderNumber: schema.orders.orderNumber })
                            .from(schema.orders)
                            .where(eq(schema.orders.id, body.orderId))
                            .limit(1);
                        orderNumber = orderInfo?.orderNumber;
                    }
                    for (const admin of admins) {
                        notifyPaymentReceived(admin.telegramChatId, { amount: body.amount, currency, customerName: customer?.name || 'Unknown', orderNumber });
                    }
                }
            } catch (e) {
                console.error('Telegram Notification Error:', e);
            }

            const responseBody = { success: true, data: result };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 500, 'INTERNAL_ERROR', 'Failed to create payment');
        }
    });

    fastify.get<{ Querystring: SupplierPaymentsQuery }>('/suppliers', {
        preHandler: [fastify.authenticate],
        schema: { querystring: SupplierPaymentsQuerySchema },
    }, async (request) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', supplierId, purchaseOrderId } = request.query;
        const page = parsePositiveInt(pageStr, 1, 1000000);
        const limit = parsePositiveInt(limitStr, 20, 100);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.supplierPayments.tenantId, user.tenantId)];
        if (supplierId) conditions.push(eq(schema.supplierPayments.supplierId, supplierId));
        if (purchaseOrderId) conditions.push(eq(schema.supplierPayments.purchaseOrderId, purchaseOrderId));

        const paymentsList = await db.select({
            id: schema.supplierPayments.id,
            paymentNumber: schema.supplierPayments.paymentNumber,
            supplierName: schema.suppliers.name,
            amount: schema.supplierPayments.amount,
            methodName: schema.paymentMethods.name,
            poNumber: schema.purchaseOrders.poNumber,
            paidAt: schema.supplierPayments.paidAt,
            paidBy: schema.users.name,
        }).from(schema.supplierPayments)
            .leftJoin(schema.suppliers, eq(schema.supplierPayments.supplierId, schema.suppliers.id))
            .leftJoin(schema.paymentMethods, eq(schema.supplierPayments.paymentMethodId, schema.paymentMethods.id))
            .leftJoin(schema.purchaseOrders, eq(schema.supplierPayments.purchaseOrderId, schema.purchaseOrders.id))
            .leftJoin(schema.users, eq(schema.supplierPayments.paidBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.supplierPayments.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.supplierPayments)
            .where(and(...conditions));

        return {
            success: true,
            data: paymentsList,
            meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) }
        };
    });

    fastify.post<{ Body: CreateSupplierPaymentBody }>('/suppliers', {
        preHandler: [fastify.authenticate, fastify.requirePermission('payments.manage'), criticalEndpointLimiter.payment],
        schema: { body: CreateSupplierPaymentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const idempotency = await beginIdempotentRequest(request, 'payments.supplier_collect');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        if (!Number.isFinite(body.amount) || body.amount <= 0) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_AMOUNT', 'amount must be greater than 0');
        }

        const [supplierExists] = await db.select({ id: schema.suppliers.id })
            .from(schema.suppliers)
            .where(and(
                eq(schema.suppliers.id, body.supplierId),
                eq(schema.suppliers.tenantId, user.tenantId)
            ))
            .limit(1);
        if (!supplierExists) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_SUPPLIER', 'supplierId is invalid for this tenant');
        }

        const [supplierPaymentMethod] = await db.select({ id: schema.paymentMethods.id, isActive: schema.paymentMethods.isActive })
            .from(schema.paymentMethods)
            .where(and(
                eq(schema.paymentMethods.id, body.paymentMethodId),
                eq(schema.paymentMethods.tenantId, user.tenantId)
            ))
            .limit(1);
        if (!supplierPaymentMethod || !supplierPaymentMethod.isActive) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 400, 'INVALID_PAYMENT_METHOD', 'paymentMethodId is invalid or inactive');
        }

        let purchaseOrderForPayment: {
            id: string;
            paidAmount: string | null;
        } | null = null;
        if (body.purchaseOrderId) {
            const [po] = await db.select({
                id: schema.purchaseOrders.id,
                paidAmount: schema.purchaseOrders.paidAmount,
            }).from(schema.purchaseOrders).where(and(
                eq(schema.purchaseOrders.id, body.purchaseOrderId),
                eq(schema.purchaseOrders.tenantId, user.tenantId),
                eq(schema.purchaseOrders.supplierId, body.supplierId)
            )).limit(1);

            if (!po) {
                await abortIdempotentRequest(idempotency);
                return sendApiError(reply, 400, 'INVALID_PURCHASE_ORDER', 'purchaseOrderId does not belong to this tenant/supplier');
            }
            purchaseOrderForPayment = po;
        }

        const paymentNumber = `SPAY-${Date.now()}`;

        try {
            const result = await db.transaction(async (tx) => {
                const [payment] = await tx.insert(schema.supplierPayments).values({
                    tenantId: user.tenantId,
                    paymentNumber,
                    supplierId: body.supplierId,
                    purchaseOrderId: body.purchaseOrderId,
                    paymentMethodId: body.paymentMethodId,
                    amount: body.amount.toString(),
                    paidBy: user.id,
                    referenceNumber: body.referenceNumber,
                    notes: body.notes,
                    paidAt: new Date(),
                }).returning();

                if (body.purchaseOrderId && purchaseOrderForPayment) {
                    const newPaidAmount = Number(purchaseOrderForPayment.paidAmount || 0) + body.amount;
                    await tx.update(schema.purchaseOrders)
                        .set({ paidAmount: newPaidAmount.toString() })
                        .where(eq(schema.purchaseOrders.id, body.purchaseOrderId));
                }

                return payment;
            });

            const responseBody = { success: true, data: result };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 500, 'INTERNAL_ERROR', 'Failed to create supplier payment');
        }

    });
};
