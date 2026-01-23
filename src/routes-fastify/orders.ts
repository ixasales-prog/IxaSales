import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray, gte, lt } from 'drizzle-orm';

// Schemas
const DashboardStatsQuerySchema = Type.Object({});

const ListOrdersQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    paymentStatus: Type.Optional(Type.String()),
    customerId: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),
});

const CreateOrderItemSchema = Type.Object({
    productId: Type.String(),
    unitPrice: Type.Number({ minimum: 0 }),
    qtyOrdered: Type.Number({ minimum: 1 }),
    lineTotal: Type.Number({ minimum: 0 }),
});

const CreateOrderBodySchema = Type.Object({
    customerId: Type.String(),
    salesRepId: Type.Optional(Type.String()),
    subtotalAmount: Type.Number({ minimum: 0 }),
    discountAmount: Type.Optional(Type.Number({ minimum: 0 })),
    taxAmount: Type.Optional(Type.Number({ minimum: 0 })),
    totalAmount: Type.Number({ minimum: 0 }),
    notes: Type.Optional(Type.String()),
    requestedDeliveryDate: Type.Optional(Type.String()),
    items: Type.Array(CreateOrderItemSchema),
});

const GetOrderParamsSchema = Type.Object({
    id: Type.String(),
});

const UpdateStatusBodySchema = Type.Object({
    status: Type.String(),
    notes: Type.Optional(Type.String()),
});

const CancelOrderBodySchema = Type.Object({
    reason: Type.Optional(Type.String()),
});

type ListOrdersQuery = Static<typeof ListOrdersQuerySchema>;
type CreateOrderBody = Static<typeof CreateOrderBodySchema>;
type UpdateStatusBody = Static<typeof UpdateStatusBodySchema>;
type CancelOrderBody = Static<typeof CancelOrderBodySchema>;

export const orderRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // DASHBOARD STATS
    // ----------------------------------------------------------------
    fastify.get('/dashboard-stats', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        const [tenant] = await db
            .select({ timezone: schema.tenants.timezone })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        const timezone = tenant?.timezone || 'Asia/Tashkent';
        const now = new Date();
        let startOfDay: Date;
        let endOfDay: Date;

        try {
            const dayFormatter = new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                timeZone: timezone,
            });
            const localDateStr = dayFormatter.format(now);
            startOfDay = new Date(`${localDateStr}T00:00:00`);

            const offsetFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'shortOffset',
            });
            const offsetMatch = offsetFormatter.format(now).match(/GMT([+-]\d+)/);
            if (offsetMatch) {
                const offsetHours = parseInt(offsetMatch[1]);
                startOfDay = new Date(startOfDay.getTime() - offsetHours * 60 * 60 * 1000);
            }
        } catch {
            startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
        }

        endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const orderConditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];
        if (user.role === 'sales_rep') {
            orderConditions.push(eq(schema.orders.createdByUserId, user.id));
        } else if (user.role === 'driver') {
            orderConditions.push(eq(schema.orders.driverId, user.id));
        }

        const [todaySales] = await db
            .select({
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'delivered'),
                gte(schema.orders.createdAt, startOfDay),
                lt(schema.orders.createdAt, endOfDay)
            ));

        const [pendingOrders] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'pending')
            ));

        const customerConditions: any[] = [eq(schema.customers.tenantId, user.tenantId)];
        if (user.role === 'sales_rep') {
            customerConditions.push(eq(schema.customers.createdByUserId, user.id));
        }

        const [customerCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.customers)
            .where(and(...customerConditions));

        const today = new Date().toISOString().split('T')[0];
        const visitConditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            eq(schema.salesVisits.plannedDate, today)
        ];
        if (user.role === 'sales_rep') {
            visitConditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        const [visitStats] = await db
            .select({
                total: sql<number>`count(*)`,
                completed: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                inProgress: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'in_progress')`,
            })
            .from(schema.salesVisits)
            .where(and(...visitConditions));

        return {
            success: true,
            data: {
                todaysSales: Number(todaySales?.total || 0),
                pendingOrders: Number(pendingOrders?.count || 0),
                customerCount: Number(customerCount?.count || 0),
                visits: {
                    total: Number(visitStats?.total || 0),
                    completed: Number(visitStats?.completed || 0),
                    inProgress: Number(visitStats?.inProgress || 0),
                }
            }
        };
    });

    // ----------------------------------------------------------------
    // LIST ORDERS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: ListOrdersQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: {
            querystring: ListOrdersQuerySchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, status, paymentStatus, customerId, startDate, endDate } = request.query;

        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];

        if (search) {
            conditions.push(sql`${schema.orders.orderNumber} ILIKE ${`%${search}%`}`);
        }
        if (status) {
            if (status.includes(',')) {
                conditions.push(inArray(schema.orders.status, status.split(',') as any));
            } else {
                conditions.push(eq(schema.orders.status, status as any));
            }
        }
        if (paymentStatus) conditions.push(eq(schema.orders.paymentStatus, paymentStatus as any));
        if (customerId) conditions.push(eq(schema.orders.customerId, customerId));

        if (startDate) conditions.push(sql`${schema.orders.createdAt} >= ${new Date(startDate).toISOString()}`);
        if (endDate) conditions.push(sql`${schema.orders.createdAt} <= ${new Date(endDate).toISOString()}`);

        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.orders.createdByUserId, user.id));
        } else if (user.role === 'driver') {
            conditions.push(eq(schema.orders.driverId, user.id));
        }

        const ordersRaw = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                customerName: schema.customers.name,
                customerCode: schema.customers.code,
                salesRepName: schema.users.name,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                status: schema.orders.status,
                paymentStatus: schema.orders.paymentStatus,
                createdAt: schema.orders.createdAt,
                itemCount: sql<number>`(SELECT count(*) FROM ${schema.orderItems} WHERE ${schema.orderItems.orderId} = ${schema.orders.id})`,
            })
            .from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .leftJoin(schema.users, eq(schema.orders.salesRepId, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.orders.createdAt))
            .limit(limit)
            .offset(offset);

        const orders = ordersRaw.map(o => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: o.customerName ? { name: o.customerName, code: o.customerCode || '' } : null,
            salesRep: o.salesRepName ? { name: o.salesRepName } : null,
            totalAmount: o.totalAmount,
            paidAmount: o.paidAmount || '0',
            status: o.status,
            paymentStatus: o.paymentStatus,
            createdAt: o.createdAt,
            itemCount: o.itemCount,
        }));

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(...conditions));

        return {
            success: true,
            data: orders,
            meta: {
                page: pageStr,
                limit: limitStr,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    });

    // ----------------------------------------------------------------
    // CREATE ORDER
    // ----------------------------------------------------------------
    fastify.post<{ Body: CreateOrderBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: {
            body: CreateOrderBodySchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { items, ...orderData } = request.body;

        // Check plan limits
        const { canCreateOrder } = await import('../lib/planLimits');
        const limitCheck = await canCreateOrder(user.tenantId);
        if (!limitCheck.allowed) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'LIMIT_EXCEEDED',
                    message: `Monthly order limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                }
            });
        }

        const result = await db.transaction(async (tx) => {
            // 1. Validate customer exists
            const [customer] = await tx
                .select({
                    id: schema.customers.id,
                    tierId: schema.customers.tierId,
                    debtBalance: schema.customers.debtBalance,
                    creditBalance: schema.customers.creditBalance,
                    createdByUserId: schema.customers.createdByUserId,
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, orderData.customerId))
                .limit(1);

            if (!customer) {
                return { error: { code: 'NOT_FOUND', message: 'Customer not found', status: 404 } };
            }

            // 2. Check ownership
            if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
                return { error: { code: 'FORBIDDEN', message: 'You can only create orders for customers you created', status: 403 } };
            }

            // 3. Validate credit/tier limits
            if (customer.tierId) {
                const [tier] = await tx
                    .select()
                    .from(schema.customerTiers)
                    .where(eq(schema.customerTiers.id, customer.tierId))
                    .limit(1);

                if (tier) {
                    if (!tier.creditAllowed) {
                        const currentCredit = Number(customer.creditBalance || 0);
                        if (currentCredit < orderData.totalAmount) {
                            return { error: { code: 'CREDIT_NOT_ALLOWED', message: 'This customer tier does not allow credit orders. Prepayment required.', status: 400 } };
                        }
                    }

                    if (tier.creditLimit) {
                        const currentDebt = Number(customer.debtBalance || 0);
                        const newDebt = currentDebt + orderData.totalAmount;
                        if (newDebt > Number(tier.creditLimit)) {
                            return { error: { code: 'CREDIT_LIMIT_EXCEEDED', message: `Order would exceed credit limit of ${tier.creditLimit}`, status: 400 } };
                        }
                    }

                    if (tier.maxOrderAmount && orderData.totalAmount > Number(tier.maxOrderAmount)) {
                        return { error: { code: 'MAX_ORDER_EXCEEDED', message: `Order amount exceeds maximum allowed of ${tier.maxOrderAmount}`, status: 400 } };
                    }
                }
            }

            // 4. Validate stock
            if (items && items.length > 0) {
                for (const item of items) {
                    const [product] = await tx
                        .select({
                            id: schema.products.id,
                            name: schema.products.name,
                            price: schema.products.price,
                            stockQuantity: schema.products.stockQuantity,
                            reservedQuantity: schema.products.reservedQuantity,
                        })
                        .from(schema.products)
                        .where(eq(schema.products.id, item.productId))
                        .for('update')
                        .limit(1);

                    if (!product) {
                        return { error: { code: 'NOT_FOUND', message: `Product not found: ${item.productId}`, status: 404 } };
                    }

                    const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
                    if (availableStock < item.qtyOrdered) {
                        return { error: { code: 'INSUFFICIENT_STOCK', message: `Insufficient stock for ${product.name}. Only ${availableStock} available.`, status: 400 } };
                    }

                    const currentPrice = Number(product.price);
                    if (Math.abs(currentPrice - item.unitPrice) > 0.01) {
                        return { error: { code: 'PRICE_CHANGED', message: `Price for ${product.name} has changed. Please refresh your cart.`, status: 400 } };
                    }
                }
            }

            // Generate Order Number
            const [tenant] = await tx
                .select({
                    orderNumberPrefix: schema.tenants.orderNumberPrefix,
                    timezone: schema.tenants.timezone,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            const prefix = tenant?.orderNumberPrefix || '';
            const timezone = tenant?.timezone || 'Asia/Tashkent';
            const now = new Date();

            let timeStr: string;
            try {
                const formatter = new Intl.DateTimeFormat('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: timezone,
                });
                const parts = formatter.formatToParts(now);
                const hour = parts.find(p => p.type === 'hour')?.value || '00';
                const minute = parts.find(p => p.type === 'minute')?.value || '00';
                timeStr = `${hour}${minute}`;
            } catch (e) {
                timeStr = now.toISOString().slice(11, 16).replace(':', '');
            }

            let startOfDay: Date;
            try {
                const dayFormatter = new Intl.DateTimeFormat('en-CA', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: timezone,
                });
                const localDateStr = dayFormatter.format(now);
                startOfDay = new Date(`${localDateStr}T00:00:00`);
                const offsetFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    timeZoneName: 'shortOffset',
                });
                const offsetMatch = offsetFormatter.format(now).match(/GMT([+-]\d+)/);
                if (offsetMatch) {
                    const offsetHours = parseInt(offsetMatch[1]);
                    startOfDay = new Date(startOfDay.getTime() - offsetHours * 60 * 60 * 1000);
                }
            } catch (e) {
                startOfDay = new Date(now);
                startOfDay.setHours(0, 0, 0, 0);
            }

            const [{ count }] = await tx
                .select({ count: sql<number>`count(*)` })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.tenantId, user.tenantId),
                    sql`${schema.orders.createdAt} >= ${startOfDay.toISOString()}`
                ));

            const sequence = (Number(count) + 1).toString().padStart(2, '0');
            const orderNumber = `${prefix}${sequence}${timeStr}`;

            const [order] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: user.tenantId,
                    orderNumber,
                    customerId: orderData.customerId,
                    salesRepId: (user.role === 'sales_rep') ? user.id : orderData.salesRepId,
                    createdByUserId: user.id,
                    status: 'pending',
                    paymentStatus: 'unpaid',
                    subtotalAmount: orderData.subtotalAmount.toString(),
                    discountAmount: orderData.discountAmount?.toString() || '0',
                    taxAmount: orderData.taxAmount?.toString() || '0',
                    totalAmount: orderData.totalAmount.toString(),
                    notes: orderData.notes,
                    requestedDeliveryDate: orderData.requestedDeliveryDate ? orderData.requestedDeliveryDate : null,
                })
                .returning();

            if (items && items.length > 0) {
                await tx.insert(schema.orderItems).values(
                    items.map((item) => ({
                        orderId: order.id,
                        productId: item.productId,
                        unitPrice: item.unitPrice.toString(),
                        qtyOrdered: item.qtyOrdered,
                        qtyPicked: 0,
                        qtyDelivered: 0,
                        lineTotal: item.lineTotal.toString(),
                    }))
                );

                for (const item of items) {
                    await tx
                        .update(schema.products)
                        .set({
                            reservedQuantity: sql`${schema.products.reservedQuantity} + ${item.qtyOrdered}`,
                        })
                        .where(eq(schema.products.id, item.productId));
                }
            }

            const currentDebt = Number(customer.debtBalance || 0);
            await tx
                .update(schema.customers)
                .set({
                    debtBalance: (currentDebt + orderData.totalAmount).toString(),
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, orderData.customerId));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                toStatus: 'pending',
                changedBy: user.id,
                notes: 'Order created',
            });

            return order;
        });

        // Handle transaction validation errors
        if (result && 'error' in result) {
            return reply.code(result.error.status).send({
                success: false,
                error: { code: result.error.code, message: result.error.message }
            });
        }

        // TELEGRAM NOTIFICATIONS
        try {
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyNewOrder,
                notifyLowStockBatch,
                notifyCustomerOrderConfirmed
            } = await import('../lib/telegram');

            const [customer] = await db
                .select({
                    name: schema.customers.name,
                    telegramChatId: schema.customers.telegramChatId
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, (result as any).customerId));

            const [tenant] = await db
                .select({ currency: schema.tenants.currency })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            const orderCheck = await canSendTenantNotification(user.tenantId, 'notifyNewOrder');
            if (orderCheck.canSend) {
                const admins = await getTenantAdminsWithTelegram(user.tenantId);
                for (const admin of admins) {
                    notifyNewOrder(admin.telegramChatId, {
                        orderNumber: (result as any).orderNumber,
                        customerName: customer?.name || 'Unknown Customer',
                        total: Number((result as any).totalAmount),
                        currency: tenant?.currency || 'UZS'
                    });
                }
            }

            const stockCheck = await canSendTenantNotification(user.tenantId, 'notifyLowStock');
            if (stockCheck.canSend && items && items.length > 0) {
                const productIds = items.map((i) => i.productId);
                const products = await db
                    .select({
                        id: schema.products.id,
                        name: schema.products.name,
                        sku: schema.products.sku,
                        stockQuantity: schema.products.stockQuantity,
                        reservedQuantity: schema.products.reservedQuantity,
                        reorderPoint: schema.products.reorderPoint,
                    })
                    .from(schema.products)
                    .where(inArray(schema.products.id, productIds));

                const lowStockProducts: Array<{ name: string; sku: string; quantity: number }> = [];
                for (const prod of products) {
                    const available = (prod.stockQuantity || 0) - (prod.reservedQuantity || 0);
                    const minQty = prod.reorderPoint ?? 10;
                    if (available < minQty) {
                        lowStockProducts.push({
                            name: prod.name,
                            sku: prod.sku || '',
                            quantity: available
                        });
                    }
                }

                if (lowStockProducts.length > 0) {
                    const admins = await getTenantAdminsWithTelegram(user.tenantId);
                    for (const admin of admins) {
                        notifyLowStockBatch(admin.telegramChatId, lowStockProducts);
                    }
                }
            }

            if (customer?.telegramChatId) {
                notifyCustomerOrderConfirmed(
                    user.tenantId,
                    { chatId: customer.telegramChatId, name: customer.name || 'Customer', id: (result as any).customerId },
                    {
                        id: (result as any).id,
                        orderNumber: (result as any).orderNumber,
                        total: Number((result as any).totalAmount),
                        currency: tenant?.currency || 'UZS',
                        itemCount: items?.length || 0
                    }
                );
            }
        } catch (err) {
            console.error('Telegram Notification Error:', err);
        }

        return { success: true, data: result };
    });

    // ----------------------------------------------------------------
    // GET ORDER DETAILS
    // ----------------------------------------------------------------
    fastify.get<{ Params: Static<typeof GetOrderParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && order.salesRepId !== user.id && order.createdByUserId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only view your own orders' } });
        }
        if (user.role === 'driver' && order.driverId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only view orders assigned to you' } });
        }

        const items = await db
            .select({
                id: schema.orderItems.id,
                productName: schema.products.name,
                sku: schema.products.sku,
                unitPrice: schema.orderItems.unitPrice,
                qtyOrdered: schema.orderItems.qtyOrdered,
                qtyDelivered: schema.orderItems.qtyDelivered,
                lineTotal: schema.orderItems.lineTotal,
            })
            .from(schema.orderItems)
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(eq(schema.orderItems.orderId, order.id));

        return { success: true, data: { ...order, items } };
    });

    // ----------------------------------------------------------------
    // UPDATE STATUS
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof GetOrderParamsSchema>; Body: UpdateStatusBody }>('/:id/status', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema,
            body: UpdateStatusBodySchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { status: newStatus, notes } = request.body;

        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to update order status' } });
        }

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        await db.transaction(async (tx) => {
            await tx
                .update(schema.orders)
                .set({
                    status: newStatus as any,
                    deliveredAt: newStatus === 'delivered' ? new Date() : (order.deliveredAt || undefined),
                    cancelledAt: newStatus === 'cancelled' ? new Date() : (order.cancelledAt || undefined),
                    updatedAt: new Date()
                })
                .where(eq(schema.orders.id, id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: id,
                fromStatus: order.status,
                toStatus: newStatus as any,
                changedBy: user.id,
                notes: notes,
            });
        });

        // --- TELEGRAM NOTIFICATIONS ---
        try {
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyOrderApproved,
                notifyOrderCancelled,
                notifyDeliveryCompleted,
                notifyOrderReturned,
                notifyCustomerOrderApproved,
                notifyCustomerOrderCancelled,
                notifyCustomerDelivered,
                notifyCustomerOutForDelivery,
                notifyCustomerReturned
            } = await import('../lib/telegram');

            // Fetch enriched order details for notifications
            const [orderDetail] = await db
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    total: schema.orders.totalAmount,
                    customerName: schema.customers.name,
                    customerChatId: schema.customers.telegramChatId,
                    driverName: schema.users.name,
                })
                .from(schema.orders)
                .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                .leftJoin(schema.users, eq(schema.orders.driverId, schema.users.id))
                .where(eq(schema.orders.id, id))
                .limit(1);

            // Fetch currency
            const [tenant] = await db
                .select({ currency: schema.tenants.currency })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            const currency = tenant?.currency || 'UZS';
            const admins = await getTenantAdminsWithTelegram(user.tenantId);
            const customerChatId = orderDetail?.customerChatId;
            const customerName = orderDetail?.customerName || 'Customer';
            const orderNumber = orderDetail?.orderNumber || '???';
            const total = Number(orderDetail?.total || 0);

            // Fetch item counts for detailed messages
            const [{ totalItems }] = await db
                .select({ totalItems: sql<number>`count(*)` })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, id));

            // Helper for Admin Broadcasts
            const broadcastAdmins = async (notifyFn: Function, payload: any) => {
                for (const admin of admins) {
                    await notifyFn(admin.telegramChatId, payload);
                }
            };

            // 1. ORDER APPROVED
            if (newStatus === 'approved') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderApproved');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderApproved, {
                        orderNumber, customerName, total, currency, approvedBy: user.name
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOrderApproved');
                    if (canSendCustomer) {
                        await notifyCustomerOrderApproved(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }
            }

            // 2. ORDER CANCELLED
            else if (newStatus === 'cancelled') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderCancelled');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderCancelled, {
                        orderNumber, customerName, total, currency, cancelledBy: user.name, reason: notes
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOrderCancelled');
                    if (canSendCustomer) {
                        await notifyCustomerOrderCancelled(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency, reason: notes
                        });
                    }
                }
            }

            // 3. OUT FOR DELIVERY (delivering)
            else if (newStatus === 'delivering') {
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOutForDelivery');
                    if (canSendCustomer) {
                        await notifyCustomerOutForDelivery(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, driverName: orderDetail?.driverName ?? undefined
                        });
                    }
                }
            }

            // 4. DELIVERED (Full)
            else if (newStatus === 'delivered') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderDelivered');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: Number(totalItems), totalItems: Number(totalItems), driverName: orderDetail?.driverName ?? undefined
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyDelivered');
                    if (canSendCustomer) {
                        await notifyCustomerDelivered(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }

                // Check if order is also fully paid -> Order Completed
                if (order.paymentStatus === 'paid') {
                    const { notifyOrderCompleted } = await import('../lib/telegram');
                    const { canSend: canSendCompleted } = await canSendTenantNotification(user.tenantId, 'notifyOrderCompleted');
                    if (canSendCompleted) {
                        await broadcastAdmins(notifyOrderCompleted, {
                            orderNumber, customerName, total, currency
                        });
                    }
                }
            }

            // 5. PARTIAL (Partial Delivery)
            else if (newStatus === 'partial') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderPartialDelivery');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: 1, totalItems: Number(totalItems),
                        driverName: orderDetail?.driverName ?? undefined
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyPartialDelivery');
                    if (canSendCustomer) {
                        await notifyCustomerDelivered(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }
            }

            // 6. RETURNED (Full/Partial)
            else if (newStatus === 'returned') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderReturned');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderReturned, {
                        orderNumber, customerName, returnedAmount: total, totalAmount: total, currency, reason: notes
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyReturned');
                    if (canSendCustomer) {
                        await notifyCustomerReturned(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, returnedAmount: total, currency
                        });
                    }
                }
            }

        } catch (e) {
            console.error('Telegram Notification Error:', e);
        }

        return { success: true, message: 'Status updated' };
    });

    // ----------------------------------------------------------------
    // CANCEL ORDER
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof GetOrderParamsSchema>; Body: CancelOrderBody }>('/:id/cancel', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema,
            body: CancelOrderBodySchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { reason } = request.body;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && order.createdByUserId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only cancel your own orders' } });
        }

        if (!order.status || !['pending', 'confirmed'].includes(order.status)) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: `Cannot cancel order with status: ${order.status}` } });
        }

        await db.transaction(async (tx) => {
            const items = await tx
                .select()
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));

            for (const item of items) {
                await tx
                    .update(schema.products)
                    .set({
                        reservedQuantity: sql`GREATEST(0, ${schema.products.reservedQuantity} - ${item.qtyOrdered})`,
                    })
                    .where(eq(schema.products.id, item.productId));
            }

            await tx
                .update(schema.customers)
                .set({
                    debtBalance: sql`GREATEST(0, ${schema.customers.debtBalance} - ${order.totalAmount})`,
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, order.customerId));

            await tx
                .update(schema.orders)
                .set({
                    status: 'cancelled',
                    updatedAt: new Date(),
                })
                .where(eq(schema.orders.id, order.id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'cancelled',
                changedBy: user.id,
                notes: reason || 'Order cancelled',
            });
        });

        return { success: true, message: 'Order cancelled successfully' };
    });
};
