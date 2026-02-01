import { pgTable, uuid, varchar, text, timestamp, boolean, integer, date, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { orders } from './orders';

// ============================================================================
// ENUMS
// ============================================================================

export const tripStatusEnum = pgEnum('trip_status', [
    'planned',
    'loading',
    'in_progress',
    'completed',
    'cancelled'
]);

// ============================================================================
// VEHICLES
// ============================================================================

export const vehicles = pgTable('vehicles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    plateNumber: varchar('plate_number', { length: 50 }),
    capacity: integer('capacity'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TRIPS
// ============================================================================

export const trips = pgTable('trips', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    tripNumber: varchar('trip_number', { length: 50 }).unique().notNull(),
    driverId: uuid('driver_id').references(() => users.id).notNull(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),
    status: tripStatusEnum('status').default('planned'),
    plannedDate: date('planned_date').notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// TRIP ORDERS
// ============================================================================

export const tripOrders = pgTable('trip_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').references(() => trips.id).notNull(),
    orderId: uuid('order_id').references(() => orders.id).unique().notNull(),
    sequence: integer('sequence').default(0),
    loadedAt: timestamp('loaded_at'),
    deliveredAt: timestamp('delivered_at'),
    deliveryNotes: text('delivery_notes'),
    createdAt: timestamp('created_at').defaultNow(),
});
