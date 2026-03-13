import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../types/fastify';
import { evaluateTenantAccess, isSafeMethod } from './tenant-access';
import { getValidSessionByToken } from './auth-sessions';
import { getPermissionsForRole, type AppPermission } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_FALLBACK_SECRET = 'test-only-secret-do-not-use';

// Enforce explicit JWT secret outside test environment.
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'test') {
        console.warn('WARNING: Using test-only JWT secret');
    } else {
        console.error('CRITICAL: JWT_SECRET is required');
        console.error('Set JWT_SECRET environment variable with a strong secret (32+ characters)');
        process.exit(1);
    }
} else if (JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters for production security');
}

const RESOLVED_JWT_SECRET = JWT_SECRET || TEST_FALLBACK_SECRET;

interface JWTPayload {
    sub: string;
    email: string;
    role: string;
    tenantId: string | null;
    type: 'user' | 'customer_user';
    customerId?: string;
    impersonatedBy?: string;
    iat?: number;
    exp?: number;
}

function normalizePath(url?: string): string {
    if (!url) return '/';
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(0, q) : url;
}

function inferPermissionForRequest(method: string, rawUrl?: string): AppPermission | null {
    const path = normalizePath(rawUrl);
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

    if (!path.startsWith('/api/')) return null;
    if (path.startsWith('/api/auth/')) return null;
    if (path.startsWith('/api/customer-portal/')) return null;
    if (path.startsWith('/api/payroll')) return isWrite ? 'payroll.manage' : 'payroll.read';
    if (path.startsWith('/api/reports')) return isWrite ? 'reports.export' : 'reports.read';
    if (path.startsWith('/api/orders')) {
        // Order status transitions have their own explicit role checks in route handlers.
        // Avoid forcing generic orders.write here because it blocks valid warehouse/driver flows.
        if (/^\/api\/orders\/[^/]+\/status$/.test(path) || /^\/api\/orders\/[^/]+\/cancel$/.test(path)) {
            return null;
        }
        return isWrite ? 'orders.write' : 'orders.read';
    }
    if (path.startsWith('/api/customers')) return isWrite ? 'customers.write' : 'customers.read';
    if (path.startsWith('/api/products')) return isWrite ? 'products.write' : 'products.read';
    if (path.startsWith('/api/inventory')) return isWrite ? 'inventory.adjust' : 'inventory.read';
    if (path.startsWith('/api/warehouse')) return 'warehouse.manage';
    if (path.startsWith('/api/deliveries') || path.startsWith('/api/delivery')) return isWrite ? 'deliveries.manage' : 'deliveries.read';
    if (path.startsWith('/api/payments/suppliers')) return 'payments.manage';
    if (path.startsWith('/api/payments') || path.startsWith('/api/payment-gateway')) return 'payments.collect';
    if (path.startsWith('/api/gps-tracking')) return isWrite ? 'gps.manage' : 'gps.read';
    if (path.startsWith('/api/notifications')) return 'notifications.manage';
    if (path.startsWith('/api/super')) return 'super.manage';
    if (path.startsWith('/api/tenants')) return 'tenants.manage';
    if (path.startsWith('/api/backups')) return isWrite ? 'backups.restore' : 'backups.read';
    if (path.startsWith('/api/uploads')) return isWrite ? 'products.write' : 'products.read';
    if (path.startsWith('/api/users')) return 'auth.manage';
    return null;
}

/**
 * Auth Plugin for Fastify
 * Decorates request with user and isAuthenticated properties
 */
const authPluginCallback: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    console.log("Executing authPluginCallback...");
    // Register JWT plugin
    await fastify.register(fastifyJwt, {
        secret: RESOLVED_JWT_SECRET,
    });

    // Decorate request with user properties

    fastify.decorateRequest('isAuthenticated', false);
    fastify.decorateRequest('tenantAccess', null);

    // Pre-handler hook to parse JWT and attach user
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                (request as any).user = null;
                request.isAuthenticated = false;
                return;
            }

            const token = authHeader.substring(7);

            try {
                const decoded = fastify.jwt.verify<JWTPayload>(token);
                const session = await getValidSessionByToken(token);
                if (!session) {
                    (request as any).user = null;
                    request.isAuthenticated = false;
                    request.tenantAccess = null;
                    return;
                }

                let user: AuthUser | null = null;

                if (decoded.type === 'customer_user') {
                    const [customerUser] = await db
                        .select({
                            id: schema.customerUsers.id,
                            email: schema.customerUsers.email,
                            name: schema.customerUsers.name,
                            tenantId: schema.customerUsers.tenantId,
                            customerId: schema.customerUsers.customerId,
                            isActive: schema.customerUsers.isActive,
                        })
                        .from(schema.customerUsers)
                        .where(eq(schema.customerUsers.id, decoded.sub))
                        .limit(1);

                    if (!customerUser || !customerUser.isActive) {
                        (request as any).user = null;
                        request.isAuthenticated = false;
                        request.tenantAccess = null;
                        return;
                    }

                    user = {
                        id: customerUser.id,
                        email: customerUser.email,
                        name: customerUser.name,
                        role: 'customer_user',
                        tenantId: customerUser.tenantId,
                        customerId: customerUser.customerId,
                        actorType: 'customer_user',
                        permissions: getPermissionsForRole('customer_user'),
                    };
                } else {
                    const [staffUser] = await db
                        .select({
                            id: schema.users.id,
                            email: schema.users.email,
                            name: schema.users.name,
                            role: schema.users.role,
                            tenantId: schema.users.tenantId,
                            phone: schema.users.phone,
                            isActive: schema.users.isActive,
                        })
                        .from(schema.users)
                        .where(eq(schema.users.id, decoded.sub))
                        .limit(1);

                    if (!staffUser || !staffUser.isActive) {
                        (request as any).user = null;
                        request.isAuthenticated = false;
                        request.tenantAccess = null;
                        return;
                    }

                    user = {
                        id: staffUser.id,
                        email: staffUser.email,
                        name: staffUser.name,
                        role: staffUser.role,
                        tenantId: staffUser.tenantId || '',
                        phone: staffUser.phone || undefined,
                        actorType: 'user',
                        permissions: getPermissionsForRole(staffUser.role),
                        impersonatedBy: decoded.impersonatedBy,
                    };
                }

                request.user = user;

                if (user.role !== 'super_admin' && user.tenantId) {
                    const [tenant] = await db
                        .select({
                            isActive: schema.tenants.isActive,
                            planStatus: schema.tenants.planStatus,
                            subscriptionEndAt: schema.tenants.subscriptionEndAt,
                        })
                        .from(schema.tenants)
                        .where(eq(schema.tenants.id, user.tenantId))
                        .limit(1);
                    request.tenantAccess = evaluateTenantAccess(tenant);
                } else {
                    request.tenantAccess = { mode: 'full', reason: 'ok', message: '' };
                }
                request.isAuthenticated = true;
            } catch (jwtError) {
                // Invalid or expired token
                (request as any).user = null;
                request.isAuthenticated = false;
                request.tenantAccess = null;
            }
        } catch (err) {
            (request as any).user = null;
            request.isAuthenticated = false;
            request.tenantAccess = null;
        }
    });

    // Decorator function for protected routes
    fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.isAuthenticated || !request.user) {
            reply.code(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
            });
            return;
        }

        const inferredPermission = inferPermissionForRequest(request.method, request.raw.url);
        if (inferredPermission && !request.user.permissions?.includes(inferredPermission)) {
            reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
            });
            return;
        }

        if (
            request.user.role !== 'super_admin' &&
            request.tenantAccess?.mode === 'read_only' &&
            !isSafeMethod(request.method)
        ) {
            reply.code(403).send({
                success: false,
                error: {
                    code: 'TENANT_READ_ONLY',
                    message: request.tenantAccess.message || 'Tenant is in read-only mode.',
                },
                data: {
                    tenantAccess: request.tenantAccess,
                },
            });
            return;
        }
    });

    fastify.decorate('requirePermission', (permission: AppPermission) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            if (!request.isAuthenticated || !request.user) {
                reply.code(401).send({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
                });
                return;
            }

            if (!request.user.permissions?.includes(permission)) {
                reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
                });
                return;
            }
        };
    });

    fastify.decorate('requireRole', (roles: string[]) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            if (!request.isAuthenticated || !request.user) {
                reply.code(401).send({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
                });
                return;
            }

            if (!roles.includes(request.user.role)) {
                reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Insufficient role' }
                });
            }
        };
    });
};

// Extend FastifyInstance type
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requirePermission: (permission: AppPermission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

export const authPlugin = fp(authPluginCallback, {
    name: 'auth-plugin',
    dependencies: [],
});
