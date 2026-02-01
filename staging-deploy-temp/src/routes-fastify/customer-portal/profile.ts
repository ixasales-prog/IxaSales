/**
 * Customer Portal - Profile Routes (Fastify)
 * 
 * Customer profile management.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const UpdateProfileSchema = {
    body: Type.Object({
        email: Type.Optional(Type.String()),
        address: Type.Optional(Type.String())
    })
};

// ============================================================================
// ROUTES
// ============================================================================

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get customer profile and balance
     */
    fastify.get('/profile', {
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

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
            .where(eq(schema.customers.id, customerAuth.customerId))
            .limit(1);

        if (!customer) {
            return reply.status(404).send(createErrorResponse('CUSTOMER_NOT_FOUND'));
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
            .where(eq(schema.tenants.id, customerAuth.tenantId))
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
    });

    /**
     * Update customer profile
     */
    fastify.put('/profile', {
        schema: UpdateProfileSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const body = request.body as { email?: string; address?: string };

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
            .where(eq(schema.customers.id, customerAuth.customerId))
            .returning();

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, customerAuth.tenantId))
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
    });
};
