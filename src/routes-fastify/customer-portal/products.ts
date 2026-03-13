/**
 * Customer Portal - Products Routes (Fastify)
 * 
 * Product catalog with search and filtering.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { createErrorResponse } from '../../lib/error-codes';
import { requireCustomerAuth } from './middleware';

// ============================================================================
// SCHEMAS
// ============================================================================

const ListProductsQuerySchema = {
    querystring: Type.Object({
        page: Type.Optional(Type.String()),
        limit: Type.Optional(Type.String()),
        search: Type.Optional(Type.String()),
        categoryId: Type.Optional(Type.String())
    })
};

const ProductIdParamsSchema = {
    params: Type.Object({ id: Type.String() })
};

const PublicProductsParamsSchema = {
    params: Type.Object({ subdomain: Type.String() }),
    querystring: Type.Object({
        page: Type.Optional(Type.String()),
        limit: Type.Optional(Type.String()),
        search: Type.Optional(Type.String()),
        categoryId: Type.Optional(Type.String())
    })
};

const PublicProductIdParamsSchema = {
    params: Type.Object({
        subdomain: Type.String(),
        id: Type.String(),
    })
};

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

// ============================================================================
// ROUTES
// ============================================================================

export const productsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Params: { subdomain: string }, Querystring: { page?: string; limit?: string; search?: string; categoryId?: string } }>('/public/:subdomain/products', {
        schema: PublicProductsParamsSchema,
    }, async (request, reply) => {
        const { subdomain } = request.params;
        const query = request.query;

        const [tenant] = await db
            .select({ id: schema.tenants.id, currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, subdomain))
            .limit(1);

        if (!tenant) {
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
        }

        const page = parsePositiveInt(query.page, 1, 1, 1000);
        const limit = parsePositiveInt(query.limit, 20, 1, 100);
        const search = query.search?.trim() || '';
        const categoryId = query.categoryId;
        const offset = (page - 1) * limit;

        const conditions = [
            eq(schema.products.tenantId, tenant.id),
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
                currency: tenant.currency || 'UZS'
            }
        };
    });

    fastify.get<{ Params: { subdomain: string; id: string } }>('/public/:subdomain/products/:id', {
        schema: PublicProductIdParamsSchema,
    }, async (request, reply) => {
        const { subdomain, id } = request.params;

        const [tenant] = await db
            .select({ id: schema.tenants.id, currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, subdomain))
            .limit(1);

        if (!tenant) {
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
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
                eq(schema.products.id, id),
                eq(schema.products.tenantId, tenant.id),
                eq(schema.products.isActive, true)
            ))
            .limit(1);

        if (!product) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        const images = await db
            .select({
                id: schema.productImages.id,
                imageUrl: schema.productImages.url,
                sortOrder: schema.productImages.sortOrder,
            })
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, id))
            .orderBy(schema.productImages.sortOrder);

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
                currency: tenant.currency || 'UZS'
            }
        };
    });

    fastify.get<{ Params: { subdomain: string } }>('/public/:subdomain/categories', {
        schema: { params: Type.Object({ subdomain: Type.String() }) }
    }, async (request, reply) => {
        const { subdomain } = request.params;

        const [tenant] = await db
            .select({ id: schema.tenants.id })
            .from(schema.tenants)
            .where(eq(schema.tenants.subdomain, subdomain))
            .limit(1);

        if (!tenant) {
            return reply.status(404).send(createErrorResponse('TENANT_NOT_FOUND'));
        }

        const categories = await db
            .select({
                id: schema.categories.id,
                name: schema.categories.name,
            })
            .from(schema.categories)
            .where(eq(schema.categories.tenantId, tenant.id))
            .orderBy(schema.categories.name);

        const subcategories = await db
            .select({
                id: schema.subcategories.id,
                name: schema.subcategories.name,
                categoryId: schema.subcategories.categoryId,
            })
            .from(schema.subcategories)
            .where(eq(schema.subcategories.tenantId, tenant.id))
            .orderBy(schema.subcategories.name);

        return {
            success: true,
            data: { categories, subcategories }
        };
    });

    /**
     * Get available products for ordering with search and category filter
     */
    fastify.get('/products', {
        schema: ListProductsQuerySchema,
        preHandler: [requireCustomerAuth]
    }, async (request) => {
        const customerAuth = request.customerAuth!;
        const query = request.query as { page?: string; limit?: string; search?: string; categoryId?: string };

        const page = parsePositiveInt(query.page, 1, 1, 1000);
        const limit = parsePositiveInt(query.limit, 20, 1, 100);
        const search = query.search?.trim() || '';
        const categoryId = query.categoryId;
        const offset = (page - 1) * limit;

        // Build where clause
        const conditions = [
            eq(schema.products.tenantId, customerAuth.tenantId),
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
            .where(eq(schema.tenants.id, customerAuth.tenantId))
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
    });

    /**
     * Get single product details
     */
    fastify.get<{ Params: { id: string } }>('/products/:id', {
        schema: ProductIdParamsSchema,
        preHandler: [requireCustomerAuth]
    }, async (request, reply) => {
        const customerAuth = request.customerAuth!;

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
                eq(schema.products.id, request.params.id),
                eq(schema.products.tenantId, customerAuth.tenantId),
                eq(schema.products.isActive, true)
            ))
            .limit(1);

        if (!product) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }

        // Get product images
        const images = await db
            .select({
                id: schema.productImages.id,
                imageUrl: schema.productImages.url,
                sortOrder: schema.productImages.sortOrder,
            })
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, request.params.id))
            .orderBy(schema.productImages.sortOrder);

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, customerAuth.tenantId))
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
    });

    /**
     * Get product categories
     */
    fastify.get('/categories', {
        preHandler: [requireCustomerAuth]
    }, async (request) => {
        const customerAuth = request.customerAuth!;

        const categories = await db
            .select({
                id: schema.categories.id,
                name: schema.categories.name,
            })
            .from(schema.categories)
            .where(eq(schema.categories.tenantId, customerAuth.tenantId))
            .orderBy(schema.categories.name);

        const subcategories = await db
            .select({
                id: schema.subcategories.id,
                name: schema.subcategories.name,
                categoryId: schema.subcategories.categoryId,
            })
            .from(schema.subcategories)
            .where(eq(schema.subcategories.tenantId, customerAuth.tenantId))
            .orderBy(schema.subcategories.name);

        return {
            success: true,
            data: { categories, subcategories }
        };
    });
};
