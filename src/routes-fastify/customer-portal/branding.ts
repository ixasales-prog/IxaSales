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
import { requireCustomerAuth } from './middleware';
import { getTelegramIntegration } from '../../lib/tenant-integrations';

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
    async function getBrandingByTenantId(tenantId: string) {
        const [tenant] = await db
            .select({
                id: schema.tenants.id,
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

        if (!tenant) {
            return null;
        }

        const telegram = await getTelegramIntegration(tenant.id, false);
        return {
            name: tenant.name,
            logo: tenant.logo,
            phone: tenant.phone,
            email: tenant.email,
            address: tenant.address,
            currency: tenant.currency,
            telegramEnabled: telegram.enabled,
            telegramBotUsername: telegram.botUsername || tenant.telegramBotUsername,
            hasTelegramBot: telegram.hasBotToken,
        };
    }

    /**
     * Get tenant branding info (requires auth)
     */
    fastify.get('/branding', async (request) => {
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

        const tenant = await getBrandingByTenantId(tenantId);

        return { success: true, data: tenant || null };
    });

    /**
     * Get tenant branding by subdomain (public - for login page)
     */
    fastify.get<{ Params: { subdomain: string } }>('/branding/:subdomain', {
        schema: SubdomainParamsSchema
    }, async (request) => {
        const [tenant] = await db
            .select({
                id: schema.tenants.id,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, request.params.subdomain))
            .limit(1);

        if (!tenant?.id) {
            return { success: true, data: null };
        }

        const branding = await getBrandingByTenantId(tenant.id);
        return { success: true, data: branding || null };
    });

    /**
     * Get tenant support/contact information
     */
    fastify.get('/support', {
        preHandler: [requireCustomerAuth]
    }, async (request) => {
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
