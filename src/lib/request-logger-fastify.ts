/**
 * Request Logging Middleware (Fastify)
 * 
 * Provides audit logging for API requests with:
 * - Request/response timing
 * - User/customer identification
 * - Endpoint tracking
 * - Error logging
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

interface RequestLog {
    timestamp: string;
    method: string;
    path: string;
    statusCode: number;
    responseTimeMs: number;
    userAgent?: string;
    ip?: string;
    userId?: string;
    customerId?: string;
    tenantId?: string;
    error?: string;
}

interface RequestMetricEntry {
    timestamp: number;
    path: string;
    method: string;
    statusCode: number;
    responseTimeMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const EXCLUDED_PATHS = [
    '/health',
    '/api/branding',
    '/api/announcement',
    '/uploads/',
    '/icons/',
    '/.well-known/',
];

const SENSITIVE_PATHS = [
    '/api/auth/',
    '/api/customer-portal/auth/',
    '/api/super/',
    '/api/payments/',
    '/api/payment-gateway/',
];

const METRICS_WINDOW_MS = 5 * 60 * 1000;
const requestMetrics: RequestMetricEntry[] = [];

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

function shouldLog(path: string): boolean {
    return !EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
}

function isSensitive(path: string): boolean {
    return SENSITIVE_PATHS.some(sensitive => path.startsWith(sensitive));
}

function pruneMetrics(now: number) {
    const cutoff = now - METRICS_WINDOW_MS;
    while (requestMetrics.length > 0 && requestMetrics[0].timestamp < cutoff) {
        requestMetrics.shift();
    }
}

function recordMetric(entry: RequestMetricEntry) {
    requestMetrics.push(entry);
    pruneMetrics(entry.timestamp);
}

function percentile(values: number[], percentileValue: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
    return sorted[index];
}

export function getRequestMetrics() {
    const now = Date.now();
    pruneMetrics(now);

    const durations = requestMetrics.map(metric => metric.responseTimeMs);
    const totalRequests = requestMetrics.length;
    const error4xx = requestMetrics.filter(metric => metric.statusCode >= 400 && metric.statusCode < 500).length;
    const error5xx = requestMetrics.filter(metric => metric.statusCode >= 500).length;
    const slowRequests = requestMetrics.filter(metric => metric.responseTimeMs > 1000).length;
    const avgResponseMs = totalRequests === 0
        ? 0
        : Math.round(durations.reduce((sum, ms) => sum + ms, 0) / totalRequests);

    const p95ResponseMs = percentile(durations, 95);
    const p99ResponseMs = percentile(durations, 99);

    const routeStats = new Map<string, { count: number; totalMs: number; durations: number[] }>();
    for (const metric of requestMetrics) {
        const key = metric.path;
        const current = routeStats.get(key) || { count: 0, totalMs: 0, durations: [] };
        current.count += 1;
        current.totalMs += metric.responseTimeMs;
        current.durations.push(metric.responseTimeMs);
        routeStats.set(key, current);
    }

    const topSlowRoutes = Array.from(routeStats.entries())
        .map(([path, stats]) => {
            const avg = Math.round(stats.totalMs / stats.count);
            return {
                path,
                count: stats.count,
                avgResponseMs: avg,
                p95ResponseMs: percentile(stats.durations, 95),
            };
        })
        .sort((a, b) => b.avgResponseMs - a.avgResponseMs)
        .slice(0, 5);

    return {
        windowMs: METRICS_WINDOW_MS,
        totalRequests,
        error4xx,
        error5xx,
        slowRequests,
        avgResponseMs,
        p95ResponseMs,
        p99ResponseMs,
        topSlowRoutes
    };
}

// ============================================================================
// PLUGIN
// ============================================================================

const requestLoggerPluginCallback: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('onRequest', async (request, reply) => {
        (request as any).requestStartTime = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
        const requestStartTime = (request as any).requestStartTime || Date.now();
        const responseTimeMs = Date.now() - requestStartTime;
        const path = request.url;

        if (!shouldLog(path)) return;

        const log: RequestLog = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path,
            statusCode: reply.statusCode,
            responseTimeMs,
            userAgent: request.headers['user-agent'],
            ip: (request.headers['x-forwarded-for'] as string) || request.ip,
        };

        // Add context if available
        const user = (request as any).user;
        const customerAuth = (request as any).customerAuth;

        if (user?.id) log.userId = user.id;
        if (customerAuth?.customerId) log.customerId = customerAuth.customerId;
        if (user?.tenantId || customerAuth?.tenantId) {
            log.tenantId = user?.tenantId || customerAuth?.tenantId;
        }

        recordMetric({
            timestamp: Date.now(),
            path,
            method: request.method,
            statusCode: log.statusCode,
            responseTimeMs: log.responseTimeMs,
        });

        // Log based on status
        if (log.statusCode >= 500) {
            logger.error('API Request', { request: log });
        } else if (log.statusCode >= 400) {
            logger.warn('API Request', { request: log });
        } else if (isSensitive(path)) {
            logger.info('API Request', { request: log, sensitive: true });
        } else if (log.responseTimeMs > 1000) {
            logger.warn('Slow API Request', { request: log });
        } else {
            logger.debug('API Request', { request: log });
        }
    });

    // Error logging is handled in onResponse usually, but we can hook into onError if needed
    fastify.addHook('onError', async (request, reply, error) => {
        const requestStartTime = (request as any).requestStartTime || Date.now();
        const responseTimeMs = Date.now() - requestStartTime;
        const path = request.url;

        if (!shouldLog(path)) return;

        const log: RequestLog = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path,
            statusCode: reply.statusCode >= 400 ? reply.statusCode : 500,
            responseTimeMs,
            userAgent: request.headers['user-agent'],
            ip: (request.headers['x-forwarded-for'] as string) || request.ip,
            error: error.message
        };

        recordMetric({
            timestamp: Date.now(),
            path,
            method: request.method,
            statusCode: log.statusCode,
            responseTimeMs: log.responseTimeMs,
        });

        logger.error('API Error', { request: log, stack: error.stack });
    });
};

export const requestLoggerPlugin = fp(requestLoggerPluginCallback, {
    name: 'request-logger'
});

// ============================================================================
// AUDIT LOG HELPER
// ============================================================================

interface AuditLogEntry {
    tenantId: string;
    actorType: 'user' | 'customer' | 'system';
    actorId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: Record<string, any>;
    ip?: string;
}

export function logAudit(entry: AuditLogEntry): void {
    logger.info('Audit', {
        ...entry,
        timestamp: new Date().toISOString(),
    });
}

export function logSecurity(event: string, details: Record<string, any>): void {
    logger.warn('Security', {
        event,
        ...details,
        timestamp: new Date().toISOString(),
    });
}
