import { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantAccessState } from '../lib/tenant-access';
import type { AppPermission } from '../lib/permissions';

// User type for authenticated requests
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    phone?: string;
    customerId?: string;
    actorType?: 'user' | 'customer_user';
    permissions?: AppPermission[];
    impersonatedBy?: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        user: AuthUser | null | undefined;
        isAuthenticated: boolean;
        tenantAccess: TenantAccessState | null;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            sub: string;
            tenantId: string | null;
            role: string;
            type: string;
            customerId?: string;
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
