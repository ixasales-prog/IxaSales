import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

export const discountRoutes = new Elysia({ prefix: '/discounts' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // DISCOUNTS CRUD
    // ----------------------------------------------------------------

    // List discounts
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, search, type, isActive } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.discounts.tenantId, user.tenantId)];

        if (search) {
            conditions.push(sql`${schema.discounts.name} ILIKE ${`%${search}%`}`);
        }
        if (type) conditions.push(eq(schema.discounts.type, type));
        if (isActive !== undefined) conditions.push(eq(schema.discounts.isActive, isActive === 'true'));

        // Sales rep filtering: only show discounts applicable to their assigned brands
        if (user.role === 'sales_rep') {
            // Get user's assigned brand IDs
            const userBrandIds = await db
                .select({ brandId: schema.userBrands.brandId })
                .from(schema.userBrands)
                .where(eq(schema.userBrands.userId, user.id));

            // Get discount IDs that are either:
            // 1. Scoped to 'all' (no specific brand filter)
            // 2. Scoped to one of the user's assigned brands
            const applicableDiscountIds = await db
                .select({ discountId: schema.discountScopes.discountId })
                .from(schema.discountScopes)
                .where(
                    userBrandIds.length > 0
                        ? sql`${schema.discountScopes.scopeType} = 'all' 
                              OR (${schema.discountScopes.scopeType} = 'brand' 
                                  AND ${schema.discountScopes.scopeId} IN (${sql.join(userBrandIds.map(b => sql`${b.brandId}`), sql`, `)}))`
                        : eq(schema.discountScopes.scopeType, 'all')
                );

            if (applicableDiscountIds.length > 0) {
                conditions.push(
                    inArray(
                        schema.discounts.id,
                        applicableDiscountIds.map(d => d.discountId)
                    )
                );
            }
        }

        const discounts = await db
            .select()
            .from(schema.discounts)
            .where(and(...conditions))
            .orderBy(desc(schema.discounts.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.discounts)
            .where(and(...conditions));

        return {
            success: true,
            data: discounts,
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
            search: t.Optional(t.String()),
            type: t.Optional(t.String()),
            isActive: t.Optional(t.String()),
        })
    })

    // Create discount
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [discount] = await db
            .insert(schema.discounts)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                type: body.type,
                value: body.value?.toString(),
                minQty: body.minQty,
                freeQty: body.freeQty,
                minOrderAmount: body.minOrderAmount?.toString(),
                maxDiscountAmount: body.maxDiscountAmount?.toString(),
                startsAt: body.startsAt ? new Date(body.startsAt) : null,
                endsAt: body.endsAt ? new Date(body.endsAt) : null,
                isActive: true,
            })
            .returning();

        return { success: true, data: discount };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            type: t.String(), // enum: percentage, fixed, buy_x_get_y, volume
            value: t.Optional(t.Number({ minimum: 0 })),
            minQty: t.Optional(t.Number({ minimum: 1 })),
            freeQty: t.Optional(t.Number({ minimum: 1 })),
            minOrderAmount: t.Optional(t.Number({ minimum: 0 })),
            maxDiscountAmount: t.Optional(t.Number({ minimum: 0 })),
            startsAt: t.Optional(t.String()),
            endsAt: t.Optional(t.String()),
        })
    })

    // Get discount by ID
    .get('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [discount] = await db
            .select()
            .from(schema.discounts)
            .where(and(eq(schema.discounts.id, params.id), eq(schema.discounts.tenantId, user.tenantId)))
            .limit(1);

        if (!discount) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Fetch scopes
        const scopes = await db
            .select()
            .from(schema.discountScopes)
            .where(eq(schema.discountScopes.discountId, params.id));

        // Sales rep access check - verify this discount is accessible to them
        if (user.role === 'sales_rep') {
            const userBrandIds = await db
                .select({ brandId: schema.userBrands.brandId })
                .from(schema.userBrands)
                .where(eq(schema.userBrands.userId, user.id));

            const hasAccessibleScope = scopes.some(scope =>
                scope.scopeType === 'all' ||
                (scope.scopeType === 'brand' && userBrandIds.some(b => b.brandId === scope.scopeId))
            );

            if (scopes.length > 0 && !hasAccessibleScope) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'You do not have access to this discount' } };
            }
        }

        // Fetch volume tiers if volume discount
        let tiers: any[] = [];
        if (discount.type === 'volume') {
            tiers = await db
                .select()
                .from(schema.volumeTiers)
                .where(eq(schema.volumeTiers.discountId, params.id))
                .orderBy(schema.volumeTiers.minQty);
        }

        return { success: true, data: { ...discount, scopes, tiers } };
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // SCOPES
    // ----------------------------------------------------------------

    // Update discount scopes
    .put('/:id/scopes', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const { scopes } = body;

        // Delete existing scopes
        await db
            .delete(schema.discountScopes)
            .where(eq(schema.discountScopes.discountId, params.id));

        // Insert new scopes
        if (scopes.length > 0) {
            await db.insert(schema.discountScopes).values(
                scopes.map((scope: any) => ({
                    discountId: params.id,
                    scopeType: scope.scopeType,
                    scopeId: scope.scopeId,
                }))
            );
        }

        return { success: true, message: 'Scopes updated successfully' };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            scopes: t.Array(t.Object({
                scopeType: t.String(),
                scopeId: t.Optional(t.String()),
            })),
        })
    })

    // ----------------------------------------------------------------
    // VOLUME TIERS
    // ----------------------------------------------------------------

    // Update volume tiers
    .put('/:id/volume-tiers', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const { tiers } = body;

        // Delete existing tiers
        await db
            .delete(schema.volumeTiers)
            .where(eq(schema.volumeTiers.discountId, params.id));

        // Insert new tiers
        if (tiers.length > 0) {
            await db.insert(schema.volumeTiers).values(
                tiers.map((tier: any) => ({
                    discountId: params.id,
                    minQty: tier.minQty,
                    discountPercent: tier.discountPercent.toString(),
                }))
            );
        }

        return { success: true, message: 'Volume tiers updated successfully' };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            tiers: t.Array(t.Object({
                minQty: t.Number({ minimum: 1 }),
                discountPercent: t.Number({ minimum: 0, maximum: 100 }),
            })),
        })
    });
