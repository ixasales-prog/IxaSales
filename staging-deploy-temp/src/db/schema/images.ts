import { pgTable, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { products } from './products';

// ============================================================================
// PRODUCT IMAGES (Gallery support)
// ============================================================================

export const productImages = pgTable('product_images', {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    mediumUrl: varchar('medium_url', { length: 500 }),
    altText: varchar('alt_text', { length: 255 }),
    sortOrder: integer('sort_order').default(0),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});
