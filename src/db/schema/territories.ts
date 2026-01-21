import { pgTable, uuid, varchar, timestamp, boolean, integer, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

// ============================================================================
// TERRITORIES (Hierarchical)
// ============================================================================

export const territories = pgTable('territories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    parentId: uuid('parent_id'), // Self-reference, add relation manually
    name: varchar('name', { length: 255 }).notNull(),
    level: integer('level').default(1), // 1=region, 2=city, 3=area
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// USER TERRITORIES (Many-to-Many)
// ============================================================================

export const userTerritories = pgTable('user_territories', {
    userId: uuid('user_id').references(() => users.id).notNull(),
    territoryId: uuid('territory_id').references(() => territories.id).notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.territoryId] }),
}));
