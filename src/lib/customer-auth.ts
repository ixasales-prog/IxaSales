/**
 * Customer Portal Authentication Middleware
 * 
 * Provides reusable authentication for customer portal routes.
 */

import { Elysia } from 'elysia';
import { jwtVerify, SignJWT } from 'jose';

// ============================================================================
// JWT CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[CustomerPortal] CRITICAL: JWT_SECRET must be set and at least 32 characters long');
}

const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET || 'development-only-secret-key-32ch');

// ============================================================================
// TYPES
// ============================================================================

export interface CustomerTokenPayload {
    customerId: string;
    tenantId: string;
    type: 'customer';
}

export interface CustomerAuthContext {
    customer: CustomerTokenPayload;
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Verify a customer JWT token
 */
export async function verifyCustomerToken(token: string): Promise<CustomerTokenPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
        if (payload.type !== 'customer') return null;
        return payload as unknown as CustomerTokenPayload;
    } catch {
        return null;
    }
}

/**
 * Generate a customer JWT token
 */
export async function generateCustomerToken(
    customerId: string,
    tenantId: string,
    expiresIn = '7d'
): Promise<string> {
    return new SignJWT({
        customerId,
        tenantId,
        type: 'customer'
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(JWT_SECRET_KEY);
}

// ============================================================================
// AUTH MIDDLEWARE PLUGIN
// ============================================================================

/**
 * Customer authentication middleware for Elysia
 * Adds customerAuth to context if token is valid
 */
export const customerAuthPlugin = new Elysia({ name: 'customer-auth' })
    .derive(async ({ headers, set }): Promise<{ customerAuth: CustomerTokenPayload | null }> => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return { customerAuth: null };
        }

        const payload = await verifyCustomerToken(token);
        return { customerAuth: payload };
    });

/**
 * Guard that requires authentication
 * Use this on routes that need customer auth
 */
export const requireCustomerAuth = {
    beforeHandle: ({ customerAuth, set }: { customerAuth: CustomerTokenPayload | null; set: any }): { success: boolean; error: { code: string; message: string } } | undefined => {
        if (!customerAuth) {
            set.status = 401;
            return {
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required'
                }
            };
        }
        return undefined;
    }
};

// ============================================================================
// ERROR RESPONSE HELPERS
// ============================================================================

export const errorResponses = {
    unauthorized: (set: any) => {
        set.status = 401;
        return { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
    },
    invalidToken: (set: any) => {
        set.status = 401;
        return { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } };
    },
    notFound: (set: any, message = 'Resource not found') => {
        set.status = 404;
        return { success: false, error: { code: 'NOT_FOUND', message } };
    },
    badRequest: (set: any, code: string, message: string, details?: string[]) => {
        set.status = 400;
        return { success: false, error: { code, message, details } };
    },
    rateLimited: (set: any, retryAfterMs: number) => {
        set.status = 429;
        return {
            success: false,
            error: {
                code: 'RATE_LIMITED',
                message: `Too many requests. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`
            }
        };
    },
    serverError: (set: any, message = 'Internal server error') => {
        set.status = 500;
        return { success: false, error: { code: 'SERVER_ERROR', message } };
    },
};
