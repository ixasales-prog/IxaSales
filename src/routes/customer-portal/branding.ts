/**
 * Customer Portal - Branding Routes
 * 
 * Tenant branding and support contact info.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse } from '../../lib/error-codes';

export const brandingRoutes = new Elysia()
    /**
     * Get tenant branding info (requires auth)
     */
    .get('/branding', async ({ headers, set }) => {
        const authHeader = headers['authorization'];
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
    })

    /**
     * Get tenant branding by subdomain (public - for login page)
     */
    .get('/branding/:subdomain', async ({ params }) => {
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
            .where(eq(schema.tenants.subdomain, params.subdomain))
            .limit(1);

        return { success: true, data: tenant || null };
    }, {
        params: t.Object({ subdomain: t.String() })
    })

    /**
     * Get tenant support/contact information
     */
    .get('/support', async ({ headers, set }) => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            set.status = 401;
            return createErrorResponse('UNAUTHORIZED');
        }

        const payload = await verifyCustomerToken(token);
        if (!payload) {
            set.status = 401;
            return createErrorResponse('INVALID_TOKEN');
        }

        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                address: schema.tenants.address,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenantId))
            .limit(1);

        return { success: true, data: tenant || null };
    });
