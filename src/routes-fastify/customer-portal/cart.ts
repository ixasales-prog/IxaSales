/**
 * Customer Portal - Cart Routes (Fastify)
 * 
 * Persistent shopping cart management.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { createSuccessResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const UpdateCartSchema = {
    body: Type.Object({
        items: Type.Array(Type.Object({
            productId: Type.String(),
            quantity: Type.Integer({ minimum: 1, maximum: 1000 })
        }))
    })
};

// ============================================================================
// ROUTES
// ============================================================================

export const cartRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get cart
     */
    fastify.get('/cart', {
        preHandler: [requireCustomerAuth]
    }, async (request) => {
        const customerAuth = request.customerAuth!;

        // Get or create cart
        let [cart] = await db
            .select()
            .from(schema.shoppingCarts)
            .where(eq(schema.shoppingCarts.customerId, customerAuth.customerId))
            .limit(1);

        if (!cart) {
            [cart] = await db
                .insert(schema.shoppingCarts)
                .values({
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    updatedAt: new Date()
                })
                .returning();
        }

        // Get items with product details
        const items = await db
            .select({
                productId: schema.cartItems.productId,
                quantity: schema.cartItems.quantity,
                product: {
                    id: schema.products.id,
                    name: schema.products.name,
                    sku: schema.products.sku,
                    price: schema.products.price,
                    imageUrl: schema.products.imageUrl,
                    stockQuantity: schema.products.stockQuantity,
                    isActive: schema.products.isActive,
                }
            })
            .from(schema.cartItems)
            .innerJoin(schema.products, eq(schema.cartItems.productId, schema.products.id))
            .where(eq(schema.cartItems.cartId, cart.id));

        return {
            success: true,
            data: items.map(i => ({
                product: {
                    ...i.product,
                    sellingPrice: Number(i.product.price),
                    stockQty: Number(i.product.stockQuantity || 0),
                    inStock: Number(i.product.stockQuantity || 0) > 0
                },
                quantity: i.quantity
            }))
        };
    });

    /**
     * Update/Replace cart
     */
    fastify.put('/cart', {
        schema: UpdateCartSchema,
        preHandler: [requireCustomerAuth]
    }, async (request) => {
        const customerAuth = request.customerAuth!;
        const { items } = request.body as { items: { productId: string; quantity: number }[] };
        const sanitizedItems = items.map((item) => ({
            productId: item.productId,
            quantity: Math.floor(Number(item.quantity)),
        }));

        if (sanitizedItems.some((item) => !Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > 1000)) {
            return {
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Cart item quantity must be an integer between 1 and 1000.',
                },
            };
        }

        // Get or create cart
        let [cart] = await db
            .select()
            .from(schema.shoppingCarts)
            .where(eq(schema.shoppingCarts.customerId, customerAuth.customerId))
            .limit(1);

        if (!cart) {
            [cart] = await db
                .insert(schema.shoppingCarts)
                .values({
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    updatedAt: new Date()
                })
                .returning();
        }

        // Use transaction to replace items
        await db.transaction(async (tx) => {
            // Delete old items
            await tx
                .delete(schema.cartItems)
                .where(eq(schema.cartItems.cartId, cart.id));

            // Insert new items if any
            if (items.length > 0) {
                await tx.insert(schema.cartItems).values(
                    sanitizedItems.map((i) => ({
                        cartId: cart.id,
                        productId: i.productId,
                        quantity: i.quantity,
                        createdAt: new Date()
                    }))
                );
            }

            // Update cart timestamp
            await tx
                .update(schema.shoppingCarts)
                .set({ updatedAt: new Date() })
                .where(eq(schema.shoppingCarts.id, cart.id));
        });

        return createSuccessResponse('CART_UPDATED');
    });
};
