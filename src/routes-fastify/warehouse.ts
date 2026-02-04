import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { and, desc, eq, inArray, sql, or } from 'drizzle-orm';

const ListTasksQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    status: Type.Optional(Type.String())
});

const TaskIdParamsSchema = Type.Object({ id: Type.String() });

const ListReceivingQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    status: Type.Optional(Type.String())
});

const ReceivingIdParamsSchema = Type.Object({ id: Type.String() });

const ListInventoryQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String())
});

const InventoryIdParamsSchema = Type.Object({ id: Type.String() });

type ListTasksQuery = Static<typeof ListTasksQuerySchema>;

type ListReceivingQuery = Static<typeof ListReceivingQuerySchema>;

type ListInventoryQuery = Static<typeof ListInventoryQuerySchema>;

const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse'];

export const warehouseRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Querystring: ListTasksQuery }>('/tasks', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListTasksQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { page: pageStr = '1', limit: limitStr = '20', status } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];
        if (status) {
            conditions.push(eq(schema.orders.status, status as any));
        } else {
            conditions.push(inArray(schema.orders.status, ['approved', 'picking', 'picked', 'loaded'] as any));
        }

        const tasks = await db.select({
            id: schema.orders.id,
            orderNumber: schema.orders.orderNumber,
            status: schema.orders.status,
            requestedDeliveryDate: schema.orders.requestedDeliveryDate,
            customerName: schema.customers.name,
            createdAt: schema.orders.createdAt,
        }).from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(...conditions))
            .orderBy(desc(schema.orders.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.orders)
            .where(and(...conditions));

        return { success: true, data: tasks, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    fastify.get<{ Params: Static<typeof TaskIdParamsSchema> }>('/tasks/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: TaskIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const [order] = await db.select({
            id: schema.orders.id,
            orderNumber: schema.orders.orderNumber,
            status: schema.orders.status,
            requestedDeliveryDate: schema.orders.requestedDeliveryDate,
            customerName: schema.customers.name,
            customerAddress: schema.customers.address,
            totalAmount: schema.orders.totalAmount,
            createdAt: schema.orders.createdAt,
        }).from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const items = await db.select({
            id: schema.orderItems.id,
            productName: schema.products.name,
            qtyOrdered: schema.orderItems.qtyOrdered,
            qtyPicked: schema.orderItems.qtyPicked,
        }).from(schema.orderItems)
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(eq(schema.orderItems.orderId, order.id));

        return { success: true, data: { ...order, items } };
    });

    fastify.get<{ Querystring: ListReceivingQuery }>('/receiving', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListReceivingQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { page: pageStr = '1', limit: limitStr = '20', status } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.purchaseOrders.tenantId, user.tenantId)];
        if (status) {
            conditions.push(eq(schema.purchaseOrders.status, status as any));
        } else {
            conditions.push(inArray(schema.purchaseOrders.status, ['draft', 'pending', 'ordered', 'partial_received'] as any));
        }

        const receiving = await db.select({
            id: schema.purchaseOrders.id,
            poNumber: schema.purchaseOrders.poNumber,
            status: schema.purchaseOrders.status,
            expectedDate: schema.purchaseOrders.expectedDate,
            supplierName: schema.suppliers.name,
            createdAt: schema.purchaseOrders.createdAt,
        }).from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(...conditions))
            .orderBy(desc(schema.purchaseOrders.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders)
            .where(and(...conditions));

        return { success: true, data: receiving, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    fastify.get<{ Params: Static<typeof ReceivingIdParamsSchema> }>('/receiving/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ReceivingIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const [po] = await db.select({
            id: schema.purchaseOrders.id,
            poNumber: schema.purchaseOrders.poNumber,
            status: schema.purchaseOrders.status,
            expectedDate: schema.purchaseOrders.expectedDate,
            supplierName: schema.suppliers.name,
            notes: schema.purchaseOrders.notes,
            createdAt: schema.purchaseOrders.createdAt,
        }).from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const items = await db.select({
            id: schema.purchaseOrderItems.id,
            productName: schema.products.name,
            qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
            qtyReceived: schema.purchaseOrderItems.qtyReceived,
        }).from(schema.purchaseOrderItems)
            .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, po.id));

        return { success: true, data: { ...po, items } };
    });

    fastify.get<{ Querystring: ListInventoryQuery }>('/inventory', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListInventoryQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { page: pageStr = '1', limit: limitStr = '20', search } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.products.tenantId, user.tenantId)];
        if (search) {
            conditions.push(sql`${schema.products.name} ILIKE ${`%${search}%`}`);
        }

        const products = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            sku: schema.products.sku,
            stockQuantity: schema.products.stockQuantity,
            reorderPoint: schema.products.reorderPoint,
        }).from(schema.products)
            .where(and(...conditions))
            .orderBy(desc(schema.products.updatedAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.products)
            .where(and(...conditions));

        return { success: true, data: products, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    fastify.get<{ Params: Static<typeof InventoryIdParamsSchema> }>('/inventory/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: InventoryIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const [product] = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            sku: schema.products.sku,
            description: schema.products.description,
            stockQuantity: schema.products.stockQuantity,
            reorderPoint: schema.products.reorderPoint,
            costPrice: schema.products.costPrice,
            price: schema.products.price,
        }).from(schema.products)
            .where(and(eq(schema.products.id, id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        return { success: true, data: product };
    });

    // PATCH /warehouse/tasks/:id - Update task (order) status
    const UpdateTaskBodySchema = Type.Object({
        status: Type.Union([
            Type.Literal('picking'),
            Type.Literal('picked'),
            Type.Literal('loaded'),
            Type.Literal('shipped')
        ])
    });

    fastify.patch<{
        Params: Static<typeof TaskIdParamsSchema>;
        Body: Static<typeof UpdateTaskBodySchema>
    }>('/tasks/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            params: TaskIdParamsSchema,
            body: UpdateTaskBodySchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { status } = request.body;

        // Verify order exists and belongs to tenant
        const [order] = await db.select({ id: schema.orders.id })
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Update order status
        await db.update(schema.orders)
            .set({
                status: status as any,
                updatedAt: new Date()
            })
            .where(eq(schema.orders.id, id));

        return { success: true, message: 'Task status updated successfully' };
    });

    // PATCH /warehouse/receiving/:id - Update receiving (PO) status
    const UpdateReceivingBodySchema = Type.Object({
        status: Type.Union([
            Type.Literal('partial_received'),
            Type.Literal('received'),
            Type.Literal('completed')
        ])
    });

    fastify.patch<{
        Params: Static<typeof ReceivingIdParamsSchema>;
        Body: Static<typeof UpdateReceivingBodySchema>
    }>('/receiving/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            params: ReceivingIdParamsSchema,
            body: UpdateReceivingBodySchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { status } = request.body;

        // Verify PO exists and belongs to tenant
        const [po] = await db.select({ id: schema.purchaseOrders.id, status: schema.purchaseOrders.status })
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Warehouse can only update status if PO has been approved by admin (status is 'ordered' or 'partial_received')
        if (!['ordered', 'partial_received'].includes(po.status as string)) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PO_NOT_READY',
                    message: 'Purchase order must be in "ordered" status before receiving. Please contact admin to approve.'
                }
            });
        }

        // Update PO status
        await db.update(schema.purchaseOrders)
            .set({
                status: status as any,
                updatedAt: new Date()
            })
            .where(eq(schema.purchaseOrders.id, id));

        return { success: true, message: 'Receiving status updated successfully' };
    });

    // Scan item during receiving
    const ScanReceivingBodySchema = Type.Object({
        barcode: Type.String(),
        quantity: Type.Optional(Type.Number({ minimum: 1 }))
    });

    fastify.post<{
        Params: Static<typeof ReceivingIdParamsSchema>;
        Body: Static<typeof ScanReceivingBodySchema>
    }>('/receiving/:id/scan', {
        preHandler: [fastify.authenticate],
        schema: {
            params: ReceivingIdParamsSchema,
            body: ScanReceivingBodySchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { barcode, quantity = 1 } = request.body;

        // Verify PO exists and belongs to tenant
        const [po] = await db.select({ id: schema.purchaseOrders.id, status: schema.purchaseOrders.status })
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } });
        }

        // Only allow receiving for 'ordered' or 'partial_received' POs
        if (!['ordered', 'partial_received'].includes(po.status as string)) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PO_NOT_READY',
                    message: 'Purchase order must be in "ordered" status before receiving items. Please contact admin to approve.'
                }
            });
        }

        // Find product by barcode or SKU
        const [product] = await db.select({ id: schema.products.id, name: schema.products.name })
            .from(schema.products)
            .where(and(
                eq(schema.products.tenantId, user.tenantId),
                or(
                    eq(schema.products.barcode, barcode),
                    eq(schema.products.sku, barcode)
                )
            ))
            .limit(1);

        if (!product) {
            return reply.code(404).send({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } });
        }

        // Find PO line item
        const [poItem] = await db.select()
            .from(schema.purchaseOrderItems)
            .where(and(
                eq(schema.purchaseOrderItems.purchaseOrderId, id),
                eq(schema.purchaseOrderItems.productId, product.id)
            ))
            .limit(1);

        if (!poItem) {
            return reply.code(400).send({ success: false, error: { code: 'ITEM_NOT_IN_PO', message: 'Product is not in this purchase order' } });
        }

        // Increment received quantity
        const newQtyReceived = (poItem.qtyReceived || 0) + quantity;

        await db.update(schema.purchaseOrderItems)
            .set({
                qtyReceived: newQtyReceived,
                lastScannedAt: new Date(),
                scannedByUserId: user.id,
                updatedAt: new Date()
            })
            .where(eq(schema.purchaseOrderItems.id, poItem.id));

        return {
            success: true,
            data: {
                productId: product.id,
                productName: product.name,
                qtyOrdered: poItem.qtyOrdered,
                qtyReceived: newQtyReceived,
                remaining: poItem.qtyOrdered - newQtyReceived,
                isComplete: newQtyReceived >= poItem.qtyOrdered,
                isOverReceived: newQtyReceived > poItem.qtyOrdered
            }
        };
    });

    // ============================================================================
    // ADD PRODUCT TO PURCHASE ORDER (Warehouse can add missing items)
    // ============================================================================
    const AddItemToPoBodySchema = Type.Object({
        productId: Type.String(),
        quantity: Type.Number({ minimum: 1 }),
        unitPrice: Type.Optional(Type.Number({ minimum: 0 }))
    });

    fastify.post<{
        Params: Static<typeof ReceivingIdParamsSchema>;
        Body: Static<typeof AddItemToPoBodySchema>
    }>('/receiving/:id/items', {
        preHandler: [fastify.authenticate],
        schema: {
            params: ReceivingIdParamsSchema,
            body: AddItemToPoBodySchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { productId, quantity, unitPrice } = request.body;

        // Verify PO exists and belongs to tenant
        const [po] = await db.select({
            id: schema.purchaseOrders.id,
            status: schema.purchaseOrders.status,
            totalAmount: schema.purchaseOrders.totalAmount
        })
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } });
        }

        // Warehouse can add items to draft POs (for editing) or approved POs (for receiving adjustments)
        if (!['draft', 'ordered', 'partial_received'].includes(po.status as string)) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PO_NOT_EDITABLE',
                    message: 'Cannot add items to this purchase order in its current status.'
                }
            });
        }

        // Get product details
        const [product] = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            costPrice: schema.products.costPrice
        })
            .from(schema.products)
            .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) {
            return reply.code(404).send({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } });
        }

        // Check if item already exists in PO
        const [existingItem] = await db.select()
            .from(schema.purchaseOrderItems)
            .where(and(
                eq(schema.purchaseOrderItems.purchaseOrderId, id),
                eq(schema.purchaseOrderItems.productId, productId)
            ))
            .limit(1);

        const price = unitPrice ?? parseFloat(product.costPrice || '0');
        const lineTotal = price * quantity;

        if (existingItem) {
            // Update existing item quantity
            const newQtyOrdered = existingItem.qtyOrdered + quantity;
            const newLineTotal = price * newQtyOrdered;

            await db.update(schema.purchaseOrderItems)
                .set({
                    qtyOrdered: newQtyOrdered,
                    lineTotal: newLineTotal.toFixed(2),
                    updatedAt: new Date()
                })
                .where(eq(schema.purchaseOrderItems.id, existingItem.id));

            // Update PO total
            const oldLineTotal = parseFloat(existingItem.lineTotal || '0');
            const newTotal = parseFloat(po.totalAmount || '0') - oldLineTotal + newLineTotal;
            await db.update(schema.purchaseOrders)
                .set({
                    totalAmount: newTotal.toFixed(2),
                    subtotalAmount: newTotal.toFixed(2),
                    updatedAt: new Date()
                })
                .where(eq(schema.purchaseOrders.id, id));

            return {
                success: true,
                data: {
                    action: 'updated',
                    productId: product.id,
                    productName: product.name,
                    qtyOrdered: newQtyOrdered,
                    unitPrice: price,
                    lineTotal: newLineTotal
                }
            };
        } else {
            // Add new item to PO
            const [newItem] = await db.insert(schema.purchaseOrderItems)
                .values({
                    purchaseOrderId: id,
                    productId: productId,
                    qtyOrdered: quantity,
                    qtyReceived: 0,
                    unitPrice: price.toFixed(2),
                    lineTotal: lineTotal.toFixed(2)
                })
                .returning();

            // Update PO total
            const newTotal = parseFloat(po.totalAmount || '0') + lineTotal;
            await db.update(schema.purchaseOrders)
                .set({
                    totalAmount: newTotal.toFixed(2),
                    subtotalAmount: newTotal.toFixed(2),
                    updatedAt: new Date()
                })
                .where(eq(schema.purchaseOrders.id, id));

            return {
                success: true,
                data: {
                    action: 'added',
                    itemId: newItem.id,
                    productId: product.id,
                    productName: product.name,
                    qtyOrdered: quantity,
                    unitPrice: price,
                    lineTotal: lineTotal
                }
            };
        }
    });

    // ============================================================================
    // DELETE ITEM FROM PURCHASE ORDER
    // ============================================================================
    const DeleteItemParamsSchema = Type.Object({
        id: Type.String(),
        itemId: Type.String()
    });

    fastify.delete<{
        Params: Static<typeof DeleteItemParamsSchema>
    }>('/receiving/:id/items/:itemId', {
        preHandler: [fastify.authenticate],
        schema: {
            params: DeleteItemParamsSchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id, itemId } = request.params;

        // Verify PO exists and belongs to tenant
        const [po] = await db.select({
            id: schema.purchaseOrders.id,
            status: schema.purchaseOrders.status,
            totalAmount: schema.purchaseOrders.totalAmount
        })
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } });
        }

        // Can only delete items from draft POs (not from ordered ones - those are locked)
        if (po.status !== 'draft') {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PO_NOT_EDITABLE',
                    message: 'Cannot remove items from approved purchase orders. Only draft POs can be edited.'
                }
            });
        }

        // Get the item to be deleted
        const [item] = await db.select()
            .from(schema.purchaseOrderItems)
            .where(and(
                eq(schema.purchaseOrderItems.id, itemId),
                eq(schema.purchaseOrderItems.purchaseOrderId, id)
            ))
            .limit(1);

        if (!item) {
            return reply.code(404).send({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found in this purchase order' } });
        }

        // Delete the item
        await db.delete(schema.purchaseOrderItems)
            .where(eq(schema.purchaseOrderItems.id, itemId));

        // Update PO total
        const itemTotal = parseFloat(item.lineTotal || '0');
        const newTotal = Math.max(0, parseFloat(po.totalAmount || '0') - itemTotal);
        await db.update(schema.purchaseOrders)
            .set({
                totalAmount: newTotal.toFixed(2),
                subtotalAmount: newTotal.toFixed(2),
                updatedAt: new Date()
            })
            .where(eq(schema.purchaseOrders.id, id));

        return {
            success: true,
            message: 'Item removed from purchase order'
        };
    });

    // ============================================================================
    // UPDATE ITEM QUANTITY IN PURCHASE ORDER
    // ============================================================================
    const UpdateItemBodySchema = Type.Object({
        quantity: Type.Number({ minimum: 1 })
    });

    fastify.patch<{
        Params: Static<typeof DeleteItemParamsSchema>;
        Body: Static<typeof UpdateItemBodySchema>
    }>('/receiving/:id/items/:itemId', {
        preHandler: [fastify.authenticate],
        schema: {
            params: DeleteItemParamsSchema,
            body: UpdateItemBodySchema
        },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id, itemId } = request.params;
        const { quantity } = request.body;

        // Verify PO exists and belongs to tenant
        const [po] = await db.select({
            id: schema.purchaseOrders.id,
            status: schema.purchaseOrders.status,
            totalAmount: schema.purchaseOrders.totalAmount
        })
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } });
        }

        // Can only update items in draft POs
        if (po.status !== 'draft') {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PO_NOT_EDITABLE',
                    message: 'Cannot edit items in approved purchase orders. Only draft POs can be edited.'
                }
            });
        }

        // Get the item to be updated
        const [item] = await db.select()
            .from(schema.purchaseOrderItems)
            .where(and(
                eq(schema.purchaseOrderItems.id, itemId),
                eq(schema.purchaseOrderItems.purchaseOrderId, id)
            ))
            .limit(1);

        if (!item) {
            return reply.code(404).send({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found in this purchase order' } });
        }

        // Calculate new line total
        const unitPrice = parseFloat(item.unitPrice || '0');
        const newLineTotal = unitPrice * quantity;
        const oldLineTotal = parseFloat(item.lineTotal || '0');

        // Update the item
        await db.update(schema.purchaseOrderItems)
            .set({
                qtyOrdered: quantity,
                lineTotal: newLineTotal.toFixed(2)
            })
            .where(eq(schema.purchaseOrderItems.id, itemId));

        // Update PO total
        const newTotal = parseFloat(po.totalAmount || '0') - oldLineTotal + newLineTotal;
        await db.update(schema.purchaseOrders)
            .set({
                totalAmount: newTotal.toFixed(2),
                subtotalAmount: newTotal.toFixed(2),
                updatedAt: new Date()
            })
            .where(eq(schema.purchaseOrders.id, id));

        return {
            success: true,
            data: {
                itemId,
                quantity,
                lineTotal: newLineTotal.toFixed(2)
            },
            message: 'Item quantity updated'
        };
    });

    // ============================================================================
    // BATCH PICKING - Get consolidated pick list for multiple orders
    // ============================================================================
    const BatchPickingQuerySchema = Type.Object({
        orderIds: Type.String() // Comma-separated order IDs
    });

    fastify.get<{ Querystring: Static<typeof BatchPickingQuerySchema> }>('/tasks/batch', {
        preHandler: [fastify.authenticate],
        schema: { querystring: BatchPickingQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const orderIds = request.query.orderIds.split(',').filter(id => id.trim());

        if (orderIds.length === 0) {
            return reply.code(400).send({ success: false, error: { code: 'NO_ORDERS', message: 'No order IDs provided' } });
        }

        // Get order details
        const orders = await db.select({
            id: schema.orders.id,
            orderNumber: schema.orders.orderNumber,
            status: schema.orders.status,
            customerName: schema.customers.name,
        })
            .from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(
                inArray(schema.orders.id, orderIds),
                eq(schema.orders.tenantId, user.tenantId)
            ));

        if (orders.length === 0) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Get all items from these orders, grouped by product
        const items = await db.select({
            orderId: schema.orderItems.orderId,
            productId: schema.orderItems.productId,
            productName: schema.products.name,
            productSku: schema.products.sku,
            productBarcode: schema.products.barcode,
            qtyOrdered: schema.orderItems.qtyOrdered,
            qtyPicked: schema.orderItems.qtyPicked,
            stockQuantity: schema.products.stockQuantity,
        })
            .from(schema.orderItems)
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(inArray(schema.orderItems.orderId, orderIds));

        // Group items by product for batch picking
        const productMap = new Map<string, {
            productId: string;
            productName: string;
            productSku: string | null;
            productBarcode: string | null;
            stockQuantity: number;
            totalQtyOrdered: number;
            totalQtyPicked: number;
            orders: { orderId: string; orderNumber: string; customerName: string | null; qtyOrdered: number; qtyPicked: number }[];
        }>();

        for (const item of items) {
            const order = orders.find(o => o.id === item.orderId);
            if (!order || !item.productId) continue;

            if (!productMap.has(item.productId)) {
                productMap.set(item.productId, {
                    productId: item.productId,
                    productName: item.productName || 'Unknown',
                    productSku: item.productSku,
                    productBarcode: item.productBarcode,
                    stockQuantity: item.stockQuantity || 0,
                    totalQtyOrdered: 0,
                    totalQtyPicked: 0,
                    orders: []
                });
            }

            const productEntry = productMap.get(item.productId)!;
            productEntry.totalQtyOrdered += item.qtyOrdered;
            productEntry.totalQtyPicked += item.qtyPicked || 0;
            productEntry.orders.push({
                orderId: item.orderId,
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                qtyOrdered: item.qtyOrdered,
                qtyPicked: item.qtyPicked || 0
            });
        }

        const batchItems = Array.from(productMap.values()).sort((a, b) =>
            a.productName.localeCompare(b.productName)
        );

        return {
            success: true,
            data: {
                orders: orders.map(o => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    status: o.status,
                    customerName: o.customerName
                })),
                batchItems,
                summary: {
                    totalOrders: orders.length,
                    totalProducts: batchItems.length,
                    totalItemsToPickl: batchItems.reduce((sum, p) => sum + p.totalQtyOrdered - p.totalQtyPicked, 0)
                }
            }
        };
    });

    // ============================================================================
    // BATCH PICK - Update picked quantity for a product across multiple orders
    // ============================================================================
    const BatchPickBodySchema = Type.Object({
        productId: Type.String(),
        orderIds: Type.Array(Type.String()),
        quantity: Type.Number({ minimum: 1 })
    });

    fastify.patch<{ Body: Static<typeof BatchPickBodySchema> }>('/tasks/batch/pick', {
        preHandler: [fastify.authenticate],
        schema: { body: BatchPickBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { productId, orderIds, quantity } = request.body;

        // Get all order items for this product in these orders
        const orderItemsList = await db.select({
            id: schema.orderItems.id,
            orderId: schema.orderItems.orderId,
            qtyOrdered: schema.orderItems.qtyOrdered,
            qtyPicked: schema.orderItems.qtyPicked,
        })
            .from(schema.orderItems)
            .leftJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
            .where(and(
                inArray(schema.orderItems.orderId, orderIds),
                eq(schema.orderItems.productId, productId),
                eq(schema.orders.tenantId, user.tenantId)
            ));

        if (orderItemsList.length === 0) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Distribute picked quantity across orders (FIFO - first order first)
        let remainingQty = quantity;
        const updates: { itemId: string; orderId: string; qtyPicked: number }[] = [];

        for (const item of orderItemsList) {
            if (remainingQty <= 0) break;

            const currentPicked = item.qtyPicked || 0;
            const needed = item.qtyOrdered - currentPicked;

            if (needed > 0) {
                const pickQty = Math.min(needed, remainingQty);
                updates.push({
                    itemId: item.id,
                    orderId: item.orderId,
                    qtyPicked: currentPicked + pickQty
                });
                remainingQty -= pickQty;
            }
        }

        // Apply updates
        for (const update of updates) {
            await db.update(schema.orderItems)
                .set({ qtyPicked: update.qtyPicked, updatedAt: new Date() })
                .where(eq(schema.orderItems.id, update.itemId));
        }

        // Check if any orders are fully picked and update their status
        for (const orderId of [...new Set(updates.map(u => u.orderId))]) {
            const orderItems = await db.select({
                qtyOrdered: schema.orderItems.qtyOrdered,
                qtyPicked: schema.orderItems.qtyPicked,
            })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, orderId));

            const allPicked = orderItems.every(item =>
                (item.qtyPicked || 0) >= item.qtyOrdered
            );

            if (allPicked) {
                await db.update(schema.orders)
                    .set({ status: 'picked', updatedAt: new Date() })
                    .where(eq(schema.orders.id, orderId));
            } else {
                // Set to picking if not already
                await db.update(schema.orders)
                    .set({ status: 'picking', updatedAt: new Date() })
                    .where(and(
                        eq(schema.orders.id, orderId),
                        inArray(schema.orders.status, ['approved'] as any)
                    ));
            }
        }

        return {
            success: true,
            data: {
                pickedQuantity: quantity - remainingQty,
                unallocated: remainingQty,
                updates
            }
        };
    });

    // ============================================================================
    // SEARCH PRODUCTS (for adding to PO)
    // ============================================================================
    const SearchProductsQuerySchema = Type.Object({
        q: Type.String(),
        limit: Type.Optional(Type.String())
    });

    fastify.get<{ Querystring: Static<typeof SearchProductsQuerySchema> }>('/products/search', {
        preHandler: [fastify.authenticate],
        schema: { querystring: SearchProductsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { q, limit: limitStr = '20' } = request.query;
        const limit = parseInt(limitStr);

        const products = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            sku: schema.products.sku,
            barcode: schema.products.barcode,
            costPrice: schema.products.costPrice,
            price: schema.products.price,
            stockQuantity: schema.products.stockQuantity,
        })
            .from(schema.products)
            .where(and(
                eq(schema.products.tenantId, user.tenantId),
                sql`(${schema.products.name} ILIKE ${`%${q}%`} OR ${schema.products.sku} ILIKE ${`%${q}%`} OR ${schema.products.barcode} ILIKE ${`%${q}%`})`
            ))
            .limit(limit);

        return { success: true, data: products };
    });

    // ============================================================================
    // SUPPLIERS - List suppliers for PO creation
    // ============================================================================
    fastify.get('/suppliers', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const suppliers = await db.select({
            id: schema.suppliers.id,
            name: schema.suppliers.name,
            contactPerson: schema.suppliers.contactPerson,
            phone: schema.suppliers.phone,
            email: schema.suppliers.email,
        })
            .from(schema.suppliers)
            .where(and(
                eq(schema.suppliers.tenantId, user.tenantId),
                eq(schema.suppliers.isActive, true)
            ))
            .orderBy(schema.suppliers.name);

        return { success: true, data: suppliers };
    });

    // ============================================================================
    // CREATE PURCHASE ORDER - Warehouse can create new POs
    // ============================================================================
    const CreatePoItemSchema = Type.Object({
        productId: Type.String(),
        quantity: Type.Number({ minimum: 1 }),
        unitPrice: Type.Optional(Type.Number({ minimum: 0 }))
    });

    const CreatePoBodySchema = Type.Object({
        supplierId: Type.String(),
        expectedDate: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
        items: Type.Array(CreatePoItemSchema, { minItems: 1 })
    });

    fastify.post<{ Body: Static<typeof CreatePoBodySchema> }>('/purchase-orders', {
        preHandler: [fastify.authenticate],
        schema: { body: CreatePoBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { supplierId, expectedDate, notes, items } = request.body;

        // Verify supplier exists and belongs to tenant
        const [supplier] = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name })
            .from(schema.suppliers)
            .where(and(
                eq(schema.suppliers.id, supplierId),
                eq(schema.suppliers.tenantId, user.tenantId)
            ))
            .limit(1);

        if (!supplier) {
            return reply.code(404).send({ success: false, error: { code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' } });
        }

        // Get product details for all items
        const productIds = items.map(item => item.productId);
        const productList = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            costPrice: schema.products.costPrice,
        })
            .from(schema.products)
            .where(and(
                eq(schema.products.tenantId, user.tenantId),
                inArray(schema.products.id, productIds)
            ));

        const productMap = new Map(productList.map(p => [p.id, p]));

        // Validate all products exist
        for (const item of items) {
            if (!productMap.has(item.productId)) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${item.productId} not found` }
                });
            }
        }

        // Generate PO number
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const poNumber = `PO-${datePrefix}-${randomSuffix}`;

        // Calculate totals
        let subtotal = 0;
        const itemsWithPrices = items.map(item => {
            const product = productMap.get(item.productId)!;
            const unitPrice = item.unitPrice ?? parseFloat(product.costPrice || '0');
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;
            return {
                productId: item.productId,
                qtyOrdered: item.quantity,
                unitPrice: unitPrice.toFixed(2),
                lineTotal: lineTotal.toFixed(2)
            };
        });

        // Create the PO
        const [newPo] = await db.insert(schema.purchaseOrders)
            .values({
                tenantId: user.tenantId,
                poNumber,
                supplierId,
                createdBy: user.id,
                status: 'draft',
                subtotalAmount: subtotal.toFixed(2),
                taxAmount: '0',
                totalAmount: subtotal.toFixed(2),
                expectedDate: expectedDate || null,
                notes: notes || null,
            })
            .returning();

        // Create PO items
        await db.insert(schema.purchaseOrderItems)
            .values(itemsWithPrices.map(item => ({
                purchaseOrderId: newPo.id,
                productId: item.productId,
                qtyOrdered: item.qtyOrdered,
                qtyReceived: 0,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal
            })));

        return {
            success: true,
            data: {
                id: newPo.id,
                poNumber: newPo.poNumber,
                status: newPo.status,
                supplierId: newPo.supplierId,
                supplierName: supplier.name,
                totalAmount: newPo.totalAmount,
                itemCount: items.length
            }
        };
    });

    // ============================================================================
    // GET LOW STOCK PRODUCTS - For quick PO creation
    // ============================================================================
    fastify.get('/products/low-stock', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const lowStockProducts = await db.select({
            id: schema.products.id,
            name: schema.products.name,
            sku: schema.products.sku,
            barcode: schema.products.barcode,
            costPrice: schema.products.costPrice,
            stockQuantity: schema.products.stockQuantity,
            reorderPoint: schema.products.reorderPoint,
            supplierId: schema.products.supplierId,
        })
            .from(schema.products)
            .where(and(
                eq(schema.products.tenantId, user.tenantId),
                eq(schema.products.isActive, true),
                sql`${schema.products.stockQuantity} <= ${schema.products.reorderPoint}`
            ))
            .orderBy(schema.products.name)
            .limit(50);

        return { success: true, data: lowStockProducts };
    });
};

