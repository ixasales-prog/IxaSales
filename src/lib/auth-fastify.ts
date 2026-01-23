import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../types/fastify';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
    await fastify.register(import('@fastify/jwt'), {
        secret: JWT_SECRET,
    });

    // Decorate request with user properties

    fastify.decorateRequest('isAuthenticated', false);

    // Pre-handler hook to parse JWT and attach user
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                request.user = null;
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
                    request.user = null;
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
                request.user = null;
                request.isAuthenticated = false;
            }
        } catch (err) {
            request.user = null;
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
