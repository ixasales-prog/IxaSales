/**
 * Customer Portal Authentication
 *
 * JWT utilities for customer portal routes (Fastify).
 */

import { jwtVerify, SignJWT } from 'jose';

// ============================================================================
// JWT CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET;

// Enforce JWT_SECRET in production environment
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[CustomerPortal] ❌ CRITICAL: JWT_SECRET is required in production environment');
        console.error('[CustomerPortal] 💡 Set JWT_SECRET environment variable with a strong secret (32+ characters)');
        process.exit(1);
    } else {
        console.warn('[CustomerPortal] ⚠️  WARNING: Using default JWT secret - this is insecure for production');
        console.warn('[CustomerPortal] 💡 Set JWT_SECRET environment variable for better security');
    }
} else if (JWT_SECRET.length < 32) {
    console.warn('[CustomerPortal] ⚠️  WARNING: JWT_SECRET should be at least 32 characters for production security');
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
