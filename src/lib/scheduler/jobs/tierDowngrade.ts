/**
 * Tier Downgrade Job
 * 
 * Evaluates active tier downgrade rules against customer data and
 * applies tier changes when conditions are met. Runs daily.
 * 
 * Idempotent: Uses tier_change_logs to prevent repeated downgrades 
 * for the same rule within a 24-hour window.
 */

import { db } from '../../../db';
import * as schema from '../../../db/schema';
import { eq, and, sql, lt, isNotNull } from 'drizzle-orm';

interface DowngradeResult {
    processed: number;
    downgraded: number;
    skipped: number;
    errors: number;
}

export async function runTierDowngradeJob(): Promise<DowngradeResult> {
    console.log('[TierDowngrade] Running tier downgrade evaluation job...');

    const result: DowngradeResult = { processed: 0, downgraded: 0, skipped: 0, errors: 0 };

    try {
        // 1. Get all active downgrade rules across all tenants
        const activeRules = await db
            .select({
                id: schema.tierDowngradeRules.id,
                tenantId: schema.tierDowngradeRules.tenantId,
                fromTierId: schema.tierDowngradeRules.fromTierId,
                toTierId: schema.tierDowngradeRules.toTierId,
                conditionType: schema.tierDowngradeRules.conditionType,
                conditionValue: schema.tierDowngradeRules.conditionValue,
                fromTierName: sql<string>`ft.name`,
                toTierName: sql<string>`tt.name`,
                creditLimit: sql<string>`ft.credit_limit`,
            })
            .from(schema.tierDowngradeRules)
            .innerJoin(
                sql`${schema.customerTiers} AS ft`,
                sql`ft.id = ${schema.tierDowngradeRules.fromTierId}`
            )
            .innerJoin(
                sql`${schema.customerTiers} AS tt`,
                sql`tt.id = ${schema.tierDowngradeRules.toTierId}`
            )
            .where(eq(schema.tierDowngradeRules.isActive, true));

        if (activeRules.length === 0) {
            console.log('[TierDowngrade] No active rules found. Exiting.');
            return result;
        }

        console.log(`[TierDowngrade] Found ${activeRules.length} active rules to evaluate.`);

        // 2. Process each rule
        for (const rule of activeRules) {
            try {
                result.processed++;
                const downgraded = await evaluateRule(rule);
                result.downgraded += downgraded;
            } catch (error) {
                result.errors++;
                console.error(`[TierDowngrade] Error evaluating rule ${rule.id}:`, error);
            }
        }

        console.log(`[TierDowngrade] Job completed. Processed: ${result.processed}, Downgraded: ${result.downgraded}, Errors: ${result.errors}`);
    } catch (error) {
        console.error('[TierDowngrade] Fatal error in tier downgrade job:', error);
    }

    return result;
}

interface RuleWithContext {
    id: string;
    tenantId: string;
    fromTierId: string;
    toTierId: string;
    conditionType: string;
    conditionValue: number;
    fromTierName: string;
    toTierName: string;
    creditLimit: string;
}

async function evaluateRule(rule: RuleWithContext): Promise<number> {
    // Find customers currently in the "from" tier
    const customersInTier = await db
        .select({
            id: schema.customers.id,
            name: schema.customers.name,
            debtBalance: schema.customers.debtBalance,
            lastOrderDate: schema.customers.lastOrderDate,
        })
        .from(schema.customers)
        .where(and(
            eq(schema.customers.tenantId, rule.tenantId),
            eq(schema.customers.tierId, rule.fromTierId),
            eq(schema.customers.isActive, true)
        ));

    if (customersInTier.length === 0) return 0;

    let downgraded = 0;

    for (const customer of customersInTier) {
        const shouldDowngrade = await checkCondition(rule, customer);
        if (!shouldDowngrade) continue;

        // Idempotency check: has this rule already been applied to this customer in the last 24h?
        const recentLog = await db
            .select({ id: schema.tierChangeLogs.id })
            .from(schema.tierChangeLogs)
            .where(and(
                eq(schema.tierChangeLogs.customerId, customer.id),
                eq(schema.tierChangeLogs.ruleId, rule.id),
                sql`${schema.tierChangeLogs.executedAt} > NOW() - INTERVAL '24 hours'`
            ))
            .limit(1);

        if (recentLog.length > 0) {
            continue; // Already processed within 24h
        }

        // Apply the downgrade
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
                        changeType: 'downgrade',
                        ruleId: rule.id,
                        reason: buildReason(rule, customer),
                    });
            });

            downgraded++;
            console.log(`[TierDowngrade] Customer "${customer.name}" (${customer.id}): ${rule.fromTierName} → ${rule.toTierName} (rule: ${rule.conditionType} = ${rule.conditionValue})`);
        } catch (error) {
            console.error(`[TierDowngrade] Failed to downgrade customer ${customer.id}:`, error);
        }
    }

    return downgraded;
}

async function checkCondition(
    rule: RuleWithContext,
    customer: { id: string; debtBalance: string | null; lastOrderDate: string | null }
): Promise<boolean> {
    switch (rule.conditionType) {
        case 'days_since_order': {
            // Downgrade if customer hasn't ordered in X days
            if (!customer.lastOrderDate) {
                // No orders ever — condition met
                return true;
            }
            const lastOrder = new Date(customer.lastOrderDate);
            const daysSince = Math.floor(
                (Date.now() - lastOrder.getTime()) / (1000 * 60 * 60 * 24)
            );
            return daysSince >= rule.conditionValue;
        }

        case 'debt_over_limit': {
            // Downgrade if debt exceeds credit limit by X%
            const creditLimit = Number(rule.creditLimit || 0);
            if (creditLimit <= 0) return false; // No credit limit set

            const debt = Number(customer.debtBalance || 0);
            const threshold = creditLimit * (1 + rule.conditionValue / 100);
            return debt > threshold;
        }

        case 'debt_overdue_days': {
            // Downgrade if customer has unpaid orders older than X days
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - rule.conditionValue);

            const [overdueOrders] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.orders)
                .where(and(
                    eq(schema.orders.customerId, customer.id),
                    eq(schema.orders.paymentStatus, 'unpaid'),
                    lt(schema.orders.createdAt, thresholdDate)
                ));

            return Number(overdueOrders?.count || 0) > 0;
        }

        default:
            console.warn(`[TierDowngrade] Unknown condition type: ${rule.conditionType}`);
            return false;
    }
}

function buildReason(rule: RuleWithContext, customer: { debtBalance: string | null; lastOrderDate: string | null }): string {
    switch (rule.conditionType) {
        case 'days_since_order': {
            const days = customer.lastOrderDate
                ? Math.floor((Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'never';
            return `No orders for ${days} days (threshold: ${rule.conditionValue} days). Auto-downgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        }
        case 'debt_over_limit': {
            const debt = Number(customer.debtBalance || 0);
            return `Debt ${debt.toFixed(2)} exceeds credit limit by ${rule.conditionValue}%. Auto-downgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        }
        case 'debt_overdue_days':
            return `Unpaid orders overdue for ${rule.conditionValue}+ days. Auto-downgraded from ${rule.fromTierName} to ${rule.toTierName}.`;
        default:
            return `Auto-downgraded by rule ${rule.id}.`;
    }
}
