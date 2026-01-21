import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const inventoryRoutes = new Elysia({ prefix: '/inventory' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // STOCK MOVEMENTS
    // ----------------------------------------------------------------

    // List movements
    .get('/movements', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, productId, movementType } = query;
        const offset = (page - 1) * limit;

        // Role check - only admins, supervisors, and warehouse can view stock movements
        const allowedRoles = ['tenant_admin', 'super_admin', 'supervisor', 'warehouse'];
        if (!allowedRoles.includes(user.role)) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to view stock movements' } };
        }

        const conditions: any[] = [eq(schema.stockMovements.tenantId, user.tenantId)];

        if (productId) conditions.push(eq(schema.stockMovements.productId, productId));
        if (movementType) conditions.push(eq(schema.stockMovements.movementType, movementType));

        const movements = await db
            .select({
                id: schema.stockMovements.id,
                productName: schema.products.name,
                movementType: schema.stockMovements.movementType,
                quantity: schema.stockMovements.quantity,
                quantityBefore: schema.stockMovements.quantityBefore,
                quantityAfter: schema.stockMovements.quantityAfter,
                notes: schema.stockMovements.notes,
                createdAt: schema.stockMovements.createdAt,
                userName: schema.users.name,
            })
            .from(schema.stockMovements)
            .leftJoin(schema.products, eq(schema.stockMovements.productId, schema.products.id))
            .leftJoin(schema.users, eq(schema.stockMovements.createdBy, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.stockMovements.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.stockMovements)
            .where(and(...conditions));

        return {
            success: true,
            data: movements,
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            productId: t.Optional(t.String()),
            movementType: t.Optional(t.String()),
        })
    })

    // ----------------------------------------------------------------
    // STOCK ADJUSTMENTS
    // ----------------------------------------------------------------

    // Create adjustment
    .post('/adjustments', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Only authorized roles
        if (!['tenant_admin', 'super_admin', 'supervisor', 'warehouse'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const adjustmentNumber = `ADJ-${Date.now()}`;

        const result = await db.transaction(async (tx) => {
            // 1. Get current stock
            const [product] = await tx
                .select({ stockQuantity: schema.products.stockQuantity })
                .from(schema.products)
                .where(and(eq(schema.products.id, body.productId), eq(schema.products.tenantId, user.tenantId)))
                .limit(1);

            if (!product) { throw new Error('Product not found'); }

            const qtyBefore = product.stockQuantity || 0;
            let qtyAfter = qtyBefore;
            let change = 0;

            if (body.type === 'count') {
                qtyAfter = body.quantity;
                change = qtyAfter - qtyBefore;
            } else if (body.type === 'found') {
                change = body.quantity;
                qtyAfter = qtyBefore + change;
            } else {
                // Damage, loss, correction (negative?)
                // Assuming 'quantity' is amount to subtract for damage/loss
                change = -body.quantity;
                qtyAfter = qtyBefore + change;
            }

            // 2. Update Product Stock
            await tx
                .update(schema.products)
                .set({ stockQuantity: qtyAfter })
                .where(eq(schema.products.id, body.productId));

            // 3. Create Adjustment Record
            const [adjustment] = await tx
                .insert(schema.stockAdjustments)
                .values({
                    tenantId: user.tenantId,
                    adjustmentNumber,
                    productId: body.productId,
                    adjustmentType: body.type,
                    qtyBefore,
                    qtyAfter,
                    reason: body.reason,
                    createdBy: user.id,
                    approvedBy: user.id, // Auto-approve for now
                })
                .returning();

            // 4. Log Movement
            await tx.insert(schema.stockMovements).values({
                tenantId: user.tenantId,
                productId: body.productId,
                movementType: body.type === 'found' ? 'in' : (change < 0 ? 'out' : 'adjust'),
                quantity: Math.abs(change),
                quantityBefore: qtyBefore,
                quantityAfter: qtyAfter,
                referenceType: 'adjustment',
                referenceId: adjustment.id,
                createdBy: user.id,
                notes: `Adjustment: ${body.reason}`,
            });

            return adjustment;
        });

        return { success: true, data: result };
    }, {
        body: t.Object({
            productId: t.String(),
            type: t.String(), // enum: count, damage, loss, found, correction
            quantity: t.Number({ minimum: 1 }), // Absolute amount for damage/found, or total for count
            reason: t.String({ minLength: 3 }),
        })
    });
