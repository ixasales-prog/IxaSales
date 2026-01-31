import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

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
            conditions.push(inArray(schema.purchaseOrders.status, ['pending', 'ordered', 'partial_received'] as any));
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
};
