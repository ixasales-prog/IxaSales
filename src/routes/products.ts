import { Elysia, t } from 'elysia';
import { db, schema } from '../db';
import { authPlugin } from '../lib/auth';
import { eq, and, sql, desc, or, ilike } from 'drizzle-orm';
import { logAudit } from '../lib/audit';

export const productRoutes = new Elysia({ prefix: '/products' })
    .use(authPlugin)

    // ----------------------------------------------------------------
    // CATEGORIES
    // ----------------------------------------------------------------

    // List categories
    .get('/categories', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const categories = await db
            .select()
            .from(schema.categories)
            .where(and(eq(schema.categories.tenantId, user.tenantId), eq(schema.categories.isActive, true)))
            .orderBy(schema.categories.name);

        return { success: true, data: categories };
    })

    // Create category
    .post('/categories', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [category] = await db
            .insert(schema.categories)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                isActive: true, // removed description
            })
            .returning();

        return { success: true, data: category };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            // description removed
        })
    })

    // Update category
    .put('/categories/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [category] = await db
            .update(schema.categories)
            .set({
                ...(body.name ? { name: body.name } : {}),
                ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.categories.id, params.id), eq(schema.categories.tenantId, user.tenantId)))
            .returning();

        if (!category) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        return { success: true, data: category };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String({ minLength: 2 })),
            isActive: t.Optional(t.Boolean())
        })
    })

    // Delete category
    .delete('/categories/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.categories)
                .where(and(eq(schema.categories.id, params.id), eq(schema.categories.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') { // FK violation
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete category with associated subcategories.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // SUBCATEGORIES
    // ----------------------------------------------------------------

    // List subcategories
    .get('/subcategories', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { categoryId } = query;
        const conditions = [eq(schema.subcategories.tenantId, user.tenantId), eq(schema.subcategories.isActive, true)];

        if (categoryId) conditions.push(eq(schema.subcategories.categoryId, categoryId));

        const subcategories = await db
            .select()
            .from(schema.subcategories)
            .where(and(...conditions))
            .orderBy(schema.subcategories.name);

        return { success: true, data: subcategories };
    }, {
        query: t.Object({
            categoryId: t.Optional(t.String())
        })
    })

    // Create subcategory
    .post('/subcategories', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [subcategory] = await db
            .insert(schema.subcategories)
            .values({
                tenantId: user.tenantId,
                categoryId: body.categoryId,
                name: body.name,
                isActive: true,
            })
            .returning();

        return { success: true, data: subcategory };
    }, {
        body: t.Object({
            categoryId: t.String(),
            name: t.String({ minLength: 2 }),
        })
    })

    // Update subcategory
    .put('/subcategories/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [subcategory] = await db
            .update(schema.subcategories)
            .set({
                ...(body.name ? { name: body.name } : {}),
                ...(body.categoryId ? { categoryId: body.categoryId } : {}),
                ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.subcategories.id, params.id), eq(schema.subcategories.tenantId, user.tenantId)))
            .returning();

        if (!subcategory) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        return { success: true, data: subcategory };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String({ minLength: 2 })),
            categoryId: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean())
        })
    })

    // Delete subcategory
    .delete('/subcategories/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.subcategories)
                .where(and(eq(schema.subcategories.id, params.id), eq(schema.subcategories.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') { // FK violation
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete subcategory with associated products.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // BRANDS
    // ----------------------------------------------------------------

    // List brands
    .get('/brands', async (ctx) => {
        const { user, isAuthenticated, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const brands = await db
            .select()
            .from(schema.brands)
            .where(and(eq(schema.brands.tenantId, user.tenantId), eq(schema.brands.isActive, true)))
            .orderBy(schema.brands.name);

        return { success: true, data: brands };
    })

    // Create brand
    .post('/brands', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [brand] = await db
            .insert(schema.brands)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                isActive: true,
            })
            .returning();

        return { success: true, data: brand };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
        })
    })

    // Update brand
    .put('/brands/:id', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        const [brand] = await db
            .update(schema.brands)
            .set({
                ...(body.name ? { name: body.name } : {}),
                ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
                updatedAt: new Date()
            })
            .where(and(eq(schema.brands.id, params.id), eq(schema.brands.tenantId, user.tenantId)))
            .returning();

        if (!brand) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        return { success: true, data: brand };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String({ minLength: 2 })),
            isActive: t.Optional(t.Boolean())
        })
    })

    // Delete brand
    .delete('/brands/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.brands)
                .where(and(eq(schema.brands.id, params.id), eq(schema.brands.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }
            return { success: true, data: deleted };
        } catch (err: any) {
            if (err.code === '23503') { // FK violation
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete brand with associated products.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // PRODUCTS
    // ----------------------------------------------------------------

    // List Master Catalog (for browsing)
    .get('/master-catalog', async ({ query, user }: any) => {
        const limit = Number(query.limit) || 20;
        const page = Number(query.page) || 1;
        const offset = (page - 1) * limit;
        const search = query.search || '';

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
    })


    // Import from Master Catalog
    .post('/import-master', async ({ body, user }: any) => {
        const { masterProductId, price, costPrice, stock } = body;

        // 1. Get Master Product
        const masterProduct = await db.select()
            .from(schema.masterProducts)
            .where(eq(schema.masterProducts.id, masterProductId))
            .limit(1);

        if (!masterProduct.length) {
            return { success: false, error: 'Master product not found' };
        }
        const mp = masterProduct[0];

        // Ensure subcategory and brand provided
        if (!body.subcategoryId || !body.brandId) {
            return { success: false, error: 'Target Subcategory and Brand are required' };
        }

        // 3. Create Product
        try {
            const newProduct = await db.insert(schema.products).values({
                tenantId: user.tenantId,
                subcategoryId: body.subcategoryId,
                brandId: body.brandId,
                name: mp.name, // Uzbek name
                description: mp.description,
                sku: mp.sku,
                barcode: mp.barcode,
                imageUrl: mp.imageUrl,
                unit: 'piece',
                price: price || 0,
                costPrice: costPrice || 0,
                stockQuantity: stock || 0,
            }).returning();

            await logAudit('product.import', { masterId: mp.id, newId: newProduct[0].id }, user.id, user.tenantId, newProduct[0].id, 'product');
            return { success: true, data: newProduct[0] };

        } catch (e: any) {
            if (e.code === '23505') {
                return { success: false, error: 'Product with this SKU already exists' };
            }
            throw e;
        }

    }, {
        body: t.Object({
            masterProductId: t.String(),
            subcategoryId: t.String(),
            brandId: t.String(),
            price: t.Number(),
            costPrice: t.Optional(t.Number()),
            stock: t.Optional(t.Number())
        })
    })

    // List products
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        const { page = 1, limit = 20, search, subcategoryId, categoryId, brandId, isActive } = query;
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

        // Category filter - get all subcategories for this category
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
                // No subcategories in this category - return empty result
                return {
                    success: true,
                    data: [],
                    meta: { page, limit, total: 0, totalPages: 0 },
                };
            }
        }

        // Sales rep can only see products from assigned brands
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
                imageUrl: schema.products.imageUrl, // Include direct imageUrl field
                subcategoryName: schema.subcategories.name, // Join subcategory
                categoryName: schema.categories.name, // Join category via subcategory
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

        // Fetch primary images from productImages table (for gallery support)
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

        // Map gallery images to products, fallback to direct imageUrl field
        const imageMap = new Map(primaryImages.map(img => [img.productId, img.thumbnailUrl || img.url]));
        const productsWithImages = products.map(p => ({
            ...p,
            // Prefer gallery primary image, fallback to direct imageUrl field
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
            search: t.Optional(t.String()),
            subcategoryId: t.Optional(t.String()),
            categoryId: t.Optional(t.String()),
            brandId: t.Optional(t.String()),
            isActive: t.Optional(t.String()),
        })
    })

    // Create product
    .post('/', async (ctx) => {
        const { user, isAuthenticated, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Check plan limits
        const { canCreateProduct } = await import('../lib/planLimits');
        const limitCheck = await canCreateProduct(user.tenantId);
        if (!limitCheck.allowed) {
            set.status = 403;
            return {
                success: false,
                error: {
                    code: 'LIMIT_EXCEEDED',
                    message: `Product limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan.`
                }
            };
        }

        // Check SKU uniqueness
        const [existing] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.tenantId, user.tenantId), eq(schema.products.sku, body.sku)))
            .limit(1);

        if (existing) {
            set.status = 409;
            return { success: false, error: { code: 'CONFLICT', message: 'SKU already exists' } };
        }

        const [product] = await db
            .insert(schema.products)
            .values({
                tenantId: user.tenantId,
                name: body.name,
                sku: body.sku,
                description: body.description,
                subcategoryId: body.subcategoryId, // Use subcategoryId
                brandId: body.brandId,
                unit: body.unit,
                price: body.price.toString(),
                costPrice: body.costPrice?.toString(),
                taxRate: body.taxRate?.toString(),
                stockQuantity: 0,
                imageUrl: body.imageUrl,
                isActive: true,
            })
            .returning();

        return { success: true, data: product };
    }, {
        body: t.Object({
            name: t.String({ minLength: 2 }),
            sku: t.String({ minLength: 2 }),
            description: t.Optional(t.String()),
            subcategoryId: t.String({ minLength: 10 }), // Ensure not empty
            brandId: t.String({ minLength: 10 }), // Ensure not empty
            unit: t.String(),
            price: t.Number({ minimum: 0 }),
            costPrice: t.Optional(t.Number({ minimum: 0 })),
            taxRate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
            imageUrl: t.Optional(t.String())
        })
    })

    // Get product by ID with all images
    .get('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

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
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Fetch all images for this product
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
            .where(eq(schema.productImages.productId, params.id))
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
    }, {
        params: t.Object({ id: t.String() })
    })

    // Update product
    .put('/:id', async (ctx) => {
        const { user, isAuthenticated, body, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Check if product exists
        const [existing] = await db
            .select()
            .from(schema.products)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!existing) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Check SKU uniqueness if changed
        if (body.sku && body.sku !== existing.sku) {
            const [skuCheck] = await db
                .select({ id: schema.products.id })
                .from(schema.products)
                .where(and(eq(schema.products.tenantId, user.tenantId), eq(schema.products.sku, body.sku)))
                .limit(1);
            if (skuCheck) {
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'SKU already exists' } };
            }
        }

        // Build update object with proper type conversions
        const updateData: any = { updatedAt: new Date() };
        if (body.name !== undefined) updateData.name = body.name;
        if (body.sku !== undefined) updateData.sku = body.sku;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.subcategoryId !== undefined) updateData.subcategoryId = body.subcategoryId;
        if (body.brandId !== undefined) updateData.brandId = body.brandId;
        if (body.unit !== undefined) updateData.unit = body.unit;
        if (body.price !== undefined) updateData.price = body.price.toString();
        if (body.costPrice !== undefined) updateData.costPrice = body.costPrice.toString();
        if (body.taxRate !== undefined) updateData.taxRate = body.taxRate.toString();
        if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
        if (body.isActive !== undefined) updateData.isActive = body.isActive;

        const [product] = await db
            .update(schema.products)
            .set(updateData)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .returning();

        return { success: true, data: product };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            name: t.Optional(t.String()),
            sku: t.Optional(t.String()),
            description: t.Optional(t.String()),
            subcategoryId: t.Optional(t.String()),
            brandId: t.Optional(t.String()),
            unit: t.Optional(t.String()),
            price: t.Optional(t.Number()),
            costPrice: t.Optional(t.Number()),
            taxRate: t.Optional(t.Number()),
            imageUrl: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean())
        })
    })

    // Delete product
    .delete('/:id', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        try {
            const [deleted] = await db
                .delete(schema.products)
                .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
                .returning();

            if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

            return { success: true, data: deleted };
        } catch (err: any) {
            // Check for foreign key violation
            if (err.code === '23503') {
                set.status = 409;
                return { success: false, error: { code: 'CONFLICT', message: 'Cannot delete product because it is used in orders or inventory.' } };
            }
            throw err;
        }
    }, {
        params: t.Object({ id: t.String() })
    })

    // ----------------------------------------------------------------
    // PRODUCT IMAGES (Gallery)
    // ----------------------------------------------------------------

    // List images for a product
    .get('/:id/images', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }

        // Verify product belongs to user's tenant
        const [product] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        const images = await db
            .select()
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, params.id))
            .orderBy(schema.productImages.sortOrder);

        return { success: true, data: images };
    }, {
        params: t.Object({ id: t.String() })
    })

    // Add image to product
    .post('/:id/images', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Verify product belongs to user's tenant
        const [product] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // Count existing images to set sortOrder
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, params.id));

        // Check if body contains array of images (batch mode) or single image
        if (body.images && Array.isArray(body.images)) {
            // Batch mode: delete existing images and insert new ones
            await db
                .delete(schema.productImages)
                .where(eq(schema.productImages.productId, params.id));

            const imagesToInsert = body.images.map((img: any, index: number) => ({
                productId: params.id,
                url: img.url,
                thumbnailUrl: img.thumbnailUrl,
                mediumUrl: img.mediumUrl,
                altText: img.altText,
                sortOrder: img.sortOrder ?? index,
                isPrimary: img.isPrimary ?? index === 0,
            }));

            if (imagesToInsert.length > 0) {
                await db.insert(schema.productImages).values(imagesToInsert);
            }

            return { success: true, data: { count: imagesToInsert.length } };
        }

        // Single image mode (legacy)
        const isFirst = Number(count) === 0;

        const [image] = await db
            .insert(schema.productImages)
            .values({
                productId: params.id,
                url: body.url,
                thumbnailUrl: body.thumbnailUrl,
                mediumUrl: body.mediumUrl,
                altText: body.altText,
                sortOrder: Number(count),
                isPrimary: isFirst,
            })
            .returning();

        // If this is the first image, also update the product's imageUrl
        if (isFirst) {
            await db
                .update(schema.products)
                .set({ imageUrl: body.mediumUrl || body.url })
                .where(eq(schema.products.id, params.id));
        }

        return { success: true, data: image };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            url: t.Optional(t.String()),
            thumbnailUrl: t.Optional(t.String()),
            mediumUrl: t.Optional(t.String()),
            altText: t.Optional(t.String()),
            images: t.Optional(t.Array(t.Object({
                url: t.String(),
                thumbnailUrl: t.Optional(t.String()),
                mediumUrl: t.Optional(t.String()),
                altText: t.Optional(t.String()),
                isPrimary: t.Optional(t.Boolean()),
                sortOrder: t.Optional(t.Number())
            })))
        })
    })

    // Update image (alt text, order, primary)
    .put('/:id/images/:imageId', async (ctx) => {
        const { user, isAuthenticated, params, body, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Verify product belongs to user's tenant
        const [product] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // If setting as primary, unset other primary images first
        if (body.isPrimary) {
            await db
                .update(schema.productImages)
                .set({ isPrimary: false })
                .where(eq(schema.productImages.productId, params.id));
        }

        const [image] = await db
            .update(schema.productImages)
            .set({
                ...(body.altText !== undefined ? { altText: body.altText } : {}),
                ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
                ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
            })
            .where(and(eq(schema.productImages.id, params.imageId), eq(schema.productImages.productId, params.id)))
            .returning();

        if (!image) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // If set as primary, update product's imageUrl
        if (body.isPrimary) {
            await db
                .update(schema.products)
                .set({ imageUrl: image.mediumUrl || image.url })
                .where(eq(schema.products.id, params.id));
        }

        return { success: true, data: image };
    }, {
        params: t.Object({ id: t.String(), imageId: t.String() }),
        body: t.Object({
            altText: t.Optional(t.String()),
            sortOrder: t.Optional(t.Number()),
            isPrimary: t.Optional(t.Boolean())
        })
    })

    // Delete image
    .delete('/:id/images/:imageId', async (ctx) => {
        const { user, isAuthenticated, params, set } = ctx as any;
        if (!isAuthenticated) { set.status = 401; return { success: false, error: { code: 'UNAUTHORIZED' } }; }
        if (!['tenant_admin', 'super_admin'].includes(user.role)) { set.status = 403; return { success: false, error: { code: 'FORBIDDEN' } }; }

        // Verify product belongs to user's tenant
        const [product] = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.id, params.id), eq(schema.products.tenantId, user.tenantId)))
            .limit(1);

        if (!product) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        const [deleted] = await db
            .delete(schema.productImages)
            .where(and(eq(schema.productImages.id, params.imageId), eq(schema.productImages.productId, params.id)))
            .returning();

        if (!deleted) { set.status = 404; return { success: false, error: { code: 'NOT_FOUND' } }; }

        // If deleted image was primary, set next image as primary
        if (deleted.isPrimary) {
            const [nextImage] = await db
                .select()
                .from(schema.productImages)
                .where(eq(schema.productImages.productId, params.id))
                .orderBy(schema.productImages.sortOrder)
                .limit(1);

            if (nextImage) {
                await db
                    .update(schema.productImages)
                    .set({ isPrimary: true })
                    .where(eq(schema.productImages.id, nextImage.id));

                await db
                    .update(schema.products)
                    .set({ imageUrl: nextImage.mediumUrl || nextImage.url })
                    .where(eq(schema.products.id, params.id));
            } else {
                // No more images, clear product imageUrl
                await db
                    .update(schema.products)
                    .set({ imageUrl: null })
                    .where(eq(schema.products.id, params.id));
            }
        }

        return { success: true, data: deleted };
    }, {
        params: t.Object({ id: t.String(), imageId: t.String() })
    });
