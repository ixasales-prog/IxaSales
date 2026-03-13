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
import { CronJob } from 'cron';
import postgres from 'postgres';
import { runGPSTrackingCleanup } from './gps-tracking-cleanup';
import { runFollowUpRemindersJob } from './scheduler/jobs/deepFollowUpReminders';
import { runTierDowngradeJob } from './scheduler/jobs/tierDowngrade';
import { runTierUpgradeJob } from './scheduler/jobs/tierUpgrade';
import { runCleanupJob } from './cleanup';
import { verifyBackups, verifyTenantBackups } from './backup';

let backupDrillJob: CronJob | null = null;
const SCHEDULER_LOCK_BASE_KEY = 95441000;

function shouldUseExternalBackupVerificationScheduler(): boolean {
    const explicit = (process.env.BACKUP_VERIFICATION_SCHEDULER_MODE || '').trim().toLowerCase();
    if (explicit === 'external') return true;
    if (explicit === 'internal') return false;
    return process.env.NODE_ENV === 'production';
}

function computeSchedulerLockKey(jobName: string): number {
    let hash = 0;
    for (let i = 0; i < jobName.length; i++) {
        hash = (hash * 31 + jobName.charCodeAt(i)) | 0;
    }
    const normalized = Math.abs(hash % 10_000);
    return SCHEDULER_LOCK_BASE_KEY + normalized;
}

async function runWithJobDistributedLock(
    jobName: string,
    task: () => Promise<{ success: boolean; message: string }>
): Promise<{ success: boolean; message: string }> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        return { success: false, message: 'DATABASE_URL is not configured' };
    }

    const lockKey = computeSchedulerLockKey(jobName);
    const client = postgres(dbUrl, { max: 1, prepare: false });
    try {
        const lockedRows = await client<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${lockKey}) AS locked`;
        if (!lockedRows?.[0]?.locked) {
            return { success: false, message: `Skipped ${jobName}: another scheduler runner already holds lock` };
        }

        return await task();
    } catch (err: any) {
        return { success: false, message: `Scheduler lock failure for ${jobName}: ${err?.message || 'unknown error'}` };
    } finally {
        try {
            await client`SELECT pg_advisory_unlock(${lockKey})`;
        } catch {
            // Best effort unlock.
        }
        try {
            await client.end();
        } catch {
            // ignore
        }
    }
}

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

        // Get all active tenants; notification gating checks integration state per tenant.
        const tenants = await db
            .select({
                id: schema.tenants.id,
                currency: schema.tenants.currency,
            })
            .from(schema.tenants)
            .where(and(
                eq(schema.tenants.isActive, true)
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
// JOB: Backup Verification
// ============================================================================

/**
 * Verify latest backups (checksum/integrity + optional freshness SLO).
 * Recommended: Run daily.
 */
export async function runBackupVerificationJob(options?: { runRestoreDrill?: boolean }): Promise<void> {
    console.log('[Scheduler] Running backup verification job...');

    try {
        const result = await verifyBackups({
            maxFiles: Number(process.env.BACKUP_VERIFY_MAX_FILES || 5),
            runRestoreDrill: options?.runRestoreDrill ?? false,
            maxAgeHours: Number(process.env.BACKUP_VERIFY_MAX_AGE_HOURS || 0),
        });

        if (result.success) {
            console.log(`[Scheduler] Backup verification completed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
        } else {
            console.error(`[Scheduler] Backup verification failed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
        }
    } catch (error) {
        console.error('[Scheduler] Error in backup verification job:', error);
    }
}

/**
 * Verify tenant-scoped backups (manifest/checksum + optional freshness SLO).
 * Recommended: Run daily.
 */
export async function runTenantBackupVerificationJob(): Promise<void> {
    console.log('[Scheduler] Running tenant backup verification job...');

    try {
        const result = await verifyTenantBackups({
            maxFiles: Number(process.env.BACKUP_VERIFY_TENANT_MAX_FILES || 20),
            maxAgeHours: Number(process.env.BACKUP_VERIFY_MAX_AGE_HOURS || 0),
        });

        if (result.success) {
            console.log(`[Scheduler] Tenant backup verification completed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
        } else {
            console.error(`[Scheduler] Tenant backup verification failed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
        }
    } catch (error) {
        console.error('[Scheduler] Error in tenant backup verification job:', error);
    }
}

/**
 * Nightly restore-drill verification for full backups with superadmin alerting.
 * Disabled unless BACKUP_VERIFY_DATABASE_URL is configured.
 */
export async function runBackupRestoreDrillNightlyJob(): Promise<void> {
    if (!process.env.BACKUP_VERIFY_DATABASE_URL) {
        console.warn('[Scheduler] Restore-drill nightly job skipped: BACKUP_VERIFY_DATABASE_URL is not configured');
        return;
    }

    console.log('[Scheduler] Running nightly backup restore-drill...');
    try {
        const maxFiles = Math.max(1, Number(process.env.BACKUP_VERIFY_DRILL_MAX_FILES || 1));
        const maxAgeHours = Number(process.env.BACKUP_VERIFY_MAX_AGE_HOURS || 0);
        const result = await verifyBackups({
            maxFiles,
            runRestoreDrill: true,
            maxAgeHours,
        });

        if (result.success) {
            console.log(`[Scheduler] Nightly restore-drill passed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
            return;
        }

        console.error(`[Scheduler] Nightly restore-drill failed. Checked: ${result.checked}, Passed: ${result.passed}, Failed: ${result.failed}`);
        const { notifySuperAdmin } = await import('./telegram');
        const firstError = result.items.find((i) => !!i.error)?.error || 'Unknown restore-drill failure';
        await notifySuperAdmin(
            `[ALERT] Backup restore-drill FAILED\n` +
            `Time: ${new Date().toISOString()}\n` +
            `Checked: ${result.checked}, Failed: ${result.failed}\n` +
            `First error: ${firstError}`
        );
    } catch (error: any) {
        console.error('[Scheduler] Error in nightly restore-drill job:', error);
        try {
            const { notifySuperAdmin } = await import('./telegram');
            await notifySuperAdmin(
                `[ALERT] Backup restore-drill ERROR\n` +
                `Time: ${new Date().toISOString()}\n` +
                `Error: ${error?.message || 'Unknown error'}`
            );
        } catch {
            // Ignore notification errors to keep scheduler resilient.
        }
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

    const externalBackupVerificationScheduler = shouldUseExternalBackupVerificationScheduler();
    if (externalBackupVerificationScheduler) {
        console.log('[Scheduler] Backup verification scheduling mode: external (in-process backup verify schedules disabled)');
    } else {
        console.log('[Scheduler] Backup verification scheduling mode: internal');
    }

    // Daily jobs - run at different intervals to spread load
    // Debt notifications: Every 24 hours (check at startup, then every 24h)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Run debt notification job after a short delay (to let server warm up)
    setTimeout(() => {
        runOverdueDebtJob().catch(console.error);
        runSubscriptionExpirationJob().catch(console.error);
        runFollowUpRemindersJob().catch(console.error);
        runTierDowngradeJob().catch(console.error);
        // GPS cleanup runs daily, not on startup
    }, 60000); // 1 minute after startup

    // Then run daily
    setInterval(() => {
        runOverdueDebtJob().catch(console.error);
        runSubscriptionExpirationJob().catch(console.error);
        runGPSTrackingCleanup().catch(console.error);
        runFollowUpRemindersJob().catch(console.error);
        runTierDowngradeJob().catch(console.error);
        runCleanupJob().catch(console.error);
        if (!externalBackupVerificationScheduler) {
            runBackupVerificationJob().catch(console.error);
            runTenantBackupVerificationJob().catch(console.error);
        }
    }, TWENTY_FOUR_HOURS);

    // Customer payment reminders: Weekly
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    setInterval(() => {
        runCustomerPaymentReminderJob().catch(console.error);
        runTierUpgradeJob().catch(console.error);
    }, ONE_WEEK);

    // Notification retry: Every 15 minutes
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    setInterval(() => {
        runNotificationRetryJob().catch(console.error);
    }, FIFTEEN_MINUTES);

    // Nightly backup restore-drill (cron) to ensure backups are actually restorable.
    // Default: 02:15 UTC daily. Override with BACKUP_VERIFY_DRILL_CRON and BACKUP_VERIFY_DRILL_TIMEZONE.
    if (backupDrillJob) {
        backupDrillJob.stop();
        backupDrillJob = null;
    }
    if (!externalBackupVerificationScheduler) {
        const drillCron = process.env.BACKUP_VERIFY_DRILL_CRON || '15 2 * * *';
        const drillTimezone = process.env.BACKUP_VERIFY_DRILL_TIMEZONE || 'UTC';
        backupDrillJob = new CronJob(drillCron, async () => {
            await runBackupRestoreDrillNightlyJob();
        }, null, false, drillTimezone);
        backupDrillJob.start();
        console.log(`[Scheduler] Nightly backup restore-drill scheduled: ${drillCron} (${drillTimezone})`);
    } else {
        console.log('[Scheduler] Nightly backup restore-drill cron disabled (external scheduler mode)');
    }

    console.log('[Scheduler] Scheduled jobs initialized.');
}

// ============================================================================
// MANUAL TRIGGER ENDPOINTS (for admin use)
// ============================================================================

async function triggerJobInternal(jobName: string): Promise<{ success: boolean; message: string }> {
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

        case 'backup-verify':
            await runBackupVerificationJob({ runRestoreDrill: false });
            return { success: true, message: 'Backup verification job completed' };

        case 'backup-verify-drill':
            if (!process.env.BACKUP_VERIFY_DATABASE_URL) {
                return { success: false, message: 'BACKUP_VERIFY_DATABASE_URL is not configured' };
            }
            await runBackupVerificationJob({ runRestoreDrill: true });
            return { success: true, message: 'Backup verification drill job completed' };

        case 'backup-verify-drill-nightly':
            await runBackupRestoreDrillNightlyJob();
            return { success: true, message: 'Nightly backup restore-drill job completed' };

        case 'backup-verify-tenant':
            await runTenantBackupVerificationJob();
            return { success: true, message: 'Tenant backup verification job completed' };

        case 'tier-downgrade':
            const downgradeResult = await runTierDowngradeJob();
            return { success: true, message: `Tier downgrade job completed. Downgraded: ${downgradeResult.downgraded}, Errors: ${downgradeResult.errors}` };

        case 'tier-upgrade':
            const upgradeResult = await runTierUpgradeJob();
            return { success: true, message: `Tier upgrade job completed. Upgraded: ${upgradeResult.upgraded}, Errors: ${upgradeResult.errors}` };

        default:
            return { success: false, message: `Unknown job: ${jobName}` };
    }
}

export async function triggerJob(jobName: string): Promise<{ success: boolean; message: string }> {
    return await runWithJobDistributedLock(jobName, () => triggerJobInternal(jobName));
}

export async function triggerJobsSequentially(jobNames: string[]): Promise<Array<{ jobName: string; success: boolean; message: string }>> {
    const results: Array<{ jobName: string; success: boolean; message: string }> = [];
    for (const jobName of jobNames) {
        const result = await triggerJob(jobName);
        results.push({ jobName, ...result });
    }
    return results;
}
