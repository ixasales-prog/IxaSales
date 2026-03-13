/**
 * Customer Portal - Orders Routes (Fastify)
 * 
 * Order management, creation, and cancellation.
 * Reorder logic is in reorder.ts for maintainability.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql, or } from 'drizzle-orm';
import { customerPortalLogger as logger } from '../../lib/logger';
import { MAX_PENDING_ORDERS } from './types';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';
import { ordersService } from '../../services/orders.service';
import type { CreateOrderResult, OrderValidationError } from '../../services/orders.service';
import { CANCELLABLE_ORDER_STATUSES } from '../../lib/constants';
import { transitionOrderStatus } from '../../services/order-workflow.service';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../../lib/idempotency';
import type { IdempotencyStartResult } from '../../lib/idempotency';

function isCreateOrderError(result: CreateOrderResult | { error: OrderValidationError }): result is { error: OrderValidationError } {
    return 'error' in result;
}

const ORDER_STATUS_FILTERS = [
    'pending',
    'confirmed',
    'approved',
    'delivering',
    'delivered',
    'cancelled',
    'returned',
] as const;
type OrderStatusFilter = typeof ORDER_STATUS_FILTERS[number];

function isOrderStatusFilter(value: string): value is OrderStatusFilter {
    return ORDER_STATUS_FILTERS.includes(value as OrderStatusFilter);
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

// ============================================================================
// SCHEMAS
// ============================================================================

const ListOrdersQuerySchema = {
    querystring: Type.Object({
        page: Type.Optional(Type.String()),
        limit: Type.Optional(Type.String()),
        status: Type.Optional(Type.String())
    })
};

const OrderIdParamsSchema = {
    params: Type.Object({ id: Type.String() })
};

const CreateOrderSchema = {
    body: Type.Object({
        items: Type.Array(Type.Object({
            productId: Type.String(),
            quantity: Type.Number()
        })),
        notes: Type.Optional(Type.String()),
        deliveryNotes: Type.Optional(Type.String()),
        discountCode: Type.Optional(Type.String())
    })
};

const CancelOrderSchema = {
    params: Type.Object({ id: Type.String() }),
    body: Type.Optional(Type.Object({
        reason: Type.Optional(Type.String())
    }))
};

// ============================================================================
// ROUTES
// ============================================================================

export const ordersRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get customer's orders with pagination
     */
    fastify.get('/orders', {
        schema: ListOrdersQuerySchema,
        preHandler: [requireCustomerAuth]
    }, async (request) => {
        const customerAuth = request.customerAuth!;
        const query = request.query as { page?: string; limit?: string; status?: string };

        const page = parsePositiveInt(query.page, 1, 1, 1000);
        const limit = parsePositiveInt(query.limit, 20, 1, 100);
        const status = query.status;
        const offset = (page - 1) * limit;

        const conditions = [
            eq(schema.orders.tenantId, customerAuth.tenantId),
            eq(schema.orders.customerId, customerAuth.customerId)
        ];

        if (status && status !== 'all' && isOrderStatusFilter(status)) {
            conditions.push(eq(schema.orders.status, status));
        }

        const orders = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                status: schema.orders.status,
                paymentStatus: schema.orders.paymentStatus,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                createdAt: schema.orders.createdAt,
                deliveredAt: schema.orders.deliveredAt,
            })
            .from(schema.orders)
            .where(and(...conditions))
            .orderBy(desc(schema.orders.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(...conditions));

        return {
            success: true,
            data: orders.map(o => ({
                ...o,
                totalAmount: Number(o.totalAmount),
                paidAmount: Number(o.paidAmount || 0),
                remainingAmount: Number(o.totalAmount) - Number(o.paidAmount || 0)
            })),
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
                hasMore: page * limit < Number(count)
            }
        };
    });

    /**
     * Get order details
     */
    fastify.get<{ Params: { id: string } }>('/orders/:id', {
        schema: OrderIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, request.params.id),
                eq(schema.orders.tenantId, customerAuth.tenantId),
                eq(schema.orders.customerId, customerAuth.customerId)
            ))
            .limit(1);

        if (!order) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const items = await db
            .select({
                id: schema.orderItems.id,
                productName: schema.products.name,
                sku: schema.products.sku,
                imageUrl: schema.products.imageUrl,
                unitPrice: schema.orderItems.unitPrice,
                qtyOrdered: schema.orderItems.qtyOrdered,
                qtyDelivered: schema.orderItems.qtyDelivered,
                lineTotal: schema.orderItems.lineTotal,
            })
            .from(schema.orderItems)
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(eq(schema.orderItems.orderId, order.id));

        let paymentUrl: string | undefined;
        if (order.paymentStatus !== 'paid') {
            try {
                const remainingAmount = Number(order.totalAmount) - Number(order.paidAmount || 0);
                if (remainingAmount <= 0) {
                    return {
                        success: true,
                        data: {
                            ...order,
                            totalAmount: Number(order.totalAmount),
                            paidAmount: Number(order.paidAmount || 0),
                            remainingAmount,
                            items: items.map(i => ({
                                ...i,
                                unitPrice: Number(i.unitPrice),
                                lineTotal: Number(i.lineTotal)
                            })),
                            paymentUrl: undefined
                        }
                    };
                }
                const { createPaymentLink } = await import('../../lib/payment-providers');
                const paymentResult = await createPaymentLink({
                    tenantId: customerAuth.tenantId,
                    orderId: order.id,
                    customerId: customerAuth.customerId,
                    amount: remainingAmount,
                    currency: 'UZS'
                });
                if (paymentResult) {
                    paymentUrl = paymentResult.portalUrl;
                }
            } catch (e) {
                logger.warn('Failed to create payment link', { error: String(e) });
            }
        }

        return {
            success: true,
            data: {
                ...order,
                totalAmount: Number(order.totalAmount),
                paidAmount: Number(order.paidAmount || 0),
                remainingAmount: Number(order.totalAmount) - Number(order.paidAmount || 0),
                items: items.map(i => ({
                    ...i,
                    unitPrice: Number(i.unitPrice),
                    lineTotal: Number(i.lineTotal)
                })),
                paymentUrl
            }
        };
    });

    /**
     * Get order timeline
     */
    fastify.get<{ Params: { id: string } }>('/orders/:id/timeline', {
        schema: OrderIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        const [order] = await db
            .select({
                id: schema.orders.id,
                status: schema.orders.status,
                createdAt: schema.orders.createdAt,
                updatedAt: schema.orders.updatedAt,
                deliveredAt: schema.orders.deliveredAt,
            })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, request.params.id),
                eq(schema.orders.tenantId, customerAuth.tenantId),
                eq(schema.orders.customerId, customerAuth.customerId)
            ))
            .limit(1);

        if (!order) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const statusHistory = await db
            .select({
                toStatus: schema.orderStatusHistory.toStatus,
                createdAt: schema.orderStatusHistory.createdAt,
            })
            .from(schema.orderStatusHistory)
            .where(eq(schema.orderStatusHistory.orderId, request.params.id))
            .orderBy(schema.orderStatusHistory.createdAt);

        const statusDates = new Map<string, Date>();
        for (const entry of statusHistory) {
            if (entry.toStatus && entry.createdAt) {
                statusDates.set(entry.toStatus, entry.createdAt);
            }
        }

        const statusOrder = ['pending', 'confirmed', 'approved', 'delivering', 'delivered'];
        const currentStatus = order.status || 'pending';
        const currentStatusIndex = statusOrder.indexOf(currentStatus);

        // If cancelled
        if (order.status === 'cancelled') {
            return {
                success: true,
                data: [{
                    status: 'pending',
                    label: 'Buyurtma qabul qilindi',
                    icon: 'package',
                    completed: true,
                    current: false,
                    date: order.createdAt,
                }, {
                    status: 'cancelled',
                    label: 'Bekor qilindi',
                    icon: 'x-circle',
                    completed: true,
                    current: true,
                    date: statusDates.get('cancelled') || order.updatedAt,
                }]
            };
        }

        const timeline = [
            {
                status: 'pending',
                label: 'Buyurtma qabul qilindi',
                icon: 'package',
                completed: currentStatusIndex >= 0,
                current: order.status === 'pending',
                date: order.createdAt,
            },
            {
                status: 'confirmed',
                label: 'Tasdiqlandi',
                icon: 'check',
                completed: currentStatusIndex >= 1,
                current: order.status === 'confirmed',
                date: statusDates.get('confirmed') || (currentStatusIndex >= 1 ? order.updatedAt : null),
            },
            {
                status: 'approved',
                label: 'Tayyorlanmoqda',
                icon: 'box',
                completed: currentStatusIndex >= 2,
                current: order.status === 'approved',
                date: statusDates.get('approved') || (currentStatusIndex >= 2 ? order.updatedAt : null),
            },
            {
                status: 'delivering',
                label: 'Yetkazilmoqda',
                icon: 'truck',
                completed: currentStatusIndex >= 3,
                current: order.status === 'delivering',
                date: statusDates.get('delivering') || (currentStatusIndex >= 3 ? order.updatedAt : null),
            },
            {
                status: 'delivered',
                label: 'Yetkazildi',
                icon: 'check-circle',
                completed: currentStatusIndex >= 4,
                current: order.status === 'delivered',
                date: order.deliveredAt || statusDates.get('delivered'),
            },
        ];

        return { success: true, data: timeline };
    });

    /**
     * Create a new order from cart
     */
    fastify.post('/orders', {
        schema: CreateOrderSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const { items, notes, deliveryNotes, discountCode } = request.body as {
            items: { productId: string; quantity: number }[];
            notes?: string;
            deliveryNotes?: string;
            discountCode?: string;
        };
        let idempotency: IdempotencyStartResult = { enabled: false };
        try {
            idempotency = await beginIdempotentRequest(request, 'customer_portal.orders.create');
        } catch (idempotencyError) {
            logger.warn('Idempotency initialization failed for customer order create; continuing without idempotency', {
                customerId: customerAuth.customerId,
                error: String(idempotencyError),
            });
        }
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_IN_PROGRESS',
                    message: 'A request with this idempotency key is currently being processed',
                },
            });
        }
        if (idempotency.enabled && idempotency.conflict) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_KEY_REUSED',
                    message: idempotency.conflict,
                },
            });
        }

        try {
            if (!items || items.length === 0) {
                const errorBody = createErrorResponse('EMPTY_CART');
                await finishIdempotentRequest(idempotency, 400, errorBody);
                return reply.status(400).send(errorBody);
            }

            // Check pending order limit
            const [{ pendingCount }] = await db
                .select({ pendingCount: sql<number>`count(*)` })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.customerId, customerAuth.customerId),
                    or(
                        eq(schema.orders.status, 'pending'),
                        eq(schema.orders.status, 'confirmed')
                    )
                ));

            if (Number(pendingCount) >= MAX_PENDING_ORDERS) {
                const errorBody = {
                    success: false,
                    error: {
                        code: 'ORDER_LIMIT_REACHED',
                        message: `Sizda ${MAX_PENDING_ORDERS} ta kutilayotgan buyurtma bor. Yangi buyurtma berish uchun avvalgilar yakunlanishi kerak.`
                    }
                };
                await finishIdempotentRequest(idempotency, 400, errorBody);
                return reply.status(400).send(errorBody);
            }

            const serviceResult = await db.transaction(async (tx) => {
                const { canCreateResourceInTx } = await import('../../lib/planLimits');
                const limitCheck = await canCreateResourceInTx(tx, customerAuth.tenantId, 'orders');
                if (!limitCheck.allowed) {
                    return {
                        error: {
                            code: 'LIMIT_EXCEEDED' as const,
                            status: 403,
                            message: `Monthly order limit reached (${limitCheck.current}/${limitCheck.max}).`,
                        }
                    };
                }

                return ordersService.createOrder(
                    tx,
                    {
                        tenantId: customerAuth.tenantId,
                        customerId: customerAuth.customerId,
                        items: items.map((item) => ({
                            productId: item.productId,
                            quantity: Math.floor(Number(item.quantity)),
                        })),
                        notes,
                        deliveryNotes,
                        discountCode,
                    },
                    {
                        mode: 'customer_portal',
                        userId: undefined,
                        actorRole: 'customer',
                        applyAutoDiscount: !discountCode,
                    }
                );
            });

            if (isCreateOrderError(serviceResult)) {
                const err = serviceResult.error;
                const errorBody = {
                    success: false,
                    error: {
                        code: err.code,
                        message: err.message,
                        details: err.details
                    }
                };
                await finishIdempotentRequest(idempotency, err.status, errorBody);
                return reply.status(err.status).send(errorBody);
            }

            const orderResult: CreateOrderResult = serviceResult;
            logger.info('Order created via customer portal', {
                orderId: orderResult.order.id,
                orderNumber: orderResult.order.orderNumber,
                customerId: customerAuth.customerId,
                subtotal: orderResult.subtotalAmount,
                discountAmount: orderResult.discountAmount,
                discountName: orderResult.discountName,
                totalAmount: orderResult.totalAmount,
                itemCount: orderResult.items.length
            });

            // Notify admin
            try {
                const { notifyNewOrder, getTenantAdminsWithTelegram, canSendTenantNotification } = await import('../../lib/telegram');
                const notifCheck = await canSendTenantNotification(customerAuth.tenantId, 'notifyNewOrder');
                if (notifCheck.canSend) {
                    const [customerInfo] = await db.select({ name: schema.customers.name, phone: schema.customers.phone })
                        .from(schema.customers).where(eq(schema.customers.id, customerAuth.customerId)).limit(1);
                    const [tenantInfo] = await db.select({ currency: schema.tenants.currency })
                        .from(schema.tenants).where(eq(schema.tenants.id, customerAuth.tenantId)).limit(1);

                    const admins = await getTenantAdminsWithTelegram(customerAuth.tenantId);
                    for (const admin of admins) {
                        await notifyNewOrder(admin.telegramChatId, {
                            orderNumber: orderResult.order.orderNumber,
                            customerName: customerInfo?.name || "Noma'lum",
                            customerPhone: customerInfo?.phone || undefined,
                            total: orderResult.totalAmount,
                            currency: tenantInfo?.currency || 'UZS',
                            itemCount: orderResult.items.length
                        });
                    }
                }
            } catch (e) {
                logger.error(`Failed to send new order notification: ${String(e)}`);
            }

            const responseBody = createSuccessResponse('ORDER_CREATED', {
                orderId: orderResult.order.id,
                orderNumber: orderResult.order.orderNumber,
                subtotalAmount: orderResult.subtotalAmount,
                discountAmount: orderResult.discountAmount,
                discountName: orderResult.discountName,
                totalAmount: orderResult.totalAmount,
                itemCount: orderResult.items.length,
                warnings: orderResult.warnings
            });
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            await abortIdempotentRequest(idempotency);
            logger.error('Customer portal order create failed', error instanceof Error ? error : new Error(String(error)), {
                customerId: customerAuth.customerId,
            });
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });

    /**
     * Cancel a pending order
     */
    fastify.post<{ Params: { id: string }; Body?: { reason?: string } }>('/orders/:id/cancel', {
        schema: CancelOrderSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const body = request.body as { reason?: string } | undefined;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, request.params.id),
                eq(schema.orders.tenantId, customerAuth.tenantId),
                eq(schema.orders.customerId, customerAuth.customerId)
            ))
            .limit(1);

        if (!order) {
            return reply.status(404).send(createErrorResponse('ORDER_NOT_FOUND'));
        }

        if (!(CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(order.status || '')) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'CANNOT_CANCEL',
                    message: `Faqat kutilayotgan yoki tasdiqlangan buyurtmalarni bekor qilish mumkin. Joriy holat: ${order.status}`
                }
            });
        }

        await db.transaction(async (tx) => {
            await transitionOrderStatus({
                tx,
                tenantId: customerAuth.tenantId,
                orderId: order.id,
                newStatus: 'cancelled',
                notes: `Cancelled by customer: ${body?.reason || 'No reason provided'}`,
                validateTransition: false,
            });

            await tx
                .update(schema.orders)
                .set({
                    notes: order.notes
                        ? `${order.notes}\n\n[Mijoz tomonidan bekor qilindi: ${body?.reason || "Sabab ko'rsatilmagan"}]`
                        : `[Mijoz tomonidan bekor qilindi: ${body?.reason || "Sabab ko'rsatilmagan"}]`,
                    updatedAt: new Date(),
                })
                .where(eq(schema.orders.id, order.id));
        });

        logger.info('Order cancelled by customer', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: customerAuth.customerId,
            reason: body?.reason
        });

        return createSuccessResponse('ORDER_CANCELLED', {
            orderNumber: order.orderNumber
        });
    });
};
