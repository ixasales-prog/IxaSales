/**
 * Customer Portal - Cart Routes
 * 
 * Persistent shopping cart management.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

export const cartRoutes = new Elysia()
    /**
     * Get cart
     */
    .get('/cart', async ({ headers, set }) => {
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

        // Get or create cart
        let [cart] = await db
            .select()
            .from(schema.shoppingCarts)
            .where(eq(schema.shoppingCarts.customerId, payload.customerId))
            .limit(1);

        if (!cart) {
            [cart] = await db
                .insert(schema.shoppingCarts)
                .values({
                    tenantId: payload.tenantId,
                    customerId: payload.customerId,
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
    })

    /**
     * Update/Replace cart
     */
    .put('/cart', async ({ headers, body, set }) => {
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

        const { items } = body;

        // Get or create cart
        let [cart] = await db
            .select()
            .from(schema.shoppingCarts)
            .where(eq(schema.shoppingCarts.customerId, payload.customerId))
            .limit(1);

        if (!cart) {
            [cart] = await db
                .insert(schema.shoppingCarts)
                .values({
                    tenantId: payload.tenantId,
                    customerId: payload.customerId,
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
                    items.map((i: any) => ({
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
    }, {
        body: t.Object({
            items: t.Array(t.Object({
                productId: t.String(),
                quantity: t.Number()
            }))
        })
    });
