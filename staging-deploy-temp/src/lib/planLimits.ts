/**
 * Plan Limits Configuration
 * 
 * This module provides dynamic plan limits that can be updated at runtime.
 * Limits are derived from the plan, not stored per-tenant.
 */

import { db, schema } from '../db';
import { eq, sql, count, and, gte } from 'drizzle-orm';

// Default plan limits
const DEFAULT_PLAN_LIMITS: Record<string, { maxUsers: number; maxProducts: number; maxOrdersPerMonth: number }> = {
    free: { maxUsers: 5, maxProducts: 100, maxOrdersPerMonth: 100 },
    starter: { maxUsers: 10, maxProducts: 500, maxOrdersPerMonth: 500 },
    pro: { maxUsers: 50, maxProducts: 5000, maxOrdersPerMonth: 5000 },
    enterprise: { maxUsers: 9999, maxProducts: 99999, maxOrdersPerMonth: 99999 },
};

// In-memory cache for plan limits (can be updated via API)
let cachedPlanLimits = { ...DEFAULT_PLAN_LIMITS };

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(plan: string) {
    return cachedPlanLimits[plan] || cachedPlanLimits.starter;
}

/**
 * Get all plan limits
 */
export function getAllPlanLimits() {
    return cachedPlanLimits;
}

/**
 * Update plan limits (called from /super/plan-limits API)
 */
export function updatePlanLimits(newLimits: typeof cachedPlanLimits) {
    cachedPlanLimits = newLimits;
}

/**
 * Get effective limits for a tenant (derived from plan, with optional overrides)
 */
export async function getTenantLimits(tenantId: string) {
    const [tenant] = await db
        .select({
            plan: schema.tenants.plan,
            maxUsersOverride: schema.tenants.maxUsers,
            maxProductsOverride: schema.tenants.maxProducts,
            maxOrdersOverride: schema.tenants.maxOrdersPerMonth,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    if (!tenant) {
        return getPlanLimits('starter'); // fallback
    }

    const planLimits = getPlanLimits(tenant.plan || 'starter');

    // Return plan limits (overrides are ignored in dynamic model)
    return planLimits;
}

/**
 * Check if tenant can create more users
 */
export async function canCreateUser(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);

    const [result] = await db
        .select({ count: count(schema.users.id) })
        .from(schema.users)
        .where(eq(schema.users.tenantId, tenantId));

    const current = Number(result?.count || 0);
    return {
        allowed: current < limits.maxUsers,
        current,
        max: limits.maxUsers
    };
}

/**
 * Check if tenant can create more products
 */
export async function canCreateProduct(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);

    const [result] = await db
        .select({ count: count(schema.products.id) })
        .from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));

    const current = Number(result?.count || 0);
    return {
        allowed: current < limits.maxProducts,
        current,
        max: limits.maxProducts
    };
}

/**
 * Check if tenant can create more orders this month
 */
export async function canCreateOrder(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);

    // Get first day of current month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [result] = await db
        .select({ count: count(schema.orders.id) })
        .from(schema.orders)
        .where(and(
            eq(schema.orders.tenantId, tenantId),
            gte(schema.orders.createdAt, firstOfMonth)
        ));

    const current = Number(result?.count || 0);
    return {
        allowed: current < limits.maxOrdersPerMonth,
        current,
        max: limits.maxOrdersPerMonth
    };
}
