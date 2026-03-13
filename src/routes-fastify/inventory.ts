import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { sendApiError } from '../lib/api-errors';
import { abortIdempotentRequest, beginIdempotentRequest, finishIdempotentRequest } from '../lib/idempotency';

// Schemas
const ListMovementsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    productId: Type.Optional(Type.String()),
    movementType: Type.Optional(Type.String()),
});

const CreateAdjustmentBodySchema = Type.Object({
    productId: Type.String(),
    type: Type.String(),
    quantity: Type.Number({ minimum: 1 }),
    reason: Type.String({ minLength: 3 }),
});

// Batch adjustment schema - adjusts multiple products at once
const BatchAdjustmentItemSchema = Type.Object({
    productId: Type.String(),
    quantity: Type.Number({ minimum: 0 }),
});

const CreateBatchAdjustmentBodySchema = Type.Object({
    type: Type.String(),
    reason: Type.String({ minLength: 3 }),
    items: Type.Array(BatchAdjustmentItemSchema, { minItems: 1 }),
});

type ListMovementsQuery = Static<typeof ListMovementsQuerySchema>;
type CreateAdjustmentBody = Static<typeof CreateAdjustmentBodySchema>;
type CreateBatchAdjustmentBody = Static<typeof CreateBatchAdjustmentBodySchema>;

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
    // List movements
    fastify.get<{ Querystring: ListMovementsQuery }>('/movements', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListMovementsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', productId, movementType } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse'];
        if (!allowedRoles.includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const conditions: any[] = [eq(schema.stockMovements.tenantId, user.tenantId)];
        if (productId) conditions.push(eq(schema.stockMovements.productId, productId));
        if (movementType) conditions.push(eq(schema.stockMovements.movementType, movementType as any));

        const movements = await db.select({
            id: schema.stockMovements.id,
            productName: schema.products.name,
            movementType: schema.stockMovements.movementType,
            quantity: schema.stockMovements.quantity,
            quantityBefore: schema.stockMovements.quantityBefore,
            quantityAfter: schema.stockMovements.quantityAfter,
            notes: schema.stockMovements.notes,
            createdAt: schema.stockMovements.createdAt,
            userName: schema.users.name,
        }).from(schema.stockMovements)
            .leftJoin(schema.products, eq(schema.stockMovements.productId, schema.products.id))
            .leftJoin(schema.users, eq(schema.stockMovements.createdBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.stockMovements.createdAt))
            .limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.stockMovements).where(and(...conditions));

        return { success: true, data: movements, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create adjustment
    fastify.post<{ Body: CreateAdjustmentBody }>('/adjustments', {
        preHandler: [fastify.authenticate, fastify.requirePermission('inventory.adjust')],
        schema: { body: CreateAdjustmentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const idempotency = await beginIdempotentRequest(request, 'inventory.adjust');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        const adjustmentNumber = `ADJ-${Date.now()}`;

        try {
            const result = await db.transaction(async (tx) => {
                const [product] = await tx.select({ stockQuantity: schema.products.stockQuantity })
                    .from(schema.products)
                    .where(and(eq(schema.products.id, body.productId), eq(schema.products.tenantId, user.tenantId)))
                    .limit(1);

                if (!product) throw new Error('Product not found');

                const qtyBefore = product.stockQuantity || 0;
                let qtyAfter = qtyBefore;
                let change = 0;

                if (body.type === 'count') { qtyAfter = body.quantity; change = qtyAfter - qtyBefore; }
                else if (body.type === 'found') { change = body.quantity; qtyAfter = qtyBefore + change; }
                else { change = -body.quantity; qtyAfter = qtyBefore + change; }

                await tx.update(schema.products).set({ stockQuantity: qtyAfter }).where(eq(schema.products.id, body.productId));

                const [adjustment] = await tx.insert(schema.stockAdjustments).values({
                    tenantId: user.tenantId, adjustmentNumber, productId: body.productId,
                    adjustmentType: body.type as any, qtyBefore, qtyAfter, reason: body.reason,
                    createdBy: user.id, approvedBy: user.id,
                }).returning();

                await tx.insert(schema.stockMovements).values({
                    tenantId: user.tenantId, productId: body.productId,
                    movementType: body.type === 'found' ? 'in' : (change < 0 ? 'out' : 'adjust'),
                    quantity: Math.abs(change), quantityBefore: qtyBefore, quantityAfter: qtyAfter,
                    referenceType: 'adjustment', referenceId: adjustment.id, createdBy: user.id,
                    notes: `Adjustment: ${body.reason}`,
                });

                return adjustment;
            });
            const responseBody = { success: true, data: result };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error: any) {
            await abortIdempotentRequest(idempotency);
            if (error.message === 'Product not found') {
                return sendApiError(reply, 404, 'NOT_FOUND', 'Product not found');
            }
            return sendApiError(reply, 500, 'INTERNAL_ERROR', 'Failed to create stock adjustment');
        }
    });

    // Batch adjustment - adjust multiple products at once
    fastify.post<{ Body: CreateBatchAdjustmentBody }>('/adjustments/batch', {
        preHandler: [fastify.authenticate, fastify.requirePermission('inventory.adjust')],
        schema: { body: CreateBatchAdjustmentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;
        const idempotency = await beginIdempotentRequest(request, 'inventory.adjust.batch');
        if (idempotency.enabled && idempotency.replay) {
            return reply.code(idempotency.replay.status).send(idempotency.replay.body);
        }
        if (idempotency.enabled && idempotency.inProgress) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is currently being processed');
        }
        if (idempotency.enabled && idempotency.conflict) {
            return sendApiError(reply, 409, 'IDEMPOTENCY_KEY_REUSED', idempotency.conflict);
        }

        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) {
            await abortIdempotentRequest(idempotency);
            return sendApiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        const batchNumber = `BATCH-${Date.now()}`;

        try {
            const results = await db.transaction(async (tx) => {
                const adjustments: any[] = [];
                const errors: string[] = [];

                for (const item of body.items) {
                    const [product] = await tx.select({
                        stockQuantity: schema.products.stockQuantity,
                        name: schema.products.name
                    })
                        .from(schema.products)
                        .where(and(eq(schema.products.id, item.productId), eq(schema.products.tenantId, user.tenantId)))
                        .limit(1);

                    if (!product) {
                        errors.push(`Product ${item.productId} not found`);
                        continue;
                    }

                    const qtyBefore = product.stockQuantity || 0;
                    let qtyAfter = qtyBefore;
                    let change = 0;

                    // Calculate new quantity based on adjustment type
                    if (body.type === 'count') {
                        qtyAfter = item.quantity;
                        change = qtyAfter - qtyBefore;
                    } else if (body.type === 'found') {
                        change = item.quantity;
                        qtyAfter = qtyBefore + change;
                    } else {
                        change = -item.quantity;
                        qtyAfter = qtyBefore + change;
                    }

                    // Skip if no change
                    if (change === 0) continue;

                    // Update product stock
                    await tx.update(schema.products)
                        .set({ stockQuantity: qtyAfter })
                        .where(eq(schema.products.id, item.productId));

                    // Create adjustment record
                    const adjustmentNumber = `ADJ-${Date.now()}-${adjustments.length}`;
                    const [adjustment] = await tx.insert(schema.stockAdjustments).values({
                        tenantId: user.tenantId,
                        adjustmentNumber,
                        productId: item.productId,
                        adjustmentType: body.type as any,
                        qtyBefore,
                        qtyAfter,
                        reason: `[${batchNumber}] ${body.reason}`,
                        createdBy: user.id,
                        approvedBy: user.id,
                    }).returning();

                    // Create stock movement
                    await tx.insert(schema.stockMovements).values({
                        tenantId: user.tenantId,
                        productId: item.productId,
                        movementType: body.type === 'found' ? 'in' : (change < 0 ? 'out' : 'adjust'),
                        quantity: Math.abs(change),
                        quantityBefore: qtyBefore,
                        quantityAfter: qtyAfter,
                        referenceType: 'adjustment',
                        referenceId: adjustment.id,
                        createdBy: user.id,
                        notes: `Batch Adjustment: ${body.reason}`,
                    });

                    adjustments.push({
                        ...adjustment,
                        productName: product.name,
                        change,
                    });
                }

                return { adjustments, errors, batchNumber };
            });

            const responseBody = {
                success: true,
                data: {
                    batchNumber: results.batchNumber,
                    adjustmentsCount: results.adjustments.length,
                    adjustments: results.adjustments,
                    errors: results.errors,
                }
            };
            await finishIdempotentRequest(idempotency, 200, responseBody);
            return responseBody;
        } catch (error: any) {
            await abortIdempotentRequest(idempotency);
            console.error('[Batch Adjustment Error]', error);
            return sendApiError(reply, 500, 'INTERNAL_ERROR', error.message || 'Failed to create batch stock adjustment');
        }
    });
};
