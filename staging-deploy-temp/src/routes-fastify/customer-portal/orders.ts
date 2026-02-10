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
import { MAX_PENDING_ORDERS, type OrderItemInput } from './types';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';
import { ordersService } from '../../services/orders.service';

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
        deliveryNotes: Type.Optional(Type.String())
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
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const query = request.query as { page?: string; limit?: string; status?: string };

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const status = query.status;
        const offset = (page - 1) * limit;

        const conditions = [
            eq(schema.orders.tenantId, customerAuth.tenantId),
            eq(schema.orders.customerId, customerAuth.customerId)
        ];

        if (status && status !== 'all') {
            conditions.push(eq(schema.orders.status, status as any));
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
                const { createPaymentLink } = await import('../../lib/payment-providers');
                const paymentResult = await createPaymentLink({
                    tenantId: customerAuth.tenantId,
                    orderId: order.id,
                    customerId: customerAuth.customerId,
                    amount: Number(order.totalAmount) - Number(order.paidAmount || 0),
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
        const { items, notes, deliveryNotes } = request.body as {
            items: { productId: string; quantity: number }[];
            notes?: string;
            deliveryNotes?: string;
        };

        if (!items || items.length === 0) {
            return reply.status(400).send(createErrorResponse('EMPTY_CART'));
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
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'ORDER_LIMIT_REACHED',
                    message: `Sizda ${MAX_PENDING_ORDERS} ta kutilayotgan buyurtma bor. Yangi buyurtma berish uchun avvalgilar yakunlanishi kerak.`
                }
            });
        }

        // Use transaction
        const result = await db.transaction(async (tx) => {
            const productIds = items.map((i: any) => i.productId);
            const products = await tx
                .select({
                    id: schema.products.id,
                    name: schema.products.name,
                    price: schema.products.price,
                    stockQuantity: schema.products.stockQuantity,
                    reservedQuantity: schema.products.reservedQuantity,
                    isActive: schema.products.isActive,
                })
                .from(schema.products)
                .where(and(
                    eq(schema.products.tenantId, customerAuth.tenantId),
                    sql`${schema.products.id} IN (${sql.join(productIds.map((id: string) => sql`${id}`), sql`, `)})`
                ))
                .for('update');

            const productMap = new Map(products.map(p => [p.id, p]));

            let totalAmount = 0;
            const orderItems: OrderItemInput[] = [];
            const errors: string[] = [];

            for (const item of items) {
                const product = productMap.get(item.productId);

                if (!product) {
                    errors.push(`Mahsulot topilmadi: ${item.productId}`);
                    continue;
                }

                if (!product.isActive) {
                    errors.push(`Mahsulot mavjud emas: ${product.name}`);
                    continue;
                }

                const qty = Number(item.quantity);
                if (qty <= 0 || qty > 1000) {
                    errors.push(`Noto'g'ri miqdor: ${product.name}`);
                    continue;
                }

                const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
                if (qty > availableStock) {
                    errors.push(`Yetarli zaxira yo'q: ${product.name} (mavjud: ${availableStock})`);
                    continue;
                }

                const unitPrice = Number(product.price);
                const lineTotal = unitPrice * qty;
                totalAmount += lineTotal;

                orderItems.push({
                    productId: item.productId,
                    qty,
                    unitPrice,
                    lineTotal,
                    productName: product.name
                });
            }

            if (orderItems.length === 0) {
                return {
                    error: {
                        code: 'NO_VALID_ITEMS',
                        message: "Hech qanday mahsulot qo'shilmadi",
                        details: errors,
                        status: 400
                    }
                };
            }

            // Find and apply the best available discount using shared service
            const totalQty = orderItems.reduce((sum, item) => sum + item.qty, 0);
            const autoDiscount = await ordersService.findBestAutoDiscount(
                customerAuth.tenantId,
                customerAuth.customerId,
                totalAmount,
                totalQty
            );

            const discountAmount = autoDiscount?.amount || 0;
            const finalTotal = totalAmount - discountAmount;

            // Validate credit/tier limits
            const creditError = await ordersService.validateCreditLimits(tx, customerAuth.customerId, finalTotal);
            if (creditError) {
                return { error: creditError };
            }

            // Generate order number using shared service
            const orderNumber = await ordersService.generateOrderNumber(tx, customerAuth.tenantId);

            // Auto-assign sales rep from customer's assigned rep (if active)
            let salesRepId: string | undefined;
            const [customer] = await tx
                .select({ assignedSalesRepId: schema.customers.assignedSalesRepId })
                .from(schema.customers)
                .where(eq(schema.customers.id, customerAuth.customerId))
                .limit(1);

            if (customer?.assignedSalesRepId) {
                const [rep] = await tx
                    .select({ isActive: schema.users.isActive })
                    .from(schema.users)
                    .where(eq(schema.users.id, customer.assignedSalesRepId))
                    .limit(1);

                if (rep?.isActive) {
                    salesRepId = customer.assignedSalesRepId;
                }
            }

            const [newOrder] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    salesRepId,
                    orderNumber,
                    status: 'pending',
                    paymentStatus: 'unpaid',
                    subtotalAmount: String(totalAmount),
                    discountAmount: String(discountAmount),
                    totalAmount: String(finalTotal),
                    paidAmount: '0',
                    notes: autoDiscount
                        ? `${notes || ''}\n[Chegirma qo'llanildi: ${autoDiscount.name} (-${discountAmount.toLocaleString()} so'm)]`.trim()
                        : (notes || null),
                    deliveryNotes: deliveryNotes || null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            // Insert order items
            for (const item of orderItems) {
                await tx.insert(schema.orderItems).values({
                    orderId: newOrder.id,
                    productId: item.productId,
                    qtyOrdered: item.qty,
                    qtyDelivered: 0,
                    unitPrice: String(item.unitPrice),
                    lineTotal: String(item.lineTotal),
                });
            }

            // Reserve stock using shared service
            await ordersService.reserveStock(tx, orderItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                unitPrice: item.unitPrice,
                quantity: item.qty,
                lineTotal: item.lineTotal,
            })));

            // Update customer debt using shared service
            await ordersService.updateCustomerDebt(tx, customerAuth.customerId, finalTotal);

            // Log status change using shared service
            await ordersService.logStatusChange(tx, newOrder.id, 'pending', undefined, 'Order created via customer portal');

            logger.info('Order created via customer portal', {
                orderId: newOrder.id,
                orderNumber: newOrder.orderNumber,
                customerId: customerAuth.customerId,
                subtotal: totalAmount,
                discountAmount,
                discountName: autoDiscount?.name,
                totalAmount: finalTotal,
                itemCount: orderItems.length
            });

            return {
                order: newOrder,
                orderItems,
                subtotalAmount: totalAmount,
                discountAmount,
                discountName: autoDiscount?.name,
                totalAmount: finalTotal,
                errors
            };
        });

        if ('error' in result && result.error) {
            const err = result.error;
            return reply.status(err.status).send({
                success: false,
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details
                }
            });
        }

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
                        orderNumber: result.order.orderNumber,
                        customerName: customerInfo?.name || "Noma'lum",
                        customerPhone: customerInfo?.phone || undefined,
                        total: result.totalAmount,
                        currency: tenantInfo?.currency || 'UZS',
                        itemCount: result.orderItems.length
                    });
                }
            }
        } catch (e) {
            logger.error('Failed to send new order notification', { error: String(e) });
        }

        return createSuccessResponse('ORDER_CREATED', {
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            subtotalAmount: result.subtotalAmount,
            discountAmount: result.discountAmount,
            discountName: result.discountName,
            totalAmount: result.totalAmount,
            itemCount: result.orderItems.length,
            warnings: result.errors.length > 0 ? result.errors : undefined
        });
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

        if (order.status !== 'pending') {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'CANNOT_CANCEL',
                    message: `Faqat kutilayotgan buyurtmalarni bekor qilish mumkin. Joriy holat: ${order.status}`
                }
            });
        }

        await db.transaction(async (tx) => {
            const items = await tx
                .select({
                    productId: schema.orderItems.productId,
                    qtyOrdered: schema.orderItems.qtyOrdered,
                })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));

            // Release stock using shared service
            await ordersService.releaseStock(tx, items.map(item => ({
                productId: item.productId,
                quantity: item.qtyOrdered,
            })));

            // Reduce customer debt using shared service (negative amount)
            const orderTotal = Number(order.totalAmount || 0);
            await ordersService.updateCustomerDebt(tx, customerAuth.customerId, -orderTotal);

            await tx
                .update(schema.orders)
                .set({
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    updatedAt: new Date(),
                    notes: order.notes
                        ? `${order.notes}\n\n[Mijoz tomonidan bekor qilindi: ${body?.reason || "Sabab ko'rsatilmagan"}]`
                        : `[Mijoz tomonidan bekor qilindi: ${body?.reason || "Sabab ko'rsatilmagan"}]`
                })
                .where(eq(schema.orders.id, order.id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'cancelled',
                notes: `Cancelled by customer: ${body?.reason || 'No reason provided'}`,
            });
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
