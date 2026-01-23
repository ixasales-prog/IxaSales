/**
 * Request Logging Middleware
 * 
 * Provides audit logging for API requests with:
 * - Request/response timing
 * - User/customer identification
 * - Endpoint tracking
 * - Error logging
 */

import { Elysia } from 'elysia';
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

// Paths to exclude from logging (health checks, static assets)
const EXCLUDED_PATHS = [
    '/health',
    '/api/branding',
    '/api/announcement',
    '/uploads/',
    '/icons/',
    '/.well-known/',
];

// Sensitive paths to log with extra scrutiny
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

function formatLog(log: RequestLog): string {
    const parts = [
        log.method,
        log.path,
        `${log.statusCode}`,
        `${log.responseTimeMs}ms`,
    ];

    if (log.userId) parts.push(`user:${log.userId}`);
    if (log.customerId) parts.push(`customer:${log.customerId}`);
    if (log.tenantId) parts.push(`tenant:${log.tenantId.slice(0, 8)}`);
    if (log.error) parts.push(`error:${log.error}`);

    return parts.join(' | ');
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
// MIDDLEWARE
// ============================================================================

/**
 * Request logging plugin for Elysia
 * Logs all API requests with timing and context
 */
export const requestLoggerPlugin = new Elysia({ name: 'request-logger' })
    .derive(({ request }) => {
        return {
            requestStartTime: Date.now(),
            requestPath: new URL(request.url).pathname,
        };
    })
    .onAfterHandle(({ request, set, requestStartTime, requestPath }) => {
        if (!shouldLog(requestPath)) return;

        const log: RequestLog = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path: requestPath,
            statusCode: (set.status as number) || 200,
            responseTimeMs: Date.now() - requestStartTime,
            userAgent: request.headers.get('user-agent') || undefined,
            ip: request.headers.get('x-forwarded-for') ||
                request.headers.get('x-real-ip') ||
                undefined,
        };

        // Add context from store if available
        const ctx = (set as any).context;
        if (ctx?.user?.id) log.userId = ctx.user.id;
        if (ctx?.customerAuth?.customerId) log.customerId = ctx.customerAuth.customerId;
        if (ctx?.user?.tenantId || ctx?.customerAuth?.tenantId) {
            log.tenantId = ctx.user?.tenantId || ctx.customerAuth?.tenantId;
        }

        recordMetric({
            timestamp: Date.now(),
            path: requestPath,
            method: request.method,
            statusCode: log.statusCode,
            responseTimeMs: log.responseTimeMs,
        });

        // Log based on status
        if (log.statusCode >= 500) {
            logger.error('API Request', { request: log });
        } else if (log.statusCode >= 400) {
            logger.warn('API Request', { request: log });
        } else if (isSensitive(requestPath)) {
            // Always log sensitive paths
            logger.info('API Request', { request: log, sensitive: true });
        } else if (log.responseTimeMs > 1000) {
            // Log slow requests
            logger.warn('Slow API Request', { request: log });
        } else {
            logger.debug('API Request', { request: log });
        }
    })
    .onError(({ request, error, set, requestStartTime }) => {
        const path = new URL(request.url).pathname;
        if (!shouldLog(path)) return;

        const log: RequestLog = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path,
            statusCode: (set.status as number) || 500,
            responseTimeMs: Date.now() - (requestStartTime || Date.now()),
            userAgent: request.headers.get('user-agent') || undefined,
            ip: request.headers.get('x-forwarded-for') || undefined,
            error: error instanceof Error ? error.message : String(error),
        };

        recordMetric({
            timestamp: Date.now(),
            path,
            method: request.method,
            statusCode: log.statusCode,
            responseTimeMs: log.responseTimeMs,
        });

        logger.error('API Error', { request: log, stack: error instanceof Error ? error.stack : undefined });
    });

/**
 * Customer Portal specific request logger
 * Enhanced logging for customer actions
 */
export const customerPortalLoggerPlugin = new Elysia({ name: 'customer-portal-logger' })
    .derive(({ request }) => ({
        cpRequestStart: Date.now(),
    }))
    .onAfterHandle(({ request, set, cpRequestStart, customerAuth }: any) => {
        const path = new URL(request.url).pathname;

        // Only log customer portal routes
        if (!path.startsWith('/api/customer-portal/')) return;

        const log: RequestLog = {
            timestamp: new Date().toISOString(),
            method: request.method,
            path,
            statusCode: (set.status as number) || 200,
            responseTimeMs: Date.now() - cpRequestStart,
        };

        if (customerAuth) {
            log.customerId = customerAuth.customerId;
            log.tenantId = customerAuth.tenantId;
        }

        // Log all customer portal actions at info level
        if (request.method !== 'GET') {
            logger.info('Customer Portal Action', { request: log });
        }
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

/**
 * Log an audit entry for important actions
 */
export function logAudit(entry: AuditLogEntry): void {
    logger.info('Audit', {
        ...entry,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Log a security event
 */
export function logSecurity(event: string, details: Record<string, any>): void {
    logger.warn('Security', {
        event,
        ...details,
        timestamp: new Date().toISOString(),
    });
}
