/**
 * Customer Portal - Discount Routes
 * 
 * Discount code validation and application for customer orders.
 */

import { Elysia, t } from 'elysia';
import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, sql, gte, lte, or, isNull } from 'drizzle-orm';
import { verifyCustomerToken } from '../../lib/customer-auth';
import { createErrorResponse } from '../../lib/error-codes';

// ============================================================================
// DISCOUNT CALCULATION TYPES
// ============================================================================

interface DiscountResult {
    discountId: string;
    discountName: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    originalTotal: number;
    newTotal: number;
}

// ============================================================================
// ROUTES
// ============================================================================

// Using Elysia() directly to avoid complex type inference issues with declarations
export const discountRoutes: any = new Elysia()

    /**
     * Validate and calculate discount for cart
     */
    .post('/discounts/validate', async ({ headers, body, set }) => {
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

        const { code, cartTotal, items } = body;

        if (!code || !code.trim()) {
            set.status = 400;
            return createErrorResponse('INVALID_INPUT');
        }

        const now = new Date();

        // Find discount by code (name is used as code)
        const [discount] = await db
            .select()
            .from(schema.discounts)
            .where(and(
                eq(schema.discounts.tenantId, payload.tenantId),
                sql`LOWER(${schema.discounts.name}) = ${code.toLowerCase().trim()}`,
                eq(schema.discounts.isActive, true),
                or(
                    isNull(schema.discounts.startsAt),
                    lte(schema.discounts.startsAt, now)
                ),
                or(
                    isNull(schema.discounts.endsAt),
                    gte(schema.discounts.endsAt, now)
                )
            ))
            .limit(1);

        if (!discount) {
            set.status = 404;
            return createErrorResponse('DISCOUNT_NOT_FOUND');
        }

        // Check if discount is active
        if (!discount.isActive) {
            set.status = 400;
            return createErrorResponse('DISCOUNT_INACTIVE');
        }

        // Check date validity
        if (discount.startsAt && now < discount.startsAt) {
            set.status = 400;
            return createErrorResponse('DISCOUNT_INACTIVE');
        }
        if (discount.endsAt && now > discount.endsAt) {
            set.status = 400;
            return createErrorResponse('DISCOUNT_EXPIRED');
        }

        // Check minimum order amount
        const minOrderAmount = discount.minOrderAmount ? Number(discount.minOrderAmount) : 0;
        if (minOrderAmount > 0 && cartTotal < minOrderAmount) {
            set.status = 400;
            return {
                success: false,
                error: {
                    code: 'DISCOUNT_MIN_NOT_MET',
                    message: `Minimal buyurtma summasi: ${minOrderAmount.toLocaleString()} so'm`,
                    minOrderAmount
                }
            };
        }

        // Calculate discount amount based on type
        let discountAmount = 0;
        const discountValue = Number(discount.value || 0);

        switch (discount.type) {
            case 'percentage':
                discountAmount = (cartTotal * discountValue) / 100;
                // Apply max discount if set
                if (discount.maxDiscountAmount) {
                    const maxDiscount = Number(discount.maxDiscountAmount);
                    discountAmount = Math.min(discountAmount, maxDiscount);
                }
                break;

            case 'fixed':
                discountAmount = discountValue;
                break;

            case 'buy_x_get_y':
                // Calculate based on items quantity
                if (discount.minQty && discount.freeQty) {
                    const totalQty = items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                    const sets = Math.floor(totalQty / (discount.minQty + discount.freeQty));
                    // For B2G1, free items would be calculated from average price
                    // This is a simplified calculation
                    if (sets > 0 && items && items.length > 0) {
                        const avgPrice = cartTotal / totalQty;
                        discountAmount = sets * discount.freeQty * avgPrice;
                    }
                }
                break;

            case 'volume':
                // Fetch volume tiers and apply appropriate discount
                const tiers = await db
                    .select()
                    .from(schema.volumeTiers)
                    .where(eq(schema.volumeTiers.discountId, discount.id))
                    .orderBy(schema.volumeTiers.minQty);

                if (tiers.length > 0) {
                    const totalQty = items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                    // Find applicable tier
                    let applicableTier = null;
                    for (const tier of tiers) {
                        if (totalQty >= (tier.minQty || 0)) {
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

        const result: DiscountResult = {
            discountId: discount.id,
            discountName: discount.name,
            discountType: discount.type,
            discountValue,
            discountAmount,
            originalTotal: cartTotal,
            newTotal: cartTotal - discountAmount
        };

        return {
            success: true,
            data: result
        };
    }, {
        body: t.Object({
            code: t.String(),
            cartTotal: t.Number({ minimum: 0 }),
            items: t.Optional(t.Array(t.Object({
                productId: t.String(),
                quantity: t.Number({ minimum: 1 }),
                unitPrice: t.Optional(t.Number({ minimum: 0 }))
            })))
        })
    })

    /**
     * Get available discounts for customer
     * Returns active public discounts without requiring a code
     */
    .get('/discounts/available', async ({ headers, set }) => {
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

        const now = new Date();

        // Get active discounts that are public/visible to customers
        const discounts = await db
            .select({
                id: schema.discounts.id,
                name: schema.discounts.name,
                type: schema.discounts.type,
                value: schema.discounts.value,
                minOrderAmount: schema.discounts.minOrderAmount,
                minQty: schema.discounts.minQty,
                freeQty: schema.discounts.freeQty,
                endsAt: schema.discounts.endsAt,
            })
            .from(schema.discounts)
            .where(and(
                eq(schema.discounts.tenantId, payload.tenantId),
                eq(schema.discounts.isActive, true),
                or(
                    isNull(schema.discounts.startsAt),
                    lte(schema.discounts.startsAt, now)
                ),
                or(
                    isNull(schema.discounts.endsAt),
                    gte(schema.discounts.endsAt, now)
                )
            ))
            .limit(10);

        return {
            success: true,
            data: discounts.map(d => ({
                id: d.id,
                name: d.name,
                type: d.type,
                value: Number(d.value || 0),
                minOrderAmount: d.minOrderAmount ? Number(d.minOrderAmount) : null,
                minQty: d.minQty,
                freeQty: d.freeQty,
                expiresAt: d.endsAt,
                description: formatDiscountDescription(d)
            }))
        };
    })

    /**
     * Preview best automatic discount for cart
     * Returns the best discount that will be applied at checkout
     */
    .post('/discounts/preview', async ({ headers, body, set }) => {
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

        const { cartTotal, itemsCount } = body;
        const now = new Date();

        // Get all active discounts for the tenant
        const discounts = await db
            .select()
            .from(schema.discounts)
            .where(and(
                eq(schema.discounts.tenantId, payload.tenantId),
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

        if (discounts.length === 0) {
            return { success: true, data: null };
        }

        let bestDiscount: {
            id: string;
            name: string;
            type: string;
            value: number;
            discountAmount: number;
            newTotal: number;
        } | null = null;
        let bestAmount = 0;

        for (const discount of discounts) {
            const minOrderAmount = discount.minOrderAmount ? Number(discount.minOrderAmount) : 0;

            if (minOrderAmount > 0 && cartTotal < minOrderAmount) {
                continue;
            }

            let discountAmount = 0;
            const discountValue = Number(discount.value || 0);

            switch (discount.type) {
                case 'percentage':
                    discountAmount = (cartTotal * discountValue) / 100;
                    if (discount.maxDiscountAmount) {
                        discountAmount = Math.min(discountAmount, Number(discount.maxDiscountAmount));
                    }
                    break;
                case 'fixed':
                    discountAmount = discountValue;
                    break;
                case 'buy_x_get_y':
                    if (discount.minQty && discount.freeQty && itemsCount) {
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

                    if (tiers.length > 0 && itemsCount) {
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

            discountAmount = Math.min(discountAmount, cartTotal);
            discountAmount = Math.round(discountAmount * 100) / 100;

            if (discountAmount > bestAmount) {
                bestAmount = discountAmount;
                bestDiscount = {
                    id: discount.id,
                    name: discount.name,
                    type: discount.type,
                    value: discountValue,
                    discountAmount,
                    newTotal: cartTotal - discountAmount
                };
            }
        }

        return { success: true, data: bestDiscount };
    }, {
        body: t.Object({
            cartTotal: t.Number(),
            itemsCount: t.Optional(t.Number())
        })
    });

// ============================================================================
// HELPERS
// ============================================================================

function formatDiscountDescription(discount: any): string {
    const value = Number(discount.value || 0);
    const minOrder = discount.minOrderAmount ? Number(discount.minOrderAmount) : 0;

    switch (discount.type) {
        case 'percentage':
            return `${value}% chegirma${minOrder > 0 ? ` (minimal: ${minOrder.toLocaleString()} so'm)` : ''}`;
        case 'fixed':
            return `${value.toLocaleString()} so'm chegirma`;
        case 'buy_x_get_y':
            return `${discount.minQty} ta oling, ${discount.freeQty} ta bepul`;
        case 'volume':
            return 'Hajm bo\'yicha chegirma';
        default:
            return discount.name;
    }
}
