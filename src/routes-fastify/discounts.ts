import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

// Schemas
const ListDiscountsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
});

const DiscountIdParamsSchema = Type.Object({ id: Type.String() });

const CreateDiscountBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    type: Type.String(),
    value: Type.Optional(Type.Number({ minimum: 0 })),
    minQty: Type.Optional(Type.Number({ minimum: 1 })),
    freeQty: Type.Optional(Type.Number({ minimum: 1 })),
    minOrderAmount: Type.Optional(Type.Number({ minimum: 0 })),
    maxDiscountAmount: Type.Optional(Type.Number({ minimum: 0 })),
    startsAt: Type.Optional(Type.String()),
    endsAt: Type.Optional(Type.String()),
});

const UpdateScopesBodySchema = Type.Object({
    scopes: Type.Array(Type.Object({
        scopeType: Type.String(),
        scopeId: Type.Optional(Type.String()),
    })),
});

const UpdateVolumeTiersBodySchema = Type.Object({
    tiers: Type.Array(Type.Object({
        minQty: Type.Number({ minimum: 1 }),
        discountPercent: Type.Number({ minimum: 0, maximum: 100 }),
    })),
});

type ListDiscountsQuery = Static<typeof ListDiscountsQuerySchema>;
type CreateDiscountBody = Static<typeof CreateDiscountBodySchema>;
type UpdateScopesBody = Static<typeof UpdateScopesBodySchema>;
type UpdateVolumeTiersBody = Static<typeof UpdateVolumeTiersBodySchema>;

export const discountRoutes: FastifyPluginAsync = async (fastify) => {
    // List discounts
    fastify.get<{ Querystring: ListDiscountsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListDiscountsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, type, isActive } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.discounts.tenantId, user.tenantId)];

        if (search) conditions.push(sql`${schema.discounts.name} ILIKE ${`%${search}%`}`);
        if (type) conditions.push(eq(schema.discounts.type, type as any));
        if (isActive !== undefined) conditions.push(eq(schema.discounts.isActive, isActive === 'true'));

        // Sales rep filtering
        if (user.role === 'sales_rep') {
            const userBrandIds = await db.select({ brandId: schema.userBrands.brandId })
                .from(schema.userBrands).where(eq(schema.userBrands.userId, user.id));

            const applicableDiscountIds = await db.select({ discountId: schema.discountScopes.discountId })
                .from(schema.discountScopes)
                .where(userBrandIds.length > 0
                    ? sql`${schema.discountScopes.scopeType} = 'all' OR (${schema.discountScopes.scopeType} = 'brand' AND ${schema.discountScopes.scopeId} IN (${sql.join(userBrandIds.map(b => sql`${b.brandId}`), sql`, `)}))`
                    : eq(schema.discountScopes.scopeType, 'all'));

            if (applicableDiscountIds.length > 0) {
                conditions.push(inArray(schema.discounts.id, applicableDiscountIds.map(d => d.discountId)));
            }
        }

        const discounts = await db.select().from(schema.discounts).where(and(...conditions))
            .orderBy(desc(schema.discounts.createdAt)).limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
            .from(schema.discounts).where(and(...conditions));

        return { success: true, data: discounts, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create discount
    fastify.post<{ Body: CreateDiscountBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateDiscountBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const body = request.body;
        const [discount] = await db.insert(schema.discounts).values({
            tenantId: user.tenantId, name: body.name, type: body.type as any,
            value: body.value?.toString(), minQty: body.minQty, freeQty: body.freeQty,
            minOrderAmount: body.minOrderAmount?.toString(), maxDiscountAmount: body.maxDiscountAmount?.toString(),
            startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null,
            isActive: true,
        }).returning();

        return { success: true, data: discount };
    });

    // Get discount by ID
    fastify.get<{ Params: Static<typeof DiscountIdParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: DiscountIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [discount] = await db.select().from(schema.discounts)
            .where(and(eq(schema.discounts.id, id), eq(schema.discounts.tenantId, user.tenantId))).limit(1);

        if (!discount) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const scopes = await db.select().from(schema.discountScopes).where(eq(schema.discountScopes.discountId, id));

        // Sales rep access check
        if (user.role === 'sales_rep') {
            const userBrandIds = await db.select({ brandId: schema.userBrands.brandId })
                .from(schema.userBrands).where(eq(schema.userBrands.userId, user.id));
            const hasAccessibleScope = scopes.some(scope =>
                scope.scopeType === 'all' || (scope.scopeType === 'brand' && userBrandIds.some(b => b.brandId === scope.scopeId)));
            if (scopes.length > 0 && !hasAccessibleScope) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            }
        }

        let tiers: any[] = [];
        if (discount.type === 'volume') {
            tiers = await db.select().from(schema.volumeTiers)
                .where(eq(schema.volumeTiers.discountId, id)).orderBy(schema.volumeTiers.minQty);
        }

        return { success: true, data: { ...discount, scopes, tiers } };
    });

    // Update scopes
    fastify.put<{ Params: Static<typeof DiscountIdParamsSchema>; Body: UpdateScopesBody }>('/:id/scopes', {
        preHandler: [fastify.authenticate],
        schema: { params: DiscountIdParamsSchema, body: UpdateScopesBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { scopes } = request.body;

        await db.delete(schema.discountScopes).where(eq(schema.discountScopes.discountId, id));
        if (scopes.length > 0) {
            await db.insert(schema.discountScopes).values(
                scopes.map(scope => ({ discountId: id, scopeType: scope.scopeType as any, scopeId: scope.scopeId }))
            );
        }

        return { success: true, message: 'Scopes updated successfully' };
    });

    // Update volume tiers
    fastify.put<{ Params: Static<typeof DiscountIdParamsSchema>; Body: UpdateVolumeTiersBody }>('/:id/volume-tiers', {
        preHandler: [fastify.authenticate],
        schema: { params: DiscountIdParamsSchema, body: UpdateVolumeTiersBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { tiers } = request.body;

        await db.delete(schema.volumeTiers).where(eq(schema.volumeTiers.discountId, id));
        if (tiers.length > 0) {
            await db.insert(schema.volumeTiers).values(
                tiers.map(tier => ({ discountId: id, minQty: tier.minQty, discountPercent: tier.discountPercent.toString() }))
            );
        }

        return { success: true, message: 'Volume tiers updated successfully' };
    });
};
