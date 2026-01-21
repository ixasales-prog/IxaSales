import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

// Types
export interface AuthUser {
    id: string;
    tenantId: string | null;
    role: string;
    email: string;
    name: string;
    customerId?: string | null;
}

export interface JWTPayload {
    sub: string;
    tenantId: string | null;
    role: string;
    type: 'user' | 'customer_user';
    iat: number;
    exp?: number;
}

// JWT Configuration - Required in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
    }
    console.warn('[Auth] WARNING: JWT_SECRET not set, using insecure default. DO NOT USE IN PRODUCTION!');
}
const jwtSecret: string = JWT_SECRET || 'dev-only-secret-do-not-use-in-production';

/**
 * Standalone token verification for use outside Elysia context
 * (e.g., in webhook handlers that don't use authPlugin)
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
    try {
        // Use jose library for standalone JWT verification
        const { jwtVerify } = await import('jose');
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        return payload as unknown as JWTPayload;
    } catch (error) {
        console.error('[Auth] Token verification failed:', error);
        return null;
    }
}

// Helper function to get user from token
async function getUserFromToken(jwtVerify: (token: string) => Promise<JWTPayload | false>, token: string | undefined): Promise<AuthUser | null> {
    if (!token) {
        return null;
    }

    try {
        const payload = await jwtVerify(token);
        if (!payload) {
            return null;
        }

        if (payload.type === 'customer_user') {
            const [user] = await db
                .select({
                    id: schema.customerUsers.id,
                    tenantId: schema.customerUsers.tenantId,
                    email: schema.customerUsers.email,
                    name: schema.customerUsers.name,
                    customerId: schema.customerUsers.customerId,
                })
                .from(schema.customerUsers)
                .where(
                    and(
                        eq(schema.customerUsers.id, payload.sub),
                        eq(schema.customerUsers.isActive, true)
                    )
                )
                .limit(1);

            if (!user) return null;

            // Check tenant status
            if (user.tenantId) {
                const [tenant] = await db
                    .select({ isActive: schema.tenants.isActive })
                    .from(schema.tenants)
                    .where(eq(schema.tenants.id, user.tenantId))
                    .limit(1);

                if (tenant && tenant.isActive === false) return null;
            }

            return { ...user, role: 'customer_user' } as AuthUser;
        }

        const [user] = await db
            .select({
                id: schema.users.id,
                tenantId: schema.users.tenantId,
                role: schema.users.role,
                email: schema.users.email,
                name: schema.users.name,
            })
            .from(schema.users)
            .where(
                and(
                    eq(schema.users.id, payload.sub),
                    eq(schema.users.isActive, true)
                )
            )
            .limit(1);

        if (!user) return null;

        // Check if tenant is suspended (exempt super admins)
        if (user.role !== 'super_admin' && user.tenantId) {
            const [tenant] = await db
                .select({ isActive: schema.tenants.isActive })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, user.tenantId))
                .limit(1);

            if (tenant && tenant.isActive === false) {
                console.log('[Auth] Token Invalidated: Tenant suspended', user.tenantId);
                return null;
            }
        }

        return user as AuthUser | null;
    } catch (err) {
        console.error('[Auth] Token verification error:', err);
        return null;
    }
}

// Create the auth plugin with JWT - uses scoped propagation
export const authPlugin = new Elysia({ name: 'auth' })
    .use(
        jwt({
            name: 'jwt',
            secret: jwtSecret,
        })
    )
    .derive({ as: 'scoped' }, async ({ jwt: jwtInstance, headers, cookie }: any) => {
        // Get token from Authorization header or cookie
        const authHeader = headers?.authorization as string | undefined;
        const token: string | undefined = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : cookie?.token?.value;

        // Console log for debugging (remove in prod)
        // if (token) console.log('[Auth] Verifying token...');

        const user = await getUserFromToken(
            (t: string) => jwtInstance.verify(t) as Promise<JWTPayload | false>,
            token
        );

        if (token && !user) console.log('[Auth] User lookup failed for token');

        return {
            user,
            isAuthenticated: !!user,
        };
    });

// Helper to create tenant-scoped queries
export function tenantScope(tenantId: string | null) {
    return tenantId ? { tenantId } : {};
}
