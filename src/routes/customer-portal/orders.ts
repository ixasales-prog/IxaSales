/**
 * Customer Portal - Orders Routes
 * 
 * Order management, creation, and cancellation.
 * Reorder logic is in reorder.ts for maintainability.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql, or, gte, lte, isNull } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { customerPortalLogger as logger } from '../../lib/logger';
import { MAX_PENDING_ORDERS, type OrderItemInput, type TransactionResult } from './types';
import { createErrorResponse, createSuccessResponse } from '../../lib/error-codes';

// ============================================================================
// AUTO-DISCOUNT CALCULATION HELPER
// ============================================================================

interface ApplicableDiscount {
    id: string;
    name: string;
    type: string;
    value: number;
    amount: number;
}

async function findBestAutoDiscount(
    tenantId: string,
    customerId: string,
    cartTotal: number,
    itemsCount: number
): Promise<ApplicableDiscount | null> {
    const now = new Date();

    // Get all active discounts for the tenant
    const discounts = await db
        .select()
        .from(schema.discounts)
        .where(and(
            eq(schema.discounts.tenantId, tenantId),
            eq(schema.discounts.isActive, true),
            or(
                isNull(schema.discounts.startsAt),
                lte(schema.discounts.startsAt, now)
            ),
            or(
                isNull(schema.discounts.endsAt),
                gte(schema.discounts.endsAt, now)
            )
        ));

    logger.info('Auto-discount search', {
        tenantId,
        customerId,
        cartTotal,
        itemsCount,
        discountsFound: discounts.length,
        discountNames: discounts.map(d => d.name)
    });

    if (discounts.length === 0) return null;

    let bestDiscount: ApplicableDiscount | null = null;
    let bestAmount = 0;

    for (const discount of discounts) {
        const minOrderAmount = discount.minOrderAmount ? Number(discount.minOrderAmount) : 0;

        // Check if cart total meets minimum requirement
        if (minOrderAmount > 0 && cartTotal < minOrderAmount) {
            continue;
        }

        // Check if discount has customer scope restrictions
        const scopes = await db
            .select()
            .from(schema.discountScopes)
            .where(eq(schema.discountScopes.discountId, discount.id));

        // If there are customer scopes, check if this customer is included
        if (scopes.length > 0) {
            const customerScopes = scopes.filter(s => s.scopeType === 'customer');
            if (customerScopes.length > 0) {
                const isCustomerIncluded = customerScopes.some(s => s.scopeId === customerId);
                if (!isCustomerIncluded) {
                    continue;
                }
            }
        }

        // Calculate discount amount
        let discountAmount = 0;
        const discountValue = Number(discount.value || 0);

        switch (discount.type) {
            case 'percentage':
                discountAmount = (cartTotal * discountValue) / 100;
                if (discount.maxDiscountAmount) {
                    const maxDiscount = Number(discount.maxDiscountAmount);
                    discountAmount = Math.min(discountAmount, maxDiscount);
                }
                break;

            case 'fixed':
                discountAmount = discountValue;
                break;

            case 'buy_x_get_y':
                if (discount.minQty && discount.freeQty) {
                    const sets = Math.floor(itemsCount / (discount.minQty + discount.freeQty));
                    if (sets > 0) {
                        const avgPrice = cartTotal / itemsCount;
                        discountAmount = sets * discount.freeQty * avgPrice;
                    }
                }
                break;

            case 'volume':
                const tiers = await db
                    .select()
                    .from(schema.volumeTiers)
                    .where(eq(schema.volumeTiers.discountId, discount.id))
                    .orderBy(schema.volumeTiers.minQty);

                if (tiers.length > 0) {
                    let applicableTier = null;
                    for (const tier of tiers) {
                        if (itemsCount >= (tier.minQty || 0)) {
                            applicableTier = tier;
                        }
                    }
                    if (applicableTier && applicableTier.discountPercent) {
                        discountAmount = (cartTotal * Number(applicableTier.discountPercent)) / 100;
                    }
                }
                break;
        }

        // Ensure discount doesn't exceed cart total
        discountAmount = Math.min(discountAmount, cartTotal);
        discountAmount = Math.round(discountAmount * 100) / 100;

        // Track the best discount (highest amount)
        if (discountAmount > bestAmount) {
            bestAmount = discountAmount;
            bestDiscount = {
                id: discount.id,
                name: discount.name,
                type: discount.type,
                value: discountValue,
                amount: discountAmount
            };
        }
    }

    logger.info('Auto-discount result', {
        found: !!bestDiscount,
        discountName: bestDiscount?.name,
        discountAmount: bestDiscount?.amount
    });

    return bestDiscount;
}

// ============================================================================
// ORDER NUMBER GENERATION
// ============================================================================

async function generateOrderNumber(
    tx: any,
    tenantId: string
): Promise<string> {
    const [tenant] = await tx
        .select({
            orderNumberPrefix: schema.tenants.orderNumberPrefix,
            timezone: schema.tenants.timezone,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    const prefix = tenant?.orderNumberPrefix || '';
    const timezone = tenant?.timezone || 'Asia/Tashkent';
    const now = new Date();

    // Format time
    let timeStr: string;
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: timezone,
        });
        const parts = formatter.formatToParts(now);
        const hour = parts.find(p => p.type === 'hour')?.value || '00';
        const minute = parts.find(p => p.type === 'minute')?.value || '00';
        timeStr = `${hour}${minute}`;
    } catch {
        timeStr = now.toISOString().slice(11, 16).replace(':', '');
    }

    // Get start of day
    let startOfDay: Date;
    try {
        const dayFormatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: timezone,
        });
        const localDateStr = dayFormatter.format(now);
        startOfDay = new Date(`${localDateStr}T00:00:00`);
        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'shortOffset',
        });
        const offsetMatch = offsetFormatter.format(now).match(/GMT([+-]\d+)/);
        if (offsetMatch) {
            const offsetHours = parseInt(offsetMatch[1]);
            startOfDay = new Date(startOfDay.getTime() - offsetHours * 60 * 60 * 1000);
        }
    } catch {
        startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
    }

    const [{ count: orderCount }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.orders)
        .where(and(
            eq(schema.orders.tenantId, tenantId),
            sql`${schema.orders.createdAt} >= ${startOfDay.toISOString()}`
        ));

    const sequence = (Number(orderCount) + 1).toString().padStart(2, '0');
    return `${prefix}${sequence}${timeStr}`;
}

// ============================================================================
// ROUTES
// ============================================================================

export const ordersRoutes = new Elysia()
    /**
     * Get customer's orders with pagination
     */
    .get('/orders', async ({ headers, query, set }) => {
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

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const status = query.status;
        const offset = (page - 1) * limit;

        const conditions = [
            eq(schema.orders.tenantId, payload.tenantId),
            eq(schema.orders.customerId, payload.customerId)
        ];

        if (status && status !== 'all') {
            conditions.push(eq(schema.orders.status, status as any));
        }

        const orders = await db
            .select({
                id: schema.orders.id,
                orderNumber: schema.orders.orderNumber,
                status: schema.orders.status,
                paymentStatus: schema.orders.paymentStatus,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                createdAt: schema.orders.createdAt,
                deliveredAt: schema.orders.deliveredAt,
            })
            .from(schema.orders)
            .where(and(...conditions))
            .orderBy(desc(schema.orders.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(...conditions));

        return {
            success: true,
            data: orders.map(o => ({
                ...o,
                totalAmount: Number(o.totalAmount),
                paidAmount: Number(o.paidAmount || 0),
                remainingAmount: Number(o.totalAmount) - Number(o.paidAmount || 0)
            })),
            meta: {
                page,
                limit,
                total: Number(count),
                totalPages: Math.ceil(Number(count) / limit),
                hasMore: page * limit < Number(count)
            }
        };
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            status: t.Optional(t.String())
        })
    })

    /**
     * Get order details
     */
    .get('/orders/:id', async ({ headers, params, set }) => {
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

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, params.id),
                eq(schema.orders.tenantId, payload.tenantId),
                eq(schema.orders.customerId, payload.customerId)
            ))
            .limit(1);

        if (!order) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        const items = await db
            .select({
                id: schema.orderItems.id,
                productName: schema.products.name,
                sku: schema.products.sku,
                imageUrl: schema.products.imageUrl,
                unitPrice: schema.orderItems.unitPrice,
                qtyOrdered: schema.orderItems.qtyOrdered,
                qtyDelivered: schema.orderItems.qtyDelivered,
                lineTotal: schema.orderItems.lineTotal,
            })
            .from(schema.orderItems)
            .leftJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
            .where(eq(schema.orderItems.orderId, order.id));

        let paymentUrl: string | undefined;
        if (order.paymentStatus !== 'paid') {
            try {
                const { createPaymentLink } = await import('../../lib/payment-providers');
                const paymentResult = await createPaymentLink({
                    tenantId: payload.tenantId,
                    orderId: order.id,
                    customerId: payload.customerId,
                    amount: Number(order.totalAmount) - Number(order.paidAmount || 0),
                    currency: 'UZS'
                });
                if (paymentResult) {
                    paymentUrl = paymentResult.portalUrl;
                }
            } catch (e) {
                logger.warn('Failed to create payment link', { error: String(e) });
            }
        }

        return {
            success: true,
            data: {
                ...order,
                totalAmount: Number(order.totalAmount),
                paidAmount: Number(order.paidAmount || 0),
                remainingAmount: Number(order.totalAmount) - Number(order.paidAmount || 0),
                items: items.map(i => ({
                    ...i,
                    unitPrice: Number(i.unitPrice),
                    lineTotal: Number(i.lineTotal)
                })),
                paymentUrl
            }
        };
    }, {
        params: t.Object({ id: t.String() })
    })

    /**
     * Get order timeline
     */
    .get('/orders/:id/timeline', async ({ headers, params, set }) => {
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

        const [order] = await db
            .select({
                id: schema.orders.id,
                status: schema.orders.status,
                createdAt: schema.orders.createdAt,
                updatedAt: schema.orders.updatedAt,
                deliveredAt: schema.orders.deliveredAt,
            })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, params.id),
                eq(schema.orders.tenantId, payload.tenantId),
                eq(schema.orders.customerId, payload.customerId)
            ))
            .limit(1);

        if (!order) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND' } };
        }

        const statusHistory = await db
            .select({
                toStatus: schema.orderStatusHistory.toStatus,
                createdAt: schema.orderStatusHistory.createdAt,
            })
            .from(schema.orderStatusHistory)
            .where(eq(schema.orderStatusHistory.orderId, params.id))
            .orderBy(schema.orderStatusHistory.createdAt);

        const statusDates = new Map<string, Date>();
        for (const entry of statusHistory) {
            if (entry.toStatus && entry.createdAt) {
                statusDates.set(entry.toStatus, entry.createdAt);
            }
        }

        const statusOrder = ['pending', 'confirmed', 'approved', 'delivering', 'delivered'];
        const currentStatus = order.status || 'pending';
        const currentStatusIndex = statusOrder.indexOf(currentStatus);

        // If cancelled
        if (order.status === 'cancelled') {
            return {
                success: true,
                data: [{
                    status: 'pending',
                    label: 'Buyurtma qabul qilindi',
                    icon: 'package',
                    completed: true,
                    current: false,
                    date: order.createdAt,
                }, {
                    status: 'cancelled',
                    label: 'Bekor qilindi',
                    icon: 'x-circle',
                    completed: true,
                    current: true,
                    date: statusDates.get('cancelled') || order.updatedAt,
                }]
            };
        }

        const timeline = [
            {
                status: 'pending',
                label: 'Buyurtma qabul qilindi',
                icon: 'package',
                completed: currentStatusIndex >= 0,
                current: order.status === 'pending',
                date: order.createdAt,
            },
            {
                status: 'confirmed',
                label: 'Tasdiqlandi',
                icon: 'check',
                completed: currentStatusIndex >= 1,
                current: order.status === 'confirmed',
                date: statusDates.get('confirmed') || (currentStatusIndex >= 1 ? order.updatedAt : null),
            },
            {
                status: 'approved',
                label: 'Tayyorlanmoqda',
                icon: 'box',
                completed: currentStatusIndex >= 2,
                current: order.status === 'approved',
                date: statusDates.get('approved') || (currentStatusIndex >= 2 ? order.updatedAt : null),
            },
            {
                status: 'delivering',
                label: 'Yetkazilmoqda',
                icon: 'truck',
                completed: currentStatusIndex >= 3,
                current: order.status === 'delivering',
                date: statusDates.get('delivering') || (currentStatusIndex >= 3 ? order.updatedAt : null),
            },
            {
                status: 'delivered',
                label: 'Yetkazildi',
                icon: 'check-circle',
                completed: currentStatusIndex >= 4,
                current: order.status === 'delivered',
                date: order.deliveredAt || statusDates.get('delivered'),
            },
        ];

        return { success: true, data: timeline };
    }, {
        params: t.Object({ id: t.String() })
    })

    /**
     * Create a new order from cart
     */
    .post('/orders', async ({ headers, body, set }) => {
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

        const { items, notes, deliveryNotes } = body;

        if (!items || items.length === 0) {
            set.status = 400;
            return createErrorResponse('EMPTY_CART');
        }

        // Check pending order limit
        const [{ pendingCount }] = await db
            .select({ pendingCount: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.customerId, payload.customerId),
                or(
                    eq(schema.orders.status, 'pending'),
                    eq(schema.orders.status, 'confirmed')
                )
            ));

        if (Number(pendingCount) >= MAX_PENDING_ORDERS) {
            set.status = 400;
            return {
                success: false,
                error: {
                    code: 'ORDER_LIMIT_REACHED',
                    message: `Sizda ${MAX_PENDING_ORDERS} ta kutilayotgan buyurtma bor. Yangi buyurtma berish uchun avvalgilar yakunlanishi kerak.`
                }
            };
        }

        // Use transaction
        const result = await db.transaction(async (tx) => {
            const productIds = items.map((i: any) => i.productId);
            const products = await tx
                .select({
                    id: schema.products.id,
                    name: schema.products.name,
                    price: schema.products.price,
                    stockQuantity: schema.products.stockQuantity,
                    reservedQuantity: schema.products.reservedQuantity,
                    isActive: schema.products.isActive,
                })
                .from(schema.products)
                .where(and(
                    eq(schema.products.tenantId, payload.tenantId),
                    sql`${schema.products.id} IN (${sql.join(productIds.map((id: string) => sql`${id}`), sql`, `)})`
                ))
                .for('update');

            const productMap = new Map(products.map(p => [p.id, p]));

            let totalAmount = 0;
            const orderItems: OrderItemInput[] = [];
            const errors: string[] = [];

            for (const item of items) {
                const product = productMap.get(item.productId);

                if (!product) {
                    errors.push(`Mahsulot topilmadi: ${item.productId}`);
                    continue;
                }

                if (!product.isActive) {
                    errors.push(`Mahsulot mavjud emas: ${product.name}`);
                    continue;
                }

                const qty = Number(item.quantity);
                if (qty <= 0 || qty > 1000) {
                    errors.push(`Noto'g'ri miqdor: ${product.name}`);
                    continue;
                }

                const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
                if (qty > availableStock) {
                    errors.push(`Yetarli zaxira yo'q: ${product.name} (mavjud: ${availableStock})`);
                    continue;
                }

                const unitPrice = Number(product.price);
                const lineTotal = unitPrice * qty;
                totalAmount += lineTotal;

                orderItems.push({
                    productId: item.productId,
                    qty,
                    unitPrice,
                    lineTotal,
                    productName: product.name
                });
            }

            if (orderItems.length === 0) {
                return {
                    error: {
                        code: 'NO_VALID_ITEMS',
                        message: 'Hech qanday mahsulot qo\'shilmadi',
                        details: errors,
                        status: 400
                    }
                };
            }

            // Find and apply the best available discount
            const totalQty = orderItems.reduce((sum, item) => sum + item.qty, 0);
            const autoDiscount = await findBestAutoDiscount(
                payload.tenantId,
                payload.customerId,
                totalAmount,
                totalQty
            );

            const discountAmount = autoDiscount?.amount || 0;
            const finalTotal = totalAmount - discountAmount;

            const orderNumber = await generateOrderNumber(tx, payload.tenantId);

            const [newOrder] = await tx
                .insert(schema.orders)
                .values({
                    tenantId: payload.tenantId,
                    customerId: payload.customerId,
                    orderNumber,
                    status: 'pending',
                    paymentStatus: 'unpaid',
                    subtotalAmount: String(totalAmount),
                    discountAmount: String(discountAmount),
                    totalAmount: String(finalTotal),
                    paidAmount: '0',
                    notes: autoDiscount
                        ? `${notes || ''}\n[Chegirma qo'llanildi: ${autoDiscount.name} (-${discountAmount.toLocaleString()} so'm)]`.trim()
                        : (notes || null),
                    deliveryNotes: deliveryNotes || null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            for (const item of orderItems) {
                await tx.insert(schema.orderItems).values({
                    orderId: newOrder.id,
                    productId: item.productId,
                    qtyOrdered: item.qty,
                    qtyDelivered: 0,
                    unitPrice: String(item.unitPrice),
                    lineTotal: String(item.lineTotal),
                });

                await tx
                    .update(schema.products)
                    .set({
                        reservedQuantity: sql`COALESCE(${schema.products.reservedQuantity}, 0) + ${item.qty}`,
                    })
                    .where(eq(schema.products.id, item.productId));
            }

            const [customer] = await tx
                .select({ debtBalance: schema.customers.debtBalance })
                .from(schema.customers)
                .where(eq(schema.customers.id, payload.customerId))
                .limit(1);

            if (customer) {
                const currentDebt = Number(customer.debtBalance || 0);
                // Charge only the final discounted total
                await tx
                    .update(schema.customers)
                    .set({
                        debtBalance: String(currentDebt + finalTotal),
                        updatedAt: new Date()
                    })
                    .where(eq(schema.customers.id, payload.customerId));
            }

            await tx.insert(schema.orderStatusHistory).values({
                orderId: newOrder.id,
                toStatus: 'pending',
                notes: 'Order created via customer portal',
            });

            logger.info('Order created via customer portal', {
                orderId: newOrder.id,
                orderNumber: newOrder.orderNumber,
                customerId: payload.customerId,
                subtotal: totalAmount,
                discountAmount,
                discountName: autoDiscount?.name,
                totalAmount: finalTotal,
                itemCount: orderItems.length
            });

            return {
                order: newOrder,
                orderItems,
                subtotalAmount: totalAmount,
                discountAmount,
                discountName: autoDiscount?.name,
                totalAmount: finalTotal,
                errors
            };
        });

        if ('error' in result && result.error) {
            const err = result.error;
            set.status = err.status;
            return {
                success: false,
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details
                }
            };
        }

        // Notify admin
        try {
            const { notifyNewOrder, getTenantAdminsWithTelegram, canSendTenantNotification } = await import('../../lib/telegram');
            const notifCheck = await canSendTenantNotification(payload.tenantId, 'notifyNewOrder');
            if (notifCheck.canSend) {
                const [customerInfo] = await db.select({ name: schema.customers.name, phone: schema.customers.phone })
                    .from(schema.customers).where(eq(schema.customers.id, payload.customerId)).limit(1);
                const [tenantInfo] = await db.select({ currency: schema.tenants.currency })
                    .from(schema.tenants).where(eq(schema.tenants.id, payload.tenantId)).limit(1);

                const admins = await getTenantAdminsWithTelegram(payload.tenantId);
                for (const admin of admins) {
                    await notifyNewOrder(admin.telegramChatId, {
                        orderNumber: result.order.orderNumber,
                        customerName: customerInfo?.name || 'Noma\'lum',
                        customerPhone: customerInfo?.phone || undefined,
                        total: result.totalAmount,
                        currency: tenantInfo?.currency || 'UZS',
                        itemCount: result.orderItems.length
                    });
                }
            }
        } catch (e) {
            logger.error('Failed to send new order notification', { error: String(e) });
        }

        return createSuccessResponse('ORDER_CREATED', {
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            subtotalAmount: result.subtotalAmount,
            discountAmount: result.discountAmount,
            discountName: result.discountName,
            totalAmount: result.totalAmount,
            itemCount: result.orderItems.length,
            warnings: result.errors.length > 0 ? result.errors : undefined
        });
    }, {
        body: t.Object({
            items: t.Array(t.Object({
                productId: t.String(),
                quantity: t.Number()
            })),
            notes: t.Optional(t.String()),
            deliveryNotes: t.Optional(t.String())
        })
    })

    /**
     * Cancel a pending order
     */
    .post('/orders/:id/cancel', async ({ headers, params, body, set }) => {
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

        const [order] = await db
            .select()
            .from(schema.orders)
            .where(and(
                eq(schema.orders.id, params.id),
                eq(schema.orders.tenantId, payload.tenantId),
                eq(schema.orders.customerId, payload.customerId)
            ))
            .limit(1);

        if (!order) {
            set.status = 404;
            return createErrorResponse('ORDER_NOT_FOUND');
        }

        if (order.status !== 'pending') {
            set.status = 400;
            return {
                success: false,
                error: {
                    code: 'CANNOT_CANCEL',
                    message: `Faqat kutilayotgan buyurtmalarni bekor qilish mumkin. Joriy holat: ${order.status}`
                }
            };
        }

        await db.transaction(async (tx) => {
            const items = await tx
                .select({
                    productId: schema.orderItems.productId,
                    qtyOrdered: schema.orderItems.qtyOrdered,
                })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));

            for (const item of items) {
                await tx
                    .update(schema.products)
                    .set({
                        reservedQuantity: sql`GREATEST(0, COALESCE(${schema.products.reservedQuantity}, 0) - ${item.qtyOrdered})`,
                    })
                    .where(eq(schema.products.id, item.productId));
            }

            const [customer] = await tx
                .select({ debtBalance: schema.customers.debtBalance })
                .from(schema.customers)
                .where(eq(schema.customers.id, payload.customerId))
                .limit(1);

            if (customer) {
                const currentDebt = Number(customer.debtBalance || 0);
                const orderTotal = Number(order.totalAmount || 0);
                await tx
                    .update(schema.customers)
                    .set({
                        debtBalance: String(Math.max(0, currentDebt - orderTotal)),
                        updatedAt: new Date()
                    })
                    .where(eq(schema.customers.id, payload.customerId));
            }

            await tx
                .update(schema.orders)
                .set({
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    updatedAt: new Date(),
                    notes: order.notes
                        ? `${order.notes}\n\n[Mijoz tomonidan bekor qilindi: ${body?.reason || 'Sabab ko\'rsatilmagan'}]`
                        : `[Mijoz tomonidan bekor qilindi: ${body?.reason || 'Sabab ko\'rsatilmagan'}]`
                })
                .where(eq(schema.orders.id, order.id));

            await tx.insert(schema.orderStatusHistory).values({
                orderId: order.id,
                fromStatus: order.status,
                toStatus: 'cancelled',
                notes: `Cancelled by customer: ${body?.reason || 'No reason provided'}`,
            });
        });

        logger.info('Order cancelled by customer', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: payload.customerId,
            reason: body?.reason
        });

        return createSuccessResponse('ORDER_CANCELLED', {
            orderNumber: order.orderNumber
        });
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Optional(t.Object({
            reason: t.Optional(t.String())
        }))
    });

