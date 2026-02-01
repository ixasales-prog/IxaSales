import { FastifyRequest, FastifyReply } from 'fastify';

// User type for authenticated requests
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    phone?: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        user: AuthUser | null;
        isAuthenticated: boolean;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            sub: string;
            tenantId: string | null;
            role: string;
            type: string;
            impersonatedBy?: string;
        };
        user: AuthUser;
    }
}

export interface AuthenticatedRequest extends FastifyRequest {
    user: AuthUser;
    isAuthenticated: true;
}

export interface RequestContext {
    user: FastifyRequest['user'];
    isAuthenticated: boolean;
    request: FastifyRequest;
    reply: FastifyReply;
}
