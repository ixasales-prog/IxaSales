import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { authPlugin } from './lib/auth';

// Security and logging
import { httpsEnforcementPlugin, securityHeadersPlugin } from './lib/security';
import { requestLoggerPlugin } from './lib/request-logger';
import { initRedisRateLimiter } from './lib/rate-limit';

// Import routes
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { tenantRoutes } from './routes/tenants';
import { productRoutes } from './routes/products';
import { customerRoutes } from './routes/customers';
import { discountRoutes } from './routes/discounts';
import { orderRoutes } from './routes/orders';
import { deliveryRoutes } from './routes/delivery';
import { returnRoutes } from './routes/returns';
import { procurementRoutes } from './routes/procurement';
import { inventoryRoutes } from './routes/inventory';
import { paymentRoutes } from './routes/payments';
import { visitRoutes } from './routes/visits';

import { notificationRoutes } from './routes/notifications';
import { reportRoutes } from './routes/reports';
import { superRoutes } from './routes/super';
import { telegramWebhookRoutes } from './routes/telegram-webhook';
import { tenantSelfRoutes } from './routes/tenant-self';
import { uploadRoutes } from './routes/uploads';
import { paymentGatewayRoutes } from './routes/payment-gateway';
import { customerPortalRoutes } from './routes/customer-portal';
import { imageRoutes } from './routes/images';

// Initialize Redis rate limiter (if REDIS_URL is set)
initRedisRateLimiter().catch(console.error);

// Create app
const app = new Elysia()
    // Security plugins (production)
    .use(httpsEnforcementPlugin)
    .use(securityHeadersPlugin)

    // Request logging
    .use(requestLoggerPlugin)

    // Global plugins
    .use(cors({
        origin: process.env.CORS_ORIGIN || true,
        credentials: true,
    }))
    .use(staticPlugin({
        assets: 'uploads',
        prefix: '/uploads'
    }))

    // Health check
    .get('/health', () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
    }))

    // Root route
    .get('/', () => ({
        success: true,
        message: 'IxaSales Distribution ERP API is running',
        documentation: '/api',
        health: '/health'
    }))

    // Public announcement endpoint (no auth required)
    .get('/api/announcement', async () => {
        const { getAnnouncementSettings } = await import('./lib/systemSettings');
        return { success: true, data: getAnnouncementSettings() };
    })

    // Public branding endpoint (no auth required)
    .get('/api/branding', async () => {
        const { getBrandingSettings } = await import('./lib/systemSettings');
        return { success: true, data: getBrandingSettings() };
    })

    // API routes
    .group('/api', (app) =>
        app
            .use(authPlugin)  // Apply auth to all API routes

            // Display settings endpoint - accessible to ALL authenticated users
            // Returns tenant's currency/timezone for frontend display formatting
            .get('/display-settings', async ({ user }: any) => {
                if (!user || !user.tenantId) {
                    return { success: true, data: { currency: '', timezone: 'Asia/Tashkent', yandexGeocoderApiKey: '' } };
                }

                const { db, schema } = await import('./db');
                const { eq } = await import('drizzle-orm');

                const [tenant] = await db
                    .select({
                        currency: schema.tenants.currency,
                        timezone: schema.tenants.timezone,
                        yandexGeocoderApiKey: schema.tenants.yandexGeocoderApiKey,
                    })
                    .from(schema.tenants)
                    .where(eq(schema.tenants.id, user.tenantId))
                    .limit(1);

                return {
                    success: true,
                    data: {
                        currency: tenant?.currency ?? '',
                        timezone: tenant?.timezone ?? 'Asia/Tashkent',
                        yandexGeocoderApiKey: tenant?.yandexGeocoderApiKey ?? '',
                    }
                };
            })

            .use(authRoutes)
            .use(userRoutes)
            .use(tenantRoutes)
            .use(productRoutes)
            .use(customerRoutes)
            .use(discountRoutes)
            .use(orderRoutes)
            .use(deliveryRoutes)
            .use(returnRoutes)
            .use(procurementRoutes)
            .use(inventoryRoutes)
            .use(paymentRoutes)
            .use(visitRoutes)

            .use(notificationRoutes)
            .use(reportRoutes)
            .use(superRoutes)
            .use(tenantSelfRoutes)
            .use(uploadRoutes)
    )

    // External webhooks (no auth - receives callbacks from Telegram, Click, Payme)
    // And Customer Portal (uses its own OTP-based auth)
    .group('/api', (app) =>
        app
            .use(telegramWebhookRoutes)
            .use(paymentGatewayRoutes)
            .use(customerPortalRoutes)
            .use(imageRoutes)
    )

    // Global error handler
    .onError(({ code, error, set }) => {
        console.error(`[${code}]`, error);

        if (code === 'VALIDATION') {
            set.status = 400;
            return {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: (error as any).message,
                },
            };
        }

        if (code === 'NOT_FOUND') {
            set.status = 404;
            return {
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Resource not found',
                },
            };
        }

        set.status = 500;
        return {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: process.env.NODE_ENV === 'development'
                    ? (error as any).message
                    : 'An unexpected error occurred',
            },
        };
    })

    // Start server
    .listen(process.env.PORT || 3000);

// Initialize backup service
import { initBackupService } from './lib/backup';
initBackupService();

// Initialize scheduler and load settings from database
import { initializeScheduler } from './lib/scheduler';
initializeScheduler();

console.log(`
🚀 IxaSales API is running at ${app.server?.hostname}:${app.server?.port}
`);

export type App = typeof app;
