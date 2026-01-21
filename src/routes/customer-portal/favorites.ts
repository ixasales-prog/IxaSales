/**
 * Customer Portal - Favorites Routes
 * 
 * Customer product favorites management.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

export const favoritesRoutes = new Elysia()
    /**
     * Get favorite products
     */
    .get('/favorites', async ({ headers, set }) => {
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

        const favorites = await db
            .select({
                productId: schema.customerFavorites.productId,
                product: {
                    id: schema.products.id,
                    name: schema.products.name,
                    sku: schema.products.sku,
                    price: schema.products.price,
                    imageUrl: schema.products.imageUrl,
                    stockQuantity: schema.products.stockQuantity,
                    isActive: schema.products.isActive
                },
                createdAt: schema.customerFavorites.createdAt
            })
            .from(schema.customerFavorites)
            .innerJoin(schema.products, eq(schema.customerFavorites.productId, schema.products.id))
            .where(eq(schema.customerFavorites.customerId, payload.customerId))
            .orderBy(desc(schema.customerFavorites.createdAt));

        return {
            success: true,
            data: favorites.map(f => ({
                id: f.product.id,
                name: f.product.name,
                sku: f.product.sku,
                sellingPrice: Number(f.product.price),
                imageUrl: f.product.imageUrl,
                stockQty: Number(f.product.stockQuantity || 0),
                inStock: Number(f.product.stockQuantity || 0) > 0,
                addedAt: f.createdAt
            }))
        };
    })

    /**
     * Add to favorites
     */
    .post('/favorites/:productId', async ({ headers, params, set }) => {
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

        try {
            await db
                .insert(schema.customerFavorites)
                .values({
                    tenantId: payload.tenantId,
                    customerId: payload.customerId,
                    productId: params.productId,
                    createdAt: new Date()
                })
                .onConflictDoNothing();

            return createSuccessResponse('FAVORITE_ADDED');
        } catch (e) {
            set.status = 500;
            return createErrorResponse('DB_ERROR');
        }
    }, {
        params: t.Object({ productId: t.String() })
    })

    /**
     * Remove from favorites
     */
    .delete('/favorites/:productId', async ({ headers, params, set }) => {
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
            .delete(schema.customerFavorites)
            .where(and(
                eq(schema.customerFavorites.customerId, payload.customerId),
                eq(schema.customerFavorites.productId, params.productId)
            ));

        return createSuccessResponse('FAVORITE_REMOVED');
    }, {
        params: t.Object({ productId: t.String() })
    });
