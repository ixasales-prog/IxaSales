import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { hashPassword } from '../lib/password';
import { eq, and, sql, desc } from 'drizzle-orm';

// Schemas
const ListUsersQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    role: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
    tenantId: Type.Optional(Type.String()),
});

const CreateUserBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    email: Type.String({ format: 'email' }),
    password: Type.String({ minLength: 8 }),
    role: Type.String(),
    phone: Type.Optional(Type.String()),
    supervisorId: Type.Optional(Type.String()),
    tenantId: Type.Optional(Type.String()),
});

const UserIdParamsSchema = Type.Object({ id: Type.String() });

const UpdateUserBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    email: Type.Optional(Type.String({ format: 'email' })),
    phone: Type.Optional(Type.String()),
    role: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean()),
    supervisorId: Type.Optional(Type.String()),
});

const AssignTerritoriesBodySchema = Type.Object({ territoryIds: Type.Array(Type.String()) });
const AssignBrandsBodySchema = Type.Object({ brandIds: Type.Array(Type.String()) });

type ListUsersQuery = Static<typeof ListUsersQuerySchema>;
type CreateUserBody = Static<typeof CreateUserBodySchema>;
type UpdateUserBody = Static<typeof UpdateUserBodySchema>;

export const userRoutes: FastifyPluginAsync = async (fastify) => {
    // List users
    fastify.get<{ Querystring: ListUsersQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListUsersQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, role, isActive, tenantId: queryTenantId } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        if (!user.tenantId && user.role !== 'super_admin') {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });
        }

        const conditions: any[] = [];
        if (user.role !== 'super_admin') {
            conditions.push(eq(schema.users.tenantId, user.tenantId));
        } else if (queryTenantId) {
            conditions.push(eq(schema.users.tenantId, queryTenantId));
        }

        if (search) conditions.push(sql`(${schema.users.name} ILIKE ${`%${search}%`} OR ${schema.users.email} ILIKE ${`%${search}%`})`);
        if (role) conditions.push(eq(schema.users.role, role as any));
        if (isActive !== undefined) conditions.push(eq(schema.users.isActive, isActive === 'true'));
        if (user.role === 'supervisor') conditions.push(eq(schema.users.supervisorId, user.id));

        const users = await db.select({
            id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role,
            phone: schema.users.phone, isActive: schema.users.isActive, lastLoginAt: schema.users.lastLoginAt,
            createdAt: schema.users.createdAt, supervisorId: schema.users.supervisorId,
        }).from(schema.users)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users)
            .where(conditions.length > 0 ? and(...conditions) : undefined);

        return { success: true, data: users, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Get all supervisors for the tenant (for assigning reps)
    fastify.get('/supervisors', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can access supervisors list' } });
        }

        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Tenant context required' } });
        }

        try {
            const supervisors = await db.select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                phone: schema.users.phone,
            }).from(schema.users).where(and(
                eq(schema.users.tenantId, user.tenantId),
                eq(schema.users.role, 'supervisor'),
                eq(schema.users.isActive, true)
            )).orderBy(schema.users.name);

            return { success: true, data: supervisors };
        } catch (error) {
            console.error('Error fetching supervisors:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch supervisors' } });
        }
    });

    // Get my assigned reps (for supervisors)
    fastify.get('/my-reps', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (user.role !== 'supervisor') {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only supervisors can access this endpoint' } });
        }

        if (!user.tenantId) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Tenant context required' } });
        }

        try {
            const reps = await db.select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                phone: schema.users.phone,
                isActive: schema.users.isActive,
                lastLoginAt: schema.users.lastLoginAt,
                createdAt: schema.users.createdAt,
            }).from(schema.users).where(and(
                eq(schema.users.supervisorId, user.id),
                eq(schema.users.tenantId, user.tenantId),
                eq(schema.users.role, 'sales_rep')
            )).orderBy(desc(schema.users.createdAt));

            return { success: true, data: reps };
        } catch (error) {
            console.error('Error fetching assigned reps:', error);
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch assigned reps' } });
        }
    });

    // Create user
    fastify.post<{ Body: CreateUserBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateUserBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const bodyTenantId = body.tenantId === '' ? null : body.tenantId;
        const targetTenantId = user.role === 'super_admin' && bodyTenantId ? bodyTenantId : user.tenantId;

        if (!targetTenantId && body.role !== 'super_admin') {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Tenant ID is required' } });
        }

        // Validate supervisorId if provided
        if (body.supervisorId) {
            const [supervisor] = await db.select({ id: schema.users.id, role: schema.users.role, tenantId: schema.users.tenantId })
                .from(schema.users)
                .where(eq(schema.users.id, body.supervisorId))
                .limit(1);
            
            if (!supervisor) {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Supervisor not found' } });
            }
            
            if (supervisor.role !== 'supervisor') {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Assigned user is not a supervisor' } });
            }
            
            // Ensure supervisor belongs to the same tenant
            if (user.role !== 'super_admin' && supervisor.tenantId !== targetTenantId) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Supervisor does not belong to this tenant' } });
            }
            
            // Prevent circular reference: a supervisor cannot be assigned to themselves
            if (body.supervisorId === user.id && user.role === 'supervisor') {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'A supervisor cannot assign themselves as their own supervisor' } });
            }
        }

        // Check plan limits
        if (user.role !== 'super_admin' && targetTenantId) {
            const { canCreateUser } = await import('../lib/planLimits');
            const limitCheck = await canCreateUser(targetTenantId);
            if (!limitCheck.allowed) {
                return reply.code(403).send({ success: false, error: { code: 'LIMIT_EXCEEDED', message: `User limit reached (${limitCheck.current}/${limitCheck.max})` } });
            }
        }

        // Check email uniqueness
        const [existing] = await db.select({ id: schema.users.id }).from(schema.users)
            .where(eq(schema.users.email, body.email.toLowerCase())).limit(1);
        if (existing) {
            return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Email already exists' } });
        }

        const passwordHash = await hashPassword(body.password);
        const [newUser] = await db.insert(schema.users).values({
            tenantId: targetTenantId, name: body.name, email: body.email.toLowerCase(), passwordHash,
            role: body.role as any, phone: body.phone || null, supervisorId: body.supervisorId || null,
        }).returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, tenantId: schema.users.tenantId, createdAt: schema.users.createdAt });

        // Telegram notification
        try {
            const { notifyNewUser } = await import('../lib/telegram');
            let tenantName;
            if (targetTenantId) {
                const [tenant] = await db.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, targetTenantId));
                tenantName = tenant?.name;
            }
            notifyNewUser({ name: newUser.name, email: newUser.email, role: newUser.role, tenantName });
        } catch (err) { console.error('Telegram notification error:', err); }

        return { success: true, data: newUser };
    });

    // Get user by ID
    fastify.get<{ Params: Static<typeof UserIdParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const condition = user.role !== 'super_admin' && user.tenantId
            ? and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId))
            : eq(schema.users.id, id);

        const [targetUser] = await db.select({
            id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role,
            phone: schema.users.phone, telegramChatId: schema.users.telegramChatId, isActive: schema.users.isActive,
            lastLoginAt: schema.users.lastLoginAt, createdAt: schema.users.createdAt,
        }).from(schema.users).where(condition).limit(1);

        if (!targetUser) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: targetUser };
    });

    // Update user
    fastify.patch<{ Params: Static<typeof UserIdParamsSchema>; Body: UpdateUserBody }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema, body: UpdateUserBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const body = request.body;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        // Validate supervisorId if provided
        if (body.supervisorId) {
            const [supervisor] = await db.select({ id: schema.users.id, role: schema.users.role, tenantId: schema.users.tenantId })
                .from(schema.users)
                .where(eq(schema.users.id, body.supervisorId))
                .limit(1);
            
            if (!supervisor) {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Supervisor not found' } });
            }
            
            if (supervisor.role !== 'supervisor') {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Assigned user is not a supervisor' } });
            }
            
            // Ensure supervisor belongs to the same tenant
            const targetTenantId = user.role === 'super_admin' ? (await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.id, id)).limit(1))[0]?.tenantId : user.tenantId;
            if (supervisor.tenantId !== targetTenantId) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Supervisor does not belong to this tenant' } });
            }
            
            // Prevent self-assignment as supervisor
            if (body.supervisorId === id) {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'A user cannot be their own supervisor' } });
            }
        }

        const condition = user.role !== 'super_admin' && user.tenantId
            ? and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId))
            : eq(schema.users.id, id);

        const [updated] = await db.update(schema.users).set({ ...body, updatedAt: new Date() } as any)
            .where(condition).returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive });

        if (!updated) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: updated };
    });

    // Get assigned territories for a user
    fastify.get<{ Params: Static<typeof UserIdParamsSchema> }>('/:id/territories', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const targetUserCondition = user.role !== 'super_admin' && user.tenantId
            ? and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId))
            : eq(schema.users.id, id);

        const [targetUser] = await db.select({ id: schema.users.id }).from(schema.users).where(targetUserCondition).limit(1);
        if (!targetUser) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const territoryRows = await db.select({ territoryId: schema.userTerritories.territoryId })
            .from(schema.userTerritories)
            .where(eq(schema.userTerritories.userId, id));

        return { success: true, data: territoryRows.map((row) => row.territoryId) };
    });

    // Assign territories
    fastify.put<{ Params: Static<typeof UserIdParamsSchema>; Body: Static<typeof AssignTerritoriesBodySchema> }>('/:id/territories', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema, body: AssignTerritoriesBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { territoryIds } = request.body;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        await db.delete(schema.userTerritories).where(eq(schema.userTerritories.userId, id));
        if (territoryIds.length > 0) {
            await db.insert(schema.userTerritories).values(territoryIds.map(tid => ({ userId: id, territoryId: tid })));
        }
        return { success: true };
    });

    // Assign brands
    fastify.put<{ Params: Static<typeof UserIdParamsSchema>; Body: Static<typeof AssignBrandsBodySchema> }>('/:id/brands', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema, body: AssignBrandsBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { brandIds } = request.body;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        await db.delete(schema.userBrands).where(eq(schema.userBrands.userId, id));
        if (brandIds.length > 0) {
            await db.insert(schema.userBrands).values(brandIds.map(bid => ({ userId: id, brandId: bid })));
        }
        return { success: true };
    });

    // Delete user
    fastify.delete<{ Params: Static<typeof UserIdParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (user.id === id) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Cannot delete yourself' } });
        }

        try {
            const condition = user.role !== 'super_admin' && user.tenantId
                ? and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId))
                : eq(schema.users.id, id);

            const [deleted] = await db.delete(schema.users).where(condition).returning();
            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') {
                return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete user with associated records' } });
            }
            throw err;
        }
    });
};
