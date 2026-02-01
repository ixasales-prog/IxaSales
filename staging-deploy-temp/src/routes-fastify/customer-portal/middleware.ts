/**
 * Customer Portal - Middleware (Fastify)
 * 
 * Customer authentication and error handling middleware.
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { verifyCustomerToken, type CustomerTokenPayload } from '../../lib/customer-auth';
import { createErrorResponse, type ErrorCode } from '../../lib/error-codes';

// ============================================================================
// AUTHENTICATED CUSTOMER CONTEXT
// ============================================================================

declare module 'fastify' {
    interface FastifyRequest {
        customerAuth: CustomerTokenPayload | null;
        isCustomerAuthenticated: boolean;
    }
}

// ============================================================================
// ERROR RESPONSE HELPER
// ============================================================================

/**
 * Create standard error response with HTTP status
 */
export function errorResponse(reply: FastifyReply, code: ErrorCode, status = 400) {
    return reply.status(status).send(createErrorResponse(code));
}

// ============================================================================
// AUTHENTICATION PLUGIN
// ============================================================================

/**
 * Customer authentication plugin
 * Extracts and verifies JWT token from Authorization header
 * Adds `customerAuth` to request if valid
 */
const customerAuthPluginCallback: FastifyPluginAsync = async (fastify) => {
    // Decorate request with customer auth properties
    fastify.decorateRequest('customerAuth', null);
    fastify.decorateRequest('isCustomerAuthenticated', false);

    // Pre-handler hook to parse JWT and attach customer
    fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            const token = authHeader?.replace('Bearer ', '');

            if (!token) {
                request.customerAuth = null;
                request.isCustomerAuthenticated = false;
                return;
            }

            const payload = await verifyCustomerToken(token);
            if (payload) {
                request.customerAuth = payload;
                request.isCustomerAuthenticated = true;
            } else {
                request.customerAuth = null;
                request.isCustomerAuthenticated = false;
            }
        } catch {
            request.customerAuth = null;
            request.isCustomerAuthenticated = false;
        }
    });
};

export const customerAuthPlugin = fp(customerAuthPluginCallback, {
    name: 'customer-portal-auth'
});

// ============================================================================
// AUTH GUARD HELPER
// ============================================================================

/**
 * Pre-handler to require customer authentication
 * Use in route preHandler array
 */
export async function requireCustomerAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    if (!request.customerAuth) {
        return reply.status(401).send(createErrorResponse('UNAUTHORIZED'));
    }
}

// ============================================================================
// RATE LIMIT RESPONSE HELPER
// ============================================================================

/**
 * Create rate limit error response with retry info
 */
export function rateLimitResponse(reply: FastifyReply, _retryAfterMs: number) {
    return reply.status(429).send(createErrorResponse('RATE_LIMITED'));
}
