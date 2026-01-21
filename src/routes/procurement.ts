import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const procurementRoutes = new Elysia({ prefix: '/procurement' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // SUPPLIERS
    // ----------------------------------------------------------------

    // List suppliers
    .get('/suppliers', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const suppliers = await db
            .select()
            .from(schema.suppliers)
            .where(and(eq(schema.suppliers.tenantId, user.tenantId), eq(schema.suppliers.isActive, true)))
            .orderBy(schema.suppliers.name);

        return { success: true, data: suppliers };
    })

    // Create supplier
    .post('/suppliers', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [supplier] = await db
            .insert(schema.suppliers)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                contactPerson: body.contactPerson,
                phone: body.phone,
                email: body.email,
                address: body.address,
                isActive: true,
            })
            .returning();

        return { success: true, data: supplier };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            contactPerson: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            email: t.Optional(t.String()),
            address: t.Optional(t.String()),
        })
    })

    // Update supplier
    .put('/suppliers/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [supplier] = await db
            .update(schema.suppliers)
            .set({
                ...(body.name ? { name: body.name } : {}),
                ...(body.contactPerson !== undefined ? { contactPerson: body.contactPerson } : {}),
                ...(body.phone !== undefined ? { phone: body.phone } : {}),
                ...(body.email !== undefined ? { email: body.email } : {}),
                ...(body.address !== undefined ? { address: body.address } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.suppliers.id, params.id), eq(schema.suppliers.tenantId, user.tenantId)))
            .returning();

        if (!supplier) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        return { success: true, data: supplier };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String({ minLength: 2 })),
            contactPerson: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            email: t.Optional(t.String()),
            address: t.Optional(t.String()),
        })
    })

    // Delete supplier
    .delete('/suppliers/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.suppliers)
                .where(and(eq(schema.suppliers.id, params.id), eq(schema.suppliers.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') { // FK violation
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete supplier with associated purchase orders.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // PURCHASE ORDERS
    // ----------------------------------------------------------------

    // List POs
    .get('/purchase-orders', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, supplierId, status } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.purchaseOrders.tenantId, user.tenantId)];

        if (supplierId) conditions.push(eq(schema.purchaseOrders.supplierId, supplierId));
        if (status) conditions.push(eq(schema.purchaseOrders.status, status));

        const pos = await db
            .select({
                id: schema.purchaseOrders.id,
                poNumber: schema.purchaseOrders.poNumber,
                supplierName: schema.suppliers.name,
                status: schema.purchaseOrders.status,
                totalAmount: schema.purchaseOrders.totalAmount,
                expectedDate: schema.purchaseOrders.expectedDate,
                createdAt: schema.purchaseOrders.createdAt,
            })
            .from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(...conditions))
            .orderBy(desc(schema.purchaseOrders.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.purchaseOrders)
            .where(and(...conditions));

        return {
            success: true,
            data: pos,
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
            supplierId: t.Optional(t.String()),
            status: t.Optional(t.String()),
        })
    })

    // Create PO
    .post('/purchase-orders', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only admin/supervisor for now
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const poNumber = `PO-${Date.now()}`;
        const poStatus = body.status || 'draft';

        const result = await db.transaction(async (tx) => {
            const [po] = await tx
                .insert(schema.purchaseOrders)
                .values({
                    tenantId: user.tenantId,
                    poNumber,
                    supplierId: body.supplierId,
                    createdBy: user.id,
                    status: poStatus,
                    subtotalAmount: body.subtotalAmount.toString(),
                    taxAmount: body.taxAmount?.toString() || '0',
                    totalAmount: body.totalAmount.toString(),
                    expectedDate: body.expectedDate,
                    notes: body.notes,
                })
                .returning();

            if (body.items && body.items.length > 0) {
                await tx.insert(schema.purchaseOrderItems).values(
                    body.items.map((item: any) => ({
                        purchaseOrderId: po.id,
                        productId: item.productId,
                        qtyOrdered: item.qtyOrdered,
                        qtyReceived: 0,
                        unitPrice: item.unitPrice.toString(),
                        lineTotal: item.lineTotal.toString(),
                    }))
                );
            }

            // If status is 'received', update stock immediately
            if (poStatus === 'received') {
                for (const item of body.items) {
                    const [product] = await tx
                        .select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products)
                        .where(eq(schema.products.id, item.productId))
                        .limit(1);

                    const quantityBefore = product?.stockQuantity || 0;
                    const quantityAfter = quantityBefore + item.qtyOrdered;

                    await tx
                        .update(schema.products)
                        .set({
                            stockQuantity: quantityAfter,
                            costPrice: item.unitPrice.toString()
                        })
                        .where(eq(schema.products.id, item.productId));

                    await tx.insert(schema.stockMovements).values({
                        tenantId: user.tenantId,
                        productId: item.productId,
                        movementType: 'in',
                        quantity: item.qtyOrdered,
                        quantityBefore: quantityBefore,
                        quantityAfter: quantityAfter,
                        referenceType: 'purchase_order',
                        referenceId: po.id,
                        createdBy: user.id,
                        notes: `PO Received: ${poNumber}`,
                    });
                }

                await tx
                    .update(schema.purchaseOrders)
                    .set({ receivedAt: new Date() })
                    .where(eq(schema.purchaseOrders.id, po.id));
            }

            return po;
        });

        return { success: true, data: result };
    }, {
        body: t.Object({
            supplierId: t.String(),
            status: t.Optional(t.String()),
            subtotalAmount: t.Number({ minimum: 0 }),
            taxAmount: t.Optional(t.Number({ minimum: 0 })),
            totalAmount: t.Number({ minimum: 0 }),
            expectedDate: t.Optional(t.String()),
            notes: t.Optional(t.String()),
            items: t.Array(t.Object({
                productId: t.String(),
                qtyOrdered: t.Number({ minimum: 1 }),
                unitPrice: t.Number({ minimum: 0 }),
                lineTotal: t.Number({ minimum: 0 }),
            })),
        })
    })

    // Get PO details
    .get('/purchase-orders/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [po] = await db
            .select({
                id: schema.purchaseOrders.id,
                poNumber: schema.purchaseOrders.poNumber,
                supplierName: schema.suppliers.name,
                status: schema.purchaseOrders.status,
                totalAmount: schema.purchaseOrders.totalAmount,
                notes: schema.purchaseOrders.notes,
                createdAt: schema.purchaseOrders.createdAt,
            })
            .from(schema.purchaseOrders)
            .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
            .where(and(eq(schema.purchaseOrders.id, params.id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        const items = await db
            .select({
                id: schema.purchaseOrderItems.id,
                productName: schema.products.name,
                qtyOrdered: schema.purchaseOrderItems.qtyOrdered,
                qtyReceived: schema.purchaseOrderItems.qtyReceived,
                unitPrice: schema.purchaseOrderItems.unitPrice,
                lineTotal: schema.purchaseOrderItems.lineTotal,
            })
            .from(schema.purchaseOrderItems)
            .leftJoin(schema.products, eq(schema.purchaseOrderItems.productId, schema.products.id))
            .where(eq(schema.purchaseOrderItems.purchaseOrderId, po.id));

        return { success: true, data: { ...po, items } };
    }, {
        params: t.Object({ id: t.String() })
    })

    // Update PO Status (Receive Stock)
    .patch('/purchase-orders/:id/status', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [po] = await db
            .select()
            .from(schema.purchaseOrders)
            .where(and(eq(schema.purchaseOrders.id, params.id), eq(schema.purchaseOrders.tenantId, user.tenantId)))
            .limit(1);

        if (!po) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // If changing to 'received', we update stock
        if (body.status === 'received' && po.status !== 'received') {
            await db.transaction(async (tx) => {
                // Update PO
                await tx
                    .update(schema.purchaseOrders)
                    .set({ status: 'received', receivedAt: new Date() })
                    .where(eq(schema.purchaseOrders.id, params.id));

                // Get items
                const items = await tx
                    .select()
                    .from(schema.purchaseOrderItems)
                    .where(eq(schema.purchaseOrderItems.purchaseOrderId, po.id));

                // Update Stock for each item
                for (const item of items) {
                    // Fetch current stock quantity BEFORE updating
                    const [product] = await tx
                        .select({ stockQuantity: schema.products.stockQuantity })
                        .from(schema.products)
                        .where(eq(schema.products.id, item.productId))
                        .limit(1);

                    const quantityBefore = product?.stockQuantity || 0;
                    const quantityAfter = quantityBefore + item.qtyOrdered;

                    // Update product quantity (increment)
                    await tx
                        .update(schema.products)
                        .set({
                            stockQuantity: quantityAfter,
                            costPrice: item.unitPrice.toString() // Update to latest cost price
                        })
                        .where(eq(schema.products.id, item.productId));

                    // Create Stock Movement log with accurate values
                    await tx.insert(schema.stockMovements).values({
                        tenantId: user.tenantId,
                        productId: item.productId,
                        movementType: 'in',
                        quantity: item.qtyOrdered,
                        quantityBefore: quantityBefore,
                        quantityAfter: quantityAfter,
                        referenceType: 'purchase_order',
                        referenceId: po.id,
                        createdBy: user.id,
                        notes: `PO Received: ${po.poNumber}`,
                    });
                }
            });
        } else {
            // Just update status
            await db
                .update(schema.purchaseOrders)
                .set({ status: body.status as any })
                .where(eq(schema.purchaseOrders.id, params.id));
        }

        return { success: true, message: 'Status updated' };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            status: t.String(),
        })
    });
