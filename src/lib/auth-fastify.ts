import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../types/fastify';

const JWT_SECRET = process.env.JWT_SECRET;

// Enforce JWT_SECRET in production environment
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL: JWT_SECRET is required in production environment');
        console.error('💡 Set JWT_SECRET environment variable with a strong secret (32+ characters)');
        process.exit(1);
    } else {
        console.warn('⚠️  WARNING: Using default JWT secret - this is insecure for production');
        console.warn('💡 Set JWT_SECRET environment variable for better security');
    }
} else if (JWT_SECRET.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters for production security');
}

interface JWTPayload {
    sub: string;
    email: string;
    role: string;
    tenantId: string | null;
    iat?: number;
    exp?: number;
}

/**
 * Auth Plugin for Fastify
 * Decorates request with user and isAuthenticated properties
 */
const authPluginCallback: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Register JWT plugin
    await fastify.register(fastifyJwt, {
        secret: JWT_SECRET || 'fallback-secret-for-development',
    });

    // Decorate request with user properties

    fastify.decorateRequest('isAuthenticated', false);

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

                // Fetch full user from database
                const [user] = await db
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

                if (!user || !user.isActive) {
                    (request as any).user = null;
                    request.isAuthenticated = false;
                    return;
                }

                request.user = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tenantId: user.tenantId || '', // super_admin may not have tenantId
                    phone: user.phone || undefined,
                };
                request.isAuthenticated = true;
            } catch (jwtError) {
                // Invalid or expired token
                (request as any).user = null;
                request.isAuthenticated = false;
            }
        } catch (err) {
            (request as any).user = null;
            request.isAuthenticated = false;
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
    });

    // Role-based access control decorator
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
                    error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
                });
                return;
            }
        };
    });

    // Tenant admin or super admin check
    fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.isAuthenticated || !request.user) {
            reply.code(401).send({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
            });
            return;
        }

        if (!['tenant_admin', 'super_admin'].includes(request.user.role)) {
            reply.code(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Admin access required' }
            });
            return;
        }
    });
};

// Extend FastifyInstance type
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

export const authPlugin = fp(authPluginCallback, {
    name: 'auth-plugin',
    dependencies: [],
});
