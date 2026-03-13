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
import type { CreateOrderResult, OrderValidationError } from '../../services/orders.service';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../../lib/idempotency';
import type { IdempotencyStartResult } from '../../lib/idempotency';

function isCreateOrderError(result: CreateOrderResult | { error: OrderValidationError }): result is { error: OrderValidationError } {
    return 'error' in result;
}

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
        let idempotency: IdempotencyStartResult = { enabled: false };
        try {
            idempotency = await beginIdempotentRequest(request, 'customer_portal.orders.reorder');
        } catch (idempotencyError) {
            logger.warn('Idempotency initialization failed for customer reorder; continuing without idempotency', {
                customerId: customerAuth.customerId,
                error: String(idempotencyError),
            });
        }
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_IN_PROGRESS',
                    message: 'A request with this idempotency key is currently being processed',
                },
            });
        }
        if (idempotency.enabled && idempotency.conflict) {
            return reply.status(409).send({
                success: false,
                error: {
                    code: 'IDEMPOTENCY_KEY_REUSED',
                    message: idempotency.conflict,
                },
            });
        }

        try {
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
                const errorBody = createErrorResponse('ORDER_LIMIT_REACHED');
                await finishIdempotentRequest(idempotency, 400, errorBody);
                return reply.status(400).send(errorBody);
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
                const errorBody = createErrorResponse('ORDER_NOT_FOUND');
                await finishIdempotentRequest(idempotency, 404, errorBody);
                return reply.status(404).send(errorBody);
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
                const errorBody = createErrorResponse('NO_ITEMS');
                await finishIdempotentRequest(idempotency, 400, errorBody);
                return reply.status(400).send(errorBody);
            }

        // Create new order in transaction
        const result = await db.transaction(async (tx) => {
            const { canCreateResourceInTx } = await import('../../lib/planLimits');
            const limitCheck = await canCreateResourceInTx(tx, customerAuth.tenantId, 'orders');
            if (!limitCheck.allowed) {
                return {
                    error: {
                        code: 'LIMIT_EXCEEDED' as const,
                        status: 403,
                        message: `Monthly order limit reached (${limitCheck.current}/${limitCheck.max}).`,
                    }
                };
            }

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

                newItems.push({
                    productId: item.productId,
                    qty,
                    unitPrice: Number(product.price),
                    lineTotal: Number(product.price) * qty,
                    productName: product.name,
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

            const orderResult = await ordersService.createOrder(
                tx,
                {
                    tenantId: customerAuth.tenantId,
                    customerId: customerAuth.customerId,
                    items: newItems.map(item => ({
                        productId: item.productId,
                        quantity: item.qty,
                    })),
                    notes: `Qayta buyurtma (${originalOrder.orderNumber} asosida)`,
                },
                {
                    mode: 'customer_portal',
                    actorRole: 'customer',
                    applyAutoDiscount: true,
                }
            );

            if (isCreateOrderError(orderResult)) {
                return orderResult;
            }

            logger.info('Reorder created via customer portal', {
                orderId: orderResult.order.id,
                orderNumber: orderResult.order.orderNumber,
                originalOrderNumber: originalOrder.orderNumber,
                customerId: customerAuth.customerId,
                totalAmount: orderResult.totalAmount,
                itemCount: orderResult.items.length,
            });

            return { orderResult, skippedProducts };
        });

            if ('error' in result && result.error) {
                const fallbackMessages: Record<string, string> = {
                    NO_AVAILABLE_PRODUCTS: 'No products from the original order are currently available.',
                };
                const errorBody = {
                    success: false,
                    error: {
                        code: result.error.code,
                        message: 'message' in result.error ? result.error.message : (fallbackMessages[result.error.code] || 'Unable to reorder'),
                        details: 'details' in result.error ? result.error.details : undefined,
                    }
                };
                await finishIdempotentRequest(idempotency, result.error.status, errorBody);
                return reply.status(result.error.status).send(errorBody);
            }

            const responseBody = createSuccessResponse('REORDER_CREATED', {
                orderId: result.orderResult.order.id,
                orderNumber: result.orderResult.order.orderNumber,
                totalAmount: result.orderResult.totalAmount,
                itemCount: result.orderResult.items.length,
                warnings: result.skippedProducts.length > 0 ? result.skippedProducts : undefined
            });
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error) {
            await abortIdempotentRequest(idempotency);
            logger.error('Customer portal reorder failed', error instanceof Error ? error : new Error(String(error)), {
                customerId: customerAuth.customerId,
                orderId: request.params.orderId,
            });
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });
};
