import { pgTable, uuid, varchar, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';
import { tenants } from './core';
import { customers } from './customers';
import { products } from './products';

// ============================================================================
// CUSTOMER FAVORITES
// ============================================================================

export const customerFavorites = pgTable('customer_favorites', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.customerId, t.productId),
}));

// ============================================================================
// CUSTOMER ADDRESS BOOK
// ============================================================================

export const customerAddresses = pgTable('customer_addresses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    name: varchar('name', { length: 100 }).notNull(), // e.g. "Main Office", "Home"
    address: text('address').notNull(),
    latitude: varchar('latitude', { length: 20 }),
    longitude: varchar('longitude', { length: 20 }),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// SHOPPING CART (PERSISTENT)
// ============================================================================

export const shoppingCarts = pgTable('shopping_carts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull().unique(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cartItems = pgTable('cart_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id').references(() => shoppingCarts.id, { onDelete: 'cascade' }).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.cartId, t.productId),
}));

// ============================================================================
// PRODUCT REVIEWS
// ============================================================================

export const productReviews = pgTable('product_reviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    productId: uuid('product_id').references(() => products.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    rating: integer('rating').notNull(), // 1-5
    comment: text('comment'),
    isApproved: boolean('is_approved').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.customerId, t.productId), // One review per customer per product
}));

// ============================================================================
// PUSH NOTIFICATIONS SUBSCRIPTIONS
// ============================================================================

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    customerId: uuid('customer_id').references(() => customers.id).notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(), // Public key
    auth: text('auth').notNull(), // Auth secret
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

