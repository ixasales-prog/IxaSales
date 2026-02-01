import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';

// Schemas
const CreateSupplierBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    contactPerson: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
});

const SupplierIdParamsSchema = Type.Object({ id: Type.String() });

const UpdateSupplierBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    contactPerson: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
});

const ListPOsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    supplierId: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
});

const POIdParamsSchema = Type.Object({ id: Type.String() });

const CreatePOBodySchema = Type.Object({
    supplierId: Type.String(),
    status: Type.Optional(Type.String()),
    subtotalAmount: Type.Number({ minimum: 0 }),
    taxAmount: Type.Optional(Type.Number({ minimum: 0 })),
    totalAmount: Type.Number({ minimum: 0 }),
    expectedDate: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    items: Type.Array(Type.Object({
        productId: Type.String(),
        qtyOrdered: Type.Number({ minimum: 1 }),
        unitPrice: Type.Number({ minimum: 0 }),
        lineTotal: Type.Number({ minimum: 0 }),
    })),
});

const UpdatePOStatusBodySchema = Type.Object({ status: Type.String() });

type CreateSupplierBody = Static<typeof CreateSupplierBodySchema>;
type UpdateSupplierBody = Static<typeof UpdateSupplierBodySchema>;
type ListPOsQuery = Static<typeof ListPOsQuerySchema>;
type CreatePOBody = Static<typeof CreatePOBodySchema>;
type UpdatePOStatusBody = Static<typeof UpdatePOStatusBodySchema>;

export const procurementRoutes: FastifyPluginAsync = async (fastify) => {
    // List suppliers
    fastify.get('/suppliers', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const suppliers = await db.select().from(schema.suppliers)
            .where(and(eq(schema.suppliers.tenantId, user.tenantId), eq(schema.suppliers.isActive, true)))
            .orderBy(schema.suppliers.name);
        return { success: true, data: suppliers };
    });

    // Create supplier
    fastify.post<{ Body: CreateSupplierBody }>('/suppliers', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateSupplierBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const [supplier] = await db.insert(schema.suppliers).values({
            tenantId: user.tenantId, name: request.body.name, contactPerson: request.body.contactPerson,
            phone: request.body.phone, email: request.body.email, address: request.body.address, isActive: true,
        }).returning();
        return { success: true, data: supplier };
    });

    // Update supplier
    fastify.put<{ Params: Static<typeof SupplierIdParamsSchema>; Body: UpdateSupplierBody }>('/suppliers/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: SupplierIdParamsSchema, body: UpdateSupplierBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const { id } = request.params;
        const body = request.body;
        const updateData: any = { updatedAt: new Date() };
        if (body.name) updateData.name = body.name;
        if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson;
        if (body.phone !== undefined) updateData.phone = body.phone;
        if (body.email !== undefined) updateData.email = body.email;
        if (body.address !== undefined) updateData.address = body.address;

        const [supplier] = await db.update(schema.suppliers).set(updateData)
            .where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.tenantId, user.tenantId))).returning();
        if (!supplier) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: supplier };
    });

    // Delete supplier
    fastify.delete<{ Params: Static<typeof SupplierIdParamsSchema> }>('/suppliers/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: SupplierIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        try {
            const [deleted] = await db.delete(schema.suppliers)
                .where(and(eq(schema.suppliers.id, request.params.id), eq(schema.suppliers.tenantId, user.tenantId))).returning();
            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete supplier with purchase orders' } });
            throw err;
        }
    });

    // List POs
    fastify.get<{ Querystring: ListPOsQuery }>('/purchase-orders', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListPOsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', supplierId, status } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.purchaseOrders.tenantId, user.tenantId)];
        if (supplierId) conditions.push(eq(schema.purchaseOrders.supplierId, supplierId));
        if (status) conditions.push(eq(schema.purchaseOrders.status, status as any));

        const pos = await db.select({
            id: schema.purchaseOrders.id, poNumber: schema.purchaseOrders.poNumber, supplierName: schema.suppliers.name,
            status: schema.purchaseOrders.status, totalAmount: schema.purchaseOrders.totalAmount,
            expectedDate: schema.purchaseOrders.expectedDate, createdAt: schema.purchaseOrders.createdAt,
        }).from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(...conditions)).orderBy(desc(schema.purchaseOrders.createdAt)).limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders).where(and(...conditions));
        return { success: true, data: pos, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create PO
    fastify.post<{ Body: CreatePOBody }>('/purchase-orders', {
        preHandler: [fastify.authenticate],
        schema: { body: CreatePOBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const body = request.body;
        const poNumber = `PO-${Date.now()}`;
        const poStatus = body.status || 'draft';

        const result = await db.transaction(async (tx) => {
            const [po] = await tx.insert(schema.purchaseOrders).values({
                tenantId: user.tenantId, poNumber, supplierId: body.supplierId, createdBy: user.id, status: poStatus as any,
                subtotalAmount: body.subtotalAmount.toString(), taxAmount: body.taxAmount?.toString() || '0',
                totalAmount: body.totalAmount.toString(), expectedDate: body.expectedDate, notes: body.notes,
            }).returning();

            if (body.items && body.items.length > 0) {
                await tx.insert(schema.purchaseOrderItems).values(body.items.map(item => ({
                    purchaseOrderId: po.id, productId: item.productId, qtyOrdered: item.qtyOrdered, qtyReceived: 0,
                    unitPrice: item.unitPrice.toString(), lineTotal: item.lineTotal.toString(),
                })));
            }

            if (poStatus === 'received') {
                for (const item of body.items) {
                    const [product] = await tx.select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products).where(eq(schema.products.id, item.productId)).limit(1);
                    const quantityBefore = product?.stockQuantity || 0;
                    const quantityAfter = quantityBefore + item.qtyOrdered;

                    await tx.update(schema.products).set({ stockQuantity: quantityAfter, costPrice: item.unitPrice.toString() })
                        .where(eq(schema.products.id, item.productId));
                    await tx.insert(schema.stockMovements).values({
                        tenantId: user.tenantId, productId: item.productId, movementType: 'in', quantity: item.qtyOrdered,
                        quantityBefore, quantityAfter, referenceType: 'purchase_order', referenceId: po.id,
                        createdBy: user.id, notes: `PO Received: ${poNumber}`,
                    });
                }
                await tx.update(schema.purchaseOrders).set({ receivedAt: new Date() }).where(eq(schema.purchaseOrders.id, po.id));
            }
            return po;
        });

        return { success: true, data: result };
    });

    // Get PO details
    fastify.get<{ Params: Static<typeof POIdParamsSchema> }>('/purchase-orders/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: POIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [po] = await db.select({
            id: schema.purchaseOrders.id, poNumber: schema.purchaseOrders.poNumber, supplierName: schema.suppliers.name,
            status: schema.purchaseOrders.status, totalAmount: schema.purchaseOrders.totalAmount,
            notes: schema.purchaseOrders.notes, createdAt: schema.purchaseOrders.createdAt,
        }).from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId))).limit(1);

        if (!po) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const items = await db.select({
            id: schema.purchaseOrderItems.id, productName: schema.products.name,
            qtyOrdered: schema.purchaseOrderItems.qtyOrdered, qtyReceived: schema.purchaseOrderItems.qtyReceived,
            unitPrice: schema.purchaseOrderItems.unitPrice, lineTotal: schema.purchaseOrderItems.lineTotal,
        }).from(schema.purchaseOrderItems)
            .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, po.id));

        return { success: true, data: { ...po, items } };
    });

    // Update PO status
    fastify.patch<{ Params: Static<typeof POIdParamsSchema>; Body: UpdatePOStatusBody }>('/purchase-orders/:id/status', {
        preHandler: [fastify.authenticate],
        schema: { params: POIdParamsSchema, body: UpdatePOStatusBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { status } = request.body;

        const [po] = await db.select().from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId))).limit(1);
        if (!po) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        if (status === 'received' && po.status !== 'received') {
            await db.transaction(async (tx) => {
                await tx.update(schema.purchaseOrders).set({ status: 'received', receivedAt: new Date() }).where(eq(schema.purchaseOrders.id, id));
                const items = await tx.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.purchaseOrderId, po.id));

                for (const item of items) {
                    const [product] = await tx.select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products).where(eq(schema.products.id, item.productId)).limit(1);
                    const quantityBefore = product?.stockQuantity || 0;
                    const quantityAfter = quantityBefore + item.qtyOrdered;

                    await tx.update(schema.products).set({ stockQuantity: quantityAfter, costPrice: item.unitPrice.toString() })
                        .where(eq(schema.products.id, item.productId));
                    await tx.insert(schema.stockMovements).values({
                        tenantId: user.tenantId, productId: item.productId, movementType: 'in', quantity: item.qtyOrdered,
                        quantityBefore, quantityAfter, referenceType: 'purchase_order', referenceId: po.id,
                        createdBy: user.id, notes: `PO Received: ${po.poNumber}`,
                    });
                }
            });
        } else {
            await db.update(schema.purchaseOrders).set({ status: status as any }).where(eq(schema.purchaseOrders.id, id));
        }

        return { success: true, message: 'Status updated' };
    });
};
