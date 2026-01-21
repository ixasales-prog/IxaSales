import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, sum, count } from 'drizzle-orm';

export const reportRoutes = new Elysia({ prefix: '/reports' })
    .use(authPlugin)

    // Middleware: Reporting typically restricted to Admin/Super/Supervisor
    .onBeforeHandle(({ user, set }: any) => {
        if (!user) {
            set.status = 401;
            return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
        }
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } };
        }
        return; // Proceed with request
    })

    // ----------------------------------------------------------------
    // SALES REPORTS
    // ----------------------------------------------------------------

    .get('/sales-by-rep', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                salesRepId: schema.users.id,
                salesRepName: schema.users.name,
                totalOrders: count(schema.orders.id), // Approximate
                totalSales: sum(schema.orders.totalAmount),
            })
            .from(schema.orders)
            .leftJoin(schema.users, eq(schema.orders.salesRepId, schema.users.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`,
                eq(schema.orders.status, 'delivered')
            ))
            .groupBy(schema.users.id, schema.users.name);

        return { success: true, data: report };
    })

    .get('/sales-by-product', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                productId: schema.products.id,
                productName: schema.products.name,
                qtySold: sum(schema.orderItems.qtyOrdered),
                totalRevenue: sum(schema.orderItems.lineTotal),
            })
            .from(schema.orderItems)
            .leftJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`,
                eq(schema.orders.status, 'delivered')
            ))
            .groupBy(schema.products.id, schema.products.name)
            .orderBy(desc(sum(schema.orderItems.lineTotal)))
            .limit(50);

        return { success: true, data: report };
    })

    .get('/recent-orders', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                customerName: schema.customers.name,
                totalAmount: schema.orders.totalAmount,
                status: schema.orders.status,
                createdAt: schema.orders.createdAt,
            })
            .from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(
                user.role !== 'super_admin' ? eq(schema.orders.tenantId, user.tenantId) : sql`true`
            )
            .orderBy(desc(schema.orders.createdAt))
            .limit(10);

        return { success: true, data: report };
    })

    .get('/low-stock', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                stockQuantity: schema.products.stockQuantity,
                reorderPoint: schema.products.reorderPoint,
                sku: schema.products.sku,
            })
            .from(schema.products)
            .where(and(
                user.role !== 'super_admin' ? eq(schema.products.tenantId, user.tenantId) : sql`true`,
                eq(schema.products.isActive, true),
                sql`${schema.products.stockQuantity} <= ${schema.products.reorderPoint}`
            ))
            .orderBy(schema.products.stockQuantity)
            .limit(20);

        return { success: true, data: report };
    })

    // ----------------------------------------------------------------
    // FINANCIAL REPORTS
    // ----------------------------------------------------------------

    .get('/customer-debts', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                code: schema.customers.code,
                debtBalance: schema.customers.debtBalance,
                creditLimit: schema.customerTiers.creditLimit,
            })
            .from(schema.customers)
            .leftJoin(schema.customerTiers, eq(schema.customers.tierId, schema.customerTiers.id))
            .where(and(
                user.role !== 'super_admin' ? eq(schema.customers.tenantId, user.tenantId) : sql`true`,
                sql`${schema.customers.debtBalance} > 0`
            ))
            .orderBy(desc(schema.customers.debtBalance));

        return { success: true, data: report };
    })

    // ----------------------------------------------------------------
    // INVENTORY REPORTS
    // ----------------------------------------------------------------

    .get('/inventory-valuation', async (ctx) => {
        const { user } = ctx as any;

        const report = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                stockQuantity: schema.products.stockQuantity,
                costPrice: schema.products.costPrice,
                valuation: sql<number>`${schema.products.stockQuantity} * ${schema.products.costPrice}`,
            })
            .from(schema.products)
            .where(and(
                user.role !== 'super_admin' ? eq(schema.products.tenantId, user.tenantId) : sql`true`,
                eq(schema.products.isActive, true)
            ));

        // Calculate totals in JS or SQL? 
        // Individual lines sent for chart/table
        return { success: true, data: report };
    });
