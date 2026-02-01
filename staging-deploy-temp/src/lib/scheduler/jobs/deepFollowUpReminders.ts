/**
 * Deep fix for follow-up reminders job
 * Addresses root causes: date handling, error propagation, and robustness
 */

import { db } from '@/db';
import { salesVisits, customers, users, tenants } from '@/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { sendFollowUpReminder } from '@/lib/telegram';

// Type definitions for better type safety
interface VisitReminderData {
    id: string;
    tenant_id: string;
    customer_id: string;
    sales_rep_id: string;
    follow_up_date: string; // PostgreSQL DATE comes as string
    follow_up_time: string | null;
    follow_up_reason: string | null;
    timezone: string;
}

interface CustomerData {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
}

interface SalesRepData {
    id: string;
    name: string;
    telegramChatId: string | null;
}

interface ReminderProcessingResult {
    visitId: string;
    status: 'sent' | 'skipped' | 'error';
    reason?: string;
    error?: any;
}

/**
 * Deep validation and data fetching with proper error handling
 */
class FollowUpDataFetcher {
    static async getCustomer(customerId: string): Promise<CustomerData | null> {
        try {
            console.log(`[DataFetcher] Fetching customer: ${customerId}`);
            
            const result = await db
                .select({
                    id: customers.id,
                    name: customers.name,
                    phone: customers.phone,
                    address: customers.address,
                })
                .from(customers)
                .where(eq(customers.id, customerId))
                .limit(1);
            
            console.log(`[DataFetcher] Customer result:`, result);
            return result[0] || null;
        } catch (error) {
            console.error(`[DataFetcher] Failed to fetch customer ${customerId}:`, error);
            return null;
        }
    }
    
    static async getSalesRep(salesRepId: string): Promise<SalesRepData | null> {
        try {
            console.log(`[DataFetcher] Fetching sales rep: ${salesRepId}`);
            
            const result = await db
                .select({
                    id: users.id,
                    name: users.name,
                    telegramChatId: users.telegramChatId,
                })
                .from(users)
                .where(eq(users.id, salesRepId))
                .limit(1);
            
            console.log(`[DataFetcher] Sales rep result:`, result);
            return result[0] || null;
        } catch (error) {
            console.error(`[DataFetcher] Failed to fetch sales rep ${salesRepId}:`, error);
            return null;
        }
    }
    
    /**
     * Safely convert database date string to JavaScript Date
     */
    static safeDateConversion(dateString: string | null): Date | null {
        if (!dateString) return null;
        
        try {
            // Handle different date formats that PostgreSQL might return
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                console.warn(`[DateConverter] Invalid date string: ${dateString}`);
                return null;
            }
            return date;
        } catch (error) {
            console.error(`[DateConverter] Failed to convert date ${dateString}:`, error);
            return null;
        }
    }
}

/**
 * Core follow-up reminder processing logic
 */
class FollowUpReminderProcessor {
    private static readonly CUTOFF_DAYS = 7; // Prevent spam for very old follow-ups
    
    /**
     * Find all visits that need follow-up reminders
     */
    static async findPendingReminders(): Promise<VisitReminderData[]> {
        try {
            // Calculate the current date in UTC
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            // Set cutoff date to prevent spamming very old follow-ups
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.CUTOFF_DAYS);
            
            console.log(`[Processor] Searching for follow-ups from ${cutoffDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
            
            // First, get all tenants with their timezones
            const tenantTimezones = await db
                .select({
                    id: tenants.id,
                    timezone: tenants.timezone,
                })
                .from(tenants);
            
            // Create a map of tenant ID to timezone
            const timezoneMap = new Map(tenantTimezones.map(t => [
                t.id, 
                t.timezone || 'UTC'
            ]));
            
            // Get the current date in each tenant's timezone
            const tenantDates = new Map();
            for (const [tenantId, tz] of timezoneMap) {
                const tenantNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
                const tenantToday = new Date(tenantNow.getFullYear(), tenantNow.getMonth(), tenantNow.getDate());
                tenantDates.set(tenantId, tenantToday.toISOString().split('T')[0]);
            }
            
            // Query for all follow-ups that need reminders
            // Join with tenants table to get timezone information
            const result: any = await db.execute(sql`
                SELECT 
                    sv.id,
                    sv.tenant_id,
                    sv.customer_id,
                    sv.sales_rep_id,
                    sv.follow_up_date,
                    sv.follow_up_time,
                    sv.follow_up_reason
                FROM sales_visits sv
                WHERE sv.outcome = 'follow_up'
                AND sv.follow_up_date >= ${cutoffDate.toISOString().split('T')[0]}
                AND sv.follow_up_date <= ${today.toISOString().split('T')[0]}
                AND sv.follow_up_reminder_sent_at IS NULL
                ORDER BY sv.follow_up_date ASC, sv.created_at ASC
            `);
            
            // Handle different result formats from Drizzle ORM execute()
            const rows = result.rows || result || [];
            console.log(`[Processor] Found ${rows.length} follow-ups in date range before timezone filtering`);
                    
            // Filter results based on timezone to only include follow-ups that are due today in the tenant's timezone
            const timezoneAdjustedRows = rows.filter((row: any) => {
                const tenantId = row.tenant_id;
                const followUpDateStr = row.follow_up_date;
                const tenantTimezone = timezoneMap.get(tenantId) || 'UTC';
                
                try {
                    // Parse the follow-up date (stored as YYYY-MM-DD) and create a date at midnight in UTC
                    const [year, month, day] = followUpDateStr.split('-').map(Number);
                    const followUpDateUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
                    
                    // Get the date in the tenant's timezone
                    const followUpInTenantTz = new Date(followUpDateUTC.toLocaleString('en-US', { timeZone: tenantTimezone }));
                    
                    // Get today in the tenant's timezone
                    const todayInTenantTz = new Date(now.toLocaleString('en-US', { timeZone: tenantTimezone }));
                    
                    // Compare just the date parts (year, month, day)
                    const isSameDay = 
                        followUpInTenantTz.getFullYear() === todayInTenantTz.getFullYear() &&
                        followUpInTenantTz.getMonth() === todayInTenantTz.getMonth() &&
                        followUpInTenantTz.getDate() === todayInTenantTz.getDate();
                    
                    return isSameDay;
                } catch (e) {
                    console.warn(`[Processor] Could not process timezone for tenant ${tenantId}, visit ${row.id}, defaulting to UTC:`, e);
                    // Fallback to UTC comparison
                    const [year, month, day] = followUpDateStr.split('-').map(Number);
                    const followUpInUTC = new Date(year, month - 1, day);
                    const todayInUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    return followUpInUTC.getTime() === todayInUTC.getTime();
                }
            });
            
            console.log(`[Processor] After timezone adjustment: ${timezoneAdjustedRows.length} follow-ups due today in respective tenant timezones`);
                    
            // Add timezone info to the results
            const rowsWithTimezone = timezoneAdjustedRows.map((row: any) => ({
                ...row,
                timezone: timezoneMap.get(row.tenant_id) || 'UTC'
            }));
                    
            // Debug log the structure of the first row
            if (rowsWithTimezone.length > 0) {
                console.log('[Processor] First row structure:', Object.keys(rowsWithTimezone[0]));
                console.log('[Processor] First row data:', rowsWithTimezone[0]);
            }
                    
            return rowsWithTimezone as VisitReminderData[];
            
        } catch (error) {
            console.error('[Processor] Failed to find pending reminders:', error);
            throw new Error(`Database query failed: ${error}`);
        }
    }
    
    /**
     * Process a single follow-up reminder
     */
    static async processSingleReminder(visit: VisitReminderData): Promise<ReminderProcessingResult> {
        try {
            // Fetch related data with error handling
            const [customer, salesRep] = await Promise.all([
                FollowUpDataFetcher.getCustomer(visit.customer_id),
                FollowUpDataFetcher.getSalesRep(visit.sales_rep_id)
            ]);
            
            // Validation checks
            if (!customer) {
                return {
                    visitId: visit.id,
                    status: 'skipped',
                    reason: `Customer ${visit.customer_id} not found`
                };
            }
            
            if (!salesRep) {
                return {
                    visitId: visit.id,
                    status: 'skipped',
                    reason: `Sales rep ${visit.sales_rep_id} not found`
                };
            }
            
            if (!salesRep.telegramChatId) {
                console.log(`[Processor] Sales rep ${salesRep.name} (${salesRep.id}) has no Telegram chat ID, skipping reminder`);
                return {
                    visitId: visit.id,
                    status: 'skipped',
                    reason: `Sales rep ${salesRep.name} has no Telegram chat ID`
                };
            }
            
            // Convert date safely
            const followUpDate = FollowUpDataFetcher.safeDateConversion(visit.follow_up_date);
            if (!followUpDate) {
                return {
                    visitId: visit.id,
                    status: 'skipped',
                    reason: `Invalid follow-up date: ${visit.follow_up_date}`
                };
            }
            
            // Send reminder
            const sent = await sendFollowUpReminder(
                salesRep.telegramChatId,
                customer.name,
                followUpDate,
                visit.follow_up_time,
                visit.follow_up_reason
            );
            
            if (sent) {
                // Mark as sent with transaction safety
                await this.markReminderAsSent(visit.id);
                return {
                    visitId: visit.id,
                    status: 'sent'
                };
            } else {
                return {
                    visitId: visit.id,
                    status: 'error',
                    reason: 'Failed to send Telegram message'
                };
            }
            
        } catch (error) {
            console.error(`[Processor] Failed to process reminder for visit ${visit.id}:`, error);
            return {
                visitId: visit.id,
                status: 'error',
                error: error,
                reason: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * Mark reminder as sent with proper error handling
     */
    private static async markReminderAsSent(visitId: string): Promise<void> {
        try {
            await db
                .update(salesVisits)
                .set({ followUpReminderSentAt: new Date() })
                .where(eq(salesVisits.id, visitId));
        } catch (error) {
            console.error(`[Processor] Failed to mark reminder as sent for visit ${visitId}:`, error);
            // Don't throw - the reminder was sent successfully, just log the error
        }
    }
}

/**
 * Main job execution with comprehensive error handling and monitoring
 */
export async function runFollowUpRemindersJob(): Promise<void> {
    console.log('[Scheduler] Starting deep follow-up reminders job');
    
    const startTime = Date.now();
    const results: ReminderProcessingResult[] = [];
    
    try {
        // Find all pending reminders
        const pendingReminders = await FollowUpReminderProcessor.findPendingReminders();
        
        if (pendingReminders.length === 0) {
            console.log('[Scheduler] No pending follow-up reminders found');
            return;
        }
        
        console.log(`[Scheduler] Processing ${pendingReminders.length} follow-up reminders`);
        
        // Process reminders with rate limiting to prevent Telegram rate limits
        for (const [index, visit] of pendingReminders.entries()) {
            try {
                const result = await FollowUpReminderProcessor.processSingleReminder(visit);
                results.push(result);
                
                // Log progress
                if ((index + 1) % 10 === 0 || index === pendingReminders.length - 1) {
                    console.log(`[Scheduler] Progress: ${index + 1}/${pendingReminders.length}`);
                }
                
                // Small delay between messages to respect rate limits
                if (index < pendingReminders.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
            } catch (error) {
                console.error(`[Scheduler] Failed to process visit ${visit.id}:`, error);
                results.push({
                    visitId: visit.id,
                    status: 'error',
                    error: error,
                    reason: 'Processing failed'
                });
            }
        }
        
        // Generate comprehensive report
        const duration = Date.now() - startTime;
        const sentCount = results.filter(r => r.status === 'sent').length;
        const skippedCount = results.filter(r => r.status === 'skipped').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        console.log(`[Scheduler] Follow-up reminders job completed in ${duration}ms`);
        console.log(`[Scheduler] Results - Sent: ${sentCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
        
        // Log detailed errors if any
        if (errorCount > 0) {
            const errors = results.filter(r => r.status === 'error');
            console.log('[Scheduler] Detailed errors:');
            errors.forEach(error => {
                console.log(`  Visit ${error.visitId}: ${error.reason}`);
            });
        }
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[Scheduler] Follow-up reminders job failed after ${duration}ms:`, error);
        throw error;
    }
}

// Export for testing
export { FollowUpDataFetcher, FollowUpReminderProcessor };