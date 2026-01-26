/**
 * Follow-Up Reminders Job
 * 
 * Sends automated Telegram reminders to sales representatives for scheduled follow-ups.
 * Prevents lost sales opportunities by reminding reps about pending customer follow-ups.
 */

import { db } from '@/db';
import { salesVisits, customers, users } from '@/db/schema';
import { and, eq, lte, isNull, gte, sql } from 'drizzle-orm';
import { sendFollowUpReminder } from '@/lib/telegram';

/**
 * Get customer details by ID
 */
async function getCustomer(customerId: string) {
    const [customer] = await db
        .select({
            id: customers.id,
            name: customers.name,
            phone: customers.phone,
            address: customers.address,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
    
    return customer;
}

/**
 * Get sales representative details by ID
 */
async function getSalesRep(salesRepId: string) {
    const [salesRep] = await db
        .select({
            id: users.id,
            name: users.name,
            telegramChatId: users.telegramChatId,
        })
        .from(users)
        .where(eq(users.id, salesRepId))
        .limit(1);
    
    return salesRep;
}

/**
 * Run the follow-up reminders job
 * Sends reminders for follow-ups scheduled for today or in the past (up to 7 days ago)
 * to prevent reminder spam for very old follow-ups
 */
export async function runFollowUpRemindersJob(): Promise<void> {
    console.log('[Scheduler] Running follow-up reminders job');
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Set cutoff date to prevent spamming very old follow-ups
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Only remind for follow-ups within last 7 days
    
    try {
        // Find visits that need follow-up reminders
        const visitsNeedingReminders = await db
            .select({
                id: salesVisits.id,
                tenantId: salesVisits.tenantId,
                customerId: salesVisits.customerId,
                salesRepId: salesVisits.salesRepId,
                followUpDate: salesVisits.followUpDate,
                followUpTime: salesVisits.followUpTime,
                followUpReason: salesVisits.followUpReason,
            })
            .from(salesVisits)
            .where(
                and(
                    eq(salesVisits.outcome, 'follow_up'),
                    gte(salesVisits.followUpDate, cutoffDate.toISOString().split('T')[0]),
                    lte(salesVisits.followUpDate, today.toISOString().split('T')[0]),
                    isNull(salesVisits.followUpReminderSentAt) // Don't send duplicates
                )
            );
        
        console.log(`[Scheduler] Found ${visitsNeedingReminders.length} follow-ups needing reminders`);
        
        let sentCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const visit of visitsNeedingReminders) {
            try {
                // Get customer and sales rep details
                const customer = await getCustomer(visit.customerId);
                const salesRep = await getSalesRep(visit.salesRepId);
                
                if (!customer) {
                    console.log(`[Scheduler] Customer ${visit.customerId} not found, skipping`);
                    skippedCount++;
                    continue;
                }
                
                if (!salesRep) {
                    console.log(`[Scheduler] Sales rep ${visit.salesRepId} not found, skipping`);
                    skippedCount++;
                    continue;
                }
                
                if (!salesRep.telegramChatId) {
                    console.log(`[Scheduler] Sales rep ${salesRep.id} has no Telegram chat ID, skipping`);
                    skippedCount++;
                    continue;
                }
                
                // Handle date conversion - followUpDate might be null
                if (!visit.followUpDate) {
                    console.log(`[Scheduler] Visit ${visit.id} has no follow-up date, skipping`);
                    skippedCount++;
                    continue;
                }
                
                // Convert string date to Date object
                const followUpDateObj = new Date(visit.followUpDate);
                
                // Send reminder
                const sent = await sendFollowUpReminder(
                    salesRep.telegramChatId,
                    customer.name,
                    followUpDateObj,
                    visit.followUpTime,
                    visit.followUpReason
                );
                
                if (sent) {
                    // Mark reminder as sent
                    await db
                        .update(salesVisits)
                        .set({ followUpReminderSentAt: new Date() })
                        .where(eq(salesVisits.id, visit.id));
                    
                    console.log(`[Scheduler] Sent follow-up reminder for visit ${visit.id} to ${salesRep.name}`);
                    sentCount++;
                } else {
                    console.log(`[Scheduler] Failed to send follow-up reminder for visit ${visit.id}`);
                    errorCount++;
                }
            } catch (error) {
                console.error(`[Scheduler] Failed to process reminder for visit ${visit.id}:`, error);
                errorCount++;
                // Continue with next visit
            }
        }
        
        console.log(`[Scheduler] Follow-up reminders job completed. Sent: ${sentCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    } catch (error) {
        console.error('[Scheduler] Follow-up reminders job failed:', error);
        throw error;
    }
}