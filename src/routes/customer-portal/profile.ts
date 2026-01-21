/**
 * Customer Portal - Profile Routes
 * 
 * Customer profile management.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

export const profileRoutes = new Elysia()
    /**
     * Get customer profile and balance
     */
    .get('/profile', async ({ headers, set }) => {
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

        const [customer] = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                phone: schema.customers.phone,
                email: schema.customers.email,
                address: schema.customers.address,
                debtBalance: schema.customers.debtBalance,
                creditBalance: schema.customers.creditBalance,
            })
            .from(schema.customers)
            .where(eq(schema.customers.id, payload.customerId))
            .limit(1);

        if (!customer) {
            set.status = 404;
            return createErrorResponse('CUSTOMER_NOT_FOUND');
        }

        // Get tenant currency and contact info
        const [tenant] = await db
            .select({
                currency: schema.tenants.currency,
                name: schema.tenants.name,
                phone: schema.tenants.phone,
                email: schema.tenants.email,
                address: schema.tenants.address,
                telegramBotUsername: schema.tenants.telegramBotUsername,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenantId))
            .limit(1);

        return {
            success: true,
            data: {
                ...customer,
                debtBalance: Number(customer.debtBalance || 0),
                creditBalance: Number(customer.creditBalance || 0),
                currency: tenant?.currency || 'UZS',
                tenant: tenant ? {
                    name: tenant.name,
                    phone: tenant.phone,
                    email: tenant.email,
                    address: tenant.address,
                    telegramBotUsername: tenant.telegramBotUsername,
                } : null
            }
        };
    })

    /**
     * Update customer profile
     */
    .put('/profile', async ({ headers, body, set }) => {
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

        const updates: Partial<typeof schema.customers.$inferInsert> = {};

        if (body.email !== undefined) updates.email = body.email;
        if (body.address !== undefined) updates.address = body.address;

        if (Object.keys(updates).length === 0) {
            return createErrorResponse('NO_CHANGES');
        }

        const [updated] = await db
            .update(schema.customers)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(schema.customers.id, payload.customerId))
            .returning();

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenantId))
            .limit(1);

        return createSuccessResponse('PROFILE_UPDATED', {
            id: updated.id,
            name: updated.name,
            phone: updated.phone,
            email: updated.email,
            address: updated.address,
            debtBalance: Number(updated.debtBalance || 0),
            creditBalance: Number(updated.creditBalance || 0),
            currency: tenant?.currency || 'UZS'
        });
    }, {
        body: t.Object({
            email: t.Optional(t.String()),
            address: t.Optional(t.String())
        })
    });
