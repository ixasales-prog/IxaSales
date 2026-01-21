/**
 * Customer Portal - Addresses Routes
 * 
 * Customer address book management.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

export const addressesRoutes = new Elysia()
    /**
     * Get customer addresses
     */
    .get('/addresses', async ({ headers, set }) => {
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

        const addresses = await db
            .select()
            .from(schema.customerAddresses)
            .where(eq(schema.customerAddresses.customerId, payload.customerId))
            .orderBy(desc(schema.customerAddresses.isDefault), desc(schema.customerAddresses.createdAt));

        return { success: true, data: addresses };
    })

    /**
     * Add new address
     */
    .post('/addresses', async ({ headers, body, set }) => {
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

        const { name, address, isDefault } = body;

        // If isDefault is true, unset other defaults
        if (isDefault) {
            await db
                .update(schema.customerAddresses)
                .set({ isDefault: false })
                .where(eq(schema.customerAddresses.customerId, payload.customerId));
        }

        const [newAddress] = await db
            .insert(schema.customerAddresses)
            .values({
                tenantId: payload.tenantId,
                customerId: payload.customerId,
                name,
                address,
                isDefault: isDefault || false,
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return createSuccessResponse('ADDRESS_ADDED', newAddress);
    }, {
        body: t.Object({
            name: t.String(),
            address: t.String(),
            isDefault: t.Optional(t.Boolean())
        })
    })

    /**
     * Update address
     */
    .put('/addresses/:id', async ({ headers, params, body, set }) => {
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

        // Check if address belongs to customer
        const [existing] = await db
            .select()
            .from(schema.customerAddresses)
            .where(and(
                eq(schema.customerAddresses.id, params.id),
                eq(schema.customerAddresses.customerId, payload.customerId)
            ))
            .limit(1);

        if (!existing) {
            set.status = 404;
            return createErrorResponse('ADDRESS_NOT_FOUND');
        }

        const { name, address, isDefault } = body;

        // If setting as default, unset other defaults
        if (isDefault) {
            await db
                .update(schema.customerAddresses)
                .set({ isDefault: false })
                .where(and(
                    eq(schema.customerAddresses.customerId, payload.customerId),
                    sql`${schema.customerAddresses.id} != ${params.id}`
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
            .where(eq(schema.customerAddresses.id, params.id))
            .returning();

        return createSuccessResponse('ADDRESS_UPDATED', updated);
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String()),
            address: t.Optional(t.String()),
            isDefault: t.Optional(t.Boolean())
        })
    })

    /**
     * Delete address
     */
    .delete('/addresses/:id', async ({ headers, params, set }) => {
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

        await db
            .delete(schema.customerAddresses)
            .where(and(
                eq(schema.customerAddresses.id, params.id),
                eq(schema.customerAddresses.customerId, payload.customerId)
            ));

        return createSuccessResponse('ADDRESS_DELETED');
    }, {
        params: t.Object({ id: t.String() })
    });
