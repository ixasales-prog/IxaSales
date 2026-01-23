import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';

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

type ListMovementsQuery = Static<typeof ListMovementsQuerySchema>;
type CreateAdjustmentBody = Static<typeof CreateAdjustmentBodySchema>;

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
        preHandler: [fastify.authenticate],
        schema: { body: CreateAdjustmentBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
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
            return { success: true, data: result };
        } catch (error: any) {
            if (error.message === 'Product not found') {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR' } });
        }
    });
};
