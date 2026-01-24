import { pgTable, uuid, decimal, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

// ============================================================================
// USER LOCATIONS (GPS Tracking)
// ============================================================================

export const userLocations = pgTable('user_locations', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    
    // Location data
    latitude: decimal('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: decimal('longitude', { precision: 11, scale: 8 }).notNull(),
    accuracy: decimal('accuracy', { precision: 8, scale: 2 }), // GPS accuracy in meters
    heading: decimal('heading', { precision: 6, scale: 2 }), // Direction in degrees (0-360)
    speed: decimal('speed', { precision: 8, scale: 2 }), // Speed in m/s
    
    // Timestamp of when this location was recorded
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    // Index for fast queries: get most recent location per user
    userTimestampIdx: index('idx_user_locations_user_id_timestamp').on(table.userId, table.timestamp),
    // Index for tenant-wide queries
    tenantTimestampIdx: index('idx_user_locations_tenant_id_timestamp').on(table.tenantId, table.timestamp),
    // Index for recent locations query
    userCreatedAtIdx: index('idx_user_locations_user_id_created_at').on(table.userId, table.createdAt),
}));
