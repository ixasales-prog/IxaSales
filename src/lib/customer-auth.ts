/**
 * Customer Portal Authentication
 *
 * JWT utilities for customer portal routes (Fastify).
 */

import { jwtVerify, SignJWT } from 'jose';
import { createSession, getSessionTtlMs, getValidSessionByToken } from './auth-sessions';

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_FALLBACK_SECRET = 'test-only-secret-do-not-use';

// Enforce explicit JWT secret outside test environment.
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'test') {
        console.warn('[CustomerPortal] WARNING: Using test-only JWT secret');
    } else {
        console.error('[CustomerPortal] CRITICAL: JWT_SECRET is required');
        console.error('[CustomerPortal] Set JWT_SECRET environment variable with a strong secret (32+ characters)');
        process.exit(1);
    }
} else if (JWT_SECRET.length < 32) {
    console.warn('[CustomerPortal] WARNING: JWT_SECRET should be at least 32 characters for production security');
}

const RESOLVED_JWT_SECRET = JWT_SECRET || TEST_FALLBACK_SECRET;
const JWT_SECRET_KEY = new TextEncoder().encode(RESOLVED_JWT_SECRET);

export interface CustomerTokenPayload {
    customerId: string;
    tenantId: string;
    type: 'customer';
}

export interface CustomerAuthContext {
    customer: CustomerTokenPayload;
}

/**
 * Verify a customer JWT token
 */
export async function verifyCustomerToken(token: string): Promise<CustomerTokenPayload | null> {
    try {
        const session = await getValidSessionByToken(token);
        if (!session || session.userType !== 'customer') {
            return null;
        }

        const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
        if (payload.type !== 'customer') {
            return null;
        }

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
    expiresIn = '7d',
    sessionMeta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }
): Promise<string> {
    const token = await new SignJWT({
        customerId,
        tenantId,
        type: 'customer',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(JWT_SECRET_KEY);

    await createSession({
        userId: customerId,
        userType: 'customer',
        token,
        ipAddress: sessionMeta?.ipAddress || null,
        userAgent: sessionMeta?.userAgent || null,
        expiresAt: new Date(Date.now() + getSessionTtlMs()),
    });

    return token;
}
