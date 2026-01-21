import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const returnRoutes = new Elysia({ prefix: '/returns' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // RETURNS CRUD
    // ----------------------------------------------------------------

    // List returns
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, orderId } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.returns.tenantId, user.tenantId)];

        if (orderId) conditions.push(eq(schema.returns.orderId, orderId));

        // Role-based filtering - drivers and sales_rep see returns for their orders only
        // Using subquery for efficiency instead of fetching orders first (N+1 pattern)
        if (user.role === 'driver') {
            conditions.push(
                sql`${schema.returns.orderId} IN (
                    SELECT id FROM ${schema.orders} 
                    WHERE ${schema.orders.tenantId} = ${user.tenantId} 
                    AND ${schema.orders.driverId} = ${user.id}
                )`
            );
        } else if (user.role === 'sales_rep') {
            conditions.push(
                sql`${schema.returns.orderId} IN (
                    SELECT id FROM ${schema.orders} 
                    WHERE ${schema.orders.tenantId} = ${user.tenantId} 
                    AND ${schema.orders.createdByUserId} = ${user.id}
                )`
            );
        }

        const returns = await db
            .select({
                id: schema.returns.id,
                orderId: schema.returns.orderId,
                productName: schema.products.name,
                qtyReturned: schema.returns.qtyReturned,
                reason: schema.returns.reason,
                processedAt: schema.returns.processedAt,
                status: sql<string>`CASE WHEN ${schema.returns.processedAt} IS NOT NULL THEN 'processed' ELSE 'pending' END`,
            })
            .from(schema.returns)
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
            orderId: t.Optional(t.String()),
        })
    })

    // Create return
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only specific roles can create returns
        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver', 'sales_rep'];
        if (!allowedRoles.includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to create returns' } };
        }

        const [returnRecord] = await db
            .insert(schema.returns)
            .values({
                tenantId: user.tenantId,
                orderId: body.orderId,
                orderItemId: body.orderItemId,
                productId: body.productId,
                qtyReturned: body.qtyReturned,
                reason: body.reason,
                reasonNotes: body.reasonNotes,
            })
            .returning();

        return { success: true, data: returnRecord };
    }, {
        body: t.Object({
            orderId: t.String(),
            orderItemId: t.String(),
            productId: t.String(),
            qtyReturned: t.Number({ minimum: 1 }),
            reason: t.String(), // enum
            reasonNotes: t.Optional(t.String()),
        })
    })

    // Process return (Admin/Warehouse)
    .patch('/:id/process', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const result = await db.transaction(async (tx) => {
            // 1. Get the return record
            const [returnRecord] = await tx
                .select()
                .from(schema.returns)
                .where(and(eq(schema.returns.id, params.id), eq(schema.returns.tenantId, user.tenantId)))
                .limit(1);

            if (!returnRecord) {
                throw new Error('Return not found');
            }

            // 2. Update return record
            const [updatedReturn] = await tx
                .update(schema.returns)
                .set({
                    condition: body.condition,
                    restock: body.restock,
                    refundAmount: body.refundAmount?.toString(),
                    processedBy: user.id,
                    processedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(schema.returns.id, params.id))
                .returning();

            // 3. If refund amount specified, update order and customer balances
            if (body.refundAmount && body.refundAmount > 0) {
                // Get order to find customer
                const [order] = await tx
                    .select({
                        id: schema.orders.id,
                        customerId: schema.orders.customerId,
                        totalAmount: schema.orders.totalAmount,
                        paidAmount: schema.orders.paidAmount,
                    })
                    .from(schema.orders)
                    .where(eq(schema.orders.id, returnRecord.orderId))
                    .limit(1);

                if (order) {
                    // Reduce order total by refund amount
                    const newTotal = Math.max(0, Number(order.totalAmount) - body.refundAmount);
                    await tx
                        .update(schema.orders)
                        .set({
                            totalAmount: newTotal.toString(),
                            updatedAt: new Date(),
                        })
                        .where(eq(schema.orders.id, order.id));

                    // Update customer - add refund to credit balance
                    const [customer] = await tx
                        .select({ creditBalance: schema.customers.creditBalance })
                        .from(schema.customers)
                        .where(eq(schema.customers.id, order.customerId))
                        .limit(1);

                    if (customer) {
                        const newCredit = Number(customer.creditBalance || 0) + body.refundAmount;
                        await tx
                            .update(schema.customers)
                            .set({
                                creditBalance: newCredit.toString(),
                                updatedAt: new Date(),
                            })
                            .where(eq(schema.customers.id, order.customerId));
                    }
                }
            }

            // 4. If restock is true, add quantity back to inventory
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

                    // Log stock movement
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

            return updatedReturn;
        });

        // --- TELEGRAM NOTIFICATION ---
        try {
            const { canSendTenantNotification, getTenantAdminsWithTelegram, notifyReturnProcessed } = await import('../lib/telegram');
            const { canSend } = await canSendTenantNotification(user.tenantId, 'notifyOrderReturned');

            if (canSend) {
                // Get order and customer info for notification
                const orderInfo = await db
                    .select({
                        orderNumber: schema.orders.orderNumber,
                        customerName: schema.customers.name,
                        currency: schema.tenants.currency,
                    })
                    .from(schema.orders)
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
        } catch (e) { console.error('Telegram Notification Error:', e); }

        return { success: true, data: result };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            condition: t.String(), // enum
            restock: t.Boolean(),
            refundAmount: t.Optional(t.Number({ minimum: 0 })),
        })
    });
