import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { hashPassword } from '../lib/password';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

const USER_ROLES = ['super_admin', 'tenant_admin', 'supervisor', 'sales_rep', 'warehouse', 'driver'] as const;
const USER_ROLE_LITERALS = USER_ROLES.map((role) => Type.Literal(role));
const TENANT_ADMIN_ALLOWED_ROLES = ['tenant_admin', 'supervisor', 'sales_rep', 'warehouse', 'driver'] as const;

// Schemas
const ListUsersQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    role: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
    tenantId: Type.Optional(Type.String()),
});
const SupervisorsQuerySchema = Type.Object({
    tenantId: Type.Optional(Type.String()),
});

const CreateUserBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    email: Type.String({ format: 'email' }),
    password: Type.String({ minLength: 8 }),
    role: Type.Union(USER_ROLE_LITERALS),
    phone: Type.Optional(Type.String()),
    supervisorId: Type.Optional(Type.String()),
    tenantId: Type.Optional(Type.String()),
    territoryIds: Type.Optional(Type.Array(Type.String())),
});

const UserIdParamsSchema = Type.Object({ id: Type.String() });

const UpdateUserBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    email: Type.Optional(Type.String({ format: 'email' })),
    phone: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    role: Type.Optional(Type.Union(USER_ROLE_LITERALS)),
    isActive: Type.Optional(Type.Boolean()),
    supervisorId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const AssignTerritoriesBodySchema = Type.Object({ territoryIds: Type.Array(Type.String()) });
const AssignBrandsBodySchema = Type.Object({ brandIds: Type.Array(Type.String()) });

type ListUsersQuery = Static<typeof ListUsersQuerySchema>;
type CreateUserBody = Static<typeof CreateUserBodySchema>;
type UpdateUserBody = Static<typeof UpdateUserBodySchema>;

function buildTerritoryTree(territories: Array<{ id: string; parentId: string | null } & Record<string, any>>) {
    const byId = new Map(territories.map((t) => [t.id, { ...t, children: [] as any[] }]));
    const roots: any[] = [];

    byId.forEach((territory) => {
        if (territory.parentId && byId.has(territory.parentId)) {
            byId.get(territory.parentId)!.children.push(territory);
        } else {
            roots.push(territory);
        }
    });

    return roots;
}

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
            tenantId: schema.users.tenantId, tenantName: schema.tenants.name,
        }).from(schema.users)
            .leftJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users)
            .where(conditions.length > 0 ? and(...conditions) : undefined);

        return { success: true, data: users, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Get all supervisors for the tenant (for assigning reps)
    fastify.get<{ Querystring: Static<typeof SupervisorsQuerySchema> }>('/supervisors', {
        preHandler: [fastify.authenticate],
        schema: { querystring: SupervisorsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { tenantId } = request.query;

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can access supervisors list' } });
        }

        try {
            const supervisorConditions: any[] = [
                eq(schema.users.role, 'supervisor'),
                eq(schema.users.isActive, true),
            ];

            if (user.role === 'super_admin') {
                if (tenantId) {
                    supervisorConditions.push(eq(schema.users.tenantId, tenantId));
                }
            } else {
                if (!user.tenantId) {
                    return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Tenant context required' } });
                }
                supervisorConditions.push(eq(schema.users.tenantId, user.tenantId));
            }

            const supervisors = await db.select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                phone: schema.users.phone,
                tenantId: schema.users.tenantId,
            }).from(schema.users).where(and(...supervisorConditions)).orderBy(schema.users.name);

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
        const requestedTerritoryIds = Array.from(new Set((body.territoryIds || []).filter(Boolean)));

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const bodyTenantId = body.tenantId === '' ? null : body.tenantId;
        const targetTenantId = user.role === 'super_admin' && bodyTenantId ? bodyTenantId : user.tenantId;

        if (!targetTenantId && body.role !== 'super_admin') {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Tenant ID is required' } });
        }

        if (user.role === 'tenant_admin') {
            if (body.role === 'super_admin') {
                return reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Tenant admins cannot create super admins' },
                });
            }
            if (!TENANT_ADMIN_ALLOWED_ROLES.includes(body.role as any)) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'BAD_REQUEST', message: 'Invalid role for tenant admin' },
                });
            }
            if (bodyTenantId && user.tenantId && bodyTenantId !== user.tenantId) {
                return reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Tenant admins cannot create users in other tenants' },
                });
            }
        }

        if (body.role !== 'sales_rep' && requestedTerritoryIds.length > 0) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: 'Territories can only be assigned to sales reps' },
            });
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
            if (targetTenantId && supervisor.tenantId !== targetTenantId) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Supervisor does not belong to this tenant' } });
            }

            // Prevent circular reference: a supervisor cannot be assigned to themselves
            if (body.supervisorId === user.id && user.role === 'supervisor') {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'A supervisor cannot assign themselves as their own supervisor' } });
            }
        }

        // Check email uniqueness
        const [existing] = await db.select({ id: schema.users.id }).from(schema.users)
            .where(eq(schema.users.email, body.email.toLowerCase())).limit(1);
        if (existing) {
            return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Email already exists' } });
        }

        const passwordHash = await hashPassword(body.password);
        let createResult: { kind: 'limit'; limitCheck: { allowed: boolean; current: number; max: number } } | { kind: 'ok'; user: any };
        try {
            createResult = await db.transaction(async (tx) => {
                if (user.role !== 'super_admin' && targetTenantId) {
                    const { canCreateResourceInTx } = await import('../lib/planLimits');
                    const limitCheck = await canCreateResourceInTx(tx, targetTenantId, 'users');
                    if (!limitCheck.allowed) {
                        return { kind: 'limit' as const, limitCheck };
                    }
                }

                const [createdUser] = await tx.insert(schema.users).values({
                    tenantId: targetTenantId, name: body.name, email: body.email.toLowerCase(), passwordHash,
                    role: body.role, phone: body.phone || null, supervisorId: body.supervisorId || null,
                }).returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, tenantId: schema.users.tenantId, createdAt: schema.users.createdAt });

                if (body.role === 'sales_rep' && requestedTerritoryIds.length > 0) {
                    if (!targetTenantId) {
                        throw new Error('Tenant context required for territory assignment');
                    }

                    const territoryRows = await tx.select({
                        id: schema.territories.id,
                    })
                        .from(schema.territories)
                        .where(and(
                            eq(schema.territories.tenantId, targetTenantId),
                            inArray(schema.territories.id, requestedTerritoryIds),
                        ));

                    if (territoryRows.length !== requestedTerritoryIds.length) {
                        throw new Error('One or more territories are invalid for the target tenant');
                    }

                    await tx.insert(schema.userTerritories).values(
                        requestedTerritoryIds.map((territoryId) => ({
                            userId: createdUser.id,
                            territoryId,
                        }))
                    );
                }

                return { kind: 'ok' as const, user: createdUser };
            });
        } catch (error: any) {
            if (error?.code === '23505') {
                return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Email already exists' } });
            }
            if (error?.message?.includes('territor')) {
                return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: error.message } });
            }
            throw error;
        }

        if (createResult.kind === 'limit') {
            const { buildLimitExceededError } = await import('../lib/planLimits');
            const limitError = buildLimitExceededError('users', createResult.limitCheck.current, createResult.limitCheck.max);
            return reply.code(403).send({
                success: false,
                error: limitError
            });
        }
        const newUser = createResult.user;

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
            phone: schema.users.phone, isActive: schema.users.isActive,
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

        try {
            if (body.role && user.role === 'tenant_admin' && body.role === 'super_admin') {
                return reply.code(403).send({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Tenant admins cannot grant super admin role' },
                });
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
            // Filter out undefined values and password field from the update body
            const updateData: Record<string, any> = { updatedAt: new Date() };
            if (body.name !== undefined) updateData.name = body.name;
            if (body.email !== undefined) updateData.email = body.email.toLowerCase();
            if (body.phone !== undefined) updateData.phone = body.phone || null;
            if (body.role !== undefined) updateData.role = body.role;
            if (body.isActive !== undefined) updateData.isActive = body.isActive;
            // Convert empty string to null for supervisorId (UUID field)
            if (body.supervisorId !== undefined) updateData.supervisorId = body.supervisorId?.trim() || null;

            const [updated] = await db.update(schema.users).set(updateData as any)
                .where(condition).returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive });

            if (!updated) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

            if (body.role && body.role !== 'sales_rep') {
                await db.delete(schema.userTerritories).where(eq(schema.userTerritories.userId, id));
            }
            return { success: true, data: updated };
        } catch (error: any) {
            console.error('Error updating user:', error);
            if (error.code === '23505') {
                return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Email already exists' } });
            }
            return reply.code(500).send({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to update user' } });
        }
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

    // Get territory tree options for target user's tenant
    fastify.get<{ Params: Static<typeof UserIdParamsSchema> }>('/:id/territory-tree', {
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

        const [targetUser] = await db.select({
            id: schema.users.id,
            role: schema.users.role,
            tenantId: schema.users.tenantId,
        }).from(schema.users).where(targetUserCondition).limit(1);

        if (!targetUser) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        if (!targetUser.tenantId) return { success: true, data: [] };

        const territories = await db.select({
            id: schema.territories.id,
            tenantId: schema.territories.tenantId,
            parentId: schema.territories.parentId,
            name: schema.territories.name,
            level: schema.territories.level,
            isActive: schema.territories.isActive,
        }).from(schema.territories)
            .where(eq(schema.territories.tenantId, targetUser.tenantId))
            .orderBy(schema.territories.name);

        return { success: true, data: buildTerritoryTree(territories) };
    });

    // Assign territories
    fastify.put<{ Params: Static<typeof UserIdParamsSchema>; Body: Static<typeof AssignTerritoriesBodySchema> }>('/:id/territories', {
        preHandler: [fastify.authenticate],
        schema: { params: UserIdParamsSchema, body: AssignTerritoriesBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const territoryIds = Array.from(new Set((request.body.territoryIds || []).filter(Boolean)));

        if (!['tenant_admin', 'super_admin'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const targetUserCondition = user.role !== 'super_admin' && user.tenantId
            ? and(eq(schema.users.id, id), eq(schema.users.tenantId, user.tenantId))
            : eq(schema.users.id, id);

        const [targetUser] = await db.select({
            id: schema.users.id,
            role: schema.users.role,
            tenantId: schema.users.tenantId,
        }).from(schema.users).where(targetUserCondition).limit(1);

        if (!targetUser) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        if (targetUser.role !== 'sales_rep' && territoryIds.length > 0) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: 'Only sales reps can have territory assignments' },
            });
        }

        if (territoryIds.length > 0) {
            if (!targetUser.tenantId) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'BAD_REQUEST', message: 'Target user has no tenant context' },
                });
            }

            const validTerritories = await db.select({ id: schema.territories.id })
                .from(schema.territories)
                .where(and(
                    eq(schema.territories.tenantId, targetUser.tenantId),
                    inArray(schema.territories.id, territoryIds),
                ));

            if (validTerritories.length !== territoryIds.length) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'BAD_REQUEST', message: 'One or more territories are invalid for this user tenant' },
                });
            }
        }

        await db.transaction(async (tx) => {
            await tx.delete(schema.userTerritories).where(eq(schema.userTerritories.userId, id));
            if (territoryIds.length > 0) {
                await tx.insert(schema.userTerritories).values(territoryIds.map((tid) => ({ userId: id, territoryId: tid })));
            }
        });
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
