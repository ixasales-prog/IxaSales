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
