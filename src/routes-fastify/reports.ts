import { FastifyPluginAsync } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, sum, count, gte, lte } from 'drizzle-orm';

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

    // Visit duration analytics by sales rep
    fastify.get('/visit-duration-by-rep', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;
        const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

        const conditions: any[] = [
            eq(schema.salesVisits.status, 'completed'),
            sql`${schema.salesVisits.startedAt} IS NOT NULL`,
            sql`${schema.salesVisits.completedAt} IS NOT NULL`,
        ];

        if (user.role !== 'super_admin') {
            conditions.push(eq(schema.salesVisits.tenantId, user.tenantId));
        }

        if (startDate) {
            conditions.push(gte(schema.salesVisits.plannedDate, startDate));
        }
        if (endDate) {
            conditions.push(lte(schema.salesVisits.plannedDate, endDate));
        }

        const report = await db.select({
            salesRepId: schema.users.id,
            salesRepName: schema.users.name,
            totalVisits: count(schema.salesVisits.id),
            avgDurationMinutes: sql<number>`ROUND(AVG(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
            minDurationMinutes: sql<number>`ROUND(MIN(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
            maxDurationMinutes: sql<number>`ROUND(MAX(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
            totalDurationMinutes: sql<number>`ROUND(SUM(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
        })
            .from(schema.salesVisits)
            .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
            .where(and(...conditions))
            .groupBy(schema.users.id, schema.users.name)
            .orderBy(desc(count(schema.salesVisits.id)));

        return { success: true, data: report };
    });

    // Visit duration trends over time
    fastify.get('/visit-duration-trends', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;
        const { days = '30' } = request.query as { days?: string };
        const daysNum = parseInt(days) || 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);
        const startDateStr = startDate.toISOString().split('T')[0];

        const conditions: any[] = [
            eq(schema.salesVisits.status, 'completed'),
            sql`${schema.salesVisits.startedAt} IS NOT NULL`,
            sql`${schema.salesVisits.completedAt} IS NOT NULL`,
            gte(schema.salesVisits.plannedDate, startDateStr),
        ];

        if (user.role !== 'super_admin') {
            conditions.push(eq(schema.salesVisits.tenantId, user.tenantId));
        }

        const report = await db.select({
            date: schema.salesVisits.plannedDate,
            totalVisits: count(schema.salesVisits.id),
            avgDurationMinutes: sql<number>`ROUND(AVG(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
        })
            .from(schema.salesVisits)
            .where(and(...conditions))
            .groupBy(schema.salesVisits.plannedDate)
            .orderBy(schema.salesVisits.plannedDate);

        return { success: true, data: report };
    });

    // Long visits report (exceeding threshold)
    fastify.get('/long-visits', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;
        const { threshold = '60', startDate, endDate } = request.query as { threshold?: string; startDate?: string; endDate?: string };
        const thresholdMinutes = parseInt(threshold) || 60;

        const conditions: any[] = [
            eq(schema.salesVisits.status, 'completed'),
            sql`${schema.salesVisits.startedAt} IS NOT NULL`,
            sql`${schema.salesVisits.completedAt} IS NOT NULL`,
            sql`EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60 > ${thresholdMinutes}`,
        ];

        if (user.role !== 'super_admin') {
            conditions.push(eq(schema.salesVisits.tenantId, user.tenantId));
        }

        if (startDate) {
            conditions.push(gte(schema.salesVisits.plannedDate, startDate));
        }
        if (endDate) {
            conditions.push(lte(schema.salesVisits.plannedDate, endDate));
        }

        const report = await db.select({
            visitId: schema.salesVisits.id,
            customerName: schema.customers.name,
            salesRepName: schema.users.name,
            plannedDate: schema.salesVisits.plannedDate,
            startedAt: schema.salesVisits.startedAt,
            completedAt: schema.salesVisits.completedAt,
            durationMinutes: sql<number>`ROUND(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60)`,
            outcome: schema.salesVisits.outcome,
        })
            .from(schema.salesVisits)
            .leftJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .leftJoin(schema.users, eq(schema.salesVisits.salesRepId, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(sql`EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt}))`))
            .limit(50);

        return { success: true, data: report };
    });

    // Visit outcomes summary
    fastify.get('/visit-outcomes', { preHandler: [reportAuth] }, async (request, reply) => {
        const user = request.user!;
        const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

        const conditions: any[] = [
            eq(schema.salesVisits.status, 'completed'),
        ];

        if (user.role !== 'super_admin') {
            conditions.push(eq(schema.salesVisits.tenantId, user.tenantId));
        }

        if (startDate) {
            conditions.push(gte(schema.salesVisits.plannedDate, startDate));
        }
        if (endDate) {
            conditions.push(lte(schema.salesVisits.plannedDate, endDate));
        }

        const report = await db.select({
            outcome: schema.salesVisits.outcome,
            count: count(schema.salesVisits.id),
            avgDurationMinutes: sql<number>`ROUND(AVG(EXTRACT(EPOCH FROM (${schema.salesVisits.completedAt} - ${schema.salesVisits.startedAt})) / 60))`,
        })
            .from(schema.salesVisits)
            .where(and(...conditions))
            .groupBy(schema.salesVisits.outcome);

        return { success: true, data: report };
    });
};
