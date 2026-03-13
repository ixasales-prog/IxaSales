/**
 * Customer Portal - Middleware (Fastify)
 * 
 * Customer authentication and error handling middleware.
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { verifyCustomerToken, type CustomerTokenPayload } from '../../lib/customer-auth';
import { createErrorResponse, type ErrorCode } from '../../lib/error-codes';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { evaluateTenantAccess, isSafeMethod, type TenantAccessState } from '../../lib/tenant-access';

// ============================================================================
// AUTHENTICATED CUSTOMER CONTEXT
// ============================================================================

declare module 'fastify' {
    interface FastifyRequest {
        customerAuth: CustomerTokenPayload | null;
        isCustomerAuthenticated: boolean;
        customerTenantAccess: TenantAccessState | null;
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
    fastify.decorateRequest('customerTenantAccess', null);

    // Pre-handler hook to parse JWT and attach customer
    fastify.addHook('onRequest', async (request: FastifyRequest) => {
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
                const [customer] = await db
                    .select({ isActive: schema.customers.isActive })
                    .from(schema.customers)
                    .where(and(
                        eq(schema.customers.id, payload.customerId),
                        eq(schema.customers.tenantId, payload.tenantId)
                    ))
                    .limit(1);

                if (!customer || !customer.isActive) {
                    request.customerAuth = null;
                    request.isCustomerAuthenticated = false;
                    request.customerTenantAccess = null;
                    return;
                }

                request.customerAuth = payload;
                request.isCustomerAuthenticated = true;
                const [tenant] = await db
                    .select({
                        isActive: schema.tenants.isActive,
                        planStatus: schema.tenants.planStatus,
                        subscriptionEndAt: schema.tenants.subscriptionEndAt,
                    })
                    .from(schema.tenants)
                    .where(eq(schema.tenants.id, payload.tenantId))
                    .limit(1);
                request.customerTenantAccess = evaluateTenantAccess(tenant);
            } else {
                request.customerAuth = null;
                request.isCustomerAuthenticated = false;
                request.customerTenantAccess = null;
            }
        } catch {
            request.customerAuth = null;
            request.isCustomerAuthenticated = false;
            request.customerTenantAccess = null;
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

    if (request.customerTenantAccess?.mode === 'read_only' && !isSafeMethod(request.method)) {
        return reply.status(403).send({
            success: false,
            error: {
                code: 'TENANT_READ_ONLY',
                message: request.customerTenantAccess.message || 'Tenant is in read-only mode.',
            },
            data: {
                tenantAccess: request.customerTenantAccess,
            },
        });
    }
}

// ============================================================================
// RATE LIMIT RESPONSE HELPER
// ============================================================================

/**
 * Create rate limit error response with retry info
 */
export function rateLimitResponse(reply: FastifyReply, retryAfterMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const body = createErrorResponse('RATE_LIMITED') as ReturnType<typeof createErrorResponse> & {
        data?: { retryAfterMs: number; retryAfterSeconds: number };
    };
    body.data = { retryAfterMs, retryAfterSeconds };
    return reply
        .header('Retry-After', String(retryAfterSeconds))
        .status(429)
        .send(body);
}
