/**
 * Customer Portal - Reorder Routes (Fastify)
 * 
 * Extracted reorder logic from orders.ts for better maintainability.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, sql, or } from 'drizzle-orm';
import { customerPortalLogger as logger } from '../../lib/logger';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';
import { MAX_PENDING_ORDERS, type OrderItemInput } from './types';
import { requireCustomerAuth } from './middleware';
import { ordersService } from '../../services/orders.service';

// ============================================================================
// SCHEMAS
// ============================================================================

const ReorderParamsSchema = {
    params: Type.Object({ orderId: Type.String() })
};

// ============================================================================
// ROUTES
// ============================================================================

export const reorderRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Reorder from a previous order
     */
    fastify.post<{ Params: { orderId: string } }>('/reorder/:orderId', {
        schema: ReorderParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        // Check pending order limit first
        const [{ pendingCount }] = await db
            .select({ pendingCount: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.customerId, customerAuth.customerId),
                or(
                    eq(schema.orders.status, 'pending'),
                    eq(schema.orders.status, 'confirmed')
                )
            ));

        if (Number(pendingCount) >= MAX_PENDING_ORDERS) {
            return reply.status(400).send(createErrorResponse('ORDER_LIMIT_REACHED'));
        }

        // Find original order
        const [originalOrder] = await db
            .select()
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, request.params.orderId),
                eq(schema.orders.tenantId, customerAuth.tenantId),
                eq(schema.orders.customerId, customerAuth.customerId)
            ))
            .limit(1);

        if (!originalOrder) {
            return reply.status(404).send(createErrorResponse('ORDER_NOT_FOUND'));
        }

        // Get original items
        const originalItems = await db
            .select({
                productId: schema.orderItems.productId,
                qtyOrdered: schema.orderItems.qtyOrdered,
            })
            .from(schema.orderItems)
            .where(eq(schema.orderItems.orderId, request.params.orderId));

        if (originalItems.length === 0) {
            return reply.status(400).send(createErrorResponse('NO_ITEMS'));
        }

        // Create new order in transaction
        const result = await db.transaction(async (tx) => {
            const productIds = originalItems.map(i => i.productId);
            const products = await tx
                .select({
                    id: schema.products.id,
                    name: schema.products.name,
                    price: schema.products.price,
                    stockQuantity: schema.products.stockQuantity,
                    reservedQuantity: schema.products.reservedQuantity,
                    isActive: schema.products.isActive,
                })
                .from(schema.products)
                .where(and(
                    eq(schema.products.tenantId, customerAuth.tenantId),
                    sql`${schema.products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`
                ))
                .for('update');

            const productMap = new Map(products.map(p => [p.id, p]));

            let totalAmount = 0;
            const newItems: OrderItemInput[] = [];
            const skippedProducts: string[] = [];

            for (const item of originalItems) {
                const product = productMap.get(item.productId);
                if (!product || !product.isActive) {
                    skippedProducts.push(`${item.productId} (mavjud emas)`);
                    continue;
                }

                const qty = Number(item.qtyOrdered);
                const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);

                if (qty > availableStock) {
                    skippedProducts.push(`${product.name} (faqat ${availableStock} ta mavjud)`);
                    continue;
                }

                const unitPrice = Number(product.price);
                const lineTotal = unitPrice * qty;
                totalAmount += lineTotal;

                newItems.push({
                    productId: item.productId,
                    qty,
                    unitPrice,
                    lineTotal,
                    productName: product.name
                });
            }

            if (newItems.length === 0) {
                return {
                    error: {
                        code: 'NO_AVAILABLE_PRODUCTS' as const,
                        status: 400
                    }
                };
            }

            // Generate order number using shared service
            const orderNumber = await ordersService.generateOrderNumber(tx, customerAuth.tenantId);

            const [newOrder] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    orderNumber,
                    status: 'pending',
                    paymentStatus: 'unpaid',
                    subtotalAmount: String(totalAmount),
                    totalAmount: String(totalAmount),
                    paidAmount: '0',
                    notes: `Qayta buyurtma (${originalOrder.orderNumber} asosida)`,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            // Insert order items
            for (const item of newItems) {
                await tx.insert(schema.orderItems).values({
                    orderId: newOrder.id,
                    productId: item.productId,
                    qtyOrdered: item.qty,
                    qtyDelivered: 0,
                    unitPrice: String(item.unitPrice),
                    lineTotal: String(item.lineTotal),
                });
            }

            // Reserve stock using shared service
            await ordersService.reserveStock(tx, newItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                unitPrice: item.unitPrice,
                quantity: item.qty,
                lineTotal: item.lineTotal,
            })));

            // Update customer debt using shared service
            await ordersService.updateCustomerDebt(tx, customerAuth.customerId, totalAmount);

            // Log status change using shared service
            await ordersService.logStatusChange(tx, newOrder.id, 'pending', undefined, `Reorder from ${originalOrder.orderNumber}`);

            logger.info('Reorder created via customer portal', {
                orderId: newOrder.id,
                orderNumber: newOrder.orderNumber,
                originalOrderNumber: originalOrder.orderNumber,
                customerId: customerAuth.customerId,
                totalAmount,
                itemCount: newItems.length
            });

            return { order: newOrder, newItems, totalAmount, skippedProducts };
        });

        if ('error' in result && result.error) {
            return reply.status(result.error.status).send(createErrorResponse(result.error.code));
        }

        return createSuccessResponse('REORDER_CREATED', {
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            totalAmount: result.totalAmount,
            itemCount: result.newItems.length,
            warnings: result.skippedProducts.length > 0 ? result.skippedProducts : undefined
        });
    });
};
