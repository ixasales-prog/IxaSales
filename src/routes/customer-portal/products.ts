/**
 * Customer Portal - Products Routes
 * 
 * Product catalog with search and filtering.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse } from '../../lib/error-codes';

export const productsRoutes = new Elysia()
    /**
     * Get available products for ordering with search and category filter
     */
    .get('/products', async ({ headers, query, set }) => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            set.status = 401;
            return createErrorResponse('UNAUTHORIZED');
        }

        const payload = await verifyCustomerToken(token);
        if (!payload) {
            set.status = 401;
            return createErrorResponse('INVALID_TOKEN');
        }

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const search = query.search?.trim() || '';
        const categoryId = query.categoryId;
        const offset = (page - 1) * limit;

        // Build where clause
        const conditions: any[] = [
            eq(schema.products.tenantId, payload.tenantId),
            or(
                eq(schema.products.isActive, true),
                sql`${schema.products.isActive} IS NULL`
            )
        ];

        if (search) {
            conditions.push(
                or(
                    ilike(schema.products.name, `%${search}%`),
                    ilike(schema.products.sku, `%${search}%`),
                    ilike(schema.products.description, `%${search}%`)
                )
            );
        }

        if (categoryId) {
            conditions.push(eq(schema.products.subcategoryId, categoryId));
        }

        const products = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                sku: schema.products.sku,
                description: schema.products.description,
                price: schema.products.price,
                imageUrl: schema.products.imageUrl,
                subcategoryId: schema.products.subcategoryId,
                stockQuantity: schema.products.stockQuantity,
            })
            .from(schema.products)
            .where(and(...conditions))
            .orderBy(schema.products.name)
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.products)
            .where(and(...conditions));

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenantId))
            .limit(1);

        return {
            success: true,
            data: products.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                description: p.description,
                sellingPrice: Number(p.price),
                imageUrl: p.imageUrl,
                categoryId: p.subcategoryId,
                stockQty: Number(p.stockQuantity || 0),
                inStock: Number(p.stockQuantity || 0) > 0
            })),
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
                hasMore: page * limit < Number(count),
                currency: tenant?.currency || 'UZS'
            }
        };
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            search: t.Optional(t.String()),
            categoryId: t.Optional(t.String())
        })
    })

    /**
     * Get single product details
     */
    .get('/products/:id', async ({ headers, params, set }) => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            set.status = 401;
            return { success: false, error: { code: 'UNAUTHORIZED' } };
        }

        const payload = await verifyCustomerToken(token);
        if (!payload) {
            set.status = 401;
            return { success: false, error: { code: 'INVALID_TOKEN' } };
        }

        const [product] = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                sku: schema.products.sku,
                description: schema.products.description,
                price: schema.products.price,
                imageUrl: schema.products.imageUrl,
                subcategoryId: schema.products.subcategoryId,
                stockQuantity: schema.products.stockQuantity,
            })
            .from(schema.products)
            .where(and(
                eq(schema.products.id, params.id),
                eq(schema.products.tenantId, payload.tenantId),
                eq(schema.products.isActive, true)
            ))
            .limit(1);

        if (!product) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        // Get product images
        const images = await db
            .select({
                id: schema.productImages.id,
                imageUrl: schema.productImages.url,
                sortOrder: schema.productImages.sortOrder,
            })
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, params.id))
            .orderBy(schema.productImages.sortOrder);

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, payload.tenantId))
            .limit(1);

        return {
            success: true,
            data: {
                id: product.id,
                name: product.name,
                sku: product.sku,
                description: product.description,
                sellingPrice: Number(product.price),
                imageUrl: product.imageUrl,
                images: images.length > 0 ? images : (product.imageUrl ? [{ id: 'main', imageUrl: product.imageUrl }] : []),
                categoryId: product.subcategoryId,
                stockQty: Number(product.stockQuantity || 0),
                inStock: Number(product.stockQuantity || 0) > 0,
                currency: tenant?.currency || 'UZS'
            }
        };
    }, {
        params: t.Object({ id: t.String() })
    })

    /**
     * Get product categories
     */
    .get('/categories', async ({ headers, set }) => {
        const authHeader = headers['authorization'];
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            set.status = 401;
            return { success: false, error: { code: 'UNAUTHORIZED' } };
        }

        const payload = await verifyCustomerToken(token);
        if (!payload) {
            set.status = 401;
            return { success: false, error: { code: 'INVALID_TOKEN' } };
        }

        const categories = await db
            .select({
                id: schema.categories.id,
                name: schema.categories.name,
            })
            .from(schema.categories)
            .where(eq(schema.categories.tenantId, payload.tenantId))
            .orderBy(schema.categories.name);

        const subcategories = await db
            .select({
                id: schema.subcategories.id,
                name: schema.subcategories.name,
                categoryId: schema.subcategories.categoryId,
            })
            .from(schema.subcategories)
            .where(eq(schema.subcategories.tenantId, payload.tenantId))
            .orderBy(schema.subcategories.name);

        return {
            success: true,
            data: { categories, subcategories }
        };
    });
