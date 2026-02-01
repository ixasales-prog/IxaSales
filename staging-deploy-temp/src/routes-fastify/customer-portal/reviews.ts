/**
 * Customer Portal - Product Reviews Routes (Fastify)
 * 
 * Customer product reviews and ratings management.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, avg, count } from 'drizzle-orm';
import { createErrorResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const ProductIdParamsSchema = {
    params: Type.Object({ productId: Type.String() })
};

const ReviewIdParamsSchema = {
    params: Type.Object({ reviewId: Type.String() })
};

const GetReviewsQuerySchema = {
    querystring: Type.Object({
        page: Type.Optional(Type.String()),
        limit: Type.Optional(Type.String())
    })
};

const AddReviewBodySchema = {
    body: Type.Object({
        rating: Type.Number({ minimum: 1, maximum: 5 }),
        comment: Type.Optional(Type.String())
    })
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Mask customer name for privacy
 */
function maskCustomerName(name: string): string {
    if (name.length <= 2) return name[0] + '***';
    return name[0] + '***' + name[name.length - 1];
}

// ============================================================================
// ROUTES
// ============================================================================

export const reviewsRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * GET /reviews/:productId - Get reviews for a product
     */
    fastify.get<{ Params: { productId: string }; Querystring: { page?: string; limit?: string } }>('/reviews/:productId', {
        schema: { ...ProductIdParamsSchema, ...GetReviewsQuerySchema },
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        const page = parseInt(request.query.page || '1');
        const limit = Math.min(parseInt(request.query.limit || '10'), 50);
        const offset = (page - 1) * limit;

        try {
            // Get reviews
            const reviews = await db
                .select({
                    id: schema.productReviews.id,
                    rating: schema.productReviews.rating,
                    comment: schema.productReviews.comment,
                    createdAt: schema.productReviews.createdAt,
                    customerName: schema.customers.name
                })
                .from(schema.productReviews)
                .leftJoin(schema.customers, eq(schema.productReviews.customerId, schema.customers.id))
                .where(and(
                    eq(schema.productReviews.productId, request.params.productId),
                    eq(schema.productReviews.isApproved, true)
                ))
                .orderBy(desc(schema.productReviews.createdAt))
                .limit(limit)
                .offset(offset);

            // Get rating stats
            const [stats] = await db
                .select({
                    avgRating: avg(schema.productReviews.rating),
                    totalReviews: count()
                })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.productId, request.params.productId),
                    eq(schema.productReviews.isApproved, true)
                ));

            // Get rating distribution
            const distribution = await db
                .select({
                    rating: schema.productReviews.rating,
                    count: count()
                })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.productId, request.params.productId),
                    eq(schema.productReviews.isApproved, true)
                ))
                .groupBy(schema.productReviews.rating);

            // Check if customer can review (has purchased product)
            const [canReview] = await db
                .select({ id: schema.orderItems.id })
                .from(schema.orderItems)
                .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
                .where(and(
                    eq(schema.orders.customerId, customerAuth.customerId),
                    eq(schema.orderItems.productId, request.params.productId),
                    eq(schema.orders.status, 'delivered')
                ))
                .limit(1);

            // Check if customer already reviewed
            const [existingReview] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.customerId, customerAuth.customerId),
                    eq(schema.productReviews.productId, request.params.productId)
                ))
                .limit(1);

            return {
                success: true,
                data: reviews.map(r => ({
                    ...r,
                    customerName: maskCustomerName(r.customerName || 'Customer')
                })),
                stats: {
                    avgRating: stats?.avgRating ? parseFloat(String(stats.avgRating)) : 0,
                    totalReviews: stats?.totalReviews || 0,
                    distribution: Object.fromEntries(distribution.map(d => [d.rating, d.count]))
                },
                canReview: !!canReview && !existingReview,
                meta: {
                    page,
                    limit,
                    hasMore: reviews.length === limit
                }
            };
        } catch (error) {
            console.error('[Reviews] Get reviews error:', error);
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });

    /**
     * POST /reviews/:productId - Add a review
     */
    fastify.post<{ Params: { productId: string }; Body: { rating: number; comment?: string } }>('/reviews/:productId', {
        schema: { ...ProductIdParamsSchema, ...AddReviewBodySchema },
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const { rating, comment } = request.body;

        // Validate rating
        if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
            return reply.status(400).send(createErrorResponse('INVALID_INPUT'));
        }

        try {
            // Check if customer purchased the product
            const [purchase] = await db
                .select({ id: schema.orderItems.id })
                .from(schema.orderItems)
                .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
                .where(and(
                    eq(schema.orders.customerId, customerAuth.customerId),
                    eq(schema.orderItems.productId, request.params.productId),
                    eq(schema.orders.status, 'delivered')
                ))
                .limit(1);

            if (!purchase) {
                return reply.status(403).send({
                    success: false,
                    error: {
                        code: 'NOT_PURCHASED',
                        message: 'You can only review products you have purchased'
                    }
                });
            }

            // Check for existing review
            const [existing] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.customerId, customerAuth.customerId),
                    eq(schema.productReviews.productId, request.params.productId)
                ))
                .limit(1);

            if (existing) {
                return reply.status(409).send({
                    success: false,
                    error: {
                        code: 'ALREADY_REVIEWED',
                        message: 'You have already reviewed this product'
                    }
                });
            }

            // Create review (auto-approve or require moderation based on settings)
            const [review] = await db
                .insert(schema.productReviews)
                .values({
                    productId: request.params.productId,
                    customerId: customerAuth.customerId,
                    tenantId: customerAuth.tenantId,
                    rating,
                    comment: comment?.trim() || null,
                    isApproved: true, // Auto-approve for now
                    createdAt: new Date()
                })
                .returning();

            return {
                success: true,
                data: {
                    id: review.id,
                    rating: review.rating,
                    comment: review.comment,
                    createdAt: review.createdAt
                },
                message: 'Review submitted successfully'
            };
        } catch (error) {
            console.error('[Reviews] Add review error:', error);
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });

    /**
     * DELETE /reviews/:reviewId - Delete own review
     */
    fastify.delete<{ Params: { reviewId: string } }>('/reviews/:reviewId', {
        schema: ReviewIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

        try {
            // Verify ownership
            const [review] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.id, request.params.reviewId),
                    eq(schema.productReviews.customerId, customerAuth.customerId)
                ))
                .limit(1);

            if (!review) {
                return reply.status(404).send(createErrorResponse('NOT_FOUND'));
            }

            await db
                .delete(schema.productReviews)
                .where(eq(schema.productReviews.id, request.params.reviewId));

            return { success: true, message: 'Review deleted' };
        } catch (error) {
            console.error('[Reviews] Delete review error:', error);
            return reply.status(500).send(createErrorResponse('SERVER_ERROR'));
        }
    });
};
