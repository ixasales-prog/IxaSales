import { FastifyPluginAsync } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, sum, count } from 'drizzle-orm';

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
    // Pre-handler for all report routes - require admin/supervisor role
    const reportAuth = async (request: any, reply: any) => {
        await fastify.authenticate(request, reply);
        const user = request.user;
        if (!user || !['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
        }
    };

    // Sales by rep
    fastify.get('/sales-by-rep', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            salesRepId: schema.users.id, salesRepName: schema.users.name,
            totalOrders: count(schema.orders.id), totalSales: sum(schema.orders.totalAmount),
        }).from(schema.orders)
            .leftJoin(schema.users, eq(schema.orders.salesRepId, schema.users.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`,
                eq(schema.orders.status, 'delivered')
            )).groupBy(schema.users.id, schema.users.name);

        return { success: true, data: report };
    });

    // Sales by product
    fastify.get('/sales-by-product', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            productId: schema.products.id, productName: schema.products.name,
            qtySold: sum(schema.orderItems.qtyOrdered), totalRevenue: sum(schema.orderItems.lineTotal),
        }).from(schema.orderItems)
            .leftJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`,
                eq(schema.orders.status, 'delivered')
            )).groupBy(schema.products.id, schema.products.name)
            .orderBy(desc(sum(schema.orderItems.lineTotal))).limit(50);

        return { success: true, data: report };
    });

    // Recent orders
    fastify.get('/recent-orders', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            id: schema.orders.id, orderNumber: schema.orders.orderNumber,
            customerName: schema.customers.name, totalAmount: schema.orders.totalAmount,
            status: schema.orders.status, createdAt: schema.orders.createdAt,
        }).from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`)
            .orderBy(desc(schema.orders.createdAt)).limit(10);

        return { success: true, data: report };
    });

    // Low stock
    fastify.get('/low-stock', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            id: schema.products.id, name: schema.products.name,
            stockQuantity: schema.products.stockQuantity, reorderPoint: schema.products.reorderPoint, sku: schema.products.sku,
        }).from(schema.products)
            .where(and(
                user.role !== 'super_admin' ? eq(schema.products.tenantId, user.tenantId) : sql`true`,
                eq(schema.products.isActive, true),
                sql`${schema.products.stockQuantity} <= ${schema.products.reorderPoint}`
            )).orderBy(schema.products.stockQuantity).limit(20);

        return { success: true, data: report };
    });

    // Customer debts
    fastify.get('/customer-debts', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            id: schema.customers.id, name: schema.customers.name, code: schema.customers.code,
            debtBalance: schema.customers.debtBalance, creditLimit: schema.customerTiers.creditLimit,
        }).from(schema.customers)
            .leftJoin(schema.customerTiers, eq(schema.customers.tierId, schema.customerTiers.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.customers.tenantId, user.tenantId) : sql`true`,
                sql`${schema.customers.debtBalance} > 0`
            )).orderBy(desc(schema.customers.debtBalance));

        return { success: true, data: report };
    });

    // Inventory valuation
    fastify.get('/inventory-valuation', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;

        const report = await db.select({
            id: schema.products.id, name: schema.products.name,
            stockQuantity: schema.products.stockQuantity, costPrice: schema.products.costPrice,
            valuation: sql<number>`${schema.products.stockQuantity} * ${schema.products.costPrice}`,
        }).from(schema.products)
            .where(and(
                user.role !== 'super_admin' ? eq(schema.products.tenantId, user.tenantId) : sql`true`,
                eq(schema.products.isActive, true)
            ));

        return { success: true, data: report };
    });
};
