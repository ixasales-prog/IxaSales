/**
 * Customer Portal - Payments Routes (Fastify)
 * 
 * Payment history for customers.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createErrorResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const ListPaymentsQuerySchema = {
    querystring: Type.Object({
        page: Type.Optional(Type.String()),
        limit: Type.Optional(Type.String())
    })
};

// ============================================================================
// ROUTES
// ============================================================================

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * Get customer's payment history
     */
    fastify.get('/payments', {
        schema: ListPaymentsQuerySchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;
        const query = request.query as { page?: string; limit?: string };

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const offset = (page - 1) * limit;

        const payments = await db
            .select({
                id: schema.payments.id,
                orderId: schema.payments.orderId,
                orderNumber: schema.orders.orderNumber,
                amount: schema.payments.amount,
                paymentMethodId: schema.payments.paymentMethodId,
                methodName: schema.paymentMethods.name,
                referenceNumber: schema.payments.referenceNumber,
                notes: schema.payments.notes,
                createdAt: schema.payments.createdAt,
            })
            .from(schema.payments)
            .leftJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
            .leftJoin(schema.paymentMethods, eq(schema.payments.paymentMethodId, schema.paymentMethods.id))
            .where(and(
                eq(schema.payments.tenantId, customerAuth.tenantId),
                eq(schema.payments.customerId, customerAuth.customerId)
            ))
            .orderBy(desc(schema.payments.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.payments)
            .where(and(
                eq(schema.payments.tenantId, customerAuth.tenantId),
                eq(schema.payments.customerId, customerAuth.customerId)
            ));

        // Get total paid amount
        const [{ totalPaid }] = await db
            .select({ totalPaid: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)` })
            .from(schema.payments)
            .where(and(
                eq(schema.payments.tenantId, customerAuth.tenantId),
                eq(schema.payments.customerId, customerAuth.customerId)
            ));

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, customerAuth.tenantId))
            .limit(1);

        return {
            success: true,
            data: payments.map(p => ({
                id: p.id,
                orderId: p.orderId,
                orderNumber: p.orderNumber,
                amount: Number(p.amount),
                method: p.methodName || "Noma'lum",
                reference: p.referenceNumber,
                notes: p.notes,
                createdAt: p.createdAt
            })),
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
                hasMore: page * limit < Number(count),
                totalPaid: Number(totalPaid),
                currency: tenant?.currency || 'UZS'
            }
        };
    });
};
