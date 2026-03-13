import { FastifyPluginAsync } from 'fastify';
import { VisitsService } from '../services/visits.service';
import { registerOrderDashboardStatsRoute } from './orders-dashboard-stats';
import { registerOrderDashboardSalesRoute } from './orders-dashboard-sales';
import { registerOrderSalesAnalyticsRoutes } from './orders-sales-analytics';
import { registerOrderListRoute } from './orders-list';
import { registerOrderCreateRoute } from './orders-create';
import { registerOrderDetailRoute } from './orders-detail';
import { registerOrderGetRoute } from './orders-get';
import { registerOrderStatusRoutes } from './orders-status';
import { registerOrderEditRoute } from './orders-edit';

export const orderRoutes: FastifyPluginAsync = async (fastify) => {
    const visitsService = new VisitsService();
    await registerOrderDashboardStatsRoute(fastify);

    await registerOrderDashboardSalesRoute(fastify, visitsService);
    await registerOrderSalesAnalyticsRoutes(fastify);
    await registerOrderListRoute(fastify);
    await registerOrderCreateRoute(fastify);
    await registerOrderDetailRoute(fastify);
    await registerOrderGetRoute(fastify);
    await registerOrderStatusRoutes(fastify);
    await registerOrderEditRoute(fastify);
};
