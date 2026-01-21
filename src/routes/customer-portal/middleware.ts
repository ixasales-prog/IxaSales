/**
 * Customer Portal - Middleware
 * 
 * Reusable authentication and error handling middleware.
 */

import { Elysia } from 'elysia';
import { verifyCustomerToken, type CustomerTokenPayload } from '../../lib/customer-auth';
import { createErrorResponse, type ErrorCode } from '../../lib/error-codes';

// ============================================================================
// AUTHENTICATED CUSTOMER CONTEXT
// ============================================================================

export interface AuthenticatedContext {
    customerAuth: CustomerTokenPayload;
    set: { status?: number };
}

// ============================================================================
// ERROR RESPONSE HELPER
// ============================================================================

/**
 * Create standard error response with HTTP status
 */
export function errorResponse(set: { status?: number }, code: ErrorCode, status = 400) {
    set.status = status;
    return createErrorResponse(code);
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Customer authentication plugin
 * Extracts and verifies JWT token from Authorization header
 * Adds `customerAuth` to context if valid
 */
export const customerAuthMiddleware = new Elysia({ name: 'customer-portal-auth' })
    .derive(async ({ headers }): Promise<{ customerAuth: CustomerTokenPayload | null }> => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return { customerAuth: null };
        }

        const payload = await verifyCustomerToken(token);
        return { customerAuth: payload };
    });

/**
 * Guard hook to require authentication
 * Use with route hooks: .get('/path', handler, { beforeHandle: [requireAuth] })
 */
export const requireAuth = ({ customerAuth, set }: { customerAuth: CustomerTokenPayload | null; set: { status?: number } }) => {
    if (!customerAuth) {
        set.status = 401;
        return createErrorResponse('UNAUTHORIZED');
    }
    return undefined; // Continue to handler
};

// ============================================================================
// PROTECTED ROUTES PLUGIN
// ============================================================================

/**
 * Plugin that adds authentication middleware and provides
 * authenticated routes with proper typing
 */
export const protectedRoutes = new Elysia({ name: 'customer-portal-protected' })
    .use(customerAuthMiddleware)
    .onBeforeHandle((ctx: any) => {
        if (!ctx.customerAuth) {
            ctx.set.status = 401;
            return createErrorResponse('UNAUTHORIZED');
        }
        return undefined;
    });

// ============================================================================
// RATE LIMIT RESPONSE HELPER
// ============================================================================

/**
 * Create rate limit error response with retry info
 */
export function rateLimitResponse(set: { status?: number }, _retryAfterMs: number) {
    set.status = 429;
    return createErrorResponse('RATE_LIMITED');
}
