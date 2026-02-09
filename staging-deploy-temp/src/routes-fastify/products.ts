import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and, sql, desc, or, ilike } from 'drizzle-orm';
import { logAudit } from '../lib/audit';

// Schemas
const CreateNameBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
});

const UpdateNameActiveBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    isActive: Type.Optional(Type.Boolean())
});

const CreateSubcategoryBodySchema = Type.Object({
    categoryId: Type.String(),
    name: Type.String({ minLength: 2 }),
});

const UpdateSubcategoryBodySchema = Type.Object({
    name: Type.Optional(Type.String({ minLength: 2 })),
    categoryId: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean())
});

const ParamsSchema = Type.Object({ id: Type.String() });

const ListProductsQuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
    subcategoryId: Type.Optional(Type.String()),
    categoryId: Type.Optional(Type.String()),
    brandId: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.String()),
});

const ImportMasterBodySchema = Type.Object({
    masterProductId: Type.String(),
    subcategoryId: Type.String(),
    brandId: Type.String(),
    price: Type.Number(),
    costPrice: Type.Optional(Type.Number()),
    stock: Type.Optional(Type.Number())
});

const CreateProductBodySchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    sku: Type.String({ minLength: 2 }),
    description: Type.Optional(Type.String()),
    subcategoryId: Type.String({ minLength: 10 }),
    brandId: Type.String({ minLength: 10 }),
    unit: Type.String(),
    price: Type.Number({ minimum: 0 }),
    costPrice: Type.Optional(Type.Number({ minimum: 0 })),
    taxRate: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    imageUrl: Type.Optional(Type.String())
});

const UpdateProductBodySchema = Type.Object({
    name: Type.Optional(Type.String()),
    sku: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    subcategoryId: Type.Optional(Type.String()),
    brandId: Type.Optional(Type.String()),
    unit: Type.Optional(Type.String()),
    price: Type.Optional(Type.Number()),
    costPrice: Type.Optional(Type.Number()),
    taxRate: Type.Optional(Type.Number()),
    imageUrl: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean())
});

const AddImageBodySchema = Type.Object({
    images: Type.Optional(Type.Array(Type.Object({
        url: Type.String(),
        thumbnailUrl: Type.Optional(Type.String()),
        mediumUrl: Type.Optional(Type.String()),
        altText: Type.Optional(Type.String()),
        isPrimary: Type.Optional(Type.Boolean()),
        sortOrder: Type.Optional(Type.Number())
    }))),
    url: Type.Optional(Type.String()),
    thumbnailUrl: Type.Optional(Type.String()),
    mediumUrl: Type.Optional(Type.String()),
    altText: Type.Optional(Type.String()),
    isPrimary: Type.Optional(Type.Boolean()),
    sortOrder: Type.Optional(Type.Number())
});

type CreateNameBody = Static<typeof CreateNameBodySchema>;
type UpdateNameActiveBody = Static<typeof UpdateNameActiveBodySchema>;
type CreateSubcategoryBody = Static<typeof CreateSubcategoryBodySchema>;
type UpdateSubcategoryBody = Static<typeof UpdateSubcategoryBodySchema>;
type ListProductsQuery = Static<typeof ListProductsQuerySchema>;
type ImportMasterBody = Static<typeof ImportMasterBodySchema>;
type CreateProductBody = Static<typeof CreateProductBodySchema>;
type UpdateProductBody = Static<typeof UpdateProductBodySchema>;
type AddImageBody = Static<typeof AddImageBodySchema>;

export const productRoutes: FastifyPluginAsync = async (fastify) => {

    // ----------------------------------------------------------------
    // CATEGORIES
    // ----------------------------------------------------------------

    fastify.get('/categories', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const categories = await db
            .select()
            .from(schema.categories)
            .where(and(eq(schema.categories.tenantId, user.tenantId), eq(schema.categories.isActive, true)))
            .orderBy(schema.categories.name);
        return { success: true, data: categories };
    });

    fastify.post<{ Body: CreateNameBody }>('/categories', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateNameBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [category] = await db.insert(schema.categories).values({
            tenantId: user.tenantId,
            name: request.body.name,
            isActive: true,
        }).returning();

        return { success: true, data: category };
    });

    fastify.put<{ Params: Static<typeof ParamsSchema>; Body: UpdateNameActiveBody }>('/categories/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: UpdateNameActiveBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [category] = await db.update(schema.categories)
            .set({
                ...(request.body.name ? { name: request.body.name } : {}),
                ...(request.body.isActive !== undefined ? { isActive: request.body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.categories.id, request.params.id), eq(schema.categories.tenantId, user.tenantId)))
            .returning();

        if (!category) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: category };
    });

    fastify.delete<{ Params: Static<typeof ParamsSchema> }>('/categories/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        try {
            const [deleted] = await db.delete(schema.categories)
                .where(and(eq(schema.categories.id, request.params.id), eq(schema.categories.tenantId, user.tenantId)))
                .returning();

            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete category with associated subcategories.' } });
            throw err;
        }
    });

    // ----------------------------------------------------------------
    // SUBCATEGORIES
    // ----------------------------------------------------------------

    fastify.get<{ Querystring: { categoryId?: string } }>('/subcategories', {
        preHandler: [fastify.authenticate],
        schema: { querystring: Type.Object({ categoryId: Type.Optional(Type.String()) }) }
    }, async (request, reply) => {
        const user = request.user!;
        const { categoryId } = request.query;
        const conditions = [eq(schema.subcategories.tenantId, user.tenantId), eq(schema.subcategories.isActive, true)];

        if (categoryId) conditions.push(eq(schema.subcategories.categoryId, categoryId));

        const subcategories = await db.select()
            .from(schema.subcategories)
            .where(and(...conditions))
            .orderBy(schema.subcategories.name);

        return { success: true, data: subcategories };
    });

    fastify.post<{ Body: CreateSubcategoryBody }>('/subcategories', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateSubcategoryBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [subcategory] = await db.insert(schema.subcategories).values({
            tenantId: user.tenantId,
            categoryId: request.body.categoryId,
            name: request.body.name,
            isActive: true,
        }).returning();

        return { success: true, data: subcategory };
    });

    fastify.put<{ Params: Static<typeof ParamsSchema>; Body: UpdateSubcategoryBody }>('/subcategories/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: UpdateSubcategoryBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [subcategory] = await db.update(schema.subcategories)
            .set({
                ...(request.body.name ? { name: request.body.name } : {}),
                ...(request.body.categoryId ? { categoryId: request.body.categoryId } : {}),
                ...(request.body.isActive !== undefined ? { isActive: request.body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.subcategories.id, request.params.id), eq(schema.subcategories.tenantId, user.tenantId)))
            .returning();

        if (!subcategory) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: subcategory };
    });

    fastify.delete<{ Params: Static<typeof ParamsSchema> }>('/subcategories/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        try {
            const [deleted] = await db.delete(schema.subcategories)
                .where(and(eq(schema.subcategories.id, request.params.id), eq(schema.subcategories.tenantId, user.tenantId)))
                .returning();

            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete subcategory with associated products.' } });
            throw err;
        }
    });

    // ----------------------------------------------------------------
    // BRANDS
    // ----------------------------------------------------------------

    fastify.get('/brands', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = request.user!;
        const brands = await db.select()
            .from(schema.brands)
            .where(and(eq(schema.brands.tenantId, user.tenantId), eq(schema.brands.isActive, true)))
            .orderBy(schema.brands.name);
        return { success: true, data: brands };
    });

    fastify.post<{ Body: CreateNameBody }>('/brands', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateNameBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [brand] = await db.insert(schema.brands).values({
            tenantId: user.tenantId,
            name: request.body.name,
            isActive: true,
        }).returning();

        return { success: true, data: brand };
    });

    fastify.put<{ Params: Static<typeof ParamsSchema>; Body: UpdateNameActiveBody }>('/brands/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: UpdateNameActiveBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [brand] = await db.update(schema.brands)
            .set({
                ...(request.body.name ? { name: request.body.name } : {}),
                ...(request.body.isActive !== undefined ? { isActive: request.body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.brands.id, request.params.id), eq(schema.brands.tenantId, user.tenantId)))
            .returning();

        if (!brand) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return { success: true, data: brand };
    });

    fastify.delete<{ Params: Static<typeof ParamsSchema> }>('/brands/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        try {
            const [deleted] = await db.delete(schema.brands)
                .where(and(eq(schema.brands.id, request.params.id), eq(schema.brands.tenantId, user.tenantId)))
                .returning();

            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete brand with associated products.' } });
            throw err;
        }
    });

    // ----------------------------------------------------------------
    // PRODUCTS
    // ----------------------------------------------------------------

    // List Master Catalog
    fastify.get<{ Querystring: ListProductsQuery }>('/master-catalog', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListProductsQuerySchema }
    }, async (request, reply) => {
        const limit = Number(request.query.limit) || 20;
        const page = Number(request.query.page) || 1;
        const offset = (page - 1) * limit;
        const search = request.query.search || '';

        let whereClause = undefined;
        if (search) {
            whereClause = or(
                ilike(schema.masterProducts.name, `%${search}%`),
                ilike(schema.masterProducts.sku, `%${search}%`),
                ilike(schema.masterProducts.category, `%${search}%`)
            );
        }

        const masterItems = await db.select()
            .from(schema.masterProducts)
            .where(whereClause)
            .limit(limit)
            .offset(offset)
            .orderBy(desc(schema.masterProducts.createdAt));

        return { success: true, data: masterItems };
    });

    // Import from Master Catalog
    fastify.post<{ Body: ImportMasterBody }>('/import-master', {
        preHandler: [fastify.authenticate],
        schema: { body: ImportMasterBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { masterProductId, price, costPrice, stock } = request.body;

        const masterProduct = await db.select()
            .from(schema.masterProducts)
            .where(eq(schema.masterProducts.id, masterProductId))
            .limit(1);

        if (!masterProduct.length) return reply.send({ success: false, error: 'Master product not found' });
        const mp = masterProduct[0];

        try {
            const newProduct = await db.insert(schema.products).values({
                tenantId: user.tenantId,
                subcategoryId: request.body.subcategoryId,
                brandId: request.body.brandId,
                name: mp.name,
                description: mp.description,
                sku: mp.sku,
                barcode: mp.barcode,
                imageUrl: mp.imageUrl,
                unit: 'piece',
                price: price.toString(),
                costPrice: costPrice?.toString() || '0',
                stockQuantity: stock || 0,
                isActive: true
            }).returning();

            await logAudit('product.import', { masterId: mp.id, newId: newProduct[0].id }, user.id, user.tenantId, newProduct[0].id, 'product');
            return { success: true, data: newProduct[0] };

        } catch (e: any) {
            if (e.code === '23505') return reply.send({ success: false, error: 'Product with this SKU already exists' });
            throw e;
        }
    });

    // List products
    fastify.get<{ Querystring: ListProductsQuery }>('/', {
        preHandler: [fastify.authenticate],
        schema: { querystring: ListProductsQuerySchema }
    }, async (request, reply) => {
        const user = request.user!;
        const { page: pageStr = '1', limit: limitStr = '20', search, subcategoryId, categoryId, brandId, isActive } = request.query;

        const page = parseInt(pageStr);
        const limit = parseInt(limitStr);
        const offset = (page - 1) * limit;

        const conditions: any[] = [eq(schema.products.tenantId, user.tenantId)];

        if (search) {
            conditions.push(
                sql`(${schema.products.name} ILIKE ${`%${search}%`} OR ${schema.products.sku} ILIKE ${`%${search}%`})`
            );
        }
        if (subcategoryId) conditions.push(eq(schema.products.subcategoryId, subcategoryId));
        if (brandId) conditions.push(eq(schema.products.brandId, brandId));
        if (isActive !== undefined) conditions.push(eq(schema.products.isActive, isActive === 'true'));

        if (categoryId) {
            const subcategoriesInCategory = await db
                .select({ id: schema.subcategories.id })
                .from(schema.subcategories)
                .where(eq(schema.subcategories.categoryId, categoryId));

            if (subcategoriesInCategory.length > 0) {
                conditions.push(
                    sql`${schema.products.subcategoryId} IN (${sql.join(subcategoriesInCategory.map(s => sql`${s.id}`), sql`, `)})`
                );
            } else {
                return {
                    success: true,
                    data: [],
                    meta: { page, limit, total: 0, totalPages: 0 },
                };
            }
        }

        if (user.role === 'sales_rep') {
            const userBrandIds = await db
                .select({ brandId: schema.userBrands.brandId })
                .from(schema.userBrands)
                .where(eq(schema.userBrands.userId, user.id));

            if (userBrandIds.length > 0) {
                conditions.push(sql`${schema.products.brandId} IN (${sql.join(userBrandIds.map(b => sql`${b.brandId}`), sql`, `)})`);
            }
        }

        const products = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                sku: schema.products.sku,
                price: schema.products.price,
                costPrice: schema.products.costPrice,
                stockQuantity: schema.products.stockQuantity,
                unit: schema.products.unit,
                isActive: schema.products.isActive,
                description: schema.products.description,
                taxRate: schema.products.taxRate,
                subcategoryId: schema.products.subcategoryId,
                brandId: schema.products.brandId,
                imageUrl: schema.products.imageUrl,
                subcategoryName: schema.subcategories.name,
                categoryName: schema.categories.name,
                brandName: schema.brands.name,
            })
            .from(schema.products)
            .leftJoin(schema.subcategories, eq(schema.products.subcategoryId, schema.subcategories.id))
            .leftJoin(schema.categories, eq(schema.subcategories.categoryId, schema.categories.id))
            .leftJoin(schema.brands, eq(schema.products.brandId, schema.brands.id))
            .where(and(...conditions))
            .orderBy(desc(schema.products.createdAt))
            .limit(limit)
            .offset(offset);

        const productIds = products.map(p => p.id);
        const primaryImages = productIds.length > 0 ? await db
            .select({
                productId: schema.productImages.productId,
                thumbnailUrl: schema.productImages.thumbnailUrl,
                url: schema.productImages.url,
            })
            .from(schema.productImages)
            .where(and(
                sql`${schema.productImages.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
                eq(schema.productImages.isPrimary, true)
            )) : [];

        const imageMap = new Map(primaryImages.map(img => [img.productId, img.thumbnailUrl || img.url]));
        const productsWithImages = products.map(p => ({
            ...p,
            imageUrl: imageMap.get(p.id) || p.imageUrl || null
        }));

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.products)
            .where(and(...conditions));

        return {
            success: true,
            data: productsWithImages,
            meta: {
                page: pageStr,
                limit: limitStr,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
            },
        };
    });

    // Create product
    fastify.post<{ Body: CreateProductBody }>('/', {
        preHandler: [fastify.authenticate],
        schema: { body: CreateProductBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const { canCreateProduct } = await import('../lib/planLimits');
        const limitCheck = await canCreateProduct(user.tenantId);
        if (!limitCheck.allowed) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'LIMIT_EXCEEDED',
                    message: `Product limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                }
            });
        }

        const [existing] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.tenantId, user.tenantId), eq(schema.products.sku, request.body.sku)))
            .limit(1);

        if (existing) {
            return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'SKU already exists' } });
        }

        const [product] = await db.insert(schema.products).values({
            tenantId: user.tenantId,
            name: request.body.name,
            sku: request.body.sku,
            description: request.body.description,
            subcategoryId: request.body.subcategoryId,
            brandId: request.body.brandId,
            unit: request.body.unit as any,
            price: request.body.price.toString(),
            costPrice: request.body.costPrice?.toString(),
            taxRate: request.body.taxRate?.toString(),
            stockQuantity: 0,
            imageUrl: request.body.imageUrl,
            isActive: true,
        }).returning();

        return { success: true, data: product };
    });

    // Get product
    fastify.get<{ Params: Static<typeof ParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        const [product] = await db
            .select({
                id: schema.products.id,
                name: schema.products.name,
                sku: schema.products.sku,
                description: schema.products.description,
                price: schema.products.price,
                costPrice: schema.products.costPrice,
                stockQuantity: schema.products.stockQuantity,
                unit: schema.products.unit,
                isActive: schema.products.isActive,
                taxRate: schema.products.taxRate,
                imageUrl: schema.products.imageUrl,
                subcategoryId: schema.products.subcategoryId,
                brandId: schema.products.brandId,
                subcategoryName: schema.subcategories.name,
                categoryName: schema.categories.name,
                brandName: schema.brands.name,
            })
            .from(schema.products)
            .leftJoin(schema.subcategories, eq(schema.products.subcategoryId, schema.subcategories.id))
            .leftJoin(schema.categories, eq(schema.subcategories.categoryId, schema.categories.id))
            .leftJoin(schema.brands, eq(schema.products.brandId, schema.brands.id))
            .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const images = await db
            .select({
                id: schema.productImages.id,
                url: schema.productImages.url,
                thumbnailUrl: schema.productImages.thumbnailUrl,
                mediumUrl: schema.productImages.mediumUrl,
                altText: schema.productImages.altText,
                isPrimary: schema.productImages.isPrimary,
                sortOrder: schema.productImages.sortOrder,
            })
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, request.params.id))
            .orderBy(schema.productImages.sortOrder);

        return {
            success: true,
            data: {
                ...product,
                images: images.length > 0 ? images : (product.imageUrl ? [{
                    id: 'main',
                    url: product.imageUrl,
                    thumbnailUrl: product.imageUrl,
                    mediumUrl: product.imageUrl,
                    isPrimary: true,
                    sortOrder: 0
                }] : [])
            }
        };
    });

    // Update product
    fastify.put<{ Params: Static<typeof ParamsSchema>; Body: UpdateProductBody }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: UpdateProductBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [existing] = await db.select().from(schema.products)
            .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        if (request.body.sku && request.body.sku !== existing.sku) {
            const [skuCheck] = await db
                .select({ id: schema.products.id })
                .from(schema.products)
                .where(and(eq(schema.products.tenantId, user.tenantId), eq(schema.products.sku, request.body.sku)))
                .limit(1);
            if (skuCheck) return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'SKU already exists' } });
        }

        const updateData: any = { updatedAt: new Date() };
        if (request.body.name !== undefined) updateData.name = request.body.name;
        if (request.body.sku !== undefined) updateData.sku = request.body.sku;
        if (request.body.description !== undefined) updateData.description = request.body.description;
        if (request.body.subcategoryId !== undefined) updateData.subcategoryId = request.body.subcategoryId;
        if (request.body.brandId !== undefined) updateData.brandId = request.body.brandId;
        if (request.body.unit !== undefined) updateData.unit = request.body.unit;
        if (request.body.price !== undefined) updateData.price = request.body.price.toString();
        if (request.body.costPrice !== undefined) updateData.costPrice = request.body.costPrice.toString();
        if (request.body.taxRate !== undefined) updateData.taxRate = request.body.taxRate.toString();
        if (request.body.imageUrl !== undefined) updateData.imageUrl = request.body.imageUrl;
        if (request.body.isActive !== undefined) updateData.isActive = request.body.isActive;

        const [product] = await db.update(schema.products)
            .set(updateData)
            .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId)))
            .returning();

        return { success: true, data: product };
    });

    // Delete product
    fastify.delete<{ Params: Static<typeof ParamsSchema> }>('/:id', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        try {
            const [deleted] = await db.delete(schema.products)
                .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId)))
                .returning();

            if (!deleted) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete product because it is used in orders or inventory.' } });
            throw err;
        }
    });

    // ----------------------------------------------------------------
    // PRODUCT IMAGES
    // ----------------------------------------------------------------

    fastify.get<{ Params: Static<typeof ParamsSchema> }>('/:id/images', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema }
    }, async (request, reply) => {
        const user = request.user!;
        const [product] = await db.select({ id: schema.products.id }).from(schema.products)
            .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId))).limit(1);

        if (!product) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const images = await db.select().from(schema.productImages)
            .where(eq(schema.productImages.productId, request.params.id))
            .orderBy(schema.productImages.sortOrder);

        return { success: true, data: images };
    });

    fastify.post<{ Params: Static<typeof ParamsSchema>; Body: AddImageBody }>('/:id/images', {
        preHandler: [fastify.authenticate],
        schema: { params: ParamsSchema, body: AddImageBodySchema }
    }, async (request, reply) => {
        const user = request.user!;
        if (!['tenant_admin', 'super_admin'].includes(user.role)) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });

        const [product] = await db.select({ id: schema.products.id }).from(schema.products)
            .where(and(eq(schema.products.id, request.params.id), eq(schema.products.tenantId, user.tenantId))).limit(1);

        if (!product) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        console.log('[ProductImages] Saving images for product:', request.params.id, 'body:', JSON.stringify(request.body).substring(0, 200));

        if (request.body.images && Array.isArray(request.body.images)) {
            console.log('[ProductImages] Deleting existing images for product:', request.params.id);
            await db.delete(schema.productImages).where(eq(schema.productImages.productId, request.params.id));

            if (request.body.images.length > 0) {
                const insertData = request.body.images.map(img => ({
                    productId: request.params.id,
                    url: img.url,
                    thumbnailUrl: img.thumbnailUrl,
                    mediumUrl: img.mediumUrl,
                    altText: img.altText,
                    isPrimary: img.isPrimary || false,
                    sortOrder: img.sortOrder || 0
                }));
                console.log('[ProductImages] Inserting images:', insertData.length);
                await db.insert(schema.productImages).values(insertData);
                console.log('[ProductImages] Insert complete');
            }
        } else if (request.body.url) {
            await db.insert(schema.productImages).values({
                productId: request.params.id,
                url: request.body.url,
                thumbnailUrl: request.body.thumbnailUrl,
                mediumUrl: request.body.mediumUrl,
                altText: request.body.altText,
                isPrimary: request.body.isPrimary || false,
                sortOrder: request.body.sortOrder || 0
            });
        }

        const images = await db.select().from(schema.productImages)
            .where(eq(schema.productImages.productId, request.params.id))
            .orderBy(schema.productImages.sortOrder);

        console.log('[ProductImages] Returning images:', images.length);
        return { success: true, data: images };
    });
};
