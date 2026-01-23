import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const customerRoutes = new Elysia({ prefix: '/customers' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // CUSTOMER TIERS
    // ----------------------------------------------------------------

    // List tiers
    .get('/tiers', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const tiers = await db
            .select()
            .from(schema.customerTiers)
            .where(eq(schema.customerTiers.tenantId, user.tenantId))
            .orderBy(schema.customerTiers.sortOrder);

        return { success: true, data: tiers };
    })

    // Create tier
    .post('/tiers', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [tier] = await db
            .insert(schema.customerTiers)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                color: body.color,
                creditAllowed: body.creditAllowed,
                creditLimit: body.creditLimit?.toString(),
                maxOrderAmount: body.maxOrderAmount?.toString(),
                paymentTermsDays: body.paymentTermsDays,
                discountPercent: body.discountPercent?.toString(),
                sortOrder: body.sortOrder,
            })
            .returning();

        return { success: true, data: tier };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            color: t.Optional(t.String()),
            creditAllowed: t.Boolean(),
            creditLimit: t.Optional(t.Number({ minimum: 0 })),
            maxOrderAmount: t.Optional(t.Number({ minimum: 0 })),
            paymentTermsDays: t.Number({ minimum: 0 }),
            discountPercent: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
            sortOrder: t.Optional(t.Number()),
        })
    })

    // ----------------------------------------------------------------
    // TIER DOWNGRADE RULES
    // ----------------------------------------------------------------

    // List rules for a tier
    .get('/tiers/:id/rules', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

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
                eq(schema.tierDowngradeRules.fromTierId, params.id)
            ));

        return { success: true, data: rules };
    }, {
        params: t.Object({ id: t.String() })
    })

    // Create rule
    .post('/tiers/:id/rules', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [rule] = await db
            .insert(schema.tierDowngradeRules)
            .values({
                tenantId: user.tenantId,
                fromTierId: params.id,
                toTierId: body.toTierId,
                conditionType: body.conditionType as any,
                conditionValue: body.conditionValue,
                isActive: true,
            })
            .returning();

        return { success: true, data: rule };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            toTierId: t.String(),
            conditionType: t.String(),
            conditionValue: t.Number({ minimum: 0 }),
        })
    })

    // ----------------------------------------------------------------
    // TERRITORIES
    // ----------------------------------------------------------------

    // List territories
    .get('/territories', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const territories = await db
            .select()
            .from(schema.territories)
            .where(eq(schema.territories.tenantId, user.tenantId))
            .orderBy(schema.territories.name);

        return { success: true, data: territories };
    })

    // ----------------------------------------------------------------
    // CUSTOMERS
    // ----------------------------------------------------------------

    // List customers
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, search, tierId, territoryId, isActive } = query;
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

        // Sales Rep restriction - view only customers they created
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
            tierId: t.Optional(t.String()),
            territoryId: t.Optional(t.String()),
            isActive: t.Optional(t.String()),
        })
    })

    // Create customer
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep'].includes(user.role)) {
            set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } };
        }

        // Check code/email uniqueness
        if (body.code) {
            const [existing] = await db.select({ id: schema.customers.id }).from(schema.customers)
                .where(and(eq(schema.customers.tenantId, user.tenantId), eq(schema.customers.code, body.code))).limit(1);
            if (existing) { set.status = 409; return { success: false, error: { code: 'CONFLICT', message: 'Customer code exists' } }; }
        }

        // Sales rep can only create customers in their assigned territories
        if (user.role === 'sales_rep' && body.territoryId) {
            const userTerritories = await db
                .select({ territoryId: schema.userTerritories.territoryId })
                .from(schema.userTerritories)
                .where(eq(schema.userTerritories.userId, user.id));

            const validTerritory = userTerritories.some(t => t.territoryId === body.territoryId);
            if (!validTerritory) {
                set.status = 403;
                return { success: false, error: { code: 'FORBIDDEN', message: 'You can only create customers in your assigned territories' } };
            }
        }

        const [customer] = await db
            .insert(schema.customers)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                code: body.code,
                email: body.email,
                phone: body.phone,
                address: body.address,
                waymark: body.waymark,
                tierId: body.tierId,
                territoryId: body.territoryId,
                assignedSalesRepId: user.role === 'sales_rep' ? user.id : body.assignedSalesRepId,
                createdByUserId: user.id,
                latitude: body.latitude?.toString(),
                longitude: body.longitude?.toString(),
                notes: body.notes,
                isActive: true,
            })
            .returning();

        return { success: true, data: customer };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            code: t.Optional(t.String()),
            email: t.Optional(t.String({ format: 'email' })),
            phone: t.Optional(t.String()),
            address: t.Optional(t.String()),
            waymark: t.Optional(t.String()),
            tierId: t.Optional(t.String()),
            territoryId: t.Optional(t.String()),
            assignedSalesRepId: t.Optional(t.String()),
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
            notes: t.Optional(t.String()),
        })
    })

    // Get customer by ID
    .get('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [customer] = await db
            .select()
            .from(schema.customers)
            .where(and(eq(schema.customers.id, params.id), eq(schema.customers.tenantId, user.tenantId)))
            .limit(1);

        if (!customer) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Role-based access check - sales_rep can only view customers they created
        if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only view customers you created' } };
        }

        return { success: true, data: customer };
    }, {
        params: t.Object({ id: t.String() })
    })

    // Update customer (sales_rep can update everything except name)
    .patch('/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin', 'supervisor', 'sales_rep'].includes(user.role)) {
            set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } };
        }

        const [customer] = await db
            .select()
            .from(schema.customers)
            .where(and(eq(schema.customers.id, params.id), eq(schema.customers.tenantId, user.tenantId)))
            .limit(1);

        if (!customer) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Sales rep can only update customers they created
        if (user.role === 'sales_rep' && customer.createdByUserId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only update customers you created' } };
        }

        // Build update object excluding name for sales_rep
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

        // Only admin/supervisor can update these fields
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
            .where(eq(schema.customers.id, params.id))
            .returning();

        return { success: true, data: updatedCustomer };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String({ minLength: 2 })),
            code: t.Optional(t.String()),
            email: t.Optional(t.String({ format: 'email' })),
            phone: t.Optional(t.String()),
            address: t.Optional(t.String()),
            waymark: t.Optional(t.String()),
            contactPerson: t.Optional(t.String()),
            tierId: t.Optional(t.String()),
            territoryId: t.Optional(t.String()),
            assignedSalesRepId: t.Optional(t.String()),
            latitude: t.Optional(t.Number()),
            longitude: t.Optional(t.Number()),
            notes: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
        })
    })

    // Delete customer
    .delete('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.customers)
                .where(and(eq(schema.customers.id, params.id), eq(schema.customers.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') {
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete customer with existing orders/records.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    });
