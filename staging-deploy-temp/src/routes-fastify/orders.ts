import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { buildSalesCustomerAssignmentCondition, buildSalesCustomerScope } from '../lib/sales-scope';
import { getTenantDayRange } from '../lib/tenant-time';
import { VisitsService } from '../services/visits.service';
import { ordersService } from '../services/orders.service';
import { eq, and, sql, desc, inArray, gte, lt } from 'drizzle-orm';

// Schemas
const DashboardStatsQuerySchema = Type.Object({});

const ListOrdersQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    paymentStatus: Type.Optional(Type.String()),
    customerId: Type.Optional(Type.String()),
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),
});

const CreateOrderItemSchema = Type.Object({
    productId: Type.String(),
    unitPrice: Type.Number({ minimum: 0 }),
    qtyOrdered: Type.Number({ minimum: 1 }),
    lineTotal: Type.Number({ minimum: 0 }),
});

const CreateOrderBodySchema = Type.Object({
    customerId: Type.String(),
    salesRepId: Type.Optional(Type.String()),
    subtotalAmount: Type.Number({ minimum: 0 }),
    discountAmount: Type.Optional(Type.Number({ minimum: 0 })),
    taxAmount: Type.Optional(Type.Number({ minimum: 0 })),
    totalAmount: Type.Number({ minimum: 0 }),
    notes: Type.Optional(Type.String()),
    requestedDeliveryDate: Type.Optional(Type.String()),
    items: Type.Array(CreateOrderItemSchema),
});

const GetOrderParamsSchema = Type.Object({
    id: Type.String(),
});

const UpdateStatusBodySchema = Type.Object({
    status: Type.String(),
    notes: Type.Optional(Type.String()),
});

const CancelOrderBodySchema = Type.Object({
    reason: Type.Optional(Type.String()),
});

type ListOrdersQuery = Static<typeof ListOrdersQuerySchema>;
type CreateOrderBody = Static<typeof CreateOrderBodySchema>;
type UpdateStatusBody = Static<typeof UpdateStatusBodySchema>;
type CancelOrderBody = Static<typeof CancelOrderBodySchema>;

export const orderRoutes: FastifyPluginAsync = async (fastify) => {
    const visitsService = new VisitsService();

    // ----------------------------------------------------------------
    // DASHBOARD STATS
    // ----------------------------------------------------------------
    fastify.get('/dashboard-stats', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }

        const { startOfDay, endOfDay, todayStr } = await getTenantDayRange(user.tenantId);

        const orderConditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const [todaySales] = await db
            .select({
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'delivered'),
                gte(schema.orders.createdAt, startOfDay),
                lt(schema.orders.createdAt, endOfDay)
            ));

        const [pendingOrders] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'pending')
            ));

        const customerConditions: any[] = [buildSalesCustomerScope(user.tenantId, user.id)];

        const [customerCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.customers)
            .where(and(...customerConditions));

        const visitConditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            eq(schema.salesVisits.plannedDate, todayStr)
        ];
        visitConditions.push(eq(schema.salesVisits.salesRepId, user.id));

        const [visitStats] = await db
            .select({
                total: sql<number>`count(*)`,
                completed: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                inProgress: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'in_progress')`,
            })
            .from(schema.salesVisits)
            .where(and(...visitConditions));

        // Week-over-week comparison
        const lastWeekStart = new Date(startOfDay);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() + 1);

        const [lastWeekSales] = await db
            .select({
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'delivered'),
                gte(schema.orders.createdAt, lastWeekStart),
                lt(schema.orders.createdAt, lastWeekEnd)
            ));

        // Top customers with debt (top 5)
        const topCustomersWithDebt = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                debtBalance: schema.customers.debtBalance,
                phone: schema.customers.phone,
                address: schema.customers.address,
            })
            .from(schema.customers)
            .where(and(
                ...customerConditions,
                sql`${schema.customers.debtBalance} > 0`
            ))
            .orderBy(desc(schema.customers.debtBalance))
            .limit(5);

        // Outstanding debt summary
        const [debtSummary] = await db
            .select({
                totalDebt: sql<number>`coalesce(sum(${schema.customers.debtBalance}), 0)`,
                customerCount: sql<number>`count(*) filter (where ${schema.customers.debtBalance} > 0)`,
            })
            .from(schema.customers)
            .where(and(...customerConditions));

        const todaySalesValue = Number(todaySales?.total || 0);
        const lastWeekSalesValue = Number(lastWeekSales?.total || 0);
        const weekOverWeekChange = lastWeekSalesValue > 0
            ? ((todaySalesValue - lastWeekSalesValue) / lastWeekSalesValue) * 100
            : 0;

        return {
            success: true,
            data: {
                todaysSales: todaySalesValue,
                pendingOrders: Number(pendingOrders?.count || 0),
                customerCount: Number(customerCount?.count || 0),
                visits: {
                    total: Number(visitStats?.total || 0),
                    completed: Number(visitStats?.completed || 0),
                    inProgress: Number(visitStats?.inProgress || 0),
                },
                // Phase 1 enhancements
                weekOverWeek: {
                    thisWeek: todaySalesValue,
                    lastWeek: lastWeekSalesValue,
                    change: weekOverWeekChange,
                    changeAmount: todaySalesValue - lastWeekSalesValue,
                },
                topCustomersWithDebt: topCustomersWithDebt.map(c => ({
                    id: c.id,
                    name: c.name,
                    debtBalance: Number(c.debtBalance || 0),
                    phone: c.phone,
                    address: c.address,
                })),
                debtSummary: {
                    totalDebt: Number(debtSummary?.totalDebt || 0),
                    customerCount: Number(debtSummary?.customerCount || 0),
                },
            }
        };
    });

    // ----------------------------------------------------------------
    // CONSOLIDATED SALES DASHBOARD
    // ----------------------------------------------------------------
    fastify.get('/dashboard/sales', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }

        const { startOfDay, endOfDay, todayStr } = await getTenantDayRange(user.tenantId);

        const orderConditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const [todaySales] = await db
            .select({ total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)` })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'delivered'),
                gte(schema.orders.createdAt, startOfDay),
                lt(schema.orders.createdAt, endOfDay)
            ));

        const [pendingOrders] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'pending')
            ));

        const customerConditions: any[] = [buildSalesCustomerScope(user.tenantId, user.id)];
        const [customerCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.customers)
            .where(and(...customerConditions));

        const visitConditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            eq(schema.salesVisits.plannedDate, todayStr),
            eq(schema.salesVisits.salesRepId, user.id)
        ];

        const [visitStats] = await db
            .select({
                total: sql<number>`count(*)`,
                completed: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                inProgress: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'in_progress')`,
            })
            .from(schema.salesVisits)
            .where(and(...visitConditions));

        const lastWeekStart = new Date(startOfDay);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() + 1);

        const [lastWeekSales] = await db
            .select({ total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)` })
            .from(schema.orders)
            .where(and(
                ...orderConditions,
                eq(schema.orders.status, 'delivered'),
                gte(schema.orders.createdAt, lastWeekStart),
                lt(schema.orders.createdAt, lastWeekEnd)
            ));

        const topCustomersWithDebt = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                debtBalance: schema.customers.debtBalance,
                phone: schema.customers.phone,
                address: schema.customers.address,
            })
            .from(schema.customers)
            .where(and(
                ...customerConditions,
                sql`${schema.customers.debtBalance} > 0`
            ))
            .orderBy(desc(schema.customers.debtBalance))
            .limit(5);

        const [debtSummary] = await db
            .select({
                totalDebt: sql<number>`coalesce(sum(${schema.customers.debtBalance}), 0)`,
                customerCount: sql<number>`count(*) filter (where ${schema.customers.debtBalance} > 0)`,
            })
            .from(schema.customers)
            .where(and(...customerConditions));

        const todaySalesValue = Number(todaySales?.total || 0);
        const lastWeekSalesValue = Number(lastWeekSales?.total || 0);
        const weekOverWeekChange = lastWeekSalesValue > 0
            ? ((todaySalesValue - lastWeekSalesValue) / lastWeekSalesValue) * 100
            : 0;

        const goals = await db
            .select()
            .from(schema.tenantSettings)
            .where(and(
                eq(schema.tenantSettings.tenantId, user.tenantId),
                sql`${schema.tenantSettings.key} LIKE 'sales_goal_%'`
            ));

        const goalsMap: Record<string, number> = {};
        goals.forEach(g => {
            const period = g.key.replace('sales_goal_', '');
            goalsMap[period] = parseFloat(g.value || '0');
        });

        const periodStartDate = new Date(startOfDay);
        periodStartDate.setDate(periodStartDate.getDate() - 7);

        const trendsConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, periodStartDate)
        ];
        trendsConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const dailySales = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...trendsConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(sql`DATE(${schema.orders.createdAt})`);

        const insightStartDate = new Date(startOfDay);
        insightStartDate.setDate(insightStartDate.getDate() - 30);

        const insightConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, insightStartDate)
        ];
        insightConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const hourlySales = await db
            .select({
                hour: sql<number>`EXTRACT(HOUR FROM ${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...insightConditions))
            .groupBy(sql`EXTRACT(HOUR FROM ${schema.orders.createdAt})`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`));

        const dailyInsightSales = await db
            .select({
                dayOfWeek: sql<number>`EXTRACT(DOW FROM ${schema.orders.createdAt})`,
                dayName: sql<string>`TO_CHAR(${schema.orders.createdAt}, 'Day')`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...insightConditions))
            .groupBy(sql`EXTRACT(DOW FROM ${schema.orders.createdAt})`, sql`TO_CHAR(${schema.orders.createdAt}, 'Day')`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`));

        const metricsConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, insightStartDate)
        ];
        metricsConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const [orderStats] = await db
            .select({
                totalRevenue: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                totalOrders: sql<number>`count(*)`,
                avgOrderValue: sql<number>`coalesce(avg(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...metricsConditions));

        const [visitStats30d] = await db
            .select({
                totalVisits: sql<number>`count(*)`,
                completedVisits: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                visitsWithOrders: sql<number>`count(*) filter (where ${schema.salesVisits.outcome} = 'order_placed')`,
            })
            .from(schema.salesVisits)
            .where(and(
                eq(schema.salesVisits.tenantId, user.tenantId),
                eq(schema.salesVisits.salesRepId, user.id),
                gte(schema.salesVisits.plannedDate, insightStartDate.toISOString().split('T')[0])
            ));

        const [customerStats] = await db
            .select({ newCustomers: sql<number>`count(*)` })
            .from(schema.customers)
            .where(and(
                buildSalesCustomerScope(user.tenantId, user.id),
                gte(schema.customers.createdAt, insightStartDate)
            ));

        const totalRevenue = Number(orderStats?.totalRevenue || 0);
        const totalOrders = Number(orderStats?.totalOrders || 0);
        const avgOrderValue = Number(orderStats?.avgOrderValue || 0);
        const totalVisits = Number(visitStats30d?.totalVisits || 0);
        const completedVisits = Number(visitStats30d?.completedVisits || 0);
        const visitsWithOrders = Number(visitStats30d?.visitsWithOrders || 0);
        const newCustomers = Number(customerStats?.newCustomers || 0);

        const conversionRate = totalVisits > 0 ? (visitsWithOrders / totalVisits) * 100 : 0;
        const visitCompletionRate = totalVisits > 0 ? (completedVisits / totalVisits) * 100 : 0;

        const routeVisits = await db
            .select({
                visitId: schema.salesVisits.id,
                customerId: schema.customers.id,
                customerName: schema.customers.name,
                customerAddress: schema.customers.address,
                latitude: schema.customers.latitude,
                longitude: schema.customers.longitude,
                plannedTime: schema.salesVisits.plannedTime,
                visitType: schema.salesVisits.visitType,
            })
            .from(schema.salesVisits)
            .innerJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .where(and(
                eq(schema.salesVisits.tenantId, user.tenantId),
                eq(schema.salesVisits.plannedDate, todayStr),
                eq(schema.salesVisits.status, 'planned'),
                eq(schema.salesVisits.salesRepId, user.id)
            ));

        const visitsWithCoords = routeVisits
            .filter(v => v.latitude && v.longitude)
            .map(visit => ({
                visitId: visit.visitId,
                customerId: visit.customerId,
                customerName: visit.customerName,
                customerAddress: visit.customerAddress,
                latitude: Number(visit.latitude || 0),
                longitude: Number(visit.longitude || 0),
                plannedTime: visit.plannedTime,
                visitType: visit.visitType,
            }));

        const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        const optimizedRoute: Array<typeof visitsWithCoords[0] & { sequence: number }> = [];
        const unvisited = [...visitsWithCoords];
        if (unvisited.length > 0) {
            let current = unvisited.shift()!;
            optimizedRoute.push({ ...current, sequence: 1 });

            while (unvisited.length > 0) {
                let nearestIndex = 0;
                let nearestDistance = Infinity;

                for (let i = 0; i < unvisited.length; i++) {
                    const distance = haversineDistance(
                        current.latitude,
                        current.longitude,
                        unvisited[i].latitude,
                        unvisited[i].longitude
                    );
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestIndex = i;
                    }
                }

                current = unvisited.splice(nearestIndex, 1)[0];
                optimizedRoute.push({ ...current, sequence: optimizedRoute.length + 1 });
            }
        }

        let totalDistance = 0;
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
            totalDistance += haversineDistance(
                optimizedRoute[i].latitude,
                optimizedRoute[i].longitude,
                optimizedRoute[i + 1].latitude,
                optimizedRoute[i + 1].longitude
            );
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const gamificationConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, thirtyDaysAgo)
        ];
        gamificationConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const gamificationDailySales = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...gamificationConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(desc(sql`DATE(${schema.orders.createdAt})`));

        let currentStreak = 0;
        const salesDates = new Set(gamificationDailySales.map(d => d.date));
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i);
            const checkDateStr = checkDate.toISOString().split('T')[0];
            if (salesDates.has(checkDateStr)) {
                currentStreak++;
            } else {
                break;
            }
        }

        const [totalSales] = await db
            .select({
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...gamificationConditions));

        const totalSalesValue = Number(totalSales?.total || 0);
        const totalOrdersValue = Number(totalSales?.orderCount || 0);

        const achievements = [] as Array<{ id: string; name: string; description: string; icon: string }>;
        if (currentStreak >= 7) achievements.push({ id: 'streak_7', name: 'Week Warrior', description: '7 day sales streak', icon: '🔥' });
        if (currentStreak >= 30) achievements.push({ id: 'streak_30', name: 'Month Master', description: '30 day sales streak', icon: '⭐' });
        if (totalSalesValue >= 10000000) achievements.push({ id: 'sales_10m', name: 'Millionaire', description: '10M in sales', icon: '💰' });
        if (totalOrdersValue >= 100) achievements.push({ id: 'orders_100', name: 'Centurion', description: '100 orders', icon: '🎯' });
        if (totalOrdersValue >= 500) achievements.push({ id: 'orders_500', name: 'Sales Legend', description: '500 orders', icon: '👑' });

        const [bestDay] = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...gamificationConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`))
            .limit(1);

        const [tenant] = await db
            .select({
                timezone: schema.tenants.timezone,
                city: schema.tenants.city,
                country: schema.tenants.country,
                openWeatherApiKey: schema.tenants.openWeatherApiKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        const city = tenant?.city || 'Tashkent';
        const country = tenant?.country || 'UZ';
        let weatherData = {
            city,
            temperature: 22,
            condition: 'Clear',
            description: 'clear sky',
            icon: '01d',
            humidity: 65,
            windSpeed: 5,
            feelsLike: 24,
            note: 'Mock data - configure OpenWeather API key in Business Settings for real weather',
        };

        try {
            const apiKey = tenant?.openWeatherApiKey || process.env.OPENWEATHER_API_KEY;
            if (apiKey) {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&appid=${apiKey}&units=metric`;
                const response = await fetch(weatherUrl);
                if (response.ok) {
                    const data = await response.json();
                    weatherData = {
                        city: data.name,
                        temperature: Math.round(data.main.temp),
                        condition: data.weather[0].main,
                        description: data.weather[0].description,
                        icon: data.weather[0].icon,
                        humidity: data.main.humidity,
                        windSpeed: data.wind?.speed || 0,
                        feelsLike: Math.round(data.main.feels_like),
                        note: 'Live weather data',
                    };
                }
            }
        } catch {
            // fall back to mock
        }

        const followUps = await visitsService.getFollowUpSummary(user.tenantId, user.id, user.role);

        return {
            success: true,
            data: {
                stats: {
                    todaysSales: todaySalesValue,
                    pendingOrders: Number(pendingOrders?.count || 0),
                    customerCount: Number(customerCount?.count || 0),
                    visits: {
                        total: Number(visitStats?.total || 0),
                        completed: Number(visitStats?.completed || 0),
                        inProgress: Number(visitStats?.inProgress || 0),
                    },
                    weekOverWeek: {
                        thisWeek: todaySalesValue,
                        lastWeek: lastWeekSalesValue,
                        change: weekOverWeekChange,
                        changeAmount: todaySalesValue - lastWeekSalesValue,
                    },
                    topCustomersWithDebt: topCustomersWithDebt.map(c => ({
                        id: c.id,
                        name: c.name,
                        debtBalance: Number(c.debtBalance || 0),
                        phone: c.phone,
                        address: c.address,
                    })),
                    debtSummary: {
                        totalDebt: Number(debtSummary?.totalDebt || 0),
                        customerCount: Number(debtSummary?.customerCount || 0),
                    },
                },
                goals: {
                    daily: goalsMap.daily || 0,
                    weekly: goalsMap.weekly || 0,
                    monthly: goalsMap.monthly || 0,
                },
                salesTrends: dailySales.map((d: { date: string; total: number; orderCount: number }) => ({
                    date: d.date,
                    sales: Number(d.total),
                    orders: Number(d.orderCount),
                })),
                timeInsights: {
                    bestHours: hourlySales.slice(0, 5).map(h => ({
                        hour: Number(h.hour),
                        sales: Number(h.total),
                        orders: Number(h.orderCount),
                    })),
                    bestDays: dailyInsightSales.map(d => ({
                        dayOfWeek: Number(d.dayOfWeek),
                        dayName: d.dayName.trim(),
                        sales: Number(d.total),
                        orders: Number(d.orderCount),
                    })),
                },
                performanceMetrics: {
                    totalRevenue,
                    totalOrders,
                    avgOrderValue,
                    conversionRate: Number(conversionRate.toFixed(2)),
                    visitCompletionRate: Number(visitCompletionRate.toFixed(2)),
                    newCustomers,
                    totalVisits,
                    completedVisits,
                    visitsWithOrders,
                },
                routeOptimization: {
                    visits: optimizedRoute,
                    totalVisits: optimizedRoute.length,
                    estimatedDistance: Number(totalDistance.toFixed(2)),
                    estimatedTime: Math.round(totalDistance * 2),
                },
                gamification: {
                    currentStreak,
                    totalSales: totalSalesValue,
                    totalOrders: totalOrdersValue,
                    achievements,
                    bestDay: bestDay ? { date: bestDay.date, sales: Number(bestDay.total) } : null,
                },
                weather: weatherData,
                followUps,
            }
        };
    });

    // Sales goals management
    fastify.get('/sales-goals', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }

        // Get goals from tenant settings
        const goals = await db
            .select()
            .from(schema.tenantSettings)
            .where(and(
                eq(schema.tenantSettings.tenantId, user.tenantId),
                sql`${schema.tenantSettings.key} LIKE 'sales_goal_%'`
            ));

        const goalsMap: Record<string, number> = {};
        goals.forEach(g => {
            const period = g.key.replace('sales_goal_', '');
            goalsMap[period] = parseFloat(g.value || '0');
        });

        return {
            success: true,
            data: {
                daily: goalsMap.daily || 0,
                weekly: goalsMap.weekly || 0,
                monthly: goalsMap.monthly || 0,
            }
        };
    });

    const SalesGoalsBodySchema = Type.Object({
        daily: Type.Optional(Type.Number({ minimum: 0 })),
        weekly: Type.Optional(Type.Number({ minimum: 0 })),
        monthly: Type.Optional(Type.Number({ minimum: 0 })),
    });

    fastify.put<{ Body: Static<typeof SalesGoalsBodySchema> }>('/sales-goals', {
        preHandler: [fastify.authenticate],
        schema: { body: SalesGoalsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { daily, weekly, monthly } = request.body;

        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Only admins and supervisors can set goals' } };
        }

        // Upsert goals using PostgreSQL ON CONFLICT for better performance
        const goals = [
            { key: 'sales_goal_daily', value: (daily || 0).toString() },
            { key: 'sales_goal_weekly', value: (weekly || 0).toString() },
            { key: 'sales_goal_monthly', value: (monthly || 0).toString() },
        ];

        for (const goal of goals) {
            // Try to use ON CONFLICT if unique constraint exists, otherwise fall back to select/update/insert
            try {
                await db.execute(sql`
                    INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
                    VALUES (${user.tenantId}, ${goal.key}, ${goal.value}, NOW())
                    ON CONFLICT (tenant_id, key) 
                    DO UPDATE SET value = ${goal.value}, updated_at = NOW()
                `);
            } catch (e: any) {
                // Fallback if unique constraint doesn't exist yet
                const existing = await db
                    .select()
                    .from(schema.tenantSettings)
                    .where(and(
                        eq(schema.tenantSettings.tenantId, user.tenantId),
                        eq(schema.tenantSettings.key, goal.key)
                    ))
                    .limit(1);

                if (existing.length > 0) {
                    await db
                        .update(schema.tenantSettings)
                        .set({ value: goal.value, updatedAt: new Date() })
                        .where(eq(schema.tenantSettings.id, existing[0].id));
                } else {
                    await db
                        .insert(schema.tenantSettings)
                        .values({
                            tenantId: user.tenantId,
                            key: goal.key,
                            value: goal.value,
                        });
                }
            }
        }

        return {
            success: true,
            data: {
                daily: daily || 0,
                weekly: weekly || 0,
                monthly: monthly || 0,
            }
        };
    });

    // Sales trends analytics (for charts)
    fastify.get<{ Querystring: { period?: string } }>('/sales-trends', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }
        const period = request.query.period || '7d';
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

        const [tenant] = await db
            .select({ timezone: schema.tenants.timezone })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        const timezone = tenant?.timezone || 'Asia/Tashkent';
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - days);

        const orderConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, startDate)
        ];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const dailySales = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(sql`DATE(${schema.orders.createdAt})`);

        return {
            success: true,
            data: dailySales.map((d: { date: string; total: number; orderCount: number }) => ({
                date: d.date,
                sales: Number(d.total),
                orders: Number(d.orderCount),
            }))
        };
    });

    // Product performance metrics
    fastify.get<{ Querystring: { days?: string; limit?: string } }>('/product-performance', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        const days = parseInt(request.query.days || '30');
        const limit = parseInt(request.query.limit || '10');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const orderConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, startDate)
        ];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const productPerformance = await db
            .select({
                productId: schema.orderItems.productId,
                productName: schema.products.name,
                productCode: schema.products.sku, // Using SKU instead of code
                totalRevenue: sql<number>`coalesce(sum(${schema.orderItems.lineTotal}), 0)`,
                totalQuantity: sql<number>`coalesce(sum(${schema.orderItems.qtyOrdered}), 0)`,
                orderCount: sql<number>`count(distinct ${schema.orderItems.orderId})`,
            })
            .from(schema.orderItems)
            .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
            .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(and(...orderConditions))
            .groupBy(schema.orderItems.productId, schema.products.name, schema.products.sku)
            .orderBy(desc(sql`sum(${schema.orderItems.lineTotal})`))
            .limit(limit);

        return {
            success: true,
            data: productPerformance.map(p => ({
                productId: p.productId,
                productName: p.productName,
                productCode: p.productCode,
                revenue: Number(p.totalRevenue),
                quantity: Number(p.totalQuantity),
                orderCount: Number(p.orderCount),
            }))
        };
    });

    // Time-based insights
    fastify.get('/time-insights', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }
        const days = 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const orderConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, startDate)
        ];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const hourlySales = await db
            .select({
                hour: sql<number>`EXTRACT(HOUR FROM ${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions))
            .groupBy(sql`EXTRACT(HOUR FROM ${schema.orders.createdAt})`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`));

        const dailySales = await db
            .select({
                dayOfWeek: sql<number>`EXTRACT(DOW FROM ${schema.orders.createdAt})`,
                dayName: sql<string>`TO_CHAR(${schema.orders.createdAt}, 'Day')`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions))
            .groupBy(sql`EXTRACT(DOW FROM ${schema.orders.createdAt})`, sql`TO_CHAR(${schema.orders.createdAt}, 'Day')`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`));

        return {
            success: true,
            data: {
                bestHours: hourlySales.slice(0, 5).map(h => ({
                    hour: Number(h.hour),
                    sales: Number(h.total),
                    orders: Number(h.orderCount),
                })),
                bestDays: dailySales.map(d => ({
                    dayOfWeek: Number(d.dayOfWeek),
                    dayName: d.dayName.trim(),
                    sales: Number(d.total),
                    orders: Number(d.orderCount),
                })),
            }
        };
    });

    // Performance metrics
    fastify.get('/performance-metrics', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }
        const days = 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const orderConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, startDate)
        ];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const [orderStats] = await db
            .select({
                totalRevenue: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                totalOrders: sql<number>`count(*)`,
                avgOrderValue: sql<number>`coalesce(avg(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions));

        const visitConditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            gte(schema.salesVisits.plannedDate, startDate.toISOString().split('T')[0])
        ];
        visitConditions.push(eq(schema.salesVisits.salesRepId, user.id));

        const [visitStats] = await db
            .select({
                totalVisits: sql<number>`count(*)`,
                completedVisits: sql<number>`count(*) filter (where ${schema.salesVisits.status} = 'completed')`,
                visitsWithOrders: sql<number>`count(*) filter (where ${schema.salesVisits.outcome} = 'order_placed')`,
            })
            .from(schema.salesVisits)
            .where(and(...visitConditions));

        const customerConditions: any[] = [
            buildSalesCustomerScope(user.tenantId, user.id),
            gte(schema.customers.createdAt, startDate)
        ];

        const [customerStats] = await db
            .select({
                newCustomers: sql<number>`count(*)`,
            })
            .from(schema.customers)
            .where(and(...customerConditions));

        const totalRevenue = Number(orderStats?.totalRevenue || 0);
        const totalOrders = Number(orderStats?.totalOrders || 0);
        const avgOrderValue = Number(orderStats?.avgOrderValue || 0);
        const totalVisits = Number(visitStats?.totalVisits || 0);
        const completedVisits = Number(visitStats?.completedVisits || 0);
        const visitsWithOrders = Number(visitStats?.visitsWithOrders || 0);
        const newCustomers = Number(customerStats?.newCustomers || 0);

        const conversionRate = totalVisits > 0 ? (visitsWithOrders / totalVisits) * 100 : 0;
        const visitCompletionRate = totalVisits > 0 ? (completedVisits / totalVisits) * 100 : 0;

        return {
            success: true,
            data: {
                totalRevenue,
                totalOrders,
                avgOrderValue,
                conversionRate: Number(conversionRate.toFixed(2)),
                visitCompletionRate: Number(visitCompletionRate.toFixed(2)),
                newCustomers,
                totalVisits,
                completedVisits,
                visitsWithOrders,
            }
        };
    });

    // Route optimization for today's visits
    fastify.get('/route-optimization', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }
        const { todayStr } = await getTenantDayRange(user.tenantId);
        const visitConditions: any[] = [
            eq(schema.salesVisits.tenantId, user.tenantId),
            eq(schema.salesVisits.plannedDate, todayStr),
            eq(schema.salesVisits.status, 'planned')
        ];
        if (user.role === 'sales_rep') {
            visitConditions.push(eq(schema.salesVisits.salesRepId, user.id));
        }

        const visits = await db
            .select({
                visitId: schema.salesVisits.id,
                customerId: schema.customers.id,
                customerName: schema.customers.name,
                customerAddress: schema.customers.address,
                latitude: schema.customers.latitude,
                longitude: schema.customers.longitude,
                plannedTime: schema.salesVisits.plannedTime,
                visitType: schema.salesVisits.visitType,
            })
            .from(schema.salesVisits)
            .innerJoin(schema.customers, eq(schema.salesVisits.customerId, schema.customers.id))
            .where(and(...visitConditions));

        const visitsWithCoords = visits
            .filter(v => v.latitude && v.longitude)
            .map(visit => ({
                visitId: visit.visitId,
                customerId: visit.customerId,
                customerName: visit.customerName,
                customerAddress: visit.customerAddress,
                latitude: Number(visit.latitude || 0),
                longitude: Number(visit.longitude || 0),
                plannedTime: visit.plannedTime,
                visitType: visit.visitType,
            }));

        const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        const optimizedRoute: Array<typeof visitsWithCoords[0] & { sequence: number }> = [];
        const unvisited = [...visitsWithCoords];

        if (unvisited.length > 0) {
            let current = unvisited.shift()!;
            optimizedRoute.push({ ...current, sequence: 1 });

            while (unvisited.length > 0) {
                let nearestIndex = 0;
                let nearestDistance = Infinity;

                for (let i = 0; i < unvisited.length; i++) {
                    const distance = haversineDistance(
                        current.latitude,
                        current.longitude,
                        unvisited[i].latitude,
                        unvisited[i].longitude
                    );
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestIndex = i;
                    }
                }

                current = unvisited.splice(nearestIndex, 1)[0];
                optimizedRoute.push({ ...current, sequence: optimizedRoute.length + 1 });
            }
        }

        let totalDistance = 0;
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
            totalDistance += haversineDistance(
                optimizedRoute[i].latitude,
                optimizedRoute[i].longitude,
                optimizedRoute[i + 1].latitude,
                optimizedRoute[i + 1].longitude
            );
        }

        return {
            success: true,
            data: {
                visits: optimizedRoute,
                totalVisits: optimizedRoute.length,
                estimatedDistance: Number(totalDistance.toFixed(2)),
                estimatedTime: Math.round(totalDistance * 2),
            }
        };
    });

    // Gamification - User achievements and streaks
    fastify.get('/gamification', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const orderConditions: any[] = [
            eq(schema.orders.tenantId, user.tenantId),
            eq(schema.orders.status, 'delivered'),
            gte(schema.orders.createdAt, thirtyDaysAgo)
        ];
        orderConditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));

        const dailySales = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(desc(sql`DATE(${schema.orders.createdAt})`));

        let currentStreak = 0;
        const today = new Date().toISOString().split('T')[0];
        const salesDates = new Set(dailySales.map(d => d.date));

        for (let i = 0; i < 365; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i);
            const checkDateStr = checkDate.toISOString().split('T')[0];

            if (salesDates.has(checkDateStr)) {
                currentStreak++;
            } else {
                break;
            }
        }

        const [totalSales] = await db
            .select({
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
                orderCount: sql<number>`count(*)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions));

        const totalSalesValue = Number(totalSales?.total || 0);
        const totalOrders = Number(totalSales?.orderCount || 0);

        const achievements = [];
        if (currentStreak >= 7) achievements.push({ id: 'streak_7', name: 'Week Warrior', description: '7 day sales streak', icon: '🔥' });
        if (currentStreak >= 30) achievements.push({ id: 'streak_30', name: 'Month Master', description: '30 day sales streak', icon: '⭐' });
        if (totalSalesValue >= 10000000) achievements.push({ id: 'sales_10m', name: 'Millionaire', description: '10M in sales', icon: '💰' });
        if (totalOrders >= 100) achievements.push({ id: 'orders_100', name: 'Centurion', description: '100 orders', icon: '🎯' });
        if (totalOrders >= 500) achievements.push({ id: 'orders_500', name: 'Sales Legend', description: '500 orders', icon: '👑' });

        const [bestDay] = await db
            .select({
                date: sql<string>`DATE(${schema.orders.createdAt})`,
                total: sql<number>`coalesce(sum(${schema.orders.totalAmount}), 0)`,
            })
            .from(schema.orders)
            .where(and(...orderConditions))
            .groupBy(sql`DATE(${schema.orders.createdAt})`)
            .orderBy(desc(sql`sum(${schema.orders.totalAmount})`))
            .limit(1);

        return {
            success: true,
            data: {
                currentStreak,
                totalSales: totalSalesValue,
                totalOrders,
                achievements,
                bestDay: bestDay ? {
                    date: bestDay.date,
                    sales: Number(bestDay.total),
                } : null,
            }
        };
    });

    // Weather information for sales planning
    fastify.get<{ Querystring: { city?: string; country?: string } }>('/weather', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'sales_rep') {
            reply.code(403);
            return { success: false, error: { code: 'FORBIDDEN', message: 'Sales dashboard is restricted to sales reps' } };
        }

        const [tenant] = await db
            .select({
                timezone: schema.tenants.timezone,
                city: schema.tenants.city,
                country: schema.tenants.country,
                openWeatherApiKey: schema.tenants.openWeatherApiKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        const city = request.query.city || tenant?.city || 'Tashkent';
        const country = request.query.country || tenant?.country || 'UZ';

        try {
            // First try tenant-specific API key, then fall back to global env var
            const apiKey = tenant?.openWeatherApiKey || process.env.OPENWEATHER_API_KEY;
            if (apiKey) {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&appid=${apiKey}&units=metric`;
                const response = await fetch(weatherUrl);
                if (response.ok) {
                    const data = await response.json();
                    return {
                        success: true,
                        data: {
                            city: data.name,
                            temperature: Math.round(data.main.temp),
                            condition: data.weather[0].main,
                            description: data.weather[0].description,
                            icon: data.weather[0].icon,
                            humidity: data.main.humidity,
                            windSpeed: data.wind?.speed || 0,
                            feelsLike: Math.round(data.main.feels_like),
                        }
                    };
                }
            }
        } catch (e) {
            // Fall through to mock data
        }

        const conditions = ['Clear', 'Clouds', 'Rain', 'Sunny'];
        const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];

        return {
            success: true,
            data: {
                city: city,
                temperature: 22,
                condition: randomCondition,
                description: randomCondition.toLowerCase(),
                icon: '01d',
                humidity: 65,
                windSpeed: 5,
                feelsLike: 24,
                note: 'Mock data - configure OpenWeather API key in Business Settings for real weather',
            }
        };
    });

    // ----------------------------------------------------------------
    // LIST ORDERS
    // ----------------------------------------------------------------
    fastify.get<{ Querystring: ListOrdersQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: {
            querystring: ListOrdersQuerySchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, status, paymentStatus, customerId, startDate, endDate } = request.query;

        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.orders.tenantId, user.tenantId)];

        if (search) {
            conditions.push(sql`${schema.orders.orderNumber} ILIKE ${`%${search}%`}`);
        }
        if (status) {
            if (status.includes(',')) {
                conditions.push(inArray(schema.orders.status, status.split(',') as any));
            } else {
                conditions.push(eq(schema.orders.status, status as any));
            }
        }
        if (paymentStatus) conditions.push(eq(schema.orders.paymentStatus, paymentStatus as any));
        if (customerId) conditions.push(eq(schema.orders.customerId, customerId));

        if (startDate) conditions.push(sql`${schema.orders.createdAt} >= ${new Date(startDate).toISOString()}`);
        if (endDate) conditions.push(sql`${schema.orders.createdAt} <= ${new Date(endDate).toISOString()}`);

        if (user.role === 'sales_rep') {
            conditions.push(buildSalesCustomerAssignmentCondition(schema.orders.customerId, user.tenantId, user.id));
        } else if (user.role === 'driver') {
            conditions.push(eq(schema.orders.driverId, user.id));
        }

        const ordersRaw = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                customerName: schema.customers.name,
                customerCode: schema.customers.code,
                salesRepName: schema.users.name,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                status: schema.orders.status,
                paymentStatus: schema.orders.paymentStatus,
                createdAt: schema.orders.createdAt,
                itemCount: sql<number>`(SELECT count(*) FROM ${schema.orderItems} WHERE ${schema.orderItems.orderId} = ${schema.orders.id})`,
            })
            .from(schema.orders)
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .leftJoin(schema.users, eq(schema.orders.salesRepId, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.orders.createdAt))
            .limit(limit)
            .offset(offset);

        const orders = ordersRaw.map(o => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: o.customerName ? { name: o.customerName, code: o.customerCode || '' } : null,
            salesRep: o.salesRepName ? { name: o.salesRepName } : null,
            totalAmount: o.totalAmount,
            paidAmount: o.paidAmount || '0',
            status: o.status,
            paymentStatus: o.paymentStatus,
            createdAt: o.createdAt,
            itemCount: o.itemCount,
        }));

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(...conditions));

        return {
            success: true,
            data: orders,
            meta: {
                page: pageStr,
                limit: limitStr,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    });

    // ----------------------------------------------------------------
    // CREATE ORDER
    // ----------------------------------------------------------------
    fastify.post<{ Body: CreateOrderBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: {
            body: CreateOrderBodySchema,
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { items, ...orderData } = request.body;

        // Check plan limits
        const { canCreateOrder } = await import('../lib/planLimits');
        const limitCheck = await canCreateOrder(user.tenantId);
        if (!limitCheck.allowed) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'LIMIT_EXCEEDED',
                    message: `Monthly order limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                }
            });
        }

        const result = await db.transaction(async (tx) => {
            // 1. Validate customer exists
            const [customer] = await tx
                .select({
                    id: schema.customers.id,
                    tierId: schema.customers.tierId,
                    debtBalance: schema.customers.debtBalance,
                    creditBalance: schema.customers.creditBalance,
                    assignedSalesRepId: schema.customers.assignedSalesRepId,
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, orderData.customerId))
                .limit(1);

            if (!customer) {
                return { error: { code: 'NOT_FOUND', message: 'Customer not found', status: 404 } };
            }

            // 2. Check ownership
            if (user.role === 'sales_rep' && customer.assignedSalesRepId !== user.id) {
                return { error: { code: 'FORBIDDEN', message: 'You can only create orders for your assigned customers', status: 403 } };
            }

            // 3. Validate credit/tier limits
            if (customer.tierId) {
                const [tier] = await tx
                    .select()
                    .from(schema.customerTiers)
                    .where(eq(schema.customerTiers.id, customer.tierId))
                    .limit(1);

                if (tier) {
                    if (!tier.creditAllowed) {
                        const currentCredit = Number(customer.creditBalance || 0);
                        if (currentCredit < orderData.totalAmount) {
                            return { error: { code: 'CREDIT_NOT_ALLOWED', message: 'This customer tier does not allow credit orders. Prepayment required.', status: 400 } };
                        }
                    }

                    if (tier.creditLimit) {
                        const currentDebt = Number(customer.debtBalance || 0);
                        const newDebt = currentDebt + orderData.totalAmount;
                        if (newDebt > Number(tier.creditLimit)) {
                            return { error: { code: 'CREDIT_LIMIT_EXCEEDED', message: `Order would exceed credit limit of ${tier.creditLimit}`, status: 400 } };
                        }
                    }

                    if (tier.maxOrderAmount && orderData.totalAmount > Number(tier.maxOrderAmount)) {
                        return { error: { code: 'MAX_ORDER_EXCEEDED', message: `Order amount exceeds maximum allowed of ${tier.maxOrderAmount}`, status: 400 } };
                    }
                }
            }

            // 4. Validate stock
            if (items && items.length > 0) {
                for (const item of items) {
                    const [product] = await tx
                        .select({
                            id: schema.products.id,
                            name: schema.products.name,
                            price: schema.products.price,
                            stockQuantity: schema.products.stockQuantity,
                            reservedQuantity: schema.products.reservedQuantity,
                        })
                        .from(schema.products)
                        .where(eq(schema.products.id, item.productId))
                        .for('update')
                        .limit(1);

                    if (!product) {
                        return { error: { code: 'NOT_FOUND', message: `Product not found: ${item.productId}`, status: 404 } };
                    }

                    const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
                    if (availableStock < item.qtyOrdered) {
                        return { error: { code: 'INSUFFICIENT_STOCK', message: `Insufficient stock for ${product.name}. Only ${availableStock} available.`, status: 400 } };
                    }

                    const currentPrice = Number(product.price);
                    if (Math.abs(currentPrice - item.unitPrice) > 0.01) {
                        return { error: { code: 'PRICE_CHANGED', message: `Price for ${product.name} has changed. Please refresh your cart.`, status: 400 } };
                    }
                }
            }

            // Generate Order Number using shared service
            const orderNumber = await ordersService.generateOrderNumber(tx, user.tenantId);

            const [order] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: user.tenantId,
                    orderNumber,
                    customerId: orderData.customerId,
                    salesRepId: (user.role === 'sales_rep') ? user.id : orderData.salesRepId,
                    createdByUserId: user.id,
                    status: 'pending',
                    paymentStatus: 'unpaid',
                    subtotalAmount: orderData.subtotalAmount.toString(),
                    discountAmount: orderData.discountAmount?.toString() || '0',
                    taxAmount: orderData.taxAmount?.toString() || '0',
                    totalAmount: orderData.totalAmount.toString(),
                    notes: orderData.notes,
                    requestedDeliveryDate: orderData.requestedDeliveryDate ? orderData.requestedDeliveryDate : null,
                })
                .returning();

            // Insert order items
            if (items && items.length > 0) {
                await tx.insert(schema.orderItems).values(
                    items.map((item) => ({
                        orderId: order.id,
                        productId: item.productId,
                        unitPrice: item.unitPrice.toString(),
                        qtyOrdered: item.qtyOrdered,
                        qtyPicked: 0,
                        qtyDelivered: 0,
                        lineTotal: item.lineTotal.toString(),
                    }))
                );

                // Reserve stock using shared service
                await ordersService.reserveStock(tx, items.map(item => ({
                    productId: item.productId,
                    productName: '',
                    unitPrice: item.unitPrice,
                    quantity: item.qtyOrdered,
                    lineTotal: item.lineTotal,
                })));
            }

            // Update customer debt using shared service
            await ordersService.updateCustomerDebt(tx, orderData.customerId, orderData.totalAmount);

            // Log status change using shared service
            await ordersService.logStatusChange(tx, order.id, 'pending', user.id, 'Order created');

            return order;
        });

        // Handle transaction validation errors
        if (result && 'error' in result) {
            return reply.code(result.error.status).send({
                success: false,
                error: { code: result.error.code, message: result.error.message }
            });
        }

        // TELEGRAM NOTIFICATIONS
        try {
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyNewOrder,
                notifyLowStockBatch,
                notifyCustomerOrderConfirmed
            } = await import('../lib/telegram');

            const [customer] = await db
                .select({
                    name: schema.customers.name,
                    telegramChatId: schema.customers.telegramChatId
                })
                .from(schema.customers)
                .where(eq(schema.customers.id, (result as any).customerId));

            const [tenant] = await db
                .select({ currency: schema.tenants.currency })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            const orderCheck = await canSendTenantNotification(user.tenantId, 'notifyNewOrder');
            if (orderCheck.canSend) {
                const admins = await getTenantAdminsWithTelegram(user.tenantId);
                for (const admin of admins) {
                    notifyNewOrder(admin.telegramChatId, {
                        orderNumber: (result as any).orderNumber,
                        customerName: customer?.name || 'Unknown Customer',
                        total: Number((result as any).totalAmount),
                        currency: tenant?.currency || 'UZS'
                    });
                }
            }

            const stockCheck = await canSendTenantNotification(user.tenantId, 'notifyLowStock');
            if (stockCheck.canSend && items && items.length > 0) {
                const productIds = items.map((i) => i.productId);
                const products = await db
                    .select({
                        id: schema.products.id,
                        name: schema.products.name,
                        sku: schema.products.sku,
                        stockQuantity: schema.products.stockQuantity,
                        reservedQuantity: schema.products.reservedQuantity,
                        reorderPoint: schema.products.reorderPoint,
                    })
                    .from(schema.products)
                    .where(inArray(schema.products.id, productIds));

                const lowStockProducts: Array<{ name: string; sku: string; quantity: number }> = [];
                for (const prod of products) {
                    const available = (prod.stockQuantity || 0) - (prod.reservedQuantity || 0);
                    const minQty = prod.reorderPoint ?? 10;
                    if (available < minQty) {
                        lowStockProducts.push({
                            name: prod.name,
                            sku: prod.sku || '',
                            quantity: available
                        });
                    }
                }

                if (lowStockProducts.length > 0) {
                    const admins = await getTenantAdminsWithTelegram(user.tenantId);
                    for (const admin of admins) {
                        notifyLowStockBatch(admin.telegramChatId, lowStockProducts);
                    }
                }
            }

            if (customer?.telegramChatId) {
                notifyCustomerOrderConfirmed(
                    user.tenantId,
                    { chatId: customer.telegramChatId, name: customer.name || 'Customer', id: (result as any).customerId },
                    {
                        id: (result as any).id,
                        orderNumber: (result as any).orderNumber,
                        total: Number((result as any).totalAmount),
                        currency: tenant?.currency || 'UZS',
                        itemCount: items?.length || 0
                    }
                );
            }
        } catch (err) {
            console.error('Telegram Notification Error:', err);
        }

        return { success: true, data: result };
    });

    // ----------------------------------------------------------------
    // GET ORDER DETAILS
    // ----------------------------------------------------------------
    fastify.get<{ Params: Static<typeof GetOrderParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        }

        // Role-based access control: sales reps and drivers can only access their own orders
        if (user.role === 'sales_rep') {
            const [customer] = await db
                .select({ assignedSalesRepId: schema.customers.assignedSalesRepId })
                .from(schema.customers)
                .where(eq(schema.customers.id, order.customerId))
                .limit(1);
            if (!customer || customer.assignedSalesRepId !== user.id) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only view orders for your assigned customers' } });
            }
        }

        if (user.role === 'driver' && order.driverId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only view orders assigned to you' } });
        }

        return { success: true, data: order };
    });

    // ----------------------------------------------------------------
    // UPDATE STATUS
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof GetOrderParamsSchema>; Body: UpdateStatusBody }>('/:id/status', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema,
            body: UpdateStatusBodySchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { status: newStatus, notes } = request.body;

        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse', 'driver'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to update order status' } });
        }

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        await db.transaction(async (tx) => {
            await tx
                .update(schema.orders)
                .set({
                    status: newStatus as any,
                    deliveredAt: newStatus === 'delivered' ? new Date() : (order.deliveredAt || undefined),
                    cancelledAt: newStatus === 'cancelled' ? new Date() : (order.cancelledAt || undefined),
                    updatedAt: new Date()
                })
                .where(eq(schema.orders.id, id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: id,
                fromStatus: order.status,
                toStatus: newStatus as any,
                changedBy: user.id,
                notes: notes,
            });
        });

        // --- TELEGRAM NOTIFICATIONS ---
        try {
            const {
                canSendTenantNotification,
                getTenantAdminsWithTelegram,
                notifyOrderApproved,
                notifyOrderCancelled,
                notifyDeliveryCompleted,
                notifyOrderReturned,
                notifyCustomerOrderApproved,
                notifyCustomerOrderCancelled,
                notifyCustomerDelivered,
                notifyCustomerOutForDelivery,
                notifyCustomerReturned
            } = await import('../lib/telegram');

            // Fetch enriched order details for notifications
            const [orderDetail] = await db
                .select({
                    id: schema.orders.id,
                    orderNumber: schema.orders.orderNumber,
                    total: schema.orders.totalAmount,
                    customerName: schema.customers.name,
                    customerChatId: schema.customers.telegramChatId,
                    driverName: schema.users.name,
                })
                .from(schema.orders)
                .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                .leftJoin(schema.users, eq(schema.orders.driverId, schema.users.id))
                .where(eq(schema.orders.id, id))
                .limit(1);

            // Fetch currency
            const [tenant] = await db
                .select({ currency: schema.tenants.currency })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            const currency = tenant?.currency || 'UZS';
            const admins = await getTenantAdminsWithTelegram(user.tenantId);
            const customerChatId = orderDetail?.customerChatId;
            const customerName = orderDetail?.customerName || 'Customer';
            const orderNumber = orderDetail?.orderNumber || '???';
            const total = Number(orderDetail?.total || 0);

            // Fetch item counts for detailed messages
            const [{ totalItems }] = await db
                .select({ totalItems: sql<number>`count(*)` })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, id));

            // Helper for Admin Broadcasts
            const broadcastAdmins = async (notifyFn: Function, payload: any) => {
                for (const admin of admins) {
                    await notifyFn(admin.telegramChatId, payload);
                }
            };

            // 1. ORDER APPROVED
            if (newStatus === 'approved') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderApproved');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderApproved, {
                        orderNumber, customerName, total, currency, approvedBy: user.name
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOrderApproved');
                    if (canSendCustomer) {
                        await notifyCustomerOrderApproved(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }
            }

            // 2. ORDER CANCELLED
            else if (newStatus === 'cancelled') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderCancelled');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderCancelled, {
                        orderNumber, customerName, total, currency, cancelledBy: user.name, reason: notes
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOrderCancelled');
                    if (canSendCustomer) {
                        await notifyCustomerOrderCancelled(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency, reason: notes
                        });
                    }
                }
            }

            // 3. OUT FOR DELIVERY (delivering)
            else if (newStatus === 'delivering') {
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyOutForDelivery');
                    if (canSendCustomer) {
                        await notifyCustomerOutForDelivery(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, driverName: orderDetail?.driverName ?? undefined
                        });
                    }
                }
            }

            // 4. DELIVERED (Full)
            else if (newStatus === 'delivered') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderDelivered');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: Number(totalItems), totalItems: Number(totalItems), driverName: orderDetail?.driverName ?? undefined
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyDelivered');
                    if (canSendCustomer) {
                        await notifyCustomerDelivered(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }

                // Check if order is also fully paid -> Order Completed
                if (order.paymentStatus === 'paid') {
                    const { notifyOrderCompleted } = await import('../lib/telegram');
                    const { canSend: canSendCompleted } = await canSendTenantNotification(user.tenantId, 'notifyOrderCompleted');
                    if (canSendCompleted) {
                        await broadcastAdmins(notifyOrderCompleted, {
                            orderNumber, customerName, total, currency
                        });
                    }
                }
            }

            // 5. PARTIAL (Partial Delivery)
            else if (newStatus === 'partial') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderPartialDelivery');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyDeliveryCompleted, {
                        orderNumber, customerName, itemsDelivered: 1, totalItems: Number(totalItems),
                        driverName: orderDetail?.driverName ?? undefined
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyPartialDelivery');
                    if (canSendCustomer) {
                        await notifyCustomerDelivered(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, total, currency
                        });
                    }
                }
            }

            // 6. RETURNED (Full/Partial)
            else if (newStatus === 'returned') {
                const { canSend: canSendAdmin } = await canSendTenantNotification(user.tenantId, 'notifyOrderReturned');
                if (canSendAdmin) {
                    await broadcastAdmins(notifyOrderReturned, {
                        orderNumber, customerName, returnedAmount: total, totalAmount: total, currency, reason: notes
                    });
                }
                if (customerChatId) {
                    const { canSend: canSendCustomer } = await canSendTenantNotification(user.tenantId, 'customerNotifyReturned');
                    if (canSendCustomer) {
                        await notifyCustomerReturned(user.tenantId, { chatId: customerChatId, name: customerName }, {
                            orderNumber, returnedAmount: total, currency
                        });
                    }
                }
            }

        } catch (e) {
            console.error('Telegram Notification Error:', e);
        }

        return { success: true, message: 'Status updated' };
    });

    // ----------------------------------------------------------------
    // CANCEL ORDER
    // ----------------------------------------------------------------
    fastify.patch<{ Params: Static<typeof GetOrderParamsSchema>; Body: CancelOrderBody }>('/:id/cancel', {
        preHandler: [fastify.authenticate],
        schema: {
            params: GetOrderParamsSchema,
            body: CancelOrderBodySchema
        }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { reason } = request.body;

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, user.tenantId)))
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep') {
            const [customer] = await db
                .select({ assignedSalesRepId: schema.customers.assignedSalesRepId })
                .from(schema.customers)
                .where(eq(schema.customers.id, order.customerId))
                .limit(1);
            if (!customer || customer.assignedSalesRepId !== user.id) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only cancel orders for your assigned customers' } });
            }
        }

        if (!order.status || !['pending', 'confirmed'].includes(order.status)) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: `Cannot cancel order with status: ${order.status}` } });
        }

        await db.transaction(async (tx) => {
            const items = await tx
                .select()
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));

            for (const item of items) {
                await tx
                    .update(schema.products)
                    .set({
                        reservedQuantity: sql`GREATEST(0, ${schema.products.reservedQuantity} - ${item.qtyOrdered})`,
                    })
                    .where(eq(schema.products.id, item.productId));
            }

            await tx
                .update(schema.customers)
                .set({
                    debtBalance: sql`GREATEST(0, ${schema.customers.debtBalance} - ${order.totalAmount})`,
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, order.customerId));

            await tx
                .update(schema.orders)
                .set({
                    status: 'cancelled',
                    updatedAt: new Date(),
                })
                .where(eq(schema.orders.id, order.id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'cancelled',
                changedBy: user.id,
                notes: reason || 'Order cancelled',
            });
        });

        return { success: true, message: 'Order cancelled successfully' };
    });
};
