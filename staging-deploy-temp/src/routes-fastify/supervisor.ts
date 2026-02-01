import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

const ListApprovalsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String())
});

const ApprovalIdParamsSchema = Type.Object({ id: Type.String() });

const ListTeamQuerySchema = Type.Object({
    supervisorId: Type.Optional(Type.String())
});

const InsightIdParamsSchema = Type.Object({ id: Type.String() });

type ListApprovalsQuery = Static<typeof ListApprovalsQuerySchema>;

type ApprovalItem = {
    id: string;
    type: 'order' | 'return';
    label: string;
    customerName: string | null;
    amount: string | null;
    status: string | null;
    createdAt: Date | null;
};

const DEFAULT_TARGET_REVENUE = 100000;

export const supervisorRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Querystring: ListApprovalsQuery }>('/approvals', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListApprovalsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { page: pageStr = '1', limit: limitStr = '20' } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);

        const orders = await db.select({
            id: schema.orders.id,
            orderNumber: schema.orders.orderNumber,
            totalAmount: schema.orders.totalAmount,
            status: schema.orders.status,
            createdAt: schema.orders.createdAt,
            customerName: schema.customers.name,
        }).from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(
                eq(schema.orders.tenantId, user.tenantId),
                inArray(schema.orders.status, ['pending', 'confirmed'] as any)
            ))
            .orderBy(desc(schema.orders.createdAt))
            .limit(100);

        const returns = await db.select({
            id: schema.returns.id,
            reason: schema.returns.reason,
            qtyReturned: schema.returns.qtyReturned,
            status: sql<string>`CASE WHEN ${schema.returns.processedAt} IS NOT NULL THEN 'processed' ELSE 'pending' END`,
            createdAt: schema.returns.createdAt,
            customerName: schema.customers.name,
            productName: schema.products.name,
        }).from(schema.returns)
            .leftJoin(schema.orders, eq(schema.returns.orderId, schema.orders.id))
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .leftJoin(schema.products, eq(schema.returns.productId, schema.products.id))
            .where(and(eq(schema.returns.tenantId, user.tenantId), sql`${schema.returns.processedAt} IS NULL`))
            .orderBy(desc(schema.returns.createdAt))
            .limit(100);

        const approvals: ApprovalItem[] = [
            ...orders.map(order => ({
                id: `order:${order.id}`,
                type: 'order' as const,
                label: order.orderNumber,
                customerName: order.customerName,
                amount: order.totalAmount?.toString() ?? null,
                status: order.status,
                createdAt: order.createdAt,
            })),
            ...returns.map(item => ({
                id: `return:${item.id}`,
                type: 'return' as const,
                label: item.productName || item.reason,
                customerName: item.customerName,
                amount: item.qtyReturned?.toString() ?? null,
                status: item.status,
                createdAt: item.createdAt,
            }))
        ].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

        const start = (page - 1) * limit;
        const paged = approvals.slice(start, start + limit);

        return {
            success: true,
            data: paged,
            meta: { page, limit, total: approvals.length, totalPages: Math.ceil(approvals.length / limit) }
        };
    });

    fastify.get<{ Params: Static<typeof ApprovalIdParamsSchema> }>('/approvals/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ApprovalIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const [kind, rawId] = id.includes(':') ? id.split(':') : ['order', id];

        if (kind === 'return') {
            const [returnItem] = await db.select({
                id: schema.returns.id,
                reason: schema.returns.reason,
                reasonNotes: schema.returns.reasonNotes,
                qtyReturned: schema.returns.qtyReturned,
                status: sql<string>`CASE WHEN ${schema.returns.processedAt} IS NOT NULL THEN 'processed' ELSE 'pending' END`,
                createdAt: schema.returns.createdAt,
                customerName: schema.customers.name,
                productName: schema.products.name,
            }).from(schema.returns)
                .leftJoin(schema.orders, eq(schema.returns.orderId, schema.orders.id))
                .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                .leftJoin(schema.products, eq(schema.returns.productId, schema.products.id))
                .where(and(eq(schema.returns.id, rawId), eq(schema.returns.tenantId, user.tenantId)))
                .limit(1);

            if (!returnItem) {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            }

            return { success: true, data: { type: 'return', ...returnItem } };
        }

        const [order] = await db.select({
            id: schema.orders.id,
            orderNumber: schema.orders.orderNumber,
            totalAmount: schema.orders.totalAmount,
            status: schema.orders.status,
            createdAt: schema.orders.createdAt,
            notes: schema.orders.notes,
            customerName: schema.customers.name,
        }).from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(and(eq(schema.orders.id, rawId), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        return { success: true, data: { type: 'order', ...order } };
    });

    fastify.get<{ Querystring: Static<typeof ListTeamQuerySchema> }>('/team', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListTeamQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const supervisorId = user.role === 'supervisor' ? user.id : request.query.supervisorId;

        const reps = await db.select({
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            phone: schema.users.phone,
            isActive: schema.users.isActive,
            lastLoginAt: schema.users.lastLoginAt,
            supervisorId: schema.users.supervisorId,
        }).from(schema.users)
            .where(and(
                eq(schema.users.tenantId, user.tenantId),
                eq(schema.users.role, 'sales_rep'),
                supervisorId ? eq(schema.users.supervisorId, supervisorId) : sql`true`
            ))
            .orderBy(desc(schema.users.createdAt));

        return { success: true, data: reps };
    });

    fastify.get('/team/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: Type.Object({ id: Type.String() }) },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const params = request.params as { id: string };
        const { id } = params;
        const [rep] = await db.select({
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            phone: schema.users.phone,
            isActive: schema.users.isActive,
            lastLoginAt: schema.users.lastLoginAt,
            createdAt: schema.users.createdAt,
        }).from(schema.users)
            .where(and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId)))
            .limit(1);

        if (!rep) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const [orderStats] = await db.select({
            total: sql<number>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
            count: sql<number>`COUNT(*)`,
        }).from(schema.orders)
            .where(and(eq(schema.orders.salesRepId, id), eq(schema.orders.tenantId, user.tenantId)));

        return { success: true, data: { ...rep, orderCount: orderStats?.count ?? 0, orderTotal: orderStats?.total ?? 0 } };
    });

    fastify.get('/insights', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7);
        const prevWeek = new Date(now);
        prevWeek.setDate(now.getDate() - 14);

        const [currentWeek] = await db.select({
            total: sql<number>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
        }).from(schema.orders)
            .where(and(eq(schema.orders.tenantId, user.tenantId), gte(schema.orders.createdAt, lastWeek)));

        const [previousWeek] = await db.select({
            total: sql<number>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
        }).from(schema.orders)
            .where(and(eq(schema.orders.tenantId, user.tenantId), gte(schema.orders.createdAt, prevWeek), sql`${schema.orders.createdAt} < ${lastWeek}`));

        const [lowStock] = await db.select({
            count: sql<number>`COUNT(*)`,
        }).from(schema.products)
            .where(and(eq(schema.products.tenantId, user.tenantId), sql`${schema.products.stockQuantity} <= ${schema.products.reorderPoint}`));

        const weeklyDelta = (currentWeek?.total ?? 0) - (previousWeek?.total ?? 0);
        const weeklyPercent = previousWeek?.total ? (weeklyDelta / previousWeek.total) * 100 : 0;

        const insights = [
            { id: 'weekly-trend', title: 'Weekly Trend', value: Number(currentWeek?.total ?? 0), deltaPercent: Number(weeklyPercent.toFixed(1)) },
            { id: 'target-hit', title: 'Target Hit', value: Number(((Number(currentWeek?.total ?? 0) / DEFAULT_TARGET_REVENUE) * 100).toFixed(1)) },
            { id: 'exceptions', title: 'Exceptions', value: Number(lowStock?.count ?? 0) },
        ];

        return { success: true, data: insights };
    });

    fastify.get<{ Params: Static<typeof InsightIdParamsSchema> }>('/insights/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: InsightIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['supervisor', 'tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        if (id === 'exceptions') {
            const [lowStock] = await db.select({
                count: sql<number>`COUNT(*)`,
            }).from(schema.products)
                .where(and(eq(schema.products.tenantId, user.tenantId), sql`${schema.products.stockQuantity} <= ${schema.products.reorderPoint}`));
            return { success: true, data: { id, title: 'Exceptions', value: Number(lowStock?.count ?? 0) } };
        }

        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 7);

        const [currentWeek] = await db.select({
            total: sql<number>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
        }).from(schema.orders)
            .where(and(eq(schema.orders.tenantId, user.tenantId), gte(schema.orders.createdAt, start)));

        if (id === 'target-hit') {
            const value = Number(((Number(currentWeek?.total ?? 0) / DEFAULT_TARGET_REVENUE) * 100).toFixed(1));
            return { success: true, data: { id, title: 'Target Hit', value } };
        }

        return { success: true, data: { id: 'weekly-trend', title: 'Weekly Trend', value: Number(currentWeek?.total ?? 0) } };
    });
};
