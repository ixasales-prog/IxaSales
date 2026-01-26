/**
 * Scheduled Jobs
 * 
 * Background tasks that run periodically.
 * These should be triggered by a cron scheduler (e.g., node-cron, external cron, or cloud scheduler).
 */

import { processOverdueDebtNotifications, retryFailedNotifications, getRetryQueueStats } from './telegram';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, lt, and, sql } from 'drizzle-orm';
import { loadSettingsFromDB } from './systemSettings';
import { runGPSTrackingCleanup } from './gps-tracking-cleanup';
import { runFollowUpRemindersJob } from './scheduler/jobs/deepFollowUpReminders';
import { runCleanupJob } from './cleanup';

// ============================================================================
// JOB: Overdue Debt Notifications
// ============================================================================

/**
 * Check for overdue debts and send notifications to admins
 * Recommended: Run daily at 9 AM
 */
export async function runOverdueDebtJob(): Promise<void> {
    console.log('[Scheduler] Running overdue debt notification job...');

    try {
        const result = await processOverdueDebtNotifications();
        console.log(`[Scheduler] Overdue debt job completed. Processed: ${result.processed}, Sent: ${result.sent}`);
    } catch (error) {
        console.error('[Scheduler] Error in overdue debt job:', error);
    }
}

// ============================================================================
// JOB: Subscription Expiration Warnings
// ============================================================================

/**
 * Check for expiring subscriptions and notify Super Admin
 * Recommended: Run daily
 */
export async function runSubscriptionExpirationJob(): Promise<void> {
    console.log('[Scheduler] Running subscription expiration check...');

    try {
        const { notifySubscriptionExpiring } = await import('./telegram');

        // Find tenants expiring in the next 7 days
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + 7);

        const expiringTenants = await db
            .select({
                id: schema.tenants.id,
                name: schema.tenants.name,
                plan: schema.tenants.plan,
                subscriptionEndAt: schema.tenants.subscriptionEndAt,
            })
            .from(schema.tenants)
            .where(and(
                eq(schema.tenants.isActive, true),
                lt(schema.tenants.subscriptionEndAt, warningDate),
                sql`${schema.tenants.subscriptionEndAt} > NOW()`
            ));

        for (const tenant of expiringTenants) {
            if (tenant.subscriptionEndAt) {
                const daysLeft = Math.ceil(
                    (tenant.subscriptionEndAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );

                await notifySubscriptionExpiring({
                    name: tenant.name,
                    plan: tenant.plan || 'unknown',
                    daysLeft,
                });
            }
        }

        console.log(`[Scheduler] Subscription check completed. Found ${expiringTenants.length} expiring tenants.`);
    } catch (error) {
        console.error('[Scheduler] Error in subscription expiration job:', error);
    }
}

// ============================================================================
// JOB: Customer Payment Reminders
// ============================================================================

/**
 * Send payment reminders to customers with overdue balances
 * Recommended: Run weekly or as configured per tenant
 */
export async function runCustomerPaymentReminderJob(): Promise<void> {
    console.log('[Scheduler] Running customer payment reminder job...');

    try {
        const { notifyCustomerPaymentDue, canSendTenantNotification } = await import('./telegram');

        // Get all active tenants with Telegram enabled
        const tenants = await db
            .select({
                id: schema.tenants.id,
                currency: schema.tenants.currency,
            })
            .from(schema.tenants)
            .where(and(
                eq(schema.tenants.isActive, true),
                eq(schema.tenants.telegramEnabled, true)
            ));

        let totalSent = 0;

        for (const tenant of tenants) {
            // Check if tenant has due debt notifications enabled
            const { canSend, settings } = await canSendTenantNotification(tenant.id, 'notifyDueDebt');
            if (!canSend || !settings) continue;

            const threshold = settings.dueDebtDaysThreshold || 7;
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - threshold);

            // Find customers with overdue debts who have Telegram linked
            const overdueCustomers = await db
                .select({
                    customerId: schema.customers.id,
                    customerName: schema.customers.name,
                    customerChatId: schema.customers.telegramChatId,
                    totalDebt: sql<number>`SUM(CAST(${schema.orders.totalAmount} AS DECIMAL) - CAST(${schema.orders.paidAmount} AS DECIMAL))`,
                    ordersCount: sql<number>`COUNT(*)`,
                    oldestOrder: sql<Date>`MIN(${schema.orders.createdAt})`,
                })
                .from(schema.orders)
                .innerJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                .where(and(
                    eq(schema.orders.tenantId, tenant.id),
                    eq(schema.orders.paymentStatus, 'unpaid'),
                    lt(schema.orders.createdAt, thresholdDate),
                    sql`${schema.customers.telegramChatId} IS NOT NULL`
                ))
                .groupBy(
                    schema.customers.id,
                    schema.customers.name,
                    schema.customers.telegramChatId
                );

            for (const customer of overdueCustomers) {
                if (Number(customer.totalDebt) <= 0 || !customer.customerChatId) continue;

                const daysOverdue = Math.floor(
                    (Date.now() - new Date(customer.oldestOrder).getTime()) / (1000 * 60 * 60 * 24)
                );

                const success = await notifyCustomerPaymentDue(
                    tenant.id,
                    { chatId: customer.customerChatId, name: customer.customerName },
                    {
                        totalDebt: Number(customer.totalDebt),
                        currency: tenant.currency || 'USD',
                        daysOverdue,
                        ordersCount: Number(customer.ordersCount),
                    }
                );

                if (success) totalSent++;
            }
        }

        console.log(`[Scheduler] Customer payment reminder job completed. Sent: ${totalSent}`);
    } catch (error) {
        console.error('[Scheduler] Error in customer payment reminder job:', error);
    }
}

// ============================================================================
// JOB: Retry Failed Notifications
// ============================================================================

/**
 * Retry failed notifications that are less than 24 hours old
 * Recommended: Run every 15 minutes
 */
export async function runNotificationRetryJob(): Promise<void> {
    console.log('[Scheduler] Running notification retry job...');

    try {
        const result = await retryFailedNotifications();
        console.log(`[Scheduler] Notification retry job completed. Processed: ${result.processed}, Succeeded: ${result.succeeded}, Failed: ${result.failed}`);
    } catch (error) {
        console.error('[Scheduler] Error in notification retry job:', error);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize scheduler on app startup
 * This sets up a simple interval-based scheduler
 * For production, consider using a proper job scheduler like node-cron or Bull
 */
export function initializeScheduler(): void {
    console.log('[Scheduler] Initializing scheduled jobs...');

    // Load settings from DB on startup
    loadSettingsFromDB().catch(console.error);

    // Daily jobs - run at different intervals to spread load
    // Debt notifications: Every 24 hours (check at startup, then every 24h)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Run debt notification job after a short delay (to let server warm up)
    setTimeout(() => {
        runOverdueDebtJob().catch(console.error);
        runSubscriptionExpirationJob().catch(console.error);
        runFollowUpRemindersJob().catch(console.error); // Run follow-up reminders
        // GPS cleanup runs daily, not on startup
    }, 60000); // 1 minute after startup

    // Then run daily
    setInterval(() => {
        runOverdueDebtJob().catch(console.error);
        runSubscriptionExpirationJob().catch(console.error);
        runGPSTrackingCleanup().catch(console.error);
        runFollowUpRemindersJob().catch(console.error); // Run follow-up reminders daily
        runCleanupJob().catch(console.error); // Run cleanup including user activity data
    }, TWENTY_FOUR_HOURS);

    // Customer payment reminders: Weekly
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    setInterval(() => {
        runCustomerPaymentReminderJob().catch(console.error);
    }, ONE_WEEK);

    // Notification retry: Every 15 minutes
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    setInterval(() => {
        runNotificationRetryJob().catch(console.error);
    }, FIFTEEN_MINUTES);

    console.log('[Scheduler] Scheduled jobs initialized.');
}

// ============================================================================
// MANUAL TRIGGER ENDPOINTS (for admin use)
// ============================================================================

export async function triggerJob(jobName: string): Promise<{ success: boolean; message: string }> {
    switch (jobName) {
        case 'overdue-debt':
            await runOverdueDebtJob();
            return { success: true, message: 'Overdue debt job completed' };

        case 'subscription-expiration':
            await runSubscriptionExpirationJob();
            return { success: true, message: 'Subscription expiration job completed' };

        case 'customer-payment-reminder':
            await runCustomerPaymentReminderJob();
            return { success: true, message: 'Customer payment reminder job completed' };

        case 'notification-retry':
            await runNotificationRetryJob();
            return { success: true, message: 'Notification retry job completed' };

        case 'gps-cleanup':
            await runGPSTrackingCleanup();
            return { success: true, message: 'GPS tracking cleanup job completed' };

        case 'follow-up-reminders':
            await runFollowUpRemindersJob();
            return { success: true, message: 'Follow-up reminders job completed' };

        case 'cleanup':
            await runCleanupJob();
            return { success: true, message: 'Cleanup job completed' };

        default:
            return { success: false, message: `Unknown job: ${jobName}` };
    }
}
