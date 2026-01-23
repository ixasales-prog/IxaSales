/**
 * Customer Portal - Branding Routes (Fastify)
 * 
 * Tenant branding and support contact info.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const SubdomainParamsSchema = {
    params: Type.Object({ subdomain: Type.String() })
};

// ============================================================================
// ROUTES
// ============================================================================

export const brandingRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get tenant branding info (requires auth)
     */
    fastify.get('/branding', async (request, reply) => {
        const authHeader = request.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        let tenantId: string | null = null;

        if (token) {
            const payload = await verifyCustomerToken(token);
            if (payload) {
                tenantId = payload.tenantId;
            }
        }

        if (!tenantId) {
            return { success: true, data: null };
        }

        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                logo: schema.tenants.logo,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                address: schema.tenants.address,
                currency: schema.tenants.currency,
                telegramBotUsername: schema.tenants.telegramBotUsername,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        return { success: true, data: tenant || null };
    });

    /**
     * Get tenant branding by subdomain (public - for login page)
     */
    fastify.get<{ Params: { subdomain: string } }>('/branding/:subdomain', {
        schema: SubdomainParamsSchema
    }, async (request, reply) => {
        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                logo: schema.tenants.logo,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                address: schema.tenants.address,
                currency: schema.tenants.currency,
                telegramBotUsername: schema.tenants.telegramBotUsername,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, request.params.subdomain))
            .limit(1);

        return { success: true, data: tenant || null };
    });

    /**
     * Get tenant support/contact information
     */
    fastify.get('/support', {
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                address: schema.tenants.address,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, customerAuth.tenantId))
            .limit(1);

        return { success: true, data: tenant || null };
    });
};
