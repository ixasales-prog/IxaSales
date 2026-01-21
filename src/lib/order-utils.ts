/**
 * Order Utilities
 * 
 * Shared utilities for order operations.
 * Extracted to eliminate duplication across routes.
 */

import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';


/**
 * Generate a unique order number for a tenant
 * Format: PREFIX + SEQUENCE + HHMM (e.g. i011430)
 */
export async function generateOrderNumber(
    tx: typeof db,
    tenantId: string
): Promise<string> {
    // Get tenant settings
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

    // Format time using tenant's timezone
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

    // Get start of day in tenant's timezone
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

    // Get count of orders created today
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

/**
 * Check and reserve stock for order items
 * Returns validated items or error
 */
export async function validateAndReserveStock(
    tx: typeof db,
    tenantId: string,
    items: { productId: string; quantity: number }[]
): Promise<{
    success: boolean;
    orderItems?: {
        productId: string;
        qty: number;
        unitPrice: number;
        lineTotal: number;
        productName: string;
    }[];
    totalAmount?: number;
    errors?: string[];
}> {
    const productIds = items.map(i => i.productId);

    // Get products with row locking
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

    const productMap = new Map(products.map(p => [p.id, p]));

    let totalAmount = 0;
    const orderItems: {
        productId: string;
        qty: number;
        unitPrice: number;
        lineTotal: number;
        productName: string;
    }[] = [];
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

        // Check AVAILABLE stock (total - reserved)
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
        return { success: false, errors };
    }

    // Reserve stock
    for (const item of orderItems) {
        await tx
            .update(schema.products)
            .set({
                reservedQuantity: sql`COALESCE(${schema.products.reservedQuantity}, 0) + ${item.qty}`,
            })
            .where(eq(schema.products.id, item.productId));
    }

    return { success: true, orderItems, totalAmount, errors };
}

/**
 * Release reserved stock for order items
 */
export async function releaseReservedStock(
    tx: typeof db,
    orderId: string
): Promise<void> {
    const items = await tx
        .select({
            productId: schema.orderItems.productId,
            qtyOrdered: schema.orderItems.qtyOrdered,
        })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId));

    for (const item of items) {
        await tx
            .update(schema.products)
            .set({
                reservedQuantity: sql`GREATEST(0, COALESCE(${schema.products.reservedQuantity}, 0) - ${item.qtyOrdered})`,
            })
            .where(eq(schema.products.id, item.productId));
    }
}

/**
 * Update customer debt balance
 */
export async function updateCustomerDebt(
    tx: typeof db,
    customerId: string,
    amount: number,
    operation: 'add' | 'subtract'
): Promise<void> {
    const [customer] = await tx
        .select({ debtBalance: schema.customers.debtBalance })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);

    if (customer) {
        const currentDebt = Number(customer.debtBalance || 0);
        const newDebt = operation === 'add'
            ? currentDebt + amount
            : Math.max(0, currentDebt - amount);

        await tx
            .update(schema.customers)
            .set({
                debtBalance: String(newDebt),
                updatedAt: new Date()
            })
            .where(eq(schema.customers.id, customerId));
    }
}
