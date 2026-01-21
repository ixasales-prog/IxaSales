import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const paymentRoutes = new Elysia({ prefix: '/payments' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // PAYMENT METHODS
    // ----------------------------------------------------------------

    // List payment methods
    .get('/methods', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const methods = await db
            .select()
            .from(schema.paymentMethods)
            .where(and(eq(schema.paymentMethods.tenantId, user.tenantId), eq(schema.paymentMethods.isActive, true)))
            .orderBy(schema.paymentMethods.name);

        return { success: true, data: methods };
    })

    // Create payment method
    .post('/methods', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [method] = await db
            .insert(schema.paymentMethods)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                isActive: true,
            })
            .returning();

        return { success: true, data: method };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
        })
    })

    // ----------------------------------------------------------------
    // CUSTOMER PAYMENTS
    // ----------------------------------------------------------------

    // List customer payments
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, customerId, orderId } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.payments.tenantId, user.tenantId)];

        if (customerId) conditions.push(eq(schema.payments.customerId, customerId));
        if (orderId) conditions.push(eq(schema.payments.orderId, orderId));

        // Role restrictions - sales_rep and driver can only see payments they collected
        if (user.role === 'sales_rep' || user.role === 'driver') {
            conditions.push(eq(schema.payments.collectedBy, user.id));
        }

        const paymentsList = await db
            .select({
                id: schema.payments.id,
                paymentNumber: schema.payments.paymentNumber,
                customerName: schema.customers.name,
                amount: schema.payments.amount,
                methodName: schema.paymentMethods.name,
                orderNumber: schema.orders.orderNumber,
                collectedAt: schema.payments.collectedAt,
                collectedBy: schema.users.name,
            })
            .from(schema.payments)
            .leftJoin(schema.customers, eq(schema.payments.customerId, schema.customers.id))
            .leftJoin(schema.paymentMethods, eq(schema.payments.paymentMethodId, schema.paymentMethods.id))
            .leftJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
            .leftJoin(schema.users, eq(schema.payments.collectedBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.payments.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.payments)
            .where(and(...conditions));

        return {
            success: true,
            data: paymentsList,
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
            customerId: t.Optional(t.String()),
            orderId: t.Optional(t.String()),
        })
    })

    // Create customer payment
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Sales rep, driver, admin can collect
        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep', 'driver'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Sales rep can only collect for customers they created
        if (user.role === 'sales_rep') {
            const [customer] = await db
                .select({ createdByUserId: schema.customers.createdByUserId })
                .from(schema.customers)
                .where(eq(schema.customers.id, body.customerId))
                .limit(1);

            if (!customer || customer.createdByUserId !== user.id) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'You can only collect payments for customers you created' } };
            }
        }

        const paymentNumber = `PAY-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            // 1. Create Payment
            const [payment] = await tx
                .insert(schema.payments)
                .values({
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
                })
                .returning();

            // 2. Update Order Paid Amount
            if (body.orderId) {
                const [order] = await tx
                    .select()
                    .from(schema.orders)
                    .where(eq(schema.orders.id, body.orderId))
                    .limit(1);

                if (order) {
                    const newPaidAmount = Number(order.paidAmount || 0) + body.amount;
                    const totalAmount = Number(order.totalAmount);

                    let paymentStatus = 'partial';
                    if (newPaidAmount >= totalAmount) paymentStatus = 'paid';
                    else if (newPaidAmount === 0) paymentStatus = 'unpaid';

                    await tx
                        .update(schema.orders)
                        .set({
                            paidAmount: newPaidAmount.toString(),
                            paymentStatus: paymentStatus as any,
                        })
                        .where(eq(schema.orders.id, body.orderId));
                }
            }

            // 3. Update Customer Debt Balance
            const [customer] = await tx
                .select({
                    debtBalance: schema.customers.debtBalance,
                    creditBalance: schema.customers.creditBalance,
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, body.customerId))
                .limit(1);

            if (customer) {
                const currentDebt = Number(customer.debtBalance || 0);
                const currentCredit = Number(customer.creditBalance || 0);

                if (body.amount <= currentDebt) {
                    // Payment reduces debt
                    await tx
                        .update(schema.customers)
                        .set({
                            debtBalance: (currentDebt - body.amount).toString(),
                            updatedAt: new Date(),
                        })
                        .where(eq(schema.customers.id, body.customerId));
                } else {
                    // Payment exceeds debt - clear debt and add remaining to credit
                    const excessAmount = body.amount - currentDebt;
                    await tx
                        .update(schema.customers)
                        .set({
                            debtBalance: '0',
                            creditBalance: (currentCredit + excessAmount).toString(),
                            updatedAt: new Date(),
                        })
                        .where(eq(schema.customers.id, body.customerId));
                }
            }

            return payment;
        });

        // --- TELEGRAM NOTIFICATION ---
        try {
            const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyPaymentReceived } = await import('../lib/telegram');
            const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyPaymentReceived');

            if (canSend) {
                // Get customer name, chatID, and updated balance for notification
                const [customer] = await db
                    .select({
                        name: schema.customers.name,
                        telegramChatId: schema.customers.telegramChatId,
                        debtBalance: schema.customers.debtBalance,
                        creditBalance: schema.customers.creditBalance,
                    })
                    .from(schema.customers)
                    .where(eq(schema.customers.id, body.customerId))
                    .limit(1);

                // Get tenant currency
                const [tenant] = await db
                    .select({ currency: schema.tenants.currency })
                    .from(schema.tenants)
                    .where(eq(schema.tenants.id, user.tenantId))
                    .limit(1);

                const currency = tenant?.currency || 'USD';

                // 1. Notify Admins
                const admins = await getTenantAdminsWithTelegram(user.tenantId);

                // Get order number if orderId is present
                let orderNumber: string | undefined;
                if (body.orderId) {
                    const [orderInfo] = await db
                        .select({ orderNumber: schema.orders.orderNumber })
                        .from(schema.orders)
                        .where(eq(schema.orders.id, body.orderId))
                        .limit(1);
                    orderNumber = orderInfo?.orderNumber;
                }

                for (const admin of admins) {
                    notifyPaymentReceived(admin.telegramChatId, {
                        amount: body.amount,
                        currency: currency,
                        customerName: customer?.name || 'Unknown',
                        orderNumber: orderNumber,
                    });
                }

                // 2. Notify Customer
                if (customer?.telegramChatId) {
                    const { notifyCustomerPaymentReceived } = await import('../lib/telegram');
                    // Calculate remaining balance roughly (debt - credit)
                    const remainingBalance = Number(customer.debtBalance || 0) > 0
                        ? Number(customer.debtBalance || 0)
                        : -Number(customer.creditBalance || 0);

                    notifyCustomerPaymentReceived(
                        user.tenantId,
                        { chatId: customer.telegramChatId, name: customer.name },
                        {
                            amount: body.amount,
                            currency: currency,
                            remainingBalance: remainingBalance
                        }
                    );
                }

                // 3. Check if order is now fully paid AND already delivered -> Order Completed
                if (body.orderId) {
                    const [updatedOrder] = await db
                        .select({
                            status: schema.orders.status,
                            paymentStatus: schema.orders.paymentStatus,
                            orderNumber: schema.orders.orderNumber,
                            totalAmount: schema.orders.totalAmount,
                            customerName: schema.customers.name,
                        })
                        .from(schema.orders)
                        .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                        .where(eq(schema.orders.id, body.orderId))
                        .limit(1);

                    if (updatedOrder?.status === 'delivered' && updatedOrder?.paymentStatus === 'paid') {
                        const { notifyOrderCompleted, canSendTenantNotification: checkCompleted } = await import('../lib/telegram');
                        const { canSend: canSendCompleted } = await checkCompleted(user.tenantId, 'notifyOrderCompleted');
                        if (canSendCompleted) {
                            for (const admin of admins) {
                                notifyOrderCompleted(admin.telegramChatId, {
                                    orderNumber: updatedOrder.orderNumber,
                                    customerName: updatedOrder.customerName || 'Unknown',
                                    total: Number(updatedOrder.totalAmount),
                                    currency: currency
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('Telegram Notification Error:', e); }

        return { success: true, data: result };
    }, {
        body: t.Object({
            customerId: t.String(),
            orderId: t.Optional(t.String()),
            paymentMethodId: t.String(),
            amount: t.Number({ minimum: 0 }),
            referenceNumber: t.Optional(t.String()),
            notes: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // SUPPLIER PAYMENTS
    // ----------------------------------------------------------------

    // List supplier payments
    .get('/suppliers', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, supplierId, purchaseOrderId } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.supplierPayments.tenantId, user.tenantId)];

        if (supplierId) conditions.push(eq(schema.supplierPayments.supplierId, supplierId));
        if (purchaseOrderId) conditions.push(eq(schema.supplierPayments.purchaseOrderId, purchaseOrderId));

        const paymentsList = await db
            .select({
                id: schema.supplierPayments.id,
                paymentNumber: schema.supplierPayments.paymentNumber,
                supplierName: schema.suppliers.name,
                amount: schema.supplierPayments.amount,
                methodName: schema.paymentMethods.name,
                poNumber: schema.purchaseOrders.poNumber,
                paidAt: schema.supplierPayments.paidAt,
                paidBy: schema.users.name,
            })
            .from(schema.supplierPayments)
            .leftJoin(schema.suppliers, eq(schema.supplierPayments.supplierId, schema.suppliers.id))
            .leftJoin(schema.paymentMethods, eq(schema.supplierPayments.paymentMethodId, schema.paymentMethods.id))
            .leftJoin(schema.purchaseOrders, eq(schema.supplierPayments.purchaseOrderId, schema.purchaseOrders.id))
            .leftJoin(schema.users, eq(schema.supplierPayments.paidBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.supplierPayments.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.supplierPayments)
            .where(and(...conditions));

        return {
            success: true,
            data: paymentsList,
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    }, {
        query: t.Object({
            page: t.Optional(t.Number({ minimum: 1, default: 1 })),
            limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
            supplierId: t.Optional(t.String()),
            purchaseOrderId: t.Optional(t.String()),
        })
    })

    // Create supplier payment
    .post('/suppliers', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only admin/supervisor
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const paymentNumber = `SPAY-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            // 1. Create Payment
            const [payment] = await tx
                .insert(schema.supplierPayments)
                .values({
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
                })
                .returning();

            // 2. Update PO Paid Amount
            if (body.purchaseOrderId) {
                const [po] = await tx
                    .select()
                    .from(schema.purchaseOrders)
                    .where(eq(schema.purchaseOrders.id, body.purchaseOrderId))
                    .limit(1);

                if (po) {
                    const newPaidAmount = Number(po.paidAmount || 0) + body.amount;
                    // Currently no payment_status enum on PO, just amounts?
                    // Checking schema... Purchase Orders has status (draft, ordered, received) but maybe not payment status explicitly?
                    // Schema has `paidAmount`.

                    await tx
                        .update(schema.purchaseOrders)
                        .set({
                            paidAmount: newPaidAmount.toString()
                        })
                        .where(eq(schema.purchaseOrders.id, body.purchaseOrderId));
                }
            }

            return payment;
        });

        return { success: true, data: result };
    }, {
        body: t.Object({
            supplierId: t.String(),
            purchaseOrderId: t.Optional(t.String()),
            paymentMethodId: t.String(),
            amount: t.Number({ minimum: 0 }),
            referenceNumber: t.Optional(t.String()),
            notes: t.Optional(t.String()),
        })
    });
