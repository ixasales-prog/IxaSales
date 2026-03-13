/**
 * Plan Limits Configuration
 *
 * Dynamic plan limits with DB persistence and transaction-safe checks.
 */

import { db, schema } from '../db';
import { eq, sql, count, and, gte } from 'drizzle-orm';

type PlanLimit = { maxUsers: number; maxProducts: number; maxOrdersPerMonth: number };
type PlanLimitsMap = Record<string, PlanLimit>;
type DbExecutor = typeof db | any;
export type LimitResource = 'users' | 'products' | 'orders';
type LimitSource = 'plan' | 'override';
type TenantLimitsDetailed = {
    plan: string;
    effective: PlanLimit;
    planDefaults: PlanLimit;
    source: {
        users: LimitSource;
        products: LimitSource;
        orders: LimitSource;
    };
};

const PLAN_LIMITS_SETTINGS_KEY = 'planLimits.config';

const DEFAULT_PLAN_LIMITS: PlanLimitsMap = {
    free: { maxUsers: 5, maxProducts: 100, maxOrdersPerMonth: 100 },
    starter: { maxUsers: 10, maxProducts: 500, maxOrdersPerMonth: 500 },
    pro: { maxUsers: 50, maxProducts: 5000, maxOrdersPerMonth: 5000 },
    enterprise: { maxUsers: 9999, maxProducts: 99999, maxOrdersPerMonth: 99999 },
};

let cachedPlanLimits: PlanLimitsMap = { ...DEFAULT_PLAN_LIMITS };
let isLoadedFromDb = false;

const asPositiveInt = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};

const normalizePlanLimits = (input: unknown): PlanLimitsMap => {
    const result: PlanLimitsMap = { ...DEFAULT_PLAN_LIMITS };
    if (!input || typeof input !== 'object') return result;

    for (const [plan, defaults] of Object.entries(DEFAULT_PLAN_LIMITS)) {
        const rawPlan = (input as Record<string, any>)[plan];
        if (!rawPlan || typeof rawPlan !== 'object') continue;

        result[plan] = {
            maxUsers: asPositiveInt(rawPlan.maxUsers, defaults.maxUsers),
            maxProducts: asPositiveInt(rawPlan.maxProducts, defaults.maxProducts),
            maxOrdersPerMonth: asPositiveInt(rawPlan.maxOrdersPerMonth, defaults.maxOrdersPerMonth),
        };
    }

    return result;
};

export async function ensurePlanLimitsLoaded(): Promise<void> {
    if (isLoadedFromDb) return;

    try {
        const [row] = await db
            .select({ value: schema.systemSettings.value })
            .from(schema.systemSettings)
            .where(eq(schema.systemSettings.key, PLAN_LIMITS_SETTINGS_KEY))
            .limit(1);

        if (row?.value) {
            try {
                cachedPlanLimits = normalizePlanLimits(JSON.parse(row.value));
            } catch {
                cachedPlanLimits = { ...DEFAULT_PLAN_LIMITS };
            }
        } else {
            cachedPlanLimits = { ...DEFAULT_PLAN_LIMITS };
        }
    } finally {
        isLoadedFromDb = true;
    }
}

export function getPlanLimits(plan: string): PlanLimit {
    return cachedPlanLimits[plan] || cachedPlanLimits.starter;
}

export function getAllPlanLimits(): PlanLimitsMap {
    return cachedPlanLimits;
}

export function buildLimitExceededError(resource: LimitResource, current: number, max: number) {
    const labels: Record<LimitResource, string> = {
        users: 'User',
        products: 'Product',
        orders: 'Monthly order',
    };

    return {
        code: 'LIMIT_EXCEEDED',
        message: `${labels[resource]} limit reached (${current}/${max}). Upgrade your plan.`,
        details: {
            resource,
            current,
            max,
            remaining: Math.max(0, max - current),
            upgradeRequired: true,
        },
    };
}

export async function updatePlanLimits(newLimits: PlanLimitsMap): Promise<PlanLimitsMap> {
    const previous = { ...cachedPlanLimits };
    const normalized = normalizePlanLimits(newLimits);
    cachedPlanLimits = normalized;
    isLoadedFromDb = true;

    await db.transaction(async (tx) => {
        await tx
            .insert(schema.systemSettings)
            .values({
                key: PLAN_LIMITS_SETTINGS_KEY,
                value: JSON.stringify(normalized),
                description: 'Plan limits config (users/products/orders per month)',
            })
            .onConflictDoUpdate({
                target: schema.systemSettings.key,
                set: {
                    value: JSON.stringify(normalized),
                    updatedAt: new Date(),
                },
            });

        // Propagate plan-level default changes to tenants that still use old defaults.
        // Tenants with custom limits are preserved (their values differ from previous defaults).
        for (const [plan, nextLimits] of Object.entries(normalized)) {
            const prevLimits = previous[plan];
            if (!prevLimits) continue;

            if (prevLimits.maxUsers !== nextLimits.maxUsers) {
                await tx.update(schema.tenants)
                    .set({ maxUsers: nextLimits.maxUsers, updatedAt: new Date() })
                    .where(and(
                        eq(schema.tenants.plan, plan as any),
                        eq(schema.tenants.maxUsers, prevLimits.maxUsers),
                    ));
            }

            if (prevLimits.maxProducts !== nextLimits.maxProducts) {
                await tx.update(schema.tenants)
                    .set({ maxProducts: nextLimits.maxProducts, updatedAt: new Date() })
                    .where(and(
                        eq(schema.tenants.plan, plan as any),
                        eq(schema.tenants.maxProducts, prevLimits.maxProducts),
                    ));
            }

            if (prevLimits.maxOrdersPerMonth !== nextLimits.maxOrdersPerMonth) {
                await tx.update(schema.tenants)
                    .set({ maxOrdersPerMonth: nextLimits.maxOrdersPerMonth, updatedAt: new Date() })
                    .where(and(
                        eq(schema.tenants.plan, plan as any),
                        eq(schema.tenants.maxOrdersPerMonth, prevLimits.maxOrdersPerMonth),
                    ));
            }
        }
    });

    return normalized;
}

/**
 * Get effective tenant limits:
 * base from plan + per-tenant override columns when set.
 */
export async function getTenantLimitsDetailed(tenantId: string, executor: DbExecutor = db): Promise<TenantLimitsDetailed> {
    await ensurePlanLimitsLoaded();

    const [tenant] = await executor
        .select({
            plan: schema.tenants.plan,
            maxUsers: schema.tenants.maxUsers,
            maxProducts: schema.tenants.maxProducts,
            maxOrdersPerMonth: schema.tenants.maxOrdersPerMonth,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    if (!tenant) {
        const planDefaults = getPlanLimits('starter');
        return {
            plan: 'starter',
            effective: planDefaults,
            planDefaults,
            source: {
                users: 'plan',
                products: 'plan',
                orders: 'plan',
            },
        };
    }

    const plan = tenant.plan || 'starter';
    const planDefaults = getPlanLimits(plan);

    const maxUsers = asPositiveInt(tenant.maxUsers, planDefaults.maxUsers);
    const maxProducts = asPositiveInt(tenant.maxProducts, planDefaults.maxProducts);
    const maxOrdersPerMonth = asPositiveInt(tenant.maxOrdersPerMonth, planDefaults.maxOrdersPerMonth);

    return {
        plan,
        effective: {
            maxUsers,
            maxProducts,
            maxOrdersPerMonth,
        },
        planDefaults,
        source: {
            users: maxUsers === planDefaults.maxUsers ? 'plan' : 'override',
            products: maxProducts === planDefaults.maxProducts ? 'plan' : 'override',
            orders: maxOrdersPerMonth === planDefaults.maxOrdersPerMonth ? 'plan' : 'override',
        },
    };
}

export async function getTenantLimits(tenantId: string, executor: DbExecutor = db): Promise<PlanLimit> {
    const detailed = await getTenantLimitsDetailed(tenantId, executor);
    return detailed.effective;
}

async function currentUsage(executor: DbExecutor, tenantId: string, resource: LimitResource): Promise<number> {
    if (resource === 'users') {
        const [result] = await executor
            .select({ count: count(schema.users.id) })
            .from(schema.users)
            .where(eq(schema.users.tenantId, tenantId));
        return Number(result?.count || 0);
    }

    if (resource === 'products') {
        const [result] = await executor
            .select({ count: count(schema.products.id) })
            .from(schema.products)
            .where(eq(schema.products.tenantId, tenantId));
        return Number(result?.count || 0);
    }

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [result] = await executor
        .select({ count: count(schema.orders.id) })
        .from(schema.orders)
        .where(and(
            eq(schema.orders.tenantId, tenantId),
            gte(schema.orders.createdAt, firstOfMonth),
        ));
    return Number(result?.count || 0);
}

async function lockTenantResource(executor: DbExecutor, tenantId: string, resource: LimitResource): Promise<void> {
    await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${resource}))`);
}

export async function canCreateResourceInTx(
    executor: DbExecutor,
    tenantId: string,
    resource: LimitResource,
): Promise<{ allowed: boolean; current: number; max: number }> {
    await lockTenantResource(executor, tenantId, resource);
    const limits = await getTenantLimits(tenantId, executor);
    const current = await currentUsage(executor, tenantId, resource);
    const max = resource === 'users'
        ? limits.maxUsers
        : resource === 'products'
            ? limits.maxProducts
            : limits.maxOrdersPerMonth;

    return { allowed: current < max, current, max };
}

export async function canCreateUser(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);
    const current = await currentUsage(db, tenantId, 'users');
    return { allowed: current < limits.maxUsers, current, max: limits.maxUsers };
}

export async function canCreateProduct(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);
    const current = await currentUsage(db, tenantId, 'products');
    return { allowed: current < limits.maxProducts, current, max: limits.maxProducts };
}

export async function canCreateOrder(tenantId: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const limits = await getTenantLimits(tenantId);
    const current = await currentUsage(db, tenantId, 'orders');
    return { allowed: current < limits.maxOrdersPerMonth, current, max: limits.maxOrdersPerMonth };
}
