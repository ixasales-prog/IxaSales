import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import multipart from '@fastify/multipart';
import formbody from '@fastify/formbody';
import path from 'path';

import { authPlugin } from './lib/auth-fastify';
import { requestLoggerPlugin } from './lib/request-logger-fastify';

// Import migrated route modules
import { authRoutes } from './routes-fastify/auth';
import { orderRoutes } from './routes-fastify/orders';
import { customerRoutes } from './routes-fastify/customers';
import { productRoutes } from './routes-fastify/products';
import { visitRoutes } from './routes-fastify/visits';
import { inventoryRoutes } from './routes-fastify/inventory';
import { paymentRoutes } from './routes-fastify/payments';
import { userRoutes } from './routes-fastify/users';
import { deliveryRoutes } from './routes-fastify/delivery';
import { discountRoutes } from './routes-fastify/discounts';
import { returnRoutes } from './routes-fastify/returns';
import { reportRoutes } from './routes-fastify/reports';
import { notificationRoutes } from './routes-fastify/notifications';
import { tenantRoutes } from './routes-fastify/tenants';
import { tenantSelfRoutes } from './routes-fastify/tenant-self';
import { procurementRoutes } from './routes-fastify/procurement';
import { uploadRoutes } from './routes-fastify/uploads';
import { imageRoutes } from './routes-fastify/images';
import { superRoutes } from './routes-fastify/super';
import { paymentGatewayRoutes } from './routes-fastify/payment-gateway';
import { telegramWebhookRoutes } from './routes-fastify/telegram-webhook';
import { customerPortalRoutes } from './routes-fastify/customer-portal';
import { gpsTrackingRoutes } from './routes-fastify/gps-tracking';
import userActivityRoutes from './routes-fastify/user-activity';
import { supervisorRoutes } from './routes-fastify/supervisor';
import { warehouseRoutes } from './routes-fastify/warehouse';
import { batchOrderRoutes } from './routes-fastify/batch-orders';

// Initialize Redis rate limiter (if REDIS_URL is set)
import { initRedisRateLimiter } from './lib/rate-limit';
initRedisRateLimiter().catch(console.error);

export const buildServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: process.env.NODE_ENV === 'development' ? {
            transport: {
                target: 'pino-pretty',
                options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            },
        } : true,
    });

    // CORS configuration - Enforce production-ready CORS policy
    const corsOrigin = (() => {
        if (process.env.NODE_ENV === 'development') {
            // For development environments, allow specific origins or localhost
            const raw = process.env.CORS_ORIGIN;
            if (!raw || raw.trim() === '') {
                console.log('✓ Development mode: Using default development origins');
                return ['http://localhost:5173', 'http://localhost:3000'];
            }

            const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
            if (origins.length === 0) {
                console.log('✓ Development mode: Using default development origins');
                return ['http://localhost:5173', 'http://localhost:3000'];
            }

            // Validate origins for development mode
            const validatedOrigins = origins.map(origin => {
                try {
                    const url = new URL(origin);
                    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                        throw new Error('Invalid protocol');
                    }
                    return origin;
                } catch (e) {
                    console.error(`❌ Invalid CORS origin: ${origin}. Must be a valid URL with http or https protocol.`);
                    process.exit(1);
                }
            });

            console.log(`✓ CORS configured for origins: ${validatedOrigins.join(', ')}`);
            return validatedOrigins;
        }

        // Production mode - must have explicit, validated configuration
        const raw = process.env.CORS_ORIGIN;
        if (!raw || raw.trim() === '') {
            console.error('❌ CRITICAL: CORS_ORIGIN not set in production - refusing to start server');
            console.error('💡 HINT: Set CORS_ORIGIN in your .env file with HTTPS origins only (comma-separated)');
            process.exit(1);
        }

        const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (origins.length === 0) {
            console.error('❌ CRITICAL: CORS_ORIGIN is empty in production - refusing to start server');
            console.error('💡 HINT: Set CORS_ORIGIN in your .env file with HTTPS origins only (comma-separated)');
            process.exit(1);
        }

        // Validate origins - reject wildcard origins in production
        const validatedOrigins = origins.map(origin => {
            if (origin === '*' || origin === '"*"') {
                console.error(`❌ REJECTED: Wildcard origin '*' is not allowed in production for security reasons.`);
                console.error('💡 HINT: Use explicit HTTPS origins like CORS_ORIGIN=https://example.com,https://app.example.com');
                process.exit(1);
            }

            try {
                const url = new URL(origin);
                if (url.protocol !== 'https:') {
                    console.error(`❌ REJECTED: Non-HTTPS origin '${origin}' is not allowed in production for security reasons.`);
                    console.error('💡 HINT: Use HTTPS origins only (e.g., CORS_ORIGIN=https://example.com)');
                    process.exit(1);
                }

                // Normalize origin by removing trailing slash
                return origin.replace(/\/$/, '');
            } catch (e) {
                console.error(`❌ Invalid CORS origin: ${origin}. Must be a valid URL with https protocol.`);
                console.error('💡 HINT: Format as HTTPS URL (e.g., CORS_ORIGIN=https://example.com)');
                process.exit(1);
            }
        });

        console.log(`✓ CORS configured for origins: ${validatedOrigins.join(', ')}`);
        return validatedOrigins;
    })();

    await fastify.register(cors, {
        origin: corsOrigin,
        credentials: true,
        methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
            'Origin', 'X-Requested-With', 'Content-Type',
            'Accept', 'Authorization', 'X-Total-Count'
        ],
        exposedHeaders: ['X-Total-Count']
    });

    // Form body parser
    await fastify.register(formbody);

    // Multipart for file uploads
    await fastify.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB
        },
    });

    // Static file serving for uploads
    await fastify.register(staticPlugin, {
        root: path.join(process.cwd(), 'uploads'),
        prefix: '/uploads/',
        decorateReply: false,
    });

    // Security headers
    fastify.addHook('onSend', async (request, reply, payload) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        if (process.env.NODE_ENV === 'production') {
            reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        return payload;
    });

    // Request logging (in development)
    if (process.env.NODE_ENV === 'development') {
        fastify.addHook('onRequest', async (request, reply) => {
            console.log(`→ ${request.method} ${request.url}`);
        });
    }

    // Health check endpoint with CORS debug info
    fastify.get('/health', async (request) => {
        const showDebug = request.query && (request.query as any).debug === 'true';
        const response: Record<string, unknown> = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            node_env: process.env.NODE_ENV,
        };

        // Show CORS info in development or when debug=true
        if (process.env.NODE_ENV === 'development' || showDebug) {
            response.cors = {
                configured_origins: Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin],
                env_var_set: !!process.env.CORS_ORIGIN,
                env_var_value: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.substring(0, 50) : null,
            };
        }

        return response;
    });

    // Root endpoint
    fastify.get('/', async () => ({
        success: true,
        message: 'IxaSales Distribution ERP API is running',
        documentation: '/api',
        health: '/health',
    }));

    // Public announcement endpoint
    fastify.get('/api/announcement', async () => {
        const { getAnnouncementSettings } = await import('./lib/systemSettings');
        return { success: true, data: getAnnouncementSettings() };
    });

    // Public branding endpoint
    fastify.get('/api/branding', async (request, reply) => {
        try {
            const { getBrandingSettings } = await import('./lib/systemSettings');
            const branding = getBrandingSettings();
            return { success: true, data: branding };
        } catch (error) {
            console.error('[API] Error fetching branding settings:', error);
            // Return default branding on error
            return {
                success: true,
                data: {
                    platformName: 'IxaSales',
                    primaryColor: '#3B82F6',
                    logoUrl: '',
                },
            };
        }
    });

    // Register auth plugin globally for /api routes
    await fastify.register(authPlugin);

    // Register Request Logger
    await fastify.register(requestLoggerPlugin);

    // API routes (will be migrated incrementally)
    await fastify.register(async (api) => {
        // Display settings endpoint
        api.get('/display-settings', {
            preHandler: [fastify.authenticate],
        }, async (request, reply) => {
            const user = request.user;
            if (!user || !user.tenantId) {
                return { success: true, data: { currency: '', timezone: 'Asia/Tashkent', yandexGeocoderApiKey: '' } };
            }

            const { db, schema } = await import('./db/index');
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
                },
            };
        });

        // Register route modules here as they are migrated
        await api.register(authRoutes, { prefix: '/auth' });
        await api.register(orderRoutes, { prefix: '/orders' });
        await api.register(customerRoutes, { prefix: '/customers' });
        await api.register(productRoutes, { prefix: '/products' });
        await api.register(visitRoutes, { prefix: '/visits' });
        await api.register(inventoryRoutes, { prefix: '/inventory' });
        await api.register(paymentRoutes, { prefix: '/payments' });
        await api.register(userRoutes, { prefix: '/users' });
        await api.register((await import('./routes-fastify/user-telegram-link')).userTelegramLinkRoutes, { prefix: '/users' });
        await api.register(deliveryRoutes, { prefix: '/delivery' });
        await api.register(discountRoutes, { prefix: '/discounts' });
        await api.register(returnRoutes, { prefix: '/returns' });
        await api.register(reportRoutes, { prefix: '/reports' });
        await api.register(notificationRoutes, { prefix: '/notifications' });
        await api.register(tenantRoutes, { prefix: '/super/tenants' });
        await api.register(tenantSelfRoutes, { prefix: '/tenant' });
        await api.register(procurementRoutes, { prefix: '/procurement' });
        await api.register(supervisorRoutes, { prefix: '/supervisor' });
        await api.register(warehouseRoutes, { prefix: '/warehouse' });
        await api.register(uploadRoutes, { prefix: '/uploads' });
        await api.register(imageRoutes, { prefix: '/images' });
        await api.register(superRoutes, { prefix: '/super' });
        await api.register(paymentGatewayRoutes, { prefix: '/payment-gateway' });
        await api.register(telegramWebhookRoutes, { prefix: '/telegram' });
        await api.register(customerPortalRoutes, { prefix: '/customer-portal' });
        await api.register(gpsTrackingRoutes, { prefix: '/gps-tracking' });
        await api.register(userActivityRoutes, { prefix: '/user-activity' });
        await api.register(batchOrderRoutes, { prefix: '/batch-orders' });

    }, { prefix: '/api' });

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
        const err = error as any;
        console.error(`[ERROR] ${err.message}`, err);

        if (err.validation) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: err.message,
                },
            });
        }

        const statusCode = err.statusCode || 500;
        return reply.code(statusCode).send({
            success: false,
            error: {
                code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
                message: process.env.NODE_ENV === 'development'
                    ? err.message
                    : 'An unexpected error occurred',
            },
        });
    });

    // 404 handler
    fastify.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'Resource not found',
            },
        });
    });

    return fastify;
};

// Start server
const start = async () => {
    try {
        const fastify = await buildServer();
        const port = parseInt(process.env.PORT || '3000', 10);
        const host = '0.0.0.0';

        await fastify.listen({ port, host });

        // Initialize backup service
        const { initBackupService } = await import('./lib/backup');
        initBackupService();

        // Initialize tenant export service
        const { initExportService } = await import('./lib/tenant-export');
        initExportService();

        // Initialize scheduler
        const { initializeScheduler } = await import('./lib/scheduler');
        initializeScheduler();

        // Initialize session cleanup
        const { initializeSessionCleanup } = await import('./lib/session-cleanup');
        initializeSessionCleanup();

        console.log(`
🚀 IxaSales API (Fastify) is running at http://${host}:${port}
        `);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

if (require.main === module) {
    start();
}
