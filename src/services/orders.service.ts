/**
 * OrdersService - Shared Order Creation Logic
 * 
 * This service consolidates order creation logic that was previously duplicated
 * between the Sales Rep API (routes-fastify/orders.ts) and the Customer Portal
 * API (routes-fastify/customer-portal/orders.ts).
 */

import { db, schema } from '../db';
import { eq, and, sql, or, gte, lte, isNull } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderItemInput {
    productId: string;
    quantity: number;
}

export interface ValidatedOrderItem {
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
}

export interface CreateOrderInput {
    tenantId: string;
    customerId: string;
    items: OrderItemInput[];
    notes?: string;
    deliveryNotes?: string;
    requestedDeliveryDate?: string;
    // Pre-calculated totals (for sales rep mode where client sends totals)
    subtotalAmount?: number;
    discountAmount?: number;
    taxAmount?: number;
    totalAmount?: number;
}

export interface CreateOrderContext {
    mode: 'sales_rep' | 'customer_portal';
    userId?: string;
    salesRepId?: string;
    skipCreditCheck?: boolean;
    applyAutoDiscount?: boolean;
}

export interface OrderValidationError {
    code: string;
    message: string;
    status: number;
    details?: string[];
}

export interface ApplicableDiscount {
    id: string;
    name: string;
    type: string;
    value: number;
    amount: number;
}

export interface CreateOrderResult {
    order: typeof schema.orders.$inferSelect;
    items: ValidatedOrderItem[];
    subtotalAmount: number;
    discountAmount: number;
    discountName?: string;
    totalAmount: number;
    warnings?: string[];
}

// ============================================================================
// ORDERS SERVICE
// ============================================================================

export class OrdersService {
    // --------------------------------------------------------------------------
    // ORDER NUMBER GENERATION
    // --------------------------------------------------------------------------

    /**
     * Generates a unique order number based on tenant settings.
     * Format: {prefix}{sequence}{time} e.g., "IXA011430"
     */
    async generateOrderNumber(tx: any, tenantId: string): Promise<string> {
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

        // Format time (HHMM)
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

        // Get start of day in tenant timezone
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

        // Count orders today
        const [{ count }] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(schema.orders)
            .where(and(
                eq(schema.orders.tenantId, tenantId),
                sql`${schema.orders.createdAt} >= ${startOfDay.toISOString()}`
            ));

        const sequence = (Number(count) + 1).toString().padStart(2, '0');
        return `${prefix}${sequence}${timeStr}`;
    }

    // --------------------------------------------------------------------------
    // PRODUCT VALIDATION
    // --------------------------------------------------------------------------

    /**
     * Validates products exist, are active, and have sufficient stock.
     * Returns validated items with current prices.
     */
    async validateProducts(
        tx: any,
        tenantId: string,
        items: OrderItemInput[],
        options?: {
            checkPriceMatch?: boolean;
            expectedPrices?: Map<string, number>;
        }
    ): Promise<{ items: ValidatedOrderItem[]; errors: string[] }> {
        const productIds = items.map(i => i.productId);

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
                eq(schema.products.tenantId, tenantId),
                sql`${schema.products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`
            ))
            .for('update');

        type ProductInfo = {
            id: string;
            name: string;
            price: string;
            stockQuantity: number | null;
            reservedQuantity: number | null;
            isActive: boolean | null;
        };
        const productMap = new Map<string, ProductInfo>(products.map((p: ProductInfo) => [p.id, p]));
        const validatedItems: ValidatedOrderItem[] = [];
        const errors: string[] = [];

        for (const item of items) {
            const product = productMap.get(item.productId);

            if (!product) {
                errors.push(`Product not found: ${item.productId}`);
                continue;
            }

            if (!product.isActive) {
                errors.push(`Product is not available: ${product.name}`);
                continue;
            }

            const qty = Number(item.quantity);
            if (qty <= 0 || qty > 1000) {
                errors.push(`Invalid quantity for ${product.name}`);
                continue;
            }

            const availableStock = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
            if (qty > availableStock) {
                errors.push(`Insufficient stock for ${product.name} (available: ${availableStock})`);
                continue;
            }

            const currentPrice = Number(product.price);

            // Check price match if requested (for sales rep mode where prices are sent)
            if (options?.checkPriceMatch && options.expectedPrices) {
                const expectedPrice = options.expectedPrices.get(item.productId);
                if (expectedPrice !== undefined && Math.abs(currentPrice - expectedPrice) > 0.01) {
                    errors.push(`Price for ${product.name} has changed. Please refresh your cart.`);
                    continue;
                }
            }

            const lineTotal = currentPrice * qty;
            validatedItems.push({
                productId: item.productId,
                productName: product.name,
                unitPrice: currentPrice,
                quantity: qty,
                lineTotal,
            });
        }

        return { items: validatedItems, errors };
    }

    // --------------------------------------------------------------------------
    // STOCK MANAGEMENT
    // --------------------------------------------------------------------------

    /**
     * Reserves stock for order items (increments reservedQuantity).
     */
    async reserveStock(tx: any, items: ValidatedOrderItem[]): Promise<void> {
        for (const item of items) {
            await tx
                .update(schema.products)
                .set({
                    reservedQuantity: sql`COALESCE(${schema.products.reservedQuantity}, 0) + ${item.quantity}`,
                })
                .where(eq(schema.products.id, item.productId));
        }
    }

    /**
     * Releases reserved stock (decrements reservedQuantity). Used in cancellation.
     */
    async releaseStock(tx: any, items: { productId: string; quantity: number }[]): Promise<void> {
        for (const item of items) {
            await tx
                .update(schema.products)
                .set({
                    reservedQuantity: sql`GREATEST(0, COALESCE(${schema.products.reservedQuantity}, 0) - ${item.quantity})`,
                })
                .where(eq(schema.products.id, item.productId));
        }
    }

    // --------------------------------------------------------------------------
    // CUSTOMER DEBT MANAGEMENT
    // --------------------------------------------------------------------------

    /**
     * Updates customer debt balance.
     */
    async updateCustomerDebt(tx: any, customerId: string, amount: number): Promise<void> {
        const [customer] = await tx
            .select({ debtBalance: schema.customers.debtBalance })
            .from(schema.customers)
            .where(eq(schema.customers.id, customerId))
            .limit(1);

        if (customer) {
            const currentDebt = Number(customer.debtBalance || 0);
            await tx
                .update(schema.customers)
                .set({
                    debtBalance: String(currentDebt + amount),
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, customerId));
        }
    }

    // --------------------------------------------------------------------------
    // ORDER ITEMS
    // --------------------------------------------------------------------------

    /**
     * Inserts order items into the database.
     */
    async createOrderItems(tx: any, orderId: string, items: ValidatedOrderItem[]): Promise<void> {
        if (items.length === 0) return;

        await tx.insert(schema.orderItems).values(
            items.map(item => ({
                orderId,
                productId: item.productId,
                unitPrice: String(item.unitPrice),
                qtyOrdered: item.quantity,
                qtyPicked: 0,
                qtyDelivered: 0,
                lineTotal: String(item.lineTotal),
            }))
        );
    }

    // --------------------------------------------------------------------------
    // STATUS HISTORY
    // --------------------------------------------------------------------------

    /**
     * Logs an order status change.
     */
    async logStatusChange(
        tx: any,
        orderId: string,
        toStatus: string,
        changedBy?: string,
        notes?: string
    ): Promise<void> {
        await tx.insert(schema.orderStatusHistory).values({
            orderId,
            toStatus,
            changedBy,
            notes,
        });
    }

    // --------------------------------------------------------------------------
    // AUTO-DISCOUNT (for Customer Portal)
    // --------------------------------------------------------------------------

    /**
     * Finds and returns the best applicable auto-discount for an order.
     */
    async findBestAutoDiscount(
        tenantId: string,
        customerId: string,
        cartTotal: number,
        itemsCount: number
    ): Promise<ApplicableDiscount | null> {
        const now = new Date();

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

        if (discounts.length === 0) return null;

        let bestDiscount: ApplicableDiscount | null = null;
        let bestAmount = 0;

        for (const discount of discounts) {
            const minOrderAmount = discount.minOrderAmount ? Number(discount.minOrderAmount) : 0;

            if (minOrderAmount > 0 && cartTotal < minOrderAmount) {
                continue;
            }

            // Check customer scope restrictions
            const scopes = await db
                .select()
                .from(schema.discountScopes)
                .where(eq(schema.discountScopes.discountId, discount.id));

            if (scopes.length > 0) {
                const customerScopes = scopes.filter((s: any) => s.scopeType === 'customer');
                if (customerScopes.length > 0) {
                    const isCustomerIncluded = customerScopes.some((s: any) => s.scopeId === customerId);
                    if (!isCustomerIncluded) {
                        continue;
                    }
                }
            }

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

            discountAmount = Math.min(discountAmount, cartTotal);
            discountAmount = Math.round(discountAmount * 100) / 100;

            if (discountAmount > bestAmount) {
                bestAmount = discountAmount;
                bestDiscount = {
                    id: discount.id,
                    name: discount.name,
                    type: discount.type,
                    value: discountValue,
                    amount: discountAmount,
                };
            }
        }

        return bestDiscount;
    }

    // --------------------------------------------------------------------------
    // CREDIT/TIER VALIDATION (for Sales Rep mode)
    // --------------------------------------------------------------------------

    /**
     * Validates customer credit/tier limits.
     */
    async validateCreditLimits(
        tx: any,
        customerId: string,
        orderTotal: number
    ): Promise<OrderValidationError | null> {
        const [customer] = await tx
            .select({
                tierId: schema.customers.tierId,
                debtBalance: schema.customers.debtBalance,
                creditBalance: schema.customers.creditBalance,
            })
            .from(schema.customers)
            .where(eq(schema.customers.id, customerId))
            .limit(1);

        if (!customer?.tierId) return null;

        const [tier] = await tx
            .select()
            .from(schema.customerTiers)
            .where(eq(schema.customerTiers.id, customer.tierId))
            .limit(1);

        if (!tier) return null;

        if (!tier.creditAllowed) {
            const currentCredit = Number(customer.creditBalance || 0);
            if (currentCredit < orderTotal) {
                return {
                    code: 'CREDIT_NOT_ALLOWED',
                    message: 'This customer tier does not allow credit orders. Prepayment required.',
                    status: 400,
                };
            }
        }

        if (tier.creditLimit) {
            const currentDebt = Number(customer.debtBalance || 0);
            const newDebt = currentDebt + orderTotal;
            if (newDebt > Number(tier.creditLimit)) {
                return {
                    code: 'CREDIT_LIMIT_EXCEEDED',
                    message: `Order would exceed credit limit of ${tier.creditLimit}`,
                    status: 400,
                };
            }
        }

        if (tier.maxOrderAmount && orderTotal > Number(tier.maxOrderAmount)) {
            return {
                code: 'MAX_ORDER_EXCEEDED',
                message: `Order amount exceeds maximum allowed of ${tier.maxOrderAmount}`,
                status: 400,
            };
        }

        return null;
    }

    // --------------------------------------------------------------------------
    // UNIFIED ORDER CREATION
    // --------------------------------------------------------------------------

    /**
     * Creates an order with all validations, stock reservation, and debt updates.
     * This is the main entry point for order creation.
     */
    async createOrder(
        tx: any,
        input: CreateOrderInput,
        context: CreateOrderContext
    ): Promise<CreateOrderResult | { error: OrderValidationError }> {
        const { tenantId, customerId, items, notes, deliveryNotes, requestedDeliveryDate } = input;

        // 1. Validate customer exists
        const [customer] = await tx
            .select({
                id: schema.customers.id,
                assignedSalesRepId: schema.customers.assignedSalesRepId,
            })
            .from(schema.customers)
            .where(eq(schema.customers.id, customerId))
            .limit(1);

        if (!customer) {
            return { error: { code: 'NOT_FOUND', message: 'Customer not found', status: 404 } };
        }

        // 2. Check ownership (sales_rep mode only)
        if (context.mode === 'sales_rep' && context.userId) {
            // Sales reps can only create orders for their assigned customers
            // unless they're admin/supervisor (handled at route level)
        }

        // 3. Validate products and stock
        const validation = await this.validateProducts(tx, tenantId, items, {
            checkPriceMatch: context.mode === 'sales_rep',
            expectedPrices: context.mode === 'sales_rep' && input.totalAmount !== undefined
                ? undefined // We'll trust the prices sent for sales rep mode
                : undefined,
        });

        if (validation.items.length === 0) {
            return {
                error: {
                    code: 'NO_VALID_ITEMS',
                    message: 'No valid items in order',
                    status: 400,
                    details: validation.errors,
                },
            };
        }

        // 4. Calculate totals
        let subtotalAmount = validation.items.reduce((sum, item) => sum + item.lineTotal, 0);
        let discountAmount = 0;
        let discountName: string | undefined;

        // For sales_rep mode, use provided totals if available
        if (context.mode === 'sales_rep' && input.subtotalAmount !== undefined) {
            subtotalAmount = input.subtotalAmount;
            discountAmount = input.discountAmount || 0;
        }

        // Apply auto-discount for customer portal
        if (context.mode === 'customer_portal' && context.applyAutoDiscount) {
            const totalQty = validation.items.reduce((sum, item) => sum + item.quantity, 0);
            const autoDiscount = await this.findBestAutoDiscount(
                tenantId,
                customerId,
                subtotalAmount,
                totalQty
            );
            if (autoDiscount) {
                discountAmount = autoDiscount.amount;
                discountName = autoDiscount.name;
            }
        }

        const totalAmount = input.totalAmount ?? (subtotalAmount - discountAmount);

        // 5. Validate credit limits (sales_rep mode, unless skipped)
        if (context.mode === 'sales_rep' && !context.skipCreditCheck) {
            const creditError = await this.validateCreditLimits(tx, customerId, totalAmount);
            if (creditError) {
                return { error: creditError };
            }
        }

        // 6. Generate order number
        const orderNumber = await this.generateOrderNumber(tx, tenantId);

        // 7. Determine sales rep
        let salesRepId: string | undefined;
        if (context.mode === 'sales_rep') {
            salesRepId = context.salesRepId || context.userId;
        }

        // 8. Build notes with discount info for portal orders
        let finalNotes = notes || null;
        if (context.mode === 'customer_portal' && discountName && discountAmount > 0) {
            const discountNote = `[Discount applied: ${discountName} (-${discountAmount.toLocaleString()})]`;
            finalNotes = finalNotes ? `${finalNotes}\n${discountNote}` : discountNote;
        }

        // 9. Insert order
        const [order] = await tx
            .insert(schema.orders)
            .values({
                tenantId,
                orderNumber,
                customerId,
                salesRepId,
                createdByUserId: context.userId,
                status: 'pending',
                paymentStatus: 'unpaid',
                subtotalAmount: String(subtotalAmount),
                discountAmount: String(discountAmount),
                taxAmount: String(input.taxAmount || 0),
                totalAmount: String(totalAmount),
                paidAmount: '0',
                notes: finalNotes,
                deliveryNotes: deliveryNotes || null,
                requestedDeliveryDate: requestedDeliveryDate || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        // 10. Insert order items
        await this.createOrderItems(tx, order.id, validation.items);

        // 11. Reserve stock
        await this.reserveStock(tx, validation.items);

        // 12. Update customer debt
        await this.updateCustomerDebt(tx, customerId, totalAmount);

        // 13. Log status change
        const statusNote = context.mode === 'customer_portal'
            ? 'Order created via customer portal'
            : 'Order created';
        await this.logStatusChange(tx, order.id, 'pending', context.userId, statusNote);

        return {
            order,
            items: validation.items,
            subtotalAmount,
            discountAmount,
            discountName,
            totalAmount,
            warnings: validation.errors.length > 0 ? validation.errors : undefined,
        };
    }
}

// Export singleton instance
export const ordersService = new OrdersService();
