import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { generateNumber } from '../lib/password'; // Using as a helper for random string if needed, or I'll generic

export const orderRoutes = new Elysia({ prefix: '/orders' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // ORDERS CRUD
    // ----------------------------------------------------------------

    // List orders
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, search, status, paymentStatus, customerId, startDate, endDate } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];

        if (search) {
            conditions.push(sql`${schema.orders.orderNumber} ILIKE ${`%${search}%`}`);
        }
        if (status) {
            if (status.includes(',')) {
                conditions.push(inArray(schema.orders.status, status.split(',')));
            } else {
                conditions.push(eq(schema.orders.status, status));
            }
        }
        if (paymentStatus) conditions.push(eq(schema.orders.paymentStatus, paymentStatus));
        if (customerId) conditions.push(eq(schema.orders.customerId, customerId));

        // Date range filter
        if (startDate) conditions.push(sql`${schema.orders.createdAt} >= ${new Date(startDate).toISOString()}`);
        if (endDate) conditions.push(sql`${schema.orders.createdAt} <= ${new Date(endDate).toISOString()}`);

        // Role restrictions - sales_rep sees orders they created
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

        // Transform to match frontend expected structure
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
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            search: t.Optional(t.String()),
            status: t.Optional(t.String()),
            paymentStatus: t.Optional(t.String()),
            customerId: t.Optional(t.String()),
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
        })
    })

    // Create order
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Check plan limits for orders this month
        const { canCreateOrder } = await import('../lib/planLimits');
        const limitCheck = await canCreateOrder(user.tenantId);
        if (!limitCheck.allowed) {
            set.status = 403;
            return {
                success: false,
                error: {
                    code: 'LIMIT_EXCEEDED',
                    message: `Monthly order limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                }
            };
        }

        // Only sales reps, tenant admins, super admins can create orders?
        // Maybe customer users too in future (portal)

        const { items, ...orderData } = body;

        // Transaction
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

            // 2. Check ownership - 403 Forbidden
            if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
                return { error: { code: 'FORBIDDEN', message: 'You can only create orders for customers you created', status: 403 } };
            }

            // 3. Validate credit/tier limits - 400 Bad Request
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

            // 4. Validate stock with row locking to prevent race conditions
            if (items && items.length > 0) {
                for (const item of items) {
                    // Use FOR UPDATE to lock the row during transaction
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

                    // Validate price hasn't changed (cart price protection)
                    const currentPrice = Number(product.price);
                    if (Math.abs(currentPrice - item.unitPrice) > 0.01) {
                        return { error: { code: 'PRICE_CHANGED', message: `Price for ${product.name} has changed. Please refresh your cart.`, status: 400 } };
                    }
                }
            }

            // 3. Generate Order Number with UUID suffix to prevent collisions
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

            // Format: PREFIX + SEQUENCE + HHMM (e.g. i011430)
            // Use tenant's timezone for the time portion
            const now = new Date();

            // Format time using tenant's timezone
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
                // Fallback to UTC if timezone is invalid
                timeStr = now.toISOString().slice(11, 16).replace(':', '');
            }

            // Get count of orders created today by this tenant to generate sequence
            // Use tenant timezone for "start of day" calculation
            let startOfDay: Date;
            try {
                const dayFormatter = new Intl.DateTimeFormat('en-CA', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: timezone,
                });
                const localDateStr = dayFormatter.format(now); // YYYY-MM-DD in tenant timezone
                startOfDay = new Date(`${localDateStr}T00:00:00`);
                // Convert back to UTC for database query
                const offsetFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    timeZoneName: 'shortOffset',
                });
                // Parse the offset to adjust startOfDay properly
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

            // 4. Create Order
            const [order] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: user.tenantId,
                    orderNumber,
                    customerId: orderData.customerId,
                    salesRepId: user.role === 'sales_rep' ? user.id : orderData.salesRepId,
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

            // 5. Create Order Items and reserve stock
            if (items && items.length > 0) {
                await tx.insert(schema.orderItems).values(
                    items.map((item: any) => ({
                        orderId: order.id,
                        productId: item.productId,
                        unitPrice: item.unitPrice.toString(),
                        qtyOrdered: item.qtyOrdered,
                        qtyPicked: 0,
                        qtyDelivered: 0,
                        lineTotal: item.lineTotal.toString(),
                    }))
                );

                // Reserve stock for each item
                for (const item of items) {
                    await tx
                        .update(schema.products)
                        .set({
                            reservedQuantity: sql`${schema.products.reservedQuantity} + ${item.qtyOrdered}`,
                        })
                        .where(eq(schema.products.id, item.productId));
                }
            }

            // 6. Update customer debt balance
            const currentDebt = Number(customer.debtBalance || 0);
            await tx
                .update(schema.customers)
                .set({
                    debtBalance: (currentDebt + orderData.totalAmount).toString(),
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, orderData.customerId));

            // 7. Log Status History
            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                toStatus: 'pending',
                changedBy: user.id,
                notes: 'Order created',
            });

            return order;
        });

        // Handle validation errors returned from transaction
        if (result && 'error' in result) {
            set.status = result.error.status;
            return { success: false, error: { code: result.error.code, message: result.error.message } };
        }

        // --- TELEGRAM NOTIFICATIONS ---
        try {
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyNewOrder,
                notifyLowStock
            } = await import('../lib/telegram');

            // Get customer name and telegram chat ID
            const [customer] = await db
                .select({
                    name: schema.customers.name,
                    telegramChatId: schema.customers.telegramChatId
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, result.customerId));

            // Get tenant currency
            const [tenant] = await db
                .select({ currency: schema.tenants.currency })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            // 1. New Order Notification
            const orderCheck = await canSendTenantNotification(user.tenantId, 'notifyNewOrder');
            if (orderCheck.canSend) {
                const admins = await getTenantAdminsWithTelegram(user.tenantId);
                for (const admin of admins) {
                    notifyNewOrder(admin.telegramChatId, {
                        orderNumber: result.orderNumber,
                        customerName: customer?.name || 'Unknown Customer',
                        total: Number(result.totalAmount),
                        currency: tenant?.currency || 'UZS'
                    });
                }
            }

            // 2. Low Stock Notification (batched - one message for all low stock products)
            const stockCheck = await canSendTenantNotification(user.tenantId, 'notifyLowStock');
            if (stockCheck.canSend && items && items.length > 0) {
                const { notifyLowStockBatch } = await import('../lib/telegram');

                const productIds = items.map((i: any) => i.productId);
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

                // Collect all low stock products
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

                // Send ONE consolidated notification
                if (lowStockProducts.length > 0) {
                    const admins = await getTenantAdminsWithTelegram(user.tenantId);
                    for (const admin of admins) {
                        notifyLowStockBatch(admin.telegramChatId, lowStockProducts);
                    }
                }
            }

            // 3. Customer Order Confirmation Notification
            if (customer?.telegramChatId) {
                const { notifyCustomerOrderConfirmed } = await import('../lib/telegram');
                notifyCustomerOrderConfirmed(
                    user.tenantId,
                    { chatId: customer.telegramChatId, name: customer.name || 'Customer', id: result.customerId },
                    {
                        id: result.id,
                        orderNumber: result.orderNumber,
                        total: Number(result.totalAmount),
                        currency: tenant?.currency || 'UZS',
                        itemCount: items?.length || 0
                    }
                );
            }
        } catch (err) {
            console.error('Telegram Notification Error:', err);
        }

        return { success: true, data: result };
    }, {
        body: t.Object({
            customerId: t.String(),
            salesRepId: t.Optional(t.String()),
            subtotalAmount: t.Number({ minimum: 0 }),
            discountAmount: t.Optional(t.Number({ minimum: 0 })),
            taxAmount: t.Optional(t.Number({ minimum: 0 })),
            totalAmount: t.Number({ minimum: 0 }),
            notes: t.Optional(t.String()),
            requestedDeliveryDate: t.Optional(t.String()),
            items: t.Array(t.Object({
                productId: t.String(),
                unitPrice: t.Number({ minimum: 0 }),
                qtyOrdered: t.Number({ minimum: 1 }),
                lineTotal: t.Number({ minimum: 0 }),
            })),
        })
    })

    // Get order details
    .get('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, params.id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Role-based access check
        if (user.role === 'sales_rep' && order.salesRepId !== user.id && order.createdByUserId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only view your own orders' } };
        }
        if (user.role === 'driver' && order.driverId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only view orders assigned to you' } };
        }

        // Get items
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
    }, {
        params: t.Object({ id: t.String() })
    })

    // Update order status
    .patch('/:id/status', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only certain roles can update status
        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver'];
        if (!allowedRoles.includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to update order status' } };
        }

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, params.id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        const newStatus = body.status;

        await db.transaction(async (tx) => {
            // Update Order
            await tx
                .update(schema.orders)
                .set({
                    status: newStatus as any,
                    // Set specific timestamps based on status
                    deliveredAt: newStatus === 'delivered' ? new Date() : (order.deliveredAt || undefined),
                    cancelledAt: newStatus === 'cancelled' ? new Date() : (order.cancelledAt || undefined),
                    updatedAt: new Date()
                })
                .where(eq(schema.orders.id, params.id));

            // Log History
            await tx.insert(schema.orderStatusHistory).values({
                orderId: params.id,
                fromStatus: order.status,
                toStatus: newStatus,
                changedBy: user.id,
                notes: body.notes,
            });
        });

        // --- TELEGRAM NOTIFICATIONS ---
        try {
            // Lazy load required functions
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyOrderApproved,
                notifyOrderCancelled,
                notifyDeliveryCompleted,
                notifyOrderReturned,
                // Customer notifs
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
                .where(eq(schema.orders.id, params.id))
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
                .where(eq(schema.orderItems.orderId, params.id));

            // Helper for Admin Broadcasts
            const broadcastAdmins = async (notifyFn: Function, payload: any) => {
                for (const admin of admins) {
                    await notifyFn(admin.telegramChatId, payload);
                }
            };

            // 1. ORDER APPROVED
            if (newStatus === 'approved') {
                // Admin
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderApproved');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderApproved, {
                        orderNumber, customerName, total, currency, approvedBy: user.name
                    });
                }
                // Customer
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
                // Admin
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderCancelled');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderCancelled, {
                        orderNumber, customerName, total, currency, cancelledBy: user.name, reason: body.notes
                    });
                }
                // Customer
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOrderCancelled');
                    if (canSendCustomer) {
                        await notifyCustomerOrderCancelled(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency, reason: body.notes
                        });
                    }
                }
            }

            // 3. OUT FOR DELIVERY (delivering)
            else if (newStatus === 'delivering') {
                // Customer notification
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
                // Admin
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderDelivered');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: Number(totalItems), totalItems: Number(totalItems), driverName: orderDetail?.driverName ?? undefined
                    });
                }
                // Customer
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
                // Admin
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderPartialDelivery');
                if (canSendAdmin) {
                    // Use Delivered template with isPartial logic (template handles partial display)
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: 1, totalItems: Number(totalItems),
                        driverName: orderDetail?.driverName ?? undefined
                    });
                }
                // Customer
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
                        orderNumber, customerName, returnedAmount: total, totalAmount: total, currency, reason: body.notes
                    });
                }
                // Customer
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
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            status: t.String(),
            notes: t.Optional(t.String()),
        })
    })

    // Cancel order (sales_rep can cancel their pending orders)
    .patch('/:id/cancel', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, params.id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Sales rep can only cancel their own orders
        if (user.role === 'sales_rep' && order.createdByUserId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only cancel your own orders' } };
        }

        // Can only cancel pending or confirmed orders
        if (!order.status || !['pending', 'confirmed'].includes(order.status)) {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_STATUS', message: `Cannot cancel order with status: ${order.status}` } };
        }

        await db.transaction(async (tx) => {
            // 1. Get order items to release stock
            const items = await tx
                .select()
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));

            // 2. Release reserved stock for each item
            for (const item of items) {
                await tx
                    .update(schema.products)
                    .set({
                        reservedQuantity: sql`GREATEST(0, ${schema.products.reservedQuantity} - ${item.qtyOrdered})`,
                    })
                    .where(eq(schema.products.id, item.productId));
            }

            // 3. Decrease customer debt
            await tx
                .update(schema.customers)
                .set({
                    debtBalance: sql`GREATEST(0, ${schema.customers.debtBalance} - ${order.totalAmount})`,
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, order.customerId));

            // 4. Update order status
            await tx
                .update(schema.orders)
                .set({
                    status: 'cancelled',
                    updatedAt: new Date(),
                })
                .where(eq(schema.orders.id, order.id));

            // 5. Log status history
            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'cancelled',
                changedBy: user.id,
                notes: body.reason || 'Order cancelled',
            });
        });

        return { success: true, message: 'Order cancelled successfully' };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            reason: t.Optional(t.String()),
        })
    });
