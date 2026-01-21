/**
 * Customer Portal - Product Reviews Routes
 * 
 * Customer product reviews and ratings management.
 */

import { Elysia } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, avg, count, sql } from 'drizzle-orm';
import { requireAuth } from './middleware';
import { createErrorResponse } from '../../lib/error-codes';

export const reviewsRoutes = new Elysia()
    /**
     * GET /reviews/:productId - Get reviews for a product
     */
    .get('/reviews/:productId', async ({ headers, params, query, set }) => {
        const auth = await requireAuth(headers);
        if (!auth.success) {
            set.status = auth.status;
            return auth.response;
        }

        const page = parseInt(query.page as string) || 1;
        const limit = Math.min(parseInt(query.limit as string) || 10, 50);
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
                    eq(schema.productReviews.productId, params.productId),
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
                    eq(schema.productReviews.productId, params.productId),
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
                    eq(schema.productReviews.productId, params.productId),
                    eq(schema.productReviews.isApproved, true)
                ))
                .groupBy(schema.productReviews.rating);

            // Check if customer can review (has purchased product)
            const [canReview] = await db
                .select({ id: schema.orderItems.id })
                .from(schema.orderItems)
                .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
                .where(and(
                    eq(schema.orders.customerId, auth.customerId),
                    eq(schema.orderItems.productId, params.productId),
                    eq(schema.orders.status, 'delivered')
                ))
                .limit(1);

            // Check if customer already reviewed
            const [existingReview] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.customerId, auth.customerId),
                    eq(schema.productReviews.productId, params.productId)
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
            set.status = 500;
            return createErrorResponse('SERVER_ERROR');
        }
    })

    /**
     * POST /reviews/:productId - Add a review
     */
    .post('/reviews/:productId', async ({ headers, params, body, set }) => {
        const auth = await requireAuth(headers);
        if (!auth.success) {
            set.status = auth.status;
            return auth.response;
        }

        const { rating, comment } = body as { rating: number; comment?: string };

        // Validate rating
        if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
            set.status = 400;
            return createErrorResponse('INVALID_INPUT');
        }

        try {
            // Check if customer purchased the product
            const [purchase] = await db
                .select({ id: schema.orderItems.id })
                .from(schema.orderItems)
                .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
                .where(and(
                    eq(schema.orders.customerId, auth.customerId),
                    eq(schema.orderItems.productId, params.productId),
                    eq(schema.orders.status, 'delivered')
                ))
                .limit(1);

            if (!purchase) {
                set.status = 403;
                return {
                    success: false,
                    error: {
                        code: 'NOT_PURCHASED',
                        message: 'You can only review products you have purchased'
                    }
                };
            }

            // Check for existing review
            const [existing] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.customerId, auth.customerId),
                    eq(schema.productReviews.productId, params.productId)
                ))
                .limit(1);

            if (existing) {
                set.status = 409;
                return {
                    success: false,
                    error: {
                        code: 'ALREADY_REVIEWED',
                        message: 'You have already reviewed this product'
                    }
                };
            }

            // Create review (auto-approve or require moderation based on settings)
            const [review] = await db
                .insert(schema.productReviews)
                .values({
                    productId: params.productId,
                    customerId: auth.customerId,
                    tenantId: auth.tenantId,
                    rating,
                    comment: comment?.trim() || null,
                    isApproved: true, // Auto-approve for now
                    createdAt: new Date()
                })
                .returning();

            // Update product average rating
            const [avgResult] = await db
                .select({
                    avgRating: avg(schema.productReviews.rating),
                    totalReviews: count()
                })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.productId, params.productId),
                    eq(schema.productReviews.isApproved, true)
                ));

            // TODO: Update product's avgRating field if you add it to the schema

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
            set.status = 500;
            return createErrorResponse('SERVER_ERROR');
        }
    })

    /**
     * DELETE /reviews/:reviewId - Delete own review
     */
    .delete('/reviews/:reviewId', async ({ headers, params, set }) => {
        const auth = await requireAuth(headers);
        if (!auth.success) {
            set.status = auth.status;
            return auth.response;
        }

        try {
            // Verify ownership
            const [review] = await db
                .select({ id: schema.productReviews.id })
                .from(schema.productReviews)
                .where(and(
                    eq(schema.productReviews.id, params.reviewId),
                    eq(schema.productReviews.customerId, auth.customerId)
                ))
                .limit(1);

            if (!review) {
                set.status = 404;
                return createErrorResponse('NOT_FOUND');
            }

            await db
                .delete(schema.productReviews)
                .where(eq(schema.productReviews.id, params.reviewId));

            return { success: true, message: 'Review deleted' };
        } catch (error) {
            console.error('[Reviews] Delete review error:', error);
            set.status = 500;
            return createErrorResponse('SERVER_ERROR');
        }
    });

/**
 * Mask customer name for privacy
 */
function maskCustomerName(name: string): string {
    if (name.length <= 2) return name[0] + '***';
    return name[0] + '***' + name[name.length - 1];
}
