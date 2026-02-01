import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';

// Schemas
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
    // List returns
    fastify.get<{ Querystring: ListReturnsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListReturnsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', orderId } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.returns.tenantId, user.tenantId)];
        if (orderId) conditions.push(eq(schema.returns.orderId, orderId));

        // Role-based filtering
        if (user.role === 'driver') {
            conditions.push(sql`${schema.returns.orderId} IN (SELECT id FROM ${schema.orders} WHERE ${schema.orders.tenantId} = ${user.tenantId} AND ${schema.orders.driverId} = ${user.id})`);
        } else if (user.role === 'sales_rep') {
            conditions.push(sql`${schema.returns.orderId} IN (SELECT id FROM ${schema.orders} WHERE ${schema.orders.tenantId} = ${user.tenantId} AND ${schema.orders.createdByUserId} = ${user.id})`);
        }

        const returns = await db.select({
            id: schema.returns.id, orderId: schema.returns.orderId, productName: schema.products.name,
            qtyReturned: schema.returns.qtyReturned, reason: schema.returns.reason, processedAt: schema.returns.processedAt,
            status: sql<string>`CASE WHEN ${schema.returns.processedAt} IS NOT NULL THEN 'processed' ELSE 'pending' END`,
        }).from(schema.returns)
            .leftJoin(schema.products, eq(schema.returns.productId, schema.products.id))
            .where(and(...conditions))
            .orderBy(desc(schema.returns.createdAt))
            .limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.returns).where(and(...conditions));
        return { success: true, data: returns, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create return
    fastify.post<{ Body: CreateReturnBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateReturnBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver', 'sales_rep'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const body = request.body;
        const [returnRecord] = await db.insert(schema.returns).values({
            tenantId: user.tenantId, orderId: body.orderId, orderItemId: body.orderItemId,
            productId: body.productId, qtyReturned: body.qtyReturned, reason: body.reason as any, reasonNotes: body.reasonNotes,
        }).returning();

        return { success: true, data: returnRecord };
    });

    // Process return
    fastify.patch<{ Params: Static<typeof ReturnIdParamsSchema>; Body: ProcessReturnBody }>('/:id/process', {
        preHandler: [fastify.authenticate],
        schema: { params: ReturnIdParamsSchema, body: ProcessReturnBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const body = request.body;

        try {
            const result = await db.transaction(async (tx) => {
                const [returnRecord] = await tx.select().from(schema.returns)
                    .where(and(eq(schema.returns.id, id), eq(schema.returns.tenantId, user.tenantId))).limit(1);
                if (!returnRecord) throw new Error('Return not found');

                const [updatedReturn] = await tx.update(schema.returns).set({
                    condition: body.condition as any, restock: body.restock, refundAmount: body.refundAmount?.toString(),
                    processedBy: user.id, processedAt: new Date(), updatedAt: new Date(),
                }).where(eq(schema.returns.id, id)).returning();

                // Handle refund
                if (body.refundAmount && body.refundAmount > 0) {
                    const [order] = await tx.select({ id: schema.orders.id, customerId: schema.orders.customerId, totalAmount: schema.orders.totalAmount })
                        .from(schema.orders).where(eq(schema.orders.id, returnRecord.orderId)).limit(1);
                    if (order) {
                        const newTotal = Math.max(0, Number(order.totalAmount) - body.refundAmount);
                        await tx.update(schema.orders).set({ totalAmount: newTotal.toString(), updatedAt: new Date() }).where(eq(schema.orders.id, order.id));

                        const [customer] = await tx.select({ creditBalance: schema.customers.creditBalance })
                            .from(schema.customers).where(eq(schema.customers.id, order.customerId)).limit(1);
                        if (customer) {
                            const newCredit = Number(customer.creditBalance || 0) + body.refundAmount;
                            await tx.update(schema.customers).set({ creditBalance: newCredit.toString(), updatedAt: new Date() })
                                .where(eq(schema.customers.id, order.customerId));
                        }
                    }
                }

                // Handle restock
                if (body.restock && returnRecord.productId) {
                    const [product] = await tx.select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products).where(eq(schema.products.id, returnRecord.productId)).limit(1);
                    if (product) {
                        const quantityBefore = product.stockQuantity || 0;
                        const quantityAfter = quantityBefore + returnRecord.qtyReturned;
                        await tx.update(schema.products).set({ stockQuantity: quantityAfter }).where(eq(schema.products.id, returnRecord.productId));
                        await tx.insert(schema.stockMovements).values({
                            tenantId: user.tenantId, productId: returnRecord.productId, movementType: 'return',
                            quantity: returnRecord.qtyReturned, quantityBefore, quantityAfter,
                            referenceType: 'return', referenceId: returnRecord.id, createdBy: user.id, notes: `Return processed: ${body.condition}`,
                        });
                    }
                }

                return updatedReturn;
            });

            // Telegram notification
            try {
                const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyReturnProcessed } = await import('../lib/telegram');
                const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyOrderReturned');
                if (canSend) {
                    const orderInfo = await db.select({
                        orderNumber: schema.orders.orderNumber, customerName: schema.customers.name, currency: schema.tenants.currency,
                    }).from(schema.orders)
                        .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                        .leftJoin(schema.tenants, eq(schema.orders.tenantId, schema.tenants.id))
                        .where(eq(schema.orders.id, result.orderId)).limit(1);
                    if (orderInfo.length > 0) {
                        const admins = await getTenantAdminsWithTelegram(user.tenantId);
                        for (const admin of admins) {
                            notifyReturnProcessed(admin.telegramChatId, {
                                orderNumber: orderInfo[0].orderNumber, customerName: orderInfo[0].customerName || 'Unknown',
                                amount: body.refundAmount || 0, currency: orderInfo[0].currency || 'USD', reason: result.reason || undefined,
                            });
                        }
                    }
                }
            } catch (e) { console.error('Telegram Notification Error:', e); }

            return { success: true, data: result };
        } catch (error: any) {
            if (error.message === 'Return not found') return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            throw error;
        }
    });
};
