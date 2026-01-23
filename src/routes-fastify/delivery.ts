import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

// Schemas
const CreateVehicleBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    plateNumber: Type.Optional(Type.String()),
    capacity: Type.Optional(Type.Number({ minimum: 0 })),
});

const ListTripsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    driverId: Type.Optional(Type.String()),
    date: Type.Optional(Type.String()),
});

const CreateTripBodySchema = Type.Object({
    driverId: Type.String(),
    vehicleId: Type.Optional(Type.String()),
    plannedDate: Type.String(),
    notes: Type.Optional(Type.String()),
    orderIds: Type.Array(Type.String()),
});

const TripIdParamsSchema = Type.Object({ id: Type.String() });
const UpdateTripStatusBodySchema = Type.Object({ status: Type.String() });

type CreateVehicleBody = Static<typeof CreateVehicleBodySchema>;
type ListTripsQuery = Static<typeof ListTripsQuerySchema>;
type CreateTripBody = Static<typeof CreateTripBodySchema>;
type UpdateTripStatusBody = Static<typeof UpdateTripStatusBodySchema>;

export const deliveryRoutes: FastifyPluginAsync = async (fastify) => {
    // List vehicles
    fastify.get('/vehicles', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const vehicles = await db.select().from(schema.vehicles)
            .where(and(eq(schema.vehicles.tenantId, user.tenantId), eq(schema.vehicles.isActive, true)))
            .orderBy(schema.vehicles.name);
        return { success: true, data: vehicles };
    });

    // Create vehicle
    fastify.post<{ Body: CreateVehicleBody }>('/vehicles', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateVehicleBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const [vehicle] = await db.insert(schema.vehicles).values({
            tenantId: user.tenantId, name: request.body.name, plateNumber: request.body.plateNumber,
            capacity: request.body.capacity, isActive: true,
        }).returning();
        return { success: true, data: vehicle };
    });

    // List trips
    fastify.get<{ Querystring: ListTripsQuery }>('/trips', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListTripsQuerySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', status, driverId, date } = request.query;
        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.trips.tenantId, user.tenantId)];
        if (status) conditions.push(eq(schema.trips.status, status as any));
        if (date) conditions.push(eq(schema.trips.plannedDate, date));
        if (user.role === 'driver') {
            conditions.push(eq(schema.trips.driverId, user.id));
        } else if (driverId) {
            conditions.push(eq(schema.trips.driverId, driverId));
        }

        const trips = await db.select({
            id: schema.trips.id, tripNumber: schema.trips.tripNumber, status: schema.trips.status,
            plannedDate: schema.trips.plannedDate, driverName: schema.users.name, vehicleName: schema.vehicles.name,
            orderCount: sql<number>`(SELECT count(*) FROM ${schema.tripOrders} WHERE ${schema.tripOrders.tripId} = ${schema.trips.id})`,
        }).from(schema.trips)
            .leftJoin(schema.users, eq(schema.trips.driverId, schema.users.id))
            .leftJoin(schema.vehicles, eq(schema.trips.vehicleId, schema.vehicles.id))
            .where(and(...conditions))
            .orderBy(desc(schema.trips.plannedDate))
            .limit(limit).offset(offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.trips).where(and(...conditions));
        return { success: true, data: trips, meta: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } };
    });

    // Create trip
    fastify.post<{ Body: CreateTripBody }>('/trips', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateTripBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const body = request.body;

        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const tripNumber = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        try {
            const result = await db.transaction(async (tx) => {
                if (body.orderIds && body.orderIds.length > 0) {
                    const validOrders = await tx.select({ id: schema.orders.id, status: schema.orders.status })
                        .from(schema.orders)
                        .where(and(eq(schema.orders.tenantId, user.tenantId), inArray(schema.orders.id, body.orderIds)));

                    if (validOrders.length !== body.orderIds.length) throw new Error('Some orders not found');
                    const invalidStatus = validOrders.filter(o => !['approved', 'picked', 'confirmed'].includes(o.status as string));
                    if (invalidStatus.length > 0) throw new Error('Orders must be in approved/picked/confirmed status');

                    const alreadyAssigned = await tx.select({ orderId: schema.tripOrders.orderId })
                        .from(schema.tripOrders).where(inArray(schema.tripOrders.orderId, body.orderIds));
                    if (alreadyAssigned.length > 0) throw new Error('Some orders are already assigned');
                }

                const [trip] = await tx.insert(schema.trips).values({
                    tenantId: user.tenantId, tripNumber, driverId: body.driverId, vehicleId: body.vehicleId,
                    plannedDate: body.plannedDate, status: 'planned', notes: body.notes,
                }).returning();

                if (body.orderIds && body.orderIds.length > 0) {
                    await tx.insert(schema.tripOrders).values(
                        body.orderIds.map((orderId, idx) => ({ tripId: trip.id, orderId, sequence: idx + 1 }))
                    );
                    await tx.update(schema.orders).set({ status: 'picking' as any, updatedAt: new Date() })
                        .where(inArray(schema.orders.id, body.orderIds));
                }
                return trip;
            });
            return { success: true, data: result };
        } catch (error: any) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: error.message } });
        }
    });

    // Get trip details
    fastify.get<{ Params: Static<typeof TripIdParamsSchema> }>('/trips/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: TripIdParamsSchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;

        const [trip] = await db.select({
            id: schema.trips.id, tripNumber: schema.trips.tripNumber, status: schema.trips.status,
            plannedDate: schema.trips.plannedDate, driverId: schema.trips.driverId, vehicleId: schema.trips.vehicleId,
            notes: schema.trips.notes, driverName: schema.users.name, vehicleName: schema.vehicles.name,
        }).from(schema.trips)
            .leftJoin(schema.users, eq(schema.trips.driverId, schema.users.id))
            .leftJoin(schema.vehicles, eq(schema.trips.vehicleId, schema.vehicles.id))
            .where(and(eq(schema.trips.id, id), eq(schema.trips.tenantId, user.tenantId)))
            .limit(1);

        if (!trip) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        if (user.role === 'driver' && trip.driverId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const orders = await db.select({
            id: schema.orders.id, orderNumber: schema.orders.orderNumber, customerName: schema.customers.name,
            address: schema.customers.address, totalAmount: schema.orders.totalAmount, status: schema.orders.status,
            sequence: schema.tripOrders.sequence, deliveryNotes: schema.tripOrders.deliveryNotes,
        }).from(schema.tripOrders)
            .innerJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(eq(schema.tripOrders.tripId, trip.id))
            .orderBy(schema.tripOrders.sequence);

        return { success: true, data: { ...trip, orders } };
    });

    // Update trip status
    fastify.patch<{ Params: Static<typeof TripIdParamsSchema>; Body: UpdateTripStatusBody }>('/trips/:id/status', {
        preHandler: [fastify.authenticate],
        schema: { params: TripIdParamsSchema, body: UpdateTripStatusBodySchema },
    }, async (request, reply) => {
        const user = request.user!;
        const { id } = request.params;
        const { status } = request.body;

        const updates: any = { status, updatedAt: new Date() };
        if (status === 'in_progress') updates.startedAt = new Date();
        if (status === 'completed') updates.completedAt = new Date();

        const [trip] = await db.update(schema.trips).set(updates)
            .where(and(eq(schema.trips.id, id), eq(schema.trips.tenantId, user.tenantId)))
            .returning();

        if (!trip) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        // When trip starts, notify customers and update order status
        if (status === 'in_progress') {
            try {
                const [driver] = await db.select({ name: schema.users.name }).from(schema.users)
                    .where(eq(schema.users.id, trip.driverId)).limit(1);

                const tripOrders = await db.select({
                    orderId: schema.orders.id, orderNumber: schema.orders.orderNumber,
                    customerName: schema.customers.name, customerChatId: schema.customers.telegramChatId,
                }).from(schema.tripOrders)
                    .innerJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
                    .innerJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                    .where(eq(schema.tripOrders.tripId, trip.id));

                const { notifyCustomerOutForDelivery } = await import('../lib/telegram');
                for (const order of tripOrders) {
                    if (order.customerChatId) {
                        notifyCustomerOutForDelivery(user.tenantId, { chatId: order.customerChatId, name: order.customerName },
                            { orderNumber: order.orderNumber, driverName: driver?.name });
                    }
                }

                const orderIds = tripOrders.map(o => o.orderId);
                if (orderIds.length > 0) {
                    await db.update(schema.orders).set({ status: 'delivering' as any, updatedAt: new Date() })
                        .where(inArray(schema.orders.id, orderIds));
                }
            } catch (e) { console.error('Telegram notification error:', e); }
        }

        return { success: true, data: trip };
    });
};
