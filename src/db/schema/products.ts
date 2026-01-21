import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

// ============================================================================
// ENUMS
// ============================================================================

export const productUnitEnum = pgEnum('product_unit', [
    'piece',
    'kg',
    'gram',
    'liter',
    'box',
    'case',
    'pack'
]);

// ============================================================================
// CATEGORIES
// ============================================================================

export const categories = pgTable('categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// SUBCATEGORIES
// ============================================================================

export const subcategories = pgTable('subcategories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    categoryId: uuid('category_id').references(() => categories.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// BRANDS
// ============================================================================

export const brands = pgTable('brands', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    logoUrl: varchar('logo_url', { length: 500 }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// USER BRANDS (Many-to-Many)
// ============================================================================

export const userBrands = pgTable('user_brands', {
    userId: uuid('user_id').references(() => users.id).notNull(),
    brandId: uuid('brand_id').references(() => brands.id).notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.brandId] }),
}));

// ============================================================================
// SUPPLIERS
// ============================================================================

export const suppliers = pgTable('suppliers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    balance: decimal('balance', { precision: 15, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// PRODUCTS
// ============================================================================

export const products = pgTable('products', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
    subcategoryId: uuid('subcategory_id').references(() => subcategories.id).notNull(),
    brandId: uuid('brand_id').references(() => brands.id).notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    sku: varchar('sku', { length: 100 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    unit: productUnitEnum('unit').default('piece'),
    price: decimal('price', { precision: 15, scale: 2 }).notNull(),
    costPrice: decimal('cost_price', { precision: 15, scale: 2 }),
    stockQuantity: integer('stock_quantity').default(0),
    reservedQuantity: integer('reserved_quantity').default(0),
    reorderPoint: integer('reorder_point').default(10),
    taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),
    barcode: varchar('barcode', { length: 100 }),
    imageUrl: varchar('image_url', { length: 500 }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// MASTER PRODUCTS (Global Catalog)
// ============================================================================

export const masterProducts = pgTable('master_products', {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 100 }).unique().notNull(),
    barcode: varchar('barcode', { length: 100 }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }), // Text-based category for flexible matching
    imageUrl: varchar('image_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
