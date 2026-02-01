/**
 * Customer Portal - Addresses Routes (Fastify)
 * 
 * Customer address book management.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const AddAddressSchema = {
    body: Type.Object({
        name: Type.String(),
        address: Type.String(),
        isDefault: Type.Optional(Type.Boolean())
    })
};

const UpdateAddressSchema = {
    params: Type.Object({ id: Type.String() }),
    body: Type.Object({
        name: Type.Optional(Type.String()),
        address: Type.Optional(Type.String()),
        isDefault: Type.Optional(Type.Boolean())
    })
};

const AddressIdParamsSchema = {
    params: Type.Object({ id: Type.String() })
};

// ============================================================================
// ROUTES
// ============================================================================

export const addressesRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get customer addresses
     */
    fastify.get('/addresses', {
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        const addresses = await db
            .select()
            .from(schema.customerAddresses)
            .where(eq(schema.customerAddresses.customerId, customerAuth.customerId))
            .orderBy(desc(schema.customerAddresses.isDefault), desc(schema.customerAddresses.createdAt));

        return { success: true, data: addresses };
    });

    /**
     * Add new address
     */
    fastify.post('/addresses', {
        schema: AddAddressSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const { name, address, isDefault } = request.body as { name: string; address: string; isDefault?: boolean };

        // If isDefault is true, unset other defaults
        if (isDefault) {
            await db
                .update(schema.customerAddresses)
                .set({ isDefault: false })
                .where(eq(schema.customerAddresses.customerId, customerAuth.customerId));
        }

        const [newAddress] = await db
            .insert(schema.customerAddresses)
            .values({
                tenantId: customerAuth.tenantId,
                customerId: customerAuth.customerId,
                name,
                address,
                isDefault: isDefault || false,
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return createSuccessResponse('ADDRESS_ADDED', newAddress);
    });

    /**
     * Update address
     */
    fastify.put<{ Params: { id: string } }>('/addresses/:id', {
        schema: UpdateAddressSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const body = request.body as { name?: string; address?: string; isDefault?: boolean };

        // Check if address belongs to customer
        const [existing] = await db
            .select()
            .from(schema.customerAddresses)
            .where(and(
                eq(schema.customerAddresses.id, request.params.id),
                eq(schema.customerAddresses.customerId, customerAuth.customerId)
            ))
            .limit(1);

        if (!existing) {
            return reply.status(404).send(createErrorResponse('ADDRESS_NOT_FOUND'));
        }

        const { name, address, isDefault } = body;

        // If setting as default, unset other defaults
        if (isDefault) {
            await db
                .update(schema.customerAddresses)
                .set({ isDefault: false })
                .where(and(
                    eq(schema.customerAddresses.customerId, customerAuth.customerId),
                    sql`${schema.customerAddresses.id} != ${request.params.id}`
                ));
        }

        const updates: Partial<typeof schema.customerAddresses.$inferInsert> = {
            updatedAt: new Date()
        };

        if (name !== undefined) updates.name = name;
        if (address !== undefined) updates.address = address;
        if (isDefault !== undefined) updates.isDefault = isDefault;

        const [updated] = await db
            .update(schema.customerAddresses)
            .set(updates)
            .where(eq(schema.customerAddresses.id, request.params.id))
            .returning();

        return createSuccessResponse('ADDRESS_UPDATED', updated);
    });

    /**
     * Delete address
     */
    fastify.delete<{ Params: { id: string } }>('/addresses/:id', {
        schema: AddressIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        await db
            .delete(schema.customerAddresses)
            .where(and(
                eq(schema.customerAddresses.id, request.params.id),
                eq(schema.customerAddresses.customerId, customerAuth.customerId)
            ));

        return createSuccessResponse('ADDRESS_DELETED');
    });
};
