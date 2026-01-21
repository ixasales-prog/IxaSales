import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

export const deliveryRoutes = new Elysia({ prefix: '/delivery' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // VEHICLES
    // ----------------------------------------------------------------

    // List vehicles
    .get('/vehicles', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const vehicles = await db
            .select()
            .from(schema.vehicles)
            .where(and(eq(schema.vehicles.tenantId, user.tenantId), eq(schema.vehicles.isActive, true)))
            .orderBy(schema.vehicles.name);

        return { success: true, data: vehicles };
    })

    // Create vehicle
    .post('/vehicles', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [vehicle] = await db
            .insert(schema.vehicles)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                plateNumber: body.plateNumber,
                capacity: body.capacity,
                isActive: true,
            })
            .returning();

        return { success: true, data: vehicle };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            plateNumber: t.Optional(t.String()),
            capacity: t.Optional(t.Number({ minimum: 0 })),
        })
    })

    // ----------------------------------------------------------------
    // TRIPS
    // ----------------------------------------------------------------

    // List trips
    .get('/trips', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, status, driverId, date } = query;
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.trips.tenantId, user.tenantId)];

        if (status) conditions.push(eq(schema.trips.status, status));
        if (date) conditions.push(eq(schema.trips.plannedDate, date));

        // Role restrictions
        if (user.role === 'driver') {
            conditions.push(eq(schema.trips.driverId, user.id));
        } else if (driverId) {
            conditions.push(eq(schema.trips.driverId, driverId));
        }

        const trips = await db
            .select({
                id: schema.trips.id,
                tripNumber: schema.trips.tripNumber,
                status: schema.trips.status,
                plannedDate: schema.trips.plannedDate,
                driverName: schema.users.name,
                vehicleName: schema.vehicles.name,
                orderCount: sql<number>`(SELECT count(*) FROM ${schema.tripOrders} WHERE ${schema.tripOrders.tripId} = ${schema.trips.id})`,
            })
            .from(schema.trips)
            .leftJoin(schema.users, eq(schema.trips.driverId, schema.users.id))
            .leftJoin(schema.vehicles, eq(schema.trips.vehicleId, schema.vehicles.id))
            .where(and(...conditions))
            .orderBy(desc(schema.trips.plannedDate))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.trips)
            .where(and(...conditions));

        return {
            success: true,
            data: trips,
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
            status: t.Optional(t.String()),
            driverId: t.Optional(t.String()),
            date: t.Optional(t.String()),
        })
    })

    // Create trip
    .post('/trips', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin', 'supervisor'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const tripNumber = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result = await db.transaction(async (tx) => {
            // 1. Validate orders before creating trip
            if (body.orderIds && body.orderIds.length > 0) {
                // Check orders exist and are valid for assignment
                const validOrders = await tx
                    .select({
                        id: schema.orders.id,
                        status: schema.orders.status,
                    })
                    .from(schema.orders)
                    .where(and(
                        eq(schema.orders.tenantId, user.tenantId),
                        inArray(schema.orders.id, body.orderIds)
                    ));

                // Verify all requested orders exist
                if (validOrders.length !== body.orderIds.length) {
                    throw new Error(`Some orders not found or don't belong to this tenant`);
                }

                // Verify orders are in valid status for trip assignment (approved or picked)
                const invalidStatusOrders = validOrders.filter(
                    o => !['approved', 'picked', 'confirmed'].includes(o.status as string)
                );
                if (invalidStatusOrders.length > 0) {
                    throw new Error(`Orders must be in approved/picked/confirmed status to be assigned to a trip`);
                }

                // Check if any orders are already assigned to another trip
                const alreadyAssigned = await tx
                    .select({ orderId: schema.tripOrders.orderId })
                    .from(schema.tripOrders)
                    .where(inArray(schema.tripOrders.orderId, body.orderIds));

                if (alreadyAssigned.length > 0) {
                    throw new Error(`Some orders are already assigned to another trip`);
                }
            }

            // 2. Create Trip
            const [trip] = await tx
                .insert(schema.trips)
                .values({
                    tenantId: user.tenantId,
                    tripNumber,
                    driverId: body.driverId,
                    vehicleId: body.vehicleId,
                    plannedDate: body.plannedDate,
                    status: 'planned',
                    notes: body.notes,
                })
                .returning();

            // 3. Add Orders to Trip
            if (body.orderIds && body.orderIds.length > 0) {
                await tx.insert(schema.tripOrders).values(
                    body.orderIds.map((orderId: string, index: number) => ({
                        tripId: trip.id,
                        orderId: orderId,
                        sequence: index + 1,
                    }))
                );

                // Update Order Status to 'picking' when assigned to trip
                await tx
                    .update(schema.orders)
                    .set({ status: 'picking' as any, updatedAt: new Date() })
                    .where(inArray(schema.orders.id, body.orderIds));
            }

            return trip;
        });

        return { success: true, data: result };
    }, {
        body: t.Object({
            driverId: t.String(),
            vehicleId: t.Optional(t.String()),
            plannedDate: t.String(),
            notes: t.Optional(t.String()),
            orderIds: t.Array(t.String()),
        })
    })

    // Get trip details
    .get('/trips/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const [trip] = await db
            .select({
                id: schema.trips.id,
                tripNumber: schema.trips.tripNumber,
                status: schema.trips.status,
                plannedDate: schema.trips.plannedDate,
                driverId: schema.trips.driverId,
                vehicleId: schema.trips.vehicleId,
                notes: schema.trips.notes,
                driverName: schema.users.name,
                vehicleName: schema.vehicles.name,
            })
            .from(schema.trips)
            .leftJoin(schema.users, eq(schema.trips.driverId, schema.users.id))
            .leftJoin(schema.vehicles, eq(schema.trips.vehicleId, schema.vehicles.id))
            .where(and(eq(schema.trips.id, params.id), eq(schema.trips.tenantId, user.tenantId)))
            .limit(1);

        if (!trip) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Role check - drivers can only view their own trips
        if (user.role === 'driver' && trip.driverId !== user.id) {
            set.status = 403;
            return { success: false, error: { code: 'FORBIDDEN', message: 'You can only view your assigned trips' } };
        }

        // Get orders in trip
        const orders = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                customerName: schema.customers.name,
                address: schema.customers.address,
                totalAmount: schema.orders.totalAmount,
                status: schema.orders.status,
                sequence: schema.tripOrders.sequence,
                deliveryNotes: schema.tripOrders.deliveryNotes,
            })
            .from(schema.tripOrders)
            .innerJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
            .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
            .where(eq(schema.tripOrders.tripId, trip.id))
            .orderBy(schema.tripOrders.sequence);

        return { success: true, data: { ...trip, orders } };
    }, {
        params: t.Object({ id: t.String() })
    })

    // Update trip status
    .patch('/trips/:id/status', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Driver can likely update to 'in_progress', 'completed'
        // Validation logic on transitions can be added here

        const updates: any = { status: body.status, updatedAt: new Date() };
        if (body.status === 'in_progress') updates.startedAt = new Date();
        if (body.status === 'completed') updates.completedAt = new Date();

        const [trip] = await db
            .update(schema.trips)
            .set(updates)
            .where(and(eq(schema.trips.id, params.id), eq(schema.trips.tenantId, user.tenantId)))
            .returning();

        if (!trip) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // When trip starts, notify customers their orders are out for delivery
        if (body.status === 'in_progress') {
            try {
                // Get driver name
                const [driver] = await db
                    .select({ name: schema.users.name })
                    .from(schema.users)
                    .where(eq(schema.users.id, trip.driverId))
                    .limit(1);

                // Get all orders in this trip with customer info
                const tripOrders = await db
                    .select({
                        orderNumber: schema.orders.orderNumber,
                        customerName: schema.customers.name,
                        customerChatId: schema.customers.telegramChatId,
                    })
                    .from(schema.tripOrders)
                    .innerJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
                    .innerJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                    .where(eq(schema.tripOrders.tripId, trip.id));

                // Notify each customer
                const { notifyCustomerOutForDelivery } = await import('../lib/telegram');
                for (const order of tripOrders) {
                    if (order.customerChatId) {
                        notifyCustomerOutForDelivery(
                            user.tenantId,
                            { chatId: order.customerChatId, name: order.customerName },
                            {
                                orderNumber: order.orderNumber,
                                driverName: driver?.name,
                            }
                        );
                    }
                }

                // Also update order statuses to 'delivering'
                const orderIds = tripOrders.map(o => o.orderNumber);
                if (orderIds.length > 0) {
                    await db
                        .update(schema.orders)
                        .set({ status: 'delivering' as any, updatedAt: new Date() })
                        .where(sql`${schema.orders.orderNumber} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
                }
            } catch (e) {
                console.error('[Telegram] Error notifying customers for trip:', e);
            }
        }

        return { success: true, data: trip };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            status: t.String(),
        })
    });
