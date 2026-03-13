/**
 * Payment Providers Index
 * 
 * Unified interface for payment provider integrations
 */

import { db, schema } from '../../db';
import { eq, and, gt, lt, desc } from 'drizzle-orm';
import crypto from 'crypto';

import { generateClickUrl } from './click';
import { generatePaymeUrl, sumToTiyin } from './payme';

export * from './click';
export * from './payme';

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate a secure payment token
 */
export function generatePaymentToken(): string {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
}

// ============================================================================
// PAYMENT LINK SERVICE
// ============================================================================

export interface PaymentLinkResult {
    token: string;
    portalUrl: string;
    clickUrl?: string;
    paymeUrl?: string;
    expiresAt: Date;
    amount: number;
    currency: string;
}

export interface CreatePaymentLinkOptions {
    tenantId: string;
    orderId: string;
    customerId: string;
    amount: number;
    currency?: string;
    expiresInHours?: number;
}

/**
 * Create a payment link for an order
 */
export async function createPaymentLink(options: CreatePaymentLinkOptions): Promise<PaymentLinkResult | null> {
    const {
        tenantId,
        orderId,
        customerId,
        amount,
        currency = 'UZS',
        expiresInHours = 24
    } = options;

    // Get tenant payment config
    const [tenant] = await db
        .select({
            subdomain: schema.tenants.subdomain,
            paymentPortalEnabled: schema.tenants.paymentPortalEnabled,
            clickMerchantId: schema.tenants.clickMerchantId,
            clickServiceId: schema.tenants.clickServiceId,
            paymeMerchantId: schema.tenants.paymeMerchantId,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    if (!tenant || !tenant.paymentPortalEnabled) {
        return null;
    }

    const existingToken = await findActivePaymentToken({
        tenantId,
        orderId,
        customerId,
        amount,
        currency,
    });

    const token = existingToken?.token || generatePaymentToken();
    const expiresAt = existingToken?.expiresAt || new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    if (!existingToken) {
        await db.insert(schema.paymentTokens).values({
            tenantId,
            orderId,
            customerId,
            token,
            amount: amount.toString(),
            currency,
            status: 'pending',
            expiresAt,
        });
    }

    // Build URLs
    const baseUrl = process.env.PAYMENT_PORTAL_URL || `https://${tenant.subdomain}.ixasales.com`;
    const portalUrl = `${baseUrl}/pay/${token}`;

    let clickUrl: string | undefined;
    let paymeUrl: string | undefined;

    if (tenant.clickMerchantId && tenant.clickServiceId) {
        clickUrl = generateClickUrl(
            tenant.clickMerchantId,
            tenant.clickServiceId,
            amount,
            token
        );
    }

    if (tenant.paymeMerchantId) {
        paymeUrl = generatePaymeUrl(
            tenant.paymeMerchantId,
            sumToTiyin(amount),
            { payment_token: token }
        );
    }

    return {
        token,
        portalUrl,
        clickUrl,
        paymeUrl,
        expiresAt,
        amount,
        currency,
    };
}

export async function findActivePaymentToken(params: {
    tenantId: string;
    orderId: string;
    customerId: string;
    amount?: number;
    currency?: string;
}) {
    const [result] = await db
        .select()
        .from(schema.paymentTokens)
        .where(
            and(
                eq(schema.paymentTokens.tenantId, params.tenantId),
                eq(schema.paymentTokens.orderId, params.orderId),
                eq(schema.paymentTokens.customerId, params.customerId),
                eq(schema.paymentTokens.status, 'pending'),
                gt(schema.paymentTokens.expiresAt, new Date())
            )
        )
        .orderBy(desc(schema.paymentTokens.createdAt))
        .limit(1);

    if (!result) {
        return null;
    }

    if (params.amount !== undefined && Number(result.amount) !== params.amount) {
        return null;
    }

    if (params.currency && result.currency !== params.currency) {
        return null;
    }

    return result;
}

/**
 * Get payment token info
 */
export async function getPaymentToken(token: string): Promise<{
    token: typeof schema.paymentTokens.$inferSelect;
    order: { orderNumber: string; customerName: string };
} | null> {
    const [result] = await db
        .select({
            token: schema.paymentTokens,
            orderNumber: schema.orders.orderNumber,
            customerName: schema.customers.name,
        })
        .from(schema.paymentTokens)
        .leftJoin(schema.orders, eq(schema.paymentTokens.orderId, schema.orders.id))
        .leftJoin(schema.customers, eq(schema.paymentTokens.customerId, schema.customers.id))
        .where(eq(schema.paymentTokens.token, token))
        .limit(1);

    if (!result) return null;

    return {
        token: result.token,
        order: {
            orderNumber: result.orderNumber || '',
            customerName: result.customerName || '',
        },
    };
}

/**
 * Expire old payment tokens (run as a scheduled job)
 */
export async function expireOldTokens(): Promise<number> {
    const now = new Date();
    const result = await db
        .update(schema.paymentTokens)
        .set({ status: 'expired' })
        .where(
            and(
                eq(schema.paymentTokens.status, 'pending'),
                lt(schema.paymentTokens.expiresAt, now)
            )
        )
        .returning();

    return result.length;
}

