import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

// Schemas
const CreateTierBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    color: Type.Optional(Type.String()),
    creditAllowed: Type.Boolean(),
    creditLimit: Type.Optional(Type.Number({ minimum: 0 })),
    maxOrderAmount: Type.Optional(Type.Number({ minimum: 0 })),
    paymentTermsDays: Type.Number({ minimum: 0 }),
    discountPercent: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    sortOrder: Type.Optional(Type.Number()),
});

const CreateRuleBodySchema = Type.Object({
    toTierId: Type.String(),
    conditionType: Type.String(),
    conditionValue: Type.Number({ minimum: 0 }),
});

const ListCustomersQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    tierId: Type.Optional(Type.String()),
    territoryId: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
});

const CreateCustomerBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    code: Type.Optional(Type.String()),
    email: Type.Optional(Type.String({ format: 'email' })),
    phone: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    waymark: Type.Optional(Type.String()),
    tierId: Type.Optional(Type.String()),
    territoryId: Type.Optional(Type.String()),
    assignedSalesRepId: Type.Optional(Type.String()),
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
    notes: Type.Optional(Type.String()),
});

const UpdateCustomerBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    code: Type.Optional(Type.String()),
    email: Type.Optional(Type.String({ format: 'email' })),
    phone: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    waymark: Type.Optional(Type.String()),
    contactPerson: Type.Optional(Type.String()),
    tierId: Type.Optional(Type.String()),
    territoryId: Type.Optional(Type.String()),
    assignedSalesRepId: Type.Optional(Type.String()),
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
    notes: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean()),
});

const ParamsSchema = Type.Object({ id: Type.String() });

type CreateTierBody = Static<typeof CreateTierBodySchema>;
type CreateRuleBody = Static<typeof CreateRuleBodySchema>;
type ListCustomersQuery = Static<typeof ListCustomersQuerySchema>;
type CreateCustomerBody = Static<typeof CreateCustomerBodySchema>;
type UpdateCustomerBody = Static<typeof UpdateCustomerBodySchema>;

export const customerRoutes: FastifyPluginAsync = async (fastify) => {
    // ----------------------------------------------------------------
    // CUSTOMER TIERS
    // ----------------------------------------------------------------

    // List tiers
    fastify.get('/tiers', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        const tiers = await db
            .select()
            .from(schema.customerTiers)
            .where(eq(schema.customerTiers.tenantId, user.tenantId))
            .orderBy(schema.customerTiers.sortOrder);
        return { success: true, data: tiers };
    });

    // Create tier
    fastify.post<{ Body: CreateTierBody }>('/tiers', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateTierBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { name, color, creditAllowed, creditLimit, maxOrderAmount, paymentTermsDays, discountPercent, sortOrder } = request.body;

        const [tier] = await db
            .insert(schema.customerTiers)
            .values({
                tenantId: user.tenantId,
                name,
                color,
                creditAllowed,
                creditLimit: creditLimit?.toString(),
                maxOrderAmount: maxOrderAmount?.toString(),
                paymentTermsDays,
                discountPercent: discountPercent?.toString(),
                sortOrder,
            })
            .returning();

        return { success: true, data: tier };
    });

    // ----------------------------------------------------------------
    // TIER DOWNGRADE RULES
    // ----------------------------------------------------------------

    // List rules for a tier
    fastify.get<{ Params: Static<typeof ParamsSchema> }>('/tiers/:id/rules', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const rules = await db
            .select({
                id: schema.tierDowngradeRules.id,
                fromTierId: schema.tierDowngradeRules.fromTierId,
                toTierId: schema.tierDowngradeRules.toTierId,
                conditionType: schema.tierDowngradeRules.conditionType,
                conditionValue: schema.tierDowngradeRules.conditionValue,
                isActive: schema.tierDowngradeRules.isActive,
                toTierName: schema.customerTiers.name,
            })
            .from(schema.tierDowngradeRules)
            .leftJoin(schema.customerTiers, eq(schema.tierDowngradeRules.toTierId, schema.customerTiers.id))
            .where(and(
                eq(schema.tierDowngradeRules.tenantId, user.tenantId),
                eq(schema.tierDowngradeRules.fromTierId, id)
            ));

        return { success: true, data: rules };
    });

    // Create rule
    fastify.post<{ Params: Static<typeof ParamsSchema>; Body: CreateRuleBody }>('/tiers/:id/rules', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: CreateRuleBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { id } = request.params;
        const { toTierId, conditionType, conditionValue } = request.body;

        const [rule] = await db
            .insert(schema.tierDowngradeRules)
            .values({
                tenantId: user.tenantId,
                fromTierId: id,
                toTierId,
                conditionType: conditionType as any,
                conditionValue,
                isActive: true,
            })
            .returning();

        return { success: true, data: rule };
    });

    // ----------------------------------------------------------------
    // TERRITORIES
    // ----------------------------------------------------------------

    // List territories
    fastify.get('/territories', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;
        const territories = await db
            .select()
            .from(schema.territories)
            .where(eq(schema.territories.tenantId, user.tenantId))
            .orderBy(schema.territories.name);

        return { success: true, data: territories };
    });

    // ----------------------------------------------------------------
    // CUSTOMERS
    // ----------------------------------------------------------------

    // List customers
    fastify.get<{ Querystring: ListCustomersQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListCustomersQuerySchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, tierId, territoryId, isActive } = request.query;

        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.customers.tenantId, user.tenantId)];

        if (search) {
            conditions.push(
                sql`(${schema.customers.name} ILIKE ${`%${search}%`} OR ${schema.customers.code} ILIKE ${`%${search}%`} OR ${schema.customers.email} ILIKE ${`%${search}%`})`
            );
        }
        if (tierId) conditions.push(eq(schema.customers.tierId, tierId));
        if (territoryId) conditions.push(eq(schema.customers.territoryId, territoryId));
        if (isActive !== undefined) conditions.push(eq(schema.customers.isActive, isActive === 'true'));

        if (user.role === 'sales_rep') {
            conditions.push(eq(schema.customers.createdByUserId, user.id));
        }

        const customers = await db
            .select({
                id: schema.customers.id,
                code: schema.customers.code,
                name: schema.customers.name,
                email: schema.customers.email,
                phone: schema.customers.phone,
                address: schema.customers.address,
                waymark: schema.customers.waymark,
                creditBalance: schema.customers.creditBalance,
                debtBalance: schema.customers.debtBalance,
                isActive: schema.customers.isActive,
                tierName: schema.customerTiers.name,
                territoryName: schema.territories.name,
                assignedSalesRepName: schema.users.name,
                tierId: schema.customers.tierId,
                territoryId: schema.customers.territoryId,
                assignedSalesRepId: schema.customers.assignedSalesRepId,
                notes: schema.customers.notes,
            })
            .from(schema.customers)
            .leftJoin(schema.customerTiers, eq(schema.customers.tierId, schema.customerTiers.id))
            .leftJoin(schema.territories, eq(schema.customers.territoryId, schema.territories.id))
            .leftJoin(schema.users, eq(schema.customers.assignedSalesRepId, schema.users.id))
            .where(and(...conditions))
            .orderBy(desc(schema.customers.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.customers)
            .where(and(...conditions));

        return {
            success: true,
            data: customers,
            meta: {
                page: pageStr,
                limit: limitStr,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    });

    // Create customer
    fastify.post<{ Body: CreateCustomerBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateCustomerBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const { code, territoryId, ...body } = request.body;

        // Check code/email uniqueness
        if (code) {
            const [existing] = await db.select({ id: schema.customers.id }).from(schema.customers)
                .where(and(eq(schema.customers.tenantId, user.tenantId), eq(schema.customers.code, code))).limit(1);
            if (existing) {
                return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Customer code exists' } });
            }
        }

        // Sales rep territory check
        if (user.role === 'sales_rep' && territoryId) {
            const userTerritories = await db
                .select({ territoryId: schema.userTerritories.territoryId })
                .from(schema.userTerritories)
                .where(eq(schema.userTerritories.userId, user.id));

            const validTerritory = userTerritories.some(t => t.territoryId === territoryId);
            if (!validTerritory) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only create customers in your assigned territories' } });
            }
        }

        const [customer] = await db
            .insert(schema.customers)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                code: code,
                email: body.email,
                phone: body.phone,
                address: body.address,
                waymark: body.waymark,
                tierId: body.tierId,
                territoryId: territoryId,
                assignedSalesRepId: user.role === 'sales_rep' ? user.id : body.assignedSalesRepId,
                createdByUserId: user.id,
                latitude: body.latitude?.toString(),
                longitude: body.longitude?.toString(),
                notes: body.notes,
                isActive: true,
            })
            .returning();

        return { success: true, data: customer };
    });

    // Get customer by ID
    fastify.get<{ Params: Static<typeof ParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [customer] = await db
            .select()
            .from(schema.customers)
            .where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, user.tenantId)))
            .limit(1);

        if (!customer) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only view customers you created' } });
        }

        return { success: true, data: customer };
    });

    // Update customer
    fastify.patch<{ Params: Static<typeof ParamsSchema>; Body: UpdateCustomerBody }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: UpdateCustomerBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const [customer] = await db
            .select()
            .from(schema.customers)
            .where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, user.tenantId)))
            .limit(1);

        if (!customer) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You can only update customers you created' } });
        }

        const body = request.body;
        const updates: any = { updatedAt: new Date() };

        if (body.code !== undefined) updates.code = body.code;
        if (body.email !== undefined) updates.email = body.email;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.address !== undefined) updates.address = body.address;
        if (body.waymark !== undefined) updates.waymark = body.waymark;
        if (body.contactPerson !== undefined) updates.contactPerson = body.contactPerson;
        if (body.latitude !== undefined) updates.latitude = body.latitude?.toString();
        if (body.longitude !== undefined) updates.longitude = body.longitude?.toString();
        if (body.notes !== undefined) updates.notes = body.notes;

        if (['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            if (body.name !== undefined) updates.name = body.name;
            if (body.tierId !== undefined) updates.tierId = body.tierId;
            if (body.territoryId !== undefined) updates.territoryId = body.territoryId;
            if (body.assignedSalesRepId !== undefined) updates.assignedSalesRepId = body.assignedSalesRepId;
            if (body.isActive !== undefined) updates.isActive = body.isActive;
        }

        const [updatedCustomer] = await db
            .update(schema.customers)
            .set(updates)
            .where(eq(schema.customers.id, id))
            .returning();

        return { success: true, data: updatedCustomer };
    });

    // Delete customer
    fastify.delete<{ Params: Static<typeof ParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        try {
            const [deleted] = await db
                .delete(schema.customers)
                .where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, user.tenantId)))
                .returning();

            if (!deleted) {
                return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            }

            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') {
                return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete customer with existing orders/records.' } });
            }
            throw err;
        }
    });
};
