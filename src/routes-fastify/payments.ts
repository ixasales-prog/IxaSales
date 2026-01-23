import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';

// Schemas
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
    amount: Type.Number({ minimum: 0 }),
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
    amount: Type.Number({ minimum: 0 }),
    referenceNumber: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
});

type ListPaymentsQuery = Static<typeof ListPaymentsQuerySchema>;
type CreatePaymentMethodBody = Static<typeof CreatePaymentMethodBodySchema>;
type CreatePaymentBody = Static<typeof CreatePaymentBodySchema>;
type SupplierPaymentsQuery = Static<typeof SupplierPaymentsQuerySchema>;
type CreateSupplierPaymentBody = Static<typeof CreateSupplierPaymentBodySchema>;

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
    // List payment methods
    fastify.get('/methods', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const methods = await db.select().from(schema.paymentMethods)
            .where(and(eq(schema.paymentMethods.tenantId, user.tenantId), eq(schema.paymentMethods.isActive, true)))
            .orderBy(schema.paymentMethods.name);
        return { success: true, data: methods };
    });

    // Create payment method
    fastify.post<{ Body: CreatePaymentMethodBody }>('/methods', {
        preHandler: [fastify.authenticate],
        schema: { body: CreatePaymentMethodBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const [method] = await db.insert(schema.paymentMethods).values({
            tenantId: user.tenantId, name: request.body.name, isActive: true,
        }).returning();
        return { success: true, data: method };
    });

    // List customer payments
    fastify.get<{ Querystring: ListPaymentsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListPaymentsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', customerId, orderId } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.payments.tenantId, user.tenantId)];
        if (customerId) conditions.push(eq(schema.payments.customerId, customerId));
        if (orderId) conditions.push(eq(schema.payments.orderId, orderId));
        if (user.role === 'sales_rep' || user.role === 'driver') {
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
            .limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.payments).where(and(...conditions));

        return { success: true, data: paymentsList, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create customer payment
    fastify.post<{ Body: CreatePaymentBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreatePaymentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep', 'driver'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (user.role === 'sales_rep') {
            const [customer] = await db.select({ createdByUserId: schema.customers.createdByUserId })
                .from(schema.customers).where(eq(schema.customers.id, body.customerId)).limit(1);
            if (!customer || customer.createdByUserId !== user.id) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            }
        }

        const paymentNumber = `PAY-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            const [payment] = await tx.insert(schema.payments).values({
                tenantId: user.tenantId, paymentNumber, customerId: body.customerId, orderId: body.orderId,
                paymentMethodId: body.paymentMethodId, amount: body.amount.toString(), collectedBy: user.id,
                referenceNumber: body.referenceNumber, notes: body.notes, collectedAt: new Date(),
            }).returning();

            if (body.orderId) {
                const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, body.orderId)).limit(1);
                if (order) {
                    const newPaidAmount = Number(order.paidAmount || 0) + body.amount;
                    const totalAmount = Number(order.totalAmount);
                    let paymentStatus = 'partial';
                    if (newPaidAmount >= totalAmount) paymentStatus = 'paid';
                    else if (newPaidAmount === 0) paymentStatus = 'unpaid';
                    await tx.update(schema.orders).set({ paidAmount: newPaidAmount.toString(), paymentStatus: paymentStatus as any })
                        .where(eq(schema.orders.id, body.orderId));
                }
            }

            const [customer] = await tx.select({ debtBalance: schema.customers.debtBalance, creditBalance: schema.customers.creditBalance })
                .from(schema.customers).where(eq(schema.customers.id, body.customerId)).limit(1);

            if (customer) {
                const currentDebt = Number(customer.debtBalance || 0);
                const currentCredit = Number(customer.creditBalance || 0);
                if (body.amount <= currentDebt) {
                    await tx.update(schema.customers).set({ debtBalance: (currentDebt - body.amount).toString(), updatedAt: new Date() })
                        .where(eq(schema.customers.id, body.customerId));
                } else {
                    const excessAmount = body.amount - currentDebt;
                    await tx.update(schema.customers).set({ debtBalance: '0', creditBalance: (currentCredit + excessAmount).toString(), updatedAt: new Date() })
                        .where(eq(schema.customers.id, body.customerId));
                }
            }
            return payment;
        });

        // Telegram notifications
        try {
            const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyPaymentReceived } = await import('../lib/telegram');
            const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyPaymentReceived');
            if (canSend) {
                const [customer] = await db.select({ name: schema.customers.name, telegramChatId: schema.customers.telegramChatId })
                    .from(schema.customers).where(eq(schema.customers.id, body.customerId)).limit(1);
                const [tenant] = await db.select({ currency: schema.tenants.currency })
                    .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);
                const currency = tenant?.currency || 'USD';
                const admins = await getTenantAdminsWithTelegram(user.tenantId);
                let orderNumber: string | undefined;
                if (body.orderId) {
                    const [orderInfo] = await db.select({ orderNumber: schema.orders.orderNumber })
                        .from(schema.orders).where(eq(schema.orders.id, body.orderId)).limit(1);
                    orderNumber = orderInfo?.orderNumber;
                }
                for (const admin of admins) {
                    notifyPaymentReceived(admin.telegramChatId, { amount: body.amount, currency, customerName: customer?.name || 'Unknown', orderNumber });
                }
            }
        } catch (e) { console.error('Telegram Notification Error:', e); }

        return { success: true, data: result };
    });

    // List supplier payments
    fastify.get<{ Querystring: SupplierPaymentsQuery }>('/suppliers', {
        preHandler: [fastify.authenticate],
        schema: { querystring: SupplierPaymentsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', supplierId, purchaseOrderId } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.supplierPayments.tenantId, user.tenantId)];
        if (supplierId) conditions.push(eq(schema.supplierPayments.supplierId, supplierId));
        if (purchaseOrderId) conditions.push(eq(schema.supplierPayments.purchaseOrderId, purchaseOrderId));

        const paymentsList = await db.select({
            id: schema.supplierPayments.id, paymentNumber: schema.supplierPayments.paymentNumber,
            supplierName: schema.suppliers.name, amount: schema.supplierPayments.amount,
            methodName: schema.paymentMethods.name, poNumber: schema.purchaseOrders.poNumber,
            paidAt: schema.supplierPayments.paidAt, paidBy: schema.users.name,
        }).from(schema.supplierPayments)
            .leftJoin(schema.suppliers, eq(schema.supplierPayments.supplierId, schema.suppliers.id))
            .leftJoin(schema.paymentMethods, eq(schema.supplierPayments.paymentMethodId, schema.paymentMethods.id))
            .leftJoin(schema.purchaseOrders, eq(schema.supplierPayments.purchaseOrderId, schema.purchaseOrders.id))
            .leftJoin(schema.users, eq(schema.supplierPayments.paidBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.supplierPayments.createdAt))
            .limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.supplierPayments).where(and(...conditions));

        return { success: true, data: paymentsList, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create supplier payment
    fastify.post<{ Body: CreateSupplierPaymentBody }>('/suppliers', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateSupplierPaymentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const paymentNumber = `SPAY-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            const [payment] = await tx.insert(schema.supplierPayments).values({
                tenantId: user.tenantId, paymentNumber, supplierId: body.supplierId, purchaseOrderId: body.purchaseOrderId,
                paymentMethodId: body.paymentMethodId, amount: body.amount.toString(), paidBy: user.id,
                referenceNumber: body.referenceNumber, notes: body.notes, paidAt: new Date(),
            }).returning();

            if (body.purchaseOrderId) {
                const [po] = await tx.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, body.purchaseOrderId)).limit(1);
                if (po) {
                    const newPaidAmount = Number(po.paidAmount || 0) + body.amount;
                    await tx.update(schema.purchaseOrders).set({ paidAmount: newPaidAmount.toString() })
                        .where(eq(schema.purchaseOrders.id, body.purchaseOrderId));
                }
            }
            return payment;
        });

        return { success: true, data: result };
    });
};
