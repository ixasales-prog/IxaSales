/**
 * Customer Portal - Favorites Routes (Fastify)
 * 
 * Customer product favorites management.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const ProductIdParamsSchema = {
    params: Type.Object({ productId: Type.String() })
};

// ============================================================================
// ROUTES
// ============================================================================

export const favoritesRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get favorite products
     */
    fastify.get('/favorites', {
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

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
            .where(eq(schema.customerFavorites.customerId, customerAuth.customerId))
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
    });

    /**
     * Add to favorites
     */
    fastify.post<{ Params: { productId: string } }>('/favorites/:productId', {
        schema: ProductIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        try {
            await db
                .insert(schema.customerFavorites)
                .values({
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    productId: request.params.productId,
                    createdAt: new Date()
                })
                .onConflictDoNothing();

            return createSuccessResponse('FAVORITE_ADDED');
        } catch (e) {
            return reply.status(500).send(createErrorResponse('DB_ERROR'));
        }
    });

    /**
     * Remove from favorites
     */
    fastify.delete<{ Params: { productId: string } }>('/favorites/:productId', {
        schema: ProductIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        await db
            .delete(schema.customerFavorites)
            .where(and(
                eq(schema.customerFavorites.customerId, customerAuth.customerId),
                eq(schema.customerFavorites.productId, request.params.productId)
            ));

        return createSuccessResponse('FAVORITE_REMOVED');
    });
};
