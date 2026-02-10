/**
 * Tier Upgrade Job
 * 
 * Evaluates active tier upgrade rules against customer achievement data
 * and applies tier upgrades when conditions are met. Runs weekly.
 * 
 * Achievement-based conditions:
 *   - orders_count: Number of orders placed within the period
 *   - total_spend: Total order value within the period
 *   - on_time_payment_pct: Percentage of orders paid within payment terms
 * 
 * Cooldown protection: A customer won't be re-evaluated for the same 
 * upgrade rule until their cooldown period has elapsed.
 */

import { db } from '../../../db';
import * as schema from '../../../db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';

interface UpgradeResult {
    processed: number;
    upgraded: number;
    skipped: number;
    errors: number;
}

export async function runTierUpgradeJob(): Promise<UpgradeResult> {
    console.log('[TierUpgrade] Running tier upgrade evaluation job...');

    const result: UpgradeResult = { processed: 0, upgraded: 0, skipped: 0, errors: 0 };

    try {
        // 1. Get all active upgrade rules across all tenants
        const activeRules = await db
            .select({
                id: schema.tierUpgradeRules.id,
                tenantId: schema.tierUpgradeRules.tenantId,
                fromTierId: schema.tierUpgradeRules.fromTierId,
                toTierId: schema.tierUpgradeRules.toTierId,
                conditionType: schema.tierUpgradeRules.conditionType,
                conditionValue: schema.tierUpgradeRules.conditionValue,
                periodDays: schema.tierUpgradeRules.periodDays,
                cooldownDays: schema.tierUpgradeRules.cooldownDays,
                fromTierName: sql<string>`ft.name`,
                toTierName: sql<string>`tt.name`,
                paymentTermsDays: sql<number>`ft.payment_terms_days`,
            })
            .from(schema.tierUpgradeRules)
            .innerJoin(
                sql`${schema.customerTiers} AS ft`,
                sql`ft.id = ${schema.tierUpgradeRules.fromTierId}`
            )
            .innerJoin(
                sql`${schema.customerTiers} AS tt`,
                sql`tt.id = ${schema.tierUpgradeRules.toTierId}`
            )
            .where(eq(schema.tierUpgradeRules.isActive, true));

        if (activeRules.length === 0) {
            console.log('[TierUpgrade] No active upgrade rules found. Exiting.');
            return result;
        }

        console.log(`[TierUpgrade] Found ${activeRules.length} active upgrade rules to evaluate.`);

        // 2. Process each rule
        for (const rule of activeRules) {
            try {
                result.processed++;
                const upgraded = await evaluateUpgradeRule(rule);
                result.upgraded += upgraded;
            } catch (error) {
                result.errors++;
                console.error(`[TierUpgrade] Error evaluating rule ${rule.id}:`, error);
            }
        }

        console.log(`[TierUpgrade] Job completed. Processed: ${result.processed}, Upgraded: ${result.upgraded}, Errors: ${result.errors}`);
    } catch (error) {
        console.error('[TierUpgrade] Fatal error in tier upgrade job:', error);
    }

    return result;
}

interface UpgradeRuleWithContext {
    id: string;
    tenantId: string;
    fromTierId: string;
    toTierId: string;
    conditionType: string;
    conditionValue: number;
    periodDays: number;
    cooldownDays: number;
    fromTierName: string;
    toTierName: string;
    paymentTermsDays: number;
}

async function evaluateUpgradeRule(rule: UpgradeRuleWithContext): Promise<number> {
    // Find customers currently in the "from" tier
    const customersInTier = await db
        .select({
            id: schema.customers.id,
            name: schema.customers.name,
        })
        .from(schema.customers)
        .where(and(
            eq(schema.customers.tenantId, rule.tenantId),
            eq(schema.customers.tierId, rule.fromTierId),
            eq(schema.customers.isActive, true)
        ));

    if (customersInTier.length === 0) return 0;

    let upgraded = 0;

    for (const customer of customersInTier) {
        // Cooldown check: skip if customer was already upgraded by this rule within cooldown period
        const recentUpgrade = await db
            .select({ id: schema.tierChangeLogs.id })
            .from(schema.tierChangeLogs)
            .where(and(
                eq(schema.tierChangeLogs.customerId, customer.id),
                eq(schema.tierChangeLogs.ruleId, rule.id),
                eq(schema.tierChangeLogs.changeType, 'upgrade'),
                sql`${schema.tierChangeLogs.executedAt} > NOW() - INTERVAL '${sql.raw(String(rule.cooldownDays))} days'`
            ))
            .limit(1);

        if (recentUpgrade.length > 0) {
            continue; // Still in cooldown
        }

        // Evaluate the achievement condition
        const qualifies = await checkUpgradeCondition(rule, customer.id);
        if (!qualifies) continue;

        // Apply the upgrade
        try {
            await db.transaction(async (tx: any) => {
                // Update customer tier
                await tx
                    .update(schema.customers)
                    .set({
                        tierId: rule.toTierId,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.customers.id, customer.id));

                // Log the change
                await tx
                    .insert(schema.tierChangeLogs)
                    .values({
                        tenantId: rule.tenantId,
                        customerId: customer.id,
                        fromTierId: rule.fromTierId,
                        toTierId: rule.toTierId,
                        changeType: 'upgrade',
                        ruleId: rule.id,
                        reason: buildUpgradeReason(rule, customer),
                    });
            });

            upgraded++;
            console.log(`[TierUpgrade] Customer "${customer.name}" (${customer.id}): ${rule.fromTierName} → ${rule.toTierName} (rule: ${rule.conditionType} ≥ ${rule.conditionValue} over ${rule.periodDays}d)`);
        } catch (error) {
            console.error(`[TierUpgrade] Failed to upgrade customer ${customer.id}:`, error);
        }
    }

    return upgraded;
}

async function checkUpgradeCondition(
    rule: UpgradeRuleWithContext,
    customerId: string
): Promise<boolean> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - rule.periodDays);

    switch (rule.conditionType) {
        case 'orders_count': {
            // Count delivered/completed orders in the period
            const [result] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.customerId, customerId),
                    gte(schema.orders.createdAt, periodStart),
                    sql`${schema.orders.status} NOT IN ('cancelled', 'returned')`
                ));

            const count = Number(result?.count || 0);
            return count >= rule.conditionValue;
        }

        case 'total_spend': {
            // Sum of totalAmount for non-cancelled orders in the period
            const [result] = await db
                .select({ total: sql<number>`COALESCE(SUM(CAST(${schema.orders.totalAmount} AS DECIMAL)), 0)` })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.customerId, customerId),
                    gte(schema.orders.createdAt, periodStart),
                    sql`${schema.orders.status} NOT IN ('cancelled', 'returned')`
                ));

            const total = Number(result?.total || 0);
            return total >= rule.conditionValue;
        }

        case 'on_time_payment_pct': {
            // Calculate percentage of orders that were paid (fully or partially) 
            // within the tier's payment terms from order creation date.
            // Only considers orders old enough to have been due for payment.
            const paymentTermsDays = rule.paymentTermsDays || 0;

            // Get all non-cancelled orders in the period that are old enough to be evaluated
            const dueCutoff = new Date();
            dueCutoff.setDate(dueCutoff.getDate() - paymentTermsDays);

            const [stats] = await db
                .select({
                    totalOrders: sql<number>`count(*)`,
                    paidOnTime: sql<number>`count(*) FILTER (WHERE ${schema.orders.paymentStatus} IN ('paid', 'partial'))`,
                })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.customerId, customerId),
                    gte(schema.orders.createdAt, periodStart),
                    sql`${schema.orders.createdAt} <= ${dueCutoff}`,
                    sql`${schema.orders.status} NOT IN ('cancelled', 'returned')`
                ));

            const totalOrders = Number(stats?.totalOrders || 0);
            if (totalOrders < 3) return false; // Need minimum 3 orders to evaluate payment discipline

            const paidOnTime = Number(stats?.paidOnTime || 0);
            const pct = Math.round((paidOnTime / totalOrders) * 100);
            return pct >= rule.conditionValue;
        }

        default:
            console.warn(`[TierUpgrade] Unknown condition type: ${rule.conditionType}`);
            return false;
    }
}

function buildUpgradeReason(
    rule: UpgradeRuleWithContext,
    customer: { name: string }
): string {
    const period = `${rule.periodDays} days`;
    switch (rule.conditionType) {
        case 'orders_count':
            return `Placed ${rule.conditionValue}+ orders in the last ${period}. Auto-upgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        case 'total_spend':
            return `Total spend reached ${rule.conditionValue}+ in the last ${period}. Auto-upgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        case 'on_time_payment_pct':
            return `On-time payment rate ≥ ${rule.conditionValue}% over the last ${period}. Auto-upgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        default:
            return `Auto-upgraded by rule ${rule.id}.`;
    }
}
