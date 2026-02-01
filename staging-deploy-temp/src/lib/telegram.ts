/**
 * Telegram Bot Integration
 * 
 * Sends notifications via Telegram Bot API
 * Supports hierarchical notification control:
 *   1. Super Admin enables/disables Telegram per tenant
 *   2. Tenant Admin chooses which notification types to receive
 * 
 * Features:
 *   - Rate limiting to avoid Telegram API limits
 *   - Webhook secret validation for security
 *   - Batch notifications to avoid spam
 *   - Inline keyboard support for interactive notifications
 *   - Bot token validation
 */

import { getTelegramSettings } from './systemSettings';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, sql, lt, inArray } from 'drizzle-orm';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
}

export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

interface TelegramMessage {
    chatId: string;
    text: string;
    parseMode?: 'HTML' | 'Markdown';
    replyMarkup?: InlineKeyboardMarkup;
    logContext?: {
        tenantId: string;
        recipientType: 'admin' | 'customer' | 'super_admin';
        recipientId?: string;
        recipientChatId?: string;
        eventType: string;
        referenceType?: string;
        referenceId?: string;
        metadata?: Record<string, any>;
    };
}

export interface BotInfo {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
}

export interface BotValidationResult {
    valid: boolean;
    botInfo?: BotInfo;
    error?: string;
}

// ============================================================================
// HTML ESCAPE & FORMATTING UTILITIES
// ============================================================================

/**
 * Escape HTML special characters to prevent injection in Telegram messages.
 * Telegram's HTML parse mode requires escaping <, >, &, and ".
 */
export function escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================================
// HASHTAG UTILITIES FOR TELEGRAM SEARCH
// ============================================================================

/**
 * Format customer name as searchable hashtag (removes spaces, special chars)
 * Example: "Jamshid Karimov" -> "#mijoz_JamshidKarimov"
 */
export function hashtagCustomer(name: string): string {
    const clean = name.replace(/[^a-zA-Z0-9\u0400-\u04FFА-Яа-я]/g, '');
    return `#mijoz_${clean}`;
}

/**
 * Format order number as searchable hashtag
 * Example: "ORD-00123" -> "#buyurtma_00123"
 */
export function hashtagOrder(orderNumber: string): string {
    // Remove prefix if exists, keep number
    const num = orderNumber.replace(/^[A-Za-z-]+/, '').trim() || orderNumber.replace(/[^0-9]/g, '');
    return `#buyurtma_${num || orderNumber}`;
}

/**
 * Format date as searchable hashtag
 * Example: 2026-01-18 -> "#sana_2026_01_18"
 */
export function hashtagDate(date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `#sana_${year}_${month}_${day}`;
}

/**
 * Format currency amount in Uzbek style
 * Example: 1250000 -> "1 250 000"
 */
export function formatUzbekMoney(amount: number): string {
    return amount.toLocaleString('ru-RU').replace(/,/g, ' ');
}

// ============================================================================
// STATUS HASHTAGS (Uzbek)
// ============================================================================

export const STATUS_TAGS = {
    // Order statuses
    newOrder: '#yangi_buyurtma',
    approved: '#tasdiqlandi',
    cancelled: '#bekor_qilindi',
    delivered: '#yetkazildi',
    partial: '#qisman',
    completed: '#yakunlandi',
    returned: '#qaytarildi',

    // Payment statuses
    payment: '#tolov',
    paid: '#tolandi',
    unpaid: '#tolanmagan',
    overdue: '#muddat_otgan',

    // Stock
    lowStock: '#kam_qoldi',

    // Security
    security: '#xavfsizlik',
} as const;


// ============================================================================
// NOTIFICATION LOGGING
// ============================================================================

interface NotificationLogEntry {
    tenantId: string;
    userId?: string;
    recipientType: 'admin' | 'customer' | 'super_admin';
    recipientId?: string;
    recipientChatId?: string;
    channel: 'telegram' | 'email' | 'push';
    eventType: string;
    message: string;
    referenceType?: string;
    referenceId?: string;
    status: 'pending' | 'sent' | 'failed';
    errorMessage?: string;
    metadata?: Record<string, any>;
}

/**
 * Log a notification attempt to the database for audit/debugging
 */
export async function logNotification(entry: NotificationLogEntry): Promise<void> {
    try {
        await db.insert(schema.notificationLogs).values({
            tenantId: entry.tenantId,
            userId: entry.userId,
            recipientType: entry.recipientType,
            recipientId: entry.recipientId,
            recipientChatId: entry.recipientChatId,
            channel: entry.channel,
            eventType: entry.eventType,
            message: entry.message,
            referenceType: entry.referenceType,
            referenceId: entry.referenceId,
            status: entry.status,
            errorMessage: entry.errorMessage,
            metadata: entry.metadata,
            sentAt: entry.status === 'sent' ? new Date() : null,
        });
    } catch (error) {
        // Don't fail the notification if logging fails
        console.error('[NotificationLog] Failed to log notification:', error);
    }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// Simple in-memory rate limiter (per chat)
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_PER_SECOND = 25; // Telegram allows ~30/sec, we stay under
const RATE_LIMIT_WINDOW_MS = 1000;

function checkRateLimit(chatId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(chatId);

    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(chatId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_SECOND) {
        return false; // Rate limited
    }

    entry.count++;
    return true;
}

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
        if (entry.resetAt < now) {
            rateLimitMap.delete(key);
        }
    }
}, 60000); // Clean every minute

// ============================================================================
// MESSAGE QUEUE (simple delayed send for rate limiting)
// ============================================================================

interface QueuedMessage extends TelegramMessage {
    retries: number;
}

const messageQueue: QueuedMessage[] = [];
let queueProcessing = false;

async function processQueue(): Promise<void> {
    if (queueProcessing || messageQueue.length === 0) return;

    queueProcessing = true;

    while (messageQueue.length > 0) {
        const msg = messageQueue.shift()!;

        if (!checkRateLimit(msg.chatId)) {
            // Put back in queue and wait
            messageQueue.unshift(msg);
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        const success = await sendTelegramMessageDirect(msg);

        if (!success && msg.retries < 3) {
            // Retry later
            msg.retries++;
            messageQueue.push(msg);
        }
    }

    queueProcessing = false;
}

// ============================================================================
// CORE TELEGRAM FUNCTIONALITY
// ============================================================================

/**
 * Direct send (bypasses queue) - use for high priority
 */
async function sendTelegramMessageDirect(message: TelegramMessage): Promise<boolean> {
    const settings = getTelegramSettings();

    if (!settings.enabled || !settings.botToken) {
        console.log('[Telegram] Not enabled or no bot token configured');
        return false;
    }

    const chatId = message.chatId || settings.defaultChatId;
    if (!chatId) {
        console.log('[Telegram] No chat ID provided');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
        const payload: Record<string, any> = {
            chat_id: chatId,
            text: message.text,
            parse_mode: message.parseMode || 'HTML',
        };

        // Add inline keyboard if provided
        if (message.replyMarkup) {
            payload.reply_markup = message.replyMarkup;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        // Log to DB if context provided
        if (message.logContext) {
            logNotification({
                ...message.logContext,
                recipientChatId: chatId,
                channel: 'telegram',
                message: message.text,
                status: result.ok ? 'sent' : 'failed',
                errorMessage: result.ok ? undefined : result.description
            });
        }

        if (!result.ok) {
            console.error('[Telegram] Error:', result.description);
            return false;
        }

        console.log('[Telegram] Message sent successfully');
        return true;
    } catch (error) {
        console.error('[Telegram] Network error:', error);

        // Log failure
        if (message.logContext) {
            logNotification({
                ...message.logContext,
                recipientChatId: chatId,
                channel: 'telegram',
                message: message.text,
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Network error'
            });
        }

        return false;
    }
}

/**
 * Send a message via Telegram Bot (queued for rate limiting)
 */
export async function sendTelegramMessage(message: TelegramMessage): Promise<boolean> {
    const settings = getTelegramSettings();

    if (!settings.enabled || !settings.botToken) {
        return false;
    }

    const chatId = message.chatId || settings.defaultChatId;
    if (!chatId) {
        return false;
    }

    // Check rate limit
    if (checkRateLimit(chatId)) {
        return sendTelegramMessageDirect(message);
    }

    // Queue for later
    messageQueue.push({ ...message, chatId, retries: 0 });
    processQueue(); // Fire and forget
    return true; // Optimistically return true for queued messages
}

/**
 * Send notification to the Super Admin (Default Chat)
 */
export async function notifySuperAdmin(text: string): Promise<boolean> {
    const settings = getTelegramSettings();
    return sendTelegramMessage({
        chatId: settings.defaultChatId,
        text,
    });
}

/**
 * Send notification to a specific user (if they have a telegramChatId)
 */
export async function notifyUser(
    chatId: string | null | undefined,
    text: string,
    logContext?: TelegramMessage['logContext']
): Promise<boolean> {
    if (!chatId) return false;
    return sendTelegramMessage({
        chatId,
        text,
        logContext
    });
}

// ============================================================================
// FOLLOW-UP REMINDERS - ENHANCED VERSION
// ============================================================================

interface FollowUpReminderParams {
    chatId: string;
    customerName: string;
    followUpDate: Date;
    followUpTime: string | null;
    followUpReason: string | null;
}

/**
 * Enhanced follow-up reminder with better formatting and error handling
 * 
 * @param params - Follow-up reminder parameters
 * @returns boolean indicating success
 */
export async function sendFollowUpReminder(params: FollowUpReminderParams): Promise<boolean>;

/**
 * Backward compatibility overload
 */
export async function sendFollowUpReminder(
    chatId: string,
    customerName: string,
    followUpDate: Date,
    followUpTime: string | null,
    followUpReason: string | null
): Promise<boolean>;

// Implementation
export async function sendFollowUpReminder(
    ...args: [FollowUpReminderParams] | [string, string, Date, string | null, string | null]
): Promise<boolean> {
    try {
        // Handle both function signatures
        let params: FollowUpReminderParams;
        if (typeof args[0] === 'string') {
            // Backward compatibility - use type assertions since we've verified args[0] is string
            params = {
                chatId: args[0],
                customerName: args[1] as string,
                followUpDate: args[2] as Date,
                followUpTime: (args[3] as string | null) ?? null,
                followUpReason: (args[4] as string | null) ?? null
            };
        } else {
            // New interface
            params = args[0];
        }

        const { chatId, customerName, followUpDate, followUpTime, followUpReason } = params;

        // Validation
        if (!chatId) {
            console.error('[Telegram] sendFollowUpReminder: chatId is required');
            return false;
        }

        if (!customerName) {
            console.error('[Telegram] sendFollowUpReminder: customerName is required');
            return false;
        }

        if (!(followUpDate instanceof Date) || isNaN(followUpDate.getTime())) {
            console.error('[Telegram] sendFollowUpReminder: valid Date object required for followUpDate');
            return false;
        }

        // Format the message with enhanced formatting
        const timeStr = followUpTime || 'Time not specified';
        const reasonStr = followUpReason || 'Reason not specified';

        // Format date with locale-aware formatting
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const formattedDate = dateFormatter.format(followUpDate);

        // Enhanced message with better formatting
        const message = `
🔔 *FOLLOW-UP REMINDER*

📅 *Scheduled Follow-up*
👤 Customer: *${escapeHtml(customerName)}*
📆 Date: ${formattedDate}
⏰ Time: ${escapeHtml(timeStr)}
📝 Reason: ${escapeHtml(reasonStr)}

👉 *Action Required*
Please contact this customer today to follow up on your scheduled visit.

---
_Reminder sent by IxaSales CRM_
`.trim();

        // Send with enhanced error handling
        const result = await sendTelegramMessage({
            chatId,
            text: message,
            parseMode: 'HTML',
            // Note: logContext requires tenantId which we don't have here
            // The notification will be logged by sendTelegramMessageDirect if context is provided
        });

        if (result) {
            console.log(`[Telegram] Follow-up reminder sent successfully to ${chatId} for customer ${customerName}`);
        } else {
            console.warn(`[Telegram] Failed to send follow-up reminder to ${chatId} for customer ${customerName}`);
        }

        return result;

    } catch (error) {
        console.error('[Telegram] sendFollowUpReminder failed:', error);
        return false;
    }
}

// ============================================================================
// WEBHOOK SECURITY
// ============================================================================

/**
 * Validate webhook request using secret token
 * Telegram sends X-Telegram-Bot-Api-Secret-Token header if configured
 */
export function validateWebhookSecret(secretToken: string | null | undefined): boolean {
    const settings = getTelegramSettings();

    // If no webhook secret is configured, skip validation (but log warning)
    if (!settings.webhookSecret) {
        console.warn('[Telegram] Webhook secret not configured - skipping validation');
        return true;
    }

    return secretToken === settings.webhookSecret;
}

// ============================================================================
// NOTIFICATION PERMISSION HELPERS
// ============================================================================

// Admin notification types (check tenant notification settings)
export type AdminNotificationType =
    | 'notifyNewOrder'
    | 'notifyOrderApproved'
    | 'notifyOrderCancelled'
    | 'notifyOrderDelivered'
    | 'notifyOrderPartialDelivery'
    | 'notifyOrderReturned'
    | 'notifyOrderPartialReturn'
    | 'notifyOrderCompleted'
    | 'notifyPaymentReceived'
    | 'notifyPaymentPartial'
    | 'notifyPaymentComplete'
    | 'notifyLowStock'
    | 'notifyDueDebt';

// Customer notification types (check tenant notification settings)
export type CustomerNotificationType =
    | 'customerNotifyOrderConfirmed'
    | 'customerNotifyOrderApproved'
    | 'customerNotifyOrderCancelled'
    | 'customerNotifyOutForDelivery'
    | 'customerNotifyDelivered'
    | 'customerNotifyPartialDelivery'
    | 'customerNotifyReturned'
    | 'customerNotifyPaymentReceived'
    | 'customerNotifyPaymentDue';

// Combined type for backwards compatibility
export type NotificationType = AdminNotificationType | CustomerNotificationType;

interface TenantNotificationCheck {
    canSend: boolean;
    settings: {
        lowStockThreshold?: number;
        dueDebtDaysThreshold?: number;
    } | null;
}

/**
 * Check if a notification should be sent for a tenant.
 * Verifies:
 *   1. Super Admin has enabled Telegram for this tenant
 *   2. Tenant Admin has enabled this specific notification type
 */
export async function canSendTenantNotification(
    tenantId: string,
    notificationType: NotificationType
): Promise<TenantNotificationCheck> {
    try {
        // Check if tenant has Telegram enabled (Super Admin control)
        const tenant = await db.select({
            telegramEnabled: schema.tenants.telegramEnabled,
        })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        if (!tenant.length || !tenant[0].telegramEnabled) {
            return { canSend: false, settings: null };
        }

        // Get tenant notification settings (Tenant Admin control)
        const notifSettings = await db.select()
            .from(schema.tenantNotificationSettings)
            .where(eq(schema.tenantNotificationSettings.tenantId, tenantId))
            .limit(1);

        // If no settings exist, use defaults (most notifications enabled by default)
        if (!notifSettings.length) {
            // Create default settings for this tenant
            const defaults = await db.insert(schema.tenantNotificationSettings)
                .values({ tenantId })
                .returning();

            return {
                canSend: defaults[0]?.[notificationType] ?? true,
                settings: {
                    lowStockThreshold: defaults[0]?.lowStockThreshold ?? 10,
                    dueDebtDaysThreshold: defaults[0]?.dueDebtDaysThreshold ?? 7,
                }
            };
        }

        const settings = notifSettings[0];
        return {
            canSend: settings[notificationType] ?? false,
            settings: {
                lowStockThreshold: settings.lowStockThreshold ?? 10,
                dueDebtDaysThreshold: settings.dueDebtDaysThreshold ?? 7,
            }
        };
    } catch (error) {
        console.error('[Telegram] Error checking notification permissions:', error);
        return { canSend: false, settings: null };
    }
}

/**
 * Get all tenant admins with Telegram chat IDs for a given tenant
 */
export async function getTenantAdminsWithTelegram(tenantId: string): Promise<Array<{ id: string; telegramChatId: string }>> {
    try {
        return await db.select({
            id: schema.users.id,
            telegramChatId: schema.users.telegramChatId,
        })
            .from(schema.users)
            .where(and(
                eq(schema.users.tenantId, tenantId),
                eq(schema.users.role, 'tenant_admin'),
                sql`${schema.users.telegramChatId} IS NOT NULL`
            )) as Array<{ id: string; telegramChatId: string }>;
    } catch (error) {
        console.error('[Telegram] Error fetching tenant admins:', error);
        return [];
    }
}

/**
 * Get users with Telegram chat IDs for specific roles in a tenant
 * Used for role-based notification assignment
 */
export async function getUsersWithTelegramByRoles(
    tenantId: string,
    roles: string[]
): Promise<Array<{ id: string; telegramChatId: string; role: string }>> {
    try {
        if (roles.length === 0) return [];

        return await db.select({
            id: schema.users.id,
            telegramChatId: schema.users.telegramChatId,
            role: schema.users.role,
        })
            .from(schema.users)
            .where(and(
                eq(schema.users.tenantId, tenantId),
                inArray(schema.users.role, roles as any),
                sql`${schema.users.telegramChatId} IS NOT NULL`,
                eq(schema.users.isActive, true)
            )) as Array<{ id: string; telegramChatId: string; role: string }>;
    } catch (error) {
        console.error('[Telegram] Error fetching users by roles:', error);
        return [];
    }
}

/**
 * Get enabled roles for a specific notification type
 */
export async function getNotificationRoles(
    tenantId: string,
    notificationType: string
): Promise<string[]> {
    try {
        const settings = await db.select({
            role: schema.notificationRoleSettings.role,
        })
            .from(schema.notificationRoleSettings)
            .where(and(
                eq(schema.notificationRoleSettings.tenantId, tenantId),
                eq(schema.notificationRoleSettings.notificationType, notificationType),
                eq(schema.notificationRoleSettings.enabled, true)
            ));

        return settings.map(s => s.role);
    } catch (error) {
        console.error('[Telegram] Error fetching notification roles:', error);
        // Default to tenant_admin if no settings found
        return ['tenant_admin'];
    }
}

/**
 * Check if a notification should be sent and get target roles
 * Combines canSendTenantNotification with role-based targeting
 */
export async function canSendNotificationToRoles(
    tenantId: string,
    notificationType: AdminNotificationType
): Promise<{
    canSend: boolean;
    targetRoles: string[];
    settings: { lowStockThreshold?: number; dueDebtDaysThreshold?: number } | null;
}> {
    // First check if notification is enabled
    const check = await canSendTenantNotification(tenantId, notificationType);

    if (!check.canSend) {
        return { canSend: false, targetRoles: [], settings: null };
    }

    // Get which roles should receive this notification
    const roles = await getNotificationRoles(tenantId, notificationType);

    return {
        canSend: roles.length > 0,
        targetRoles: roles,
        settings: check.settings
    };
}

// ============================================================================
// TENANT ADMIN NOTIFICATION TEMPLATES
// ============================================================================

// Extended order info type for richer notifications
export interface OrderNotificationInfo {
    id?: string;
    orderNumber: string;
    customerName: string;
    customerPhone?: string;
    total: number;
    currency: string;
    itemCount?: number;
    territory?: string;
    salesRepName?: string;
    salesRepPhone?: string;
}

export async function notifyNewOrder(
    targetChatId: string | null,
    order: OrderNotificationInfo
): Promise<boolean> {
    const orderNum = order.orderNumber || order.id?.slice(0, 8) || '';
    return notifyUser(targetChatId,
        `🛒 <b>Yangi buyurtma</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(orderNum)}\n` +
        `👤 Mijoz: ${escapeHtml(order.customerName)}${order.customerPhone ? ` (📞 ${escapeHtml(order.customerPhone)})` : ''}\n` +
        (order.territory ? `📍 Hudud: ${escapeHtml(order.territory)}\n` : '') +
        (order.salesRepName ? `👔 Sotuvchi: ${escapeHtml(order.salesRepName)}${order.salesRepPhone ? ` (📞 ${escapeHtml(order.salesRepPhone)})` : ''}\n` : '') +
        (order.itemCount ? `📦 Mahsulotlar: ${order.itemCount} ta\n` : '') +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n\n` +
        `${hashtagOrder(orderNum)} ${hashtagCustomer(order.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.newOrder}`
    );
}

export async function notifyLowStock(
    targetChatId: string | null,
    product: { name: string; sku: string; quantity: number }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `⚠️ <b>Mahsulot kam qoldi</b>\n\n` +
        `📦 Mahsulot: ${escapeHtml(product.name)}\n` +
        `🏷️ SKU: ${escapeHtml(product.sku)}\n` +
        `📋 Qoldiq: ${product.quantity} dona\n\n` +
        `${hashtagDate()} ${STATUS_TAGS.lowStock}`
    );
}

/**
 * Send a consolidated low stock notification for multiple products
 * Avoids spamming with 10 separate messages
 */
export async function notifyLowStockBatch(
    targetChatId: string | null,
    products: Array<{ name: string; sku: string; quantity: number }>
): Promise<boolean> {
    if (products.length === 0) return true;

    // Single product - use regular format
    if (products.length === 1) {
        return notifyLowStock(targetChatId, products[0]);
    }

    // Multiple products - consolidated list
    const productList = products
        .slice(0, 10) // Limit to 10 to avoid too long message
        .map(p => `• <b>${escapeHtml(p.name)}</b> (${escapeHtml(p.sku)}) - ${p.quantity} qoldi`)
        .join('\n');

    const moreText = products.length > 10
        ? `\n\n<i>...va yana ${products.length - 10} ta mahsulot</i>`
        : '';

    return notifyUser(targetChatId,
        `⚠️ <b>Mahsulotlar kam qoldi</b>\n\n` +
        `${products.length} ta mahsulot kam qoldi:\n\n` +
        productList +
        moreText +
        `\n\n${hashtagDate()} ${STATUS_TAGS.lowStock}`
    );
}

export async function notifyPaymentReceived(
    targetChatId: string | null,
    payment: {
        amount: number;
        currency: string;
        customerName: string;
        customerPhone?: string;
        orderNumber?: string;
        totalAmount?: number;
        remainingBalance?: number;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    const isPartial = payment.remainingBalance && payment.remainingBalance > 0;
    const orderTag = payment.orderNumber ? hashtagOrder(payment.orderNumber) : '';

    return notifyUser(targetChatId,
        `💰 <b>To'lov qabul qilindi</b>${isPartial ? ' #qisman' : ''}\n\n` +
        `👤 Mijoz: ${escapeHtml(payment.customerName)}${payment.customerPhone ? ` (📞 ${escapeHtml(payment.customerPhone)})` : ''}\n` +
        (payment.territory ? `� Hudud: ${escapeHtml(payment.territory)}\n` : '') +
        (payment.salesRepName ? `👔 Sotuvchi: ${escapeHtml(payment.salesRepName)}\n` : '') +
        `�💵 Summa: ${formatUzbekMoney(payment.amount)} ${escapeHtml(payment.currency)}\n` +
        (payment.orderNumber ? `📝 Buyurtma: #${escapeHtml(payment.orderNumber)}\n` : '') +
        (isPartial ? `📋 Qoldiq: ${formatUzbekMoney(payment.remainingBalance!)} ${escapeHtml(payment.currency)}\n` : '') +
        (!isPartial && payment.totalAmount ? `✅ To'liq to'landi!\n` : '') +
        `\n${hashtagCustomer(payment.customerName)} ${orderTag}\n` +
        `${hashtagDate()} ${STATUS_TAGS.payment}${isPartial ? ' ' + STATUS_TAGS.partial : ' ' + STATUS_TAGS.paid}`
    );
}

export async function notifyDeliveryCompleted(
    targetChatId: string | null,
    delivery: {
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        itemsDelivered: number;
        totalItems: number;
        total?: number;
        currency?: string;
        driverName?: string;
        driverPhone?: string;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    const isPartial = delivery.itemsDelivered < delivery.totalItems;

    return notifyUser(targetChatId,
        `🚚 <b>Buyurtma yetkazildi</b>${isPartial ? ' #qisman' : ''}\n\n` +
        `📝 Buyurtma: #${escapeHtml(delivery.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(delivery.customerName)}${delivery.customerPhone ? ` (📞 ${escapeHtml(delivery.customerPhone)})` : ''}\n` +
        (delivery.territory ? `📍 Hudud: ${escapeHtml(delivery.territory)}\n` : '') +
        (delivery.salesRepName ? `👔 Sotuvchi: ${escapeHtml(delivery.salesRepName)}\n` : '') +
        `📦 Mahsulotlar: ${delivery.itemsDelivered}/${delivery.totalItems}\n` +
        (isPartial ? `📋 Qoldi: ${delivery.totalItems - delivery.itemsDelivered} ta\n` : '') +
        (delivery.total && delivery.currency ? `💰 Summa: ${formatUzbekMoney(delivery.total)} ${escapeHtml(delivery.currency)}\n` : '') +
        (delivery.driverName ? `👨‍🚗 Haydovchi: ${escapeHtml(delivery.driverName)}${delivery.driverPhone ? ` (📞 ${escapeHtml(delivery.driverPhone)})` : ''}\n` : '') +
        `\n${hashtagOrder(delivery.orderNumber)} ${hashtagCustomer(delivery.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.delivered}${isPartial ? ' ' + STATUS_TAGS.partial : ''}`
    );
}

export async function notifyReturnProcessed(
    targetChatId: string | null,
    returnInfo: { orderNumber: string; customerName: string; amount: number; currency: string; reason?: string }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `↩️ <b>Qaytarish amalga oshirildi</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(returnInfo.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(returnInfo.customerName)}\n` +
        `💰 Summa: ${formatUzbekMoney(returnInfo.amount)} ${escapeHtml(returnInfo.currency)}\n` +
        (returnInfo.reason ? `📝 Sabab: ${escapeHtml(returnInfo.reason)}\n` : '') +
        `\n${hashtagOrder(returnInfo.orderNumber)} ${hashtagCustomer(returnInfo.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.returned}`
    );
}

export async function notifyDueDebt(
    targetChatId: string | null,
    debt: {
        customerName: string;
        customerPhone?: string;
        totalDebt: number;
        currency: string;
        daysOverdue: number;
        ordersCount: number;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `⏰ <b>Qarzdorlik eslatmasi</b>\n\n` +
        `👤 Mijoz: ${escapeHtml(debt.customerName)}${debt.customerPhone ? ` (📞 ${escapeHtml(debt.customerPhone)})` : ''}\n` +
        (debt.territory ? `📍 Hudud: ${escapeHtml(debt.territory)}\n` : '') +
        (debt.salesRepName ? `👔 Sotuvchi: ${escapeHtml(debt.salesRepName)}\n` : '') +
        `💰 Qarz: ${formatUzbekMoney(debt.totalDebt)} ${escapeHtml(debt.currency)}\n` +
        `📅 Muddati o'tdi: ${debt.daysOverdue} kun\n` +
        `📋 Buyurtmalar: ${debt.ordersCount} ta\n\n` +
        `${hashtagCustomer(debt.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.overdue} ${STATUS_TAGS.unpaid}`
    );
}

// ============================================================================
// ADDITIONAL ORDER LIFECYCLE NOTIFICATIONS (ADMIN)
// ============================================================================

export async function notifyOrderApproved(
    targetChatId: string | null,
    order: {
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        total: number;
        currency: string;
        approvedBy?: string;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `✅ <b>Buyurtma tasdiqlandi</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(order.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(order.customerName)}${order.customerPhone ? ` (📞 ${escapeHtml(order.customerPhone)})` : ''}\n` +
        (order.territory ? `📍 Hudud: ${escapeHtml(order.territory)}\n` : '') +
        (order.salesRepName ? `👔 Sotuvchi: ${escapeHtml(order.salesRepName)}\n` : '') +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n` +
        (order.approvedBy ? `✅ Tasdiqladi: ${escapeHtml(order.approvedBy)}\n` : '') +
        `\n${hashtagOrder(order.orderNumber)} ${hashtagCustomer(order.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.approved}`
    );
}

export async function notifyOrderCancelled(
    targetChatId: string | null,
    order: {
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        total: number;
        currency: string;
        cancelledBy?: string;
        reason?: string;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `❌ <b>Buyurtma bekor qilindi</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(order.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(order.customerName)}${order.customerPhone ? ` (📞 ${escapeHtml(order.customerPhone)})` : ''}\n` +
        (order.territory ? `📍 Hudud: ${escapeHtml(order.territory)}\n` : '') +
        (order.salesRepName ? `👔 Sotuvchi: ${escapeHtml(order.salesRepName)}\n` : '') +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n` +
        (order.cancelledBy ? `🚫 Bekor qildi: ${escapeHtml(order.cancelledBy)}\n` : '') +
        (order.reason ? `📝 Sabab: ${escapeHtml(order.reason)}\n` : '') +
        `\n${hashtagOrder(order.orderNumber)} ${hashtagCustomer(order.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.cancelled}`
    );
}

// notifyOrderDelivered is now consolidated with notifyDeliveryCompleted above
// Use notifyDeliveryCompleted for both full and partial deliveries

export async function notifyOrderReturned(
    targetChatId: string | null,
    order: {
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        returnedAmount: number;
        totalAmount: number;
        currency: string;
        reason?: string;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    const isPartial = order.returnedAmount < order.totalAmount;
    return notifyUser(targetChatId,
        `↩️ <b>Qaytarish${isPartial ? ' (qisman)' : ''}</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(order.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(order.customerName)}${order.customerPhone ? ` (📞 ${escapeHtml(order.customerPhone)})` : ''}\n` +
        (order.territory ? `📍 Hudud: ${escapeHtml(order.territory)}\n` : '') +
        (order.salesRepName ? `� Sotuvchi: ${escapeHtml(order.salesRepName)}\n` : '') +
        `�💰 Qaytarildi: ${formatUzbekMoney(order.returnedAmount)} ${escapeHtml(order.currency)}\n` +
        (isPartial ? `💵 Umumiy: ${formatUzbekMoney(order.totalAmount)} ${escapeHtml(order.currency)}\n` : '') +
        (order.reason ? `📝 Sabab: ${escapeHtml(order.reason)}\n` : '') +
        `\n${hashtagOrder(order.orderNumber)} ${hashtagCustomer(order.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.returned}${isPartial ? ' ' + STATUS_TAGS.partial : ''}`
    );
}

// notifyPaymentPartial and notifyPaymentComplete are now consolidated in notifyPaymentReceived above

export async function notifyOrderCompleted(
    targetChatId: string | null,
    order: {
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        total: number;
        currency: string;
        territory?: string;
        salesRepName?: string;
    }
): Promise<boolean> {
    return notifyUser(targetChatId,
        `🎉 <b>Buyurtma yakunlandi!</b>\n\n` +
        `📝 Buyurtma: #${escapeHtml(order.orderNumber)}\n` +
        `👤 Mijoz: ${escapeHtml(order.customerName)}${order.customerPhone ? ` (📞 ${escapeHtml(order.customerPhone)})` : ''}\n` +
        (order.territory ? `📍 Hudud: ${escapeHtml(order.territory)}\n` : '') +
        (order.salesRepName ? `👔 Sotuvchi: ${escapeHtml(order.salesRepName)}\n` : '') +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n` +
        `✅ Yetkazildi va to'landi!\n\n` +
        `${hashtagOrder(order.orderNumber)} ${hashtagCustomer(order.customerName)}\n` +
        `${hashtagDate()} ${STATUS_TAGS.completed}`
    );
}


export async function notifyNewTenant(tenant: { name: string; subdomain: string; plan: string }): Promise<boolean> {
    return notifySuperAdmin(
        `🏢 <b>Yangi korxona ro'yxatdan o'tdi</b>\n\n` +
        `🏬 Nomi: ${escapeHtml(tenant.name)}\n` +
        `🌐 Subdomain: ${escapeHtml(tenant.subdomain)}\n` +
        `📊 Tarif: ${escapeHtml(tenant.plan)}\n\n` +
        `${hashtagDate()}`
    );
}

export async function notifyNewUser(user: { name: string; email: string; role: string; tenantName?: string }): Promise<boolean> {
    return notifySuperAdmin(
        `👤 <b>Yangi foydalanuvchi</b>\n\n` +
        `👤 Ism: ${escapeHtml(user.name)}\n` +
        `📧 Email: ${escapeHtml(user.email)}\n` +
        `💼 Rol: ${escapeHtml(user.role)}\n` +
        (user.tenantName ? `🏢 Korxona: ${escapeHtml(user.tenantName)}` : `<i>Global foydalanuvchi</i>`) +
        `\n\n${hashtagDate()}`
    );
}

export async function notifyLoginLocked(email: string, ip: string): Promise<boolean> {
    return notifySuperAdmin(
        `⛔ <b>Xavfsizlik: Hisob bloklandi</b>\n\n` +
        `📧 Hisob: ${escapeHtml(email)}\n` +
        `🌐 IP: ${escapeHtml(ip)}\n` +
        `📝 Sabab: Juda ko'p noto'g'ri urinishlar.\n` +
        `⚠️ Hisob vaqtincha bloklandi.\n\n` +
        `${hashtagDate()} ${STATUS_TAGS.security}`
    );
}

export async function notifySubscriptionExpiring(tenant: { name: string; daysLeft: number; plan: string }): Promise<boolean> {
    return notifySuperAdmin(
        `⏳ <b>Obuna tugayapti</b>\n\n` +
        `🏢 Korxona: ${escapeHtml(tenant.name)}\n` +
        `📊 Tarif: ${escapeHtml(tenant.plan)}\n` +
        `📅 Qoldi: ${tenant.daysLeft} kun\n` +
        `☝️ Yangilash uchun bog'laning.\n\n` +
        `${hashtagDate()}`
    );
}

// ============================================================================
// TEST FUNCTION
// ============================================================================

export async function testTelegram(): Promise<{ success: boolean; message: string }> {
    const settings = getTelegramSettings();

    if (!settings.enabled) {
        return { success: false, message: 'Telegram is not enabled' };
    }

    if (!settings.botToken) {
        return { success: false, message: 'Bot token is not configured' };
    }

    if (!settings.defaultChatId) {
        return { success: false, message: 'Default chat ID is not configured' };
    }

    const sent = await sendTelegramMessage({
        chatId: settings.defaultChatId,
        text: `✅ <b>IxaSales Test Message</b>

Your Telegram integration is working correctly!

Time: ${new Date().toLocaleString()}`,
    });

    return {
        success: sent,
        message: sent ? 'Test message sent successfully' : 'Failed to send test message',
    };
}

// ============================================================================
// CUSTOMER NOTIFICATIONS (Using Tenant's Bot)
// ============================================================================

// Send a message to a customer using the tenant's own bot
export async function sendToCustomer(
    tenantId: string,
    customerChatId: string,
    text: string,
    logContext?: TelegramMessage['logContext']
): Promise<boolean> {
    try {
        // Get tenant's bot token
        const [tenant] = await db
            .select({
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramEnabled: schema.tenants.telegramEnabled,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        if (!tenant || !tenant.telegramEnabled || !tenant.telegramBotToken) {
            return false;
        }

        // Check rate limit for tenant's bot
        if (!checkRateLimit(`tenant:${tenantId}`)) {
            console.log('[Telegram] Rate limited for tenant:', tenantId);
            return false;
        }

        const response = await fetch(
            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: customerChatId,
                    text,
                    parse_mode: 'HTML',
                }),
            }
        );

        const result = await response.json();

        // Log notification
        if (logContext) {
            logNotification({
                ...logContext,
                tenantId: tenantId, // Enforce tenantId
                recipientChatId: customerChatId, // Not recipientChatId in context, but explicit
                channel: 'telegram',
                message: text,
                status: result.ok ? 'sent' : 'failed',
                errorMessage: result.ok ? undefined : result.description
            });
        }

        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error sending to customer:', error);

        if (logContext) {
            logNotification({
                ...logContext,
                tenantId,
                recipientChatId: customerChatId,
                channel: 'telegram',
                message: text,
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Network error'
            });
        }

        return false;
    }
}

/**
 * Notify customer: Order Confirmed (Uzbek)
 */
export async function notifyCustomerOrderConfirmed(
    tenantId: string,
    customer: { chatId: string; name: string; id: string },
    order: { id: string; orderNumber: string; total: number; currency: string; itemCount: number }
): Promise<boolean> {
    if (!customer.chatId) return false;

    let portalUrl: string | undefined;

    try {
        const { createPaymentLink } = await import('./payment-providers');
        const paymentResult = await createPaymentLink({
            tenantId,
            orderId: order.id,
            customerId: customer.id,
            amount: order.total,
            currency: order.currency
        });

        if (paymentResult) {
            portalUrl = paymentResult.portalUrl;
        }
    } catch (e) {
        console.error('Error creating payment link for notification:', e);
    }

    const text = `✅ <b>Buyurtma qabul qilindi!</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `Buyurtmangiz <b>#${escapeHtml(order.orderNumber)}</b> qabul qilindi.\n\n` +
        `📦 Mahsulotlar: ${order.itemCount} ta\n` +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n\n` +
        `Yetkazib berish boshlanganida xabar beramiz. Rahmat! 🙏`;

    if (portalUrl) {
        return sendToCustomerWithKeyboard(
            tenantId,
            customer.chatId,
            text,
            createInlineKeyboard([
                [urlButton('💳 Hozir to\'lash', portalUrl)]
            ]),
            {
                tenantId,
                recipientType: 'customer',
                eventType: 'order_confirmed',
                recipientChatId: customer.chatId,
                referenceType: 'order',
                referenceId: order.orderNumber
            }
        );
    }

    return sendToCustomer(tenantId, customer.chatId,
        text,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_confirmed',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

/**
 * Notify customer: Order Approved (Uzbek)
 */
export async function notifyCustomerOrderApproved(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; total: number; currency: string }
): Promise<boolean> {
    if (!customer.chatId) return false;
    return sendToCustomer(tenantId, customer.chatId,
        `✅ <b>Buyurtma tasdiqlandi</b>\n\n` +
        `Hurmatli ${escapeHtml(customer.name)},\n\n` +
        `Buyurtmangiz #${escapeHtml(order.orderNumber)} tasdiqlandi va tayyorlanmoqda.\n\n` +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}`,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_approved',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

/**
 * Notify customer: Order Cancelled (Uzbek)
 */
export async function notifyCustomerOrderCancelled(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; total: number; currency: string; reason?: string }
): Promise<boolean> {
    if (!customer.chatId) return false;
    return sendToCustomer(tenantId, customer.chatId,
        `❌ <b>Buyurtma bekor qilindi</b>\n\n` +
        `Hurmatli ${escapeHtml(customer.name)},\n\n` +
        `Buyurtmangiz #${escapeHtml(order.orderNumber)} bekor qilindi.\n` +
        (order.reason ? `📝 Sabab: ${escapeHtml(order.reason)}\n\n` : '\n') +
        `Savollaringiz bo'lsa, biz bilan bog'laning.`,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_cancelled',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

/**
 * Notify customer: Order Out for Delivery (Uzbek)
 */
export async function notifyCustomerOutForDelivery(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; driverName?: string; driverPhone?: string; eta?: string }
): Promise<boolean> {
    if (!customer.chatId) return false;

    return sendToCustomer(tenantId, customer.chatId,
        `🚚 <b>Yetkazib berish boshlandi!</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `Buyurtmangiz <b>#${escapeHtml(order.orderNumber)}</b> yo'lda!\n\n` +
        (order.driverName ? `👨‍🚗 Kurier: ${escapeHtml(order.driverName)}${order.driverPhone ? ` (📞 ${escapeHtml(order.driverPhone)})` : ''}\n` : '') +
        (order.eta ? `⏰ Taxminiy vaqt: ${escapeHtml(order.eta)}\n` : '') +
        `\nIltimos, qabul qilishga tayyor bo'ling.`,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_delivering',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

/**
 * Notify customer: Order Delivered (Uzbek) - consolidated for full and partial
 */
export async function notifyCustomerDelivered(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; total: number; currency: string; deliveredItems?: number; totalItems?: number; driverName?: string; driverPhone?: string }
): Promise<boolean> {
    if (!customer.chatId) return false;

    const isPartial = order.deliveredItems && order.totalItems && order.deliveredItems < order.totalItems;

    return sendToCustomer(tenantId, customer.chatId,
        `📦 <b>Buyurtma yetkazildi${isPartial ? ' (qisman)' : ''}!</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `Buyurtmangiz <b>#${escapeHtml(order.orderNumber)}</b> yetkazildi.\n\n` +
        (isPartial ? `📦 Yetkazildi: ${order.deliveredItems}/${order.totalItems} ta\n` : '') +
        (order.driverName ? `👨‍🚗 Kurier: ${escapeHtml(order.driverName)}${order.driverPhone ? ` (📞 ${escapeHtml(order.driverPhone)})` : ''}\n` : '') +
        `💰 Summa: ${formatUzbekMoney(order.total)} ${escapeHtml(order.currency)}\n\n` +
        (isPartial ? `Qolgan mahsulotlar yetkazilganda xabar beramiz.` : `Xaridingiz uchun rahmat! 🙏`),
        {
            tenantId,
            recipientType: 'customer',
            eventType: isPartial ? 'order_partial_delivery' : 'order_delivered',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

// notifyCustomerPartialDelivery is now consolidated into notifyCustomerDelivered above

/**
 * Notify customer: Return Processed (Uzbek)
 */
export async function notifyCustomerReturned(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; returnedAmount: number; currency: string }
): Promise<boolean> {
    if (!customer.chatId) return false;
    return sendToCustomer(tenantId, customer.chatId,
        `↩️ <b>Qaytarish amalga oshirildi</b>\n\n` +
        `Hurmatli ${escapeHtml(customer.name)},\n\n` +
        `Buyurtma #${escapeHtml(order.orderNumber)} bo'yicha qaytarish amalga oshirildi.\n` +
        `💰 Qaytarilgan summa: ${formatUzbekMoney(order.returnedAmount)} ${escapeHtml(order.currency)}`,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_returned',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        }
    );
}

/**
 * Notify customer: Payment Reminder (Uzbek)
 */
export async function notifyCustomerPaymentDue(
    tenantId: string,
    customer: { chatId: string; name: string },
    debt: { totalDebt: number; currency: string; daysOverdue: number; ordersCount: number }
): Promise<boolean> {
    if (!customer.chatId) return false;

    const urgency = debt.daysOverdue > 7 ? '⚠️' : '💳';

    return sendToCustomer(tenantId, customer.chatId,
        `${urgency} <b>To'lov eslatmasi</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `Sizda to'lanmagan qarz mavjud:\n\n` +
        `💰 Qarz: ${formatUzbekMoney(debt.totalDebt)} ${escapeHtml(debt.currency)}\n` +
        `📋 Buyurtmalar: ${debt.ordersCount} ta\n` +
        `📅 Muddat o'tdi: ${debt.daysOverdue} kun\n\n` +
        `Iltimos, imkon qadar tezroq to'lang. Rahmat!`,
        {
            tenantId,
            recipientType: 'customer',
            eventType: 'payment_due',
            recipientChatId: customer.chatId
        }
    );
}

/**
 * Notify customer: Payment Received (Uzbek) - consolidated for full and partial
 */
export async function notifyCustomerPaymentReceived(
    tenantId: string,
    customer: { chatId: string; name: string },
    payment: { amount: number; currency: string; remainingBalance: number; orderNumber?: string }
): Promise<boolean> {
    if (!customer.chatId) return false;

    const isPartial = payment.remainingBalance > 0;

    return sendToCustomer(tenantId, customer.chatId,
        `🙏 <b>To'lov qabul qilindi${isPartial ? ' (qisman)' : ''}!</b>\n\n` +
        `Assalomu alaykum ${escapeHtml(customer.name)},\n\n` +
        `To'lovingiz qabul qilindi: <b>${formatUzbekMoney(payment.amount)} ${escapeHtml(payment.currency)}</b>\n\n` +
        (isPartial
            ? `📋 Qoldiq: ${formatUzbekMoney(payment.remainingBalance)} ${escapeHtml(payment.currency)}`
            : `✅ Hisobingiz to'liq to'landi. Rahmat!`
        ),
        {
            tenantId,
            recipientType: 'customer',
            eventType: isPartial ? 'payment_partial' : 'payment_received',
            recipientChatId: customer.chatId,
            referenceType: payment.orderNumber ? 'order' : undefined,
            referenceId: payment.orderNumber
        }
    );
}

// ============================================================================
// SCHEDULED NOTIFICATION HELPERS
// ============================================================================


/**
 * Process overdue debts and send notifications
 * Should be called by a scheduled job (e.g., daily cron)
 */
export async function processOverdueDebtNotifications(): Promise<{ processed: number; sent: number }> {
    let processed = 0;
    let sent = 0;

    try {
        // Get all tenants with notifications enabled
        const tenants = await db
            .select({
                id: schema.tenants.id,
                currency: schema.tenants.currency,
                telegramEnabled: schema.tenants.telegramEnabled,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.telegramEnabled, true));

        for (const tenant of tenants) {
            // Check if this tenant has due debt notifications enabled
            const { canSend, settings } = await canSendTenantNotification(tenant.id, 'notifyDueDebt');
            if (!canSend || !settings) continue;

            const threshold = settings.dueDebtDaysThreshold || 7;
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - threshold);

            // Find customers with overdue orders
            const overdueCustomers = await db
                .select({
                    customerId: schema.customers.id,
                    customerName: schema.customers.name,
                    totalDebt: sql<number>`SUM(CAST(${schema.orders.totalAmount} AS DECIMAL) - CAST(${schema.orders.paidAmount} AS DECIMAL))`,
                    ordersCount: sql<number>`COUNT(*)`,
                    oldestOrder: sql<Date>`MIN(${schema.orders.createdAt})`,
                })
                .from(schema.orders)
                .innerJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
                .where(and(
                    eq(schema.orders.tenantId, tenant.id),
                    eq(schema.orders.paymentStatus, 'unpaid'),
                    lt(schema.orders.createdAt, thresholdDate)
                ))
                .groupBy(schema.customers.id, schema.customers.name);

            // Get tenant admins
            const admins = await getTenantAdminsWithTelegram(tenant.id);

            for (const customer of overdueCustomers) {
                if (Number(customer.totalDebt) <= 0) continue;

                processed++;
                const daysOverdue = Math.floor((Date.now() - new Date(customer.oldestOrder).getTime()) / (1000 * 60 * 60 * 24));

                for (const admin of admins) {
                    const success = await notifyDueDebt(admin.telegramChatId, {
                        customerName: customer.customerName,
                        totalDebt: Number(customer.totalDebt),
                        currency: tenant.currency || 'USD',
                        daysOverdue,
                        ordersCount: Number(customer.ordersCount),
                    });
                    if (success) sent++;
                }
            }
        }
    } catch (error) {
        console.error('[Telegram] Error processing overdue debts:', error);
    }

    return { processed, sent };
}

// ============================================================================
// BOT VALIDATION
// ============================================================================

/**
 * Validate a Telegram bot token by calling the getMe API
 * Use this when a tenant saves their bot token to verify it's valid
 */
export async function validateBotToken(botToken: string): Promise<BotValidationResult> {
    if (!botToken || botToken.trim() === '') {
        return { valid: false, error: 'Bot token is empty' };
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/getMe`,
            { method: 'GET' }
        );

        const result = await response.json();

        if (!result.ok) {
            return {
                valid: false,
                error: result.description || 'Invalid bot token'
            };
        }

        return {
            valid: true,
            botInfo: result.result as BotInfo
        };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Network error validating token'
        };
    }
}

/**
 * Validate a tenant's bot token and return detailed info
 */
export async function validateTenantBot(tenantId: string): Promise<BotValidationResult> {
    try {
        const [tenant] = await db
            .select({
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramEnabled: schema.tenants.telegramEnabled,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        if (!tenant) {
            return { valid: false, error: 'Tenant not found' };
        }

        if (!tenant.telegramEnabled) {
            return { valid: false, error: 'Telegram is not enabled for this tenant' };
        }

        if (!tenant.telegramBotToken) {
            return { valid: false, error: 'No bot token configured' };
        }

        return validateBotToken(tenant.telegramBotToken);
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Error validating tenant bot'
        };
    }
}

// ============================================================================
// INLINE KEYBOARD BUILDERS
// ============================================================================

/**
 * Create an inline keyboard markup for interactive notifications
 */
export function createInlineKeyboard(buttons: InlineKeyboardButton[][]): InlineKeyboardMarkup {
    return { inline_keyboard: buttons };
}

/**
 * Create a single-row inline keyboard
 */
export function createSingleRowKeyboard(...buttons: InlineKeyboardButton[]): InlineKeyboardMarkup {
    return { inline_keyboard: [buttons] };
}

/**
 * Create a button with callback data
 */
export function callbackButton(text: string, callbackData: string): InlineKeyboardButton {
    return { text, callback_data: callbackData };
}

/**
 * Create a URL button
 */
export function urlButton(text: string, url: string): InlineKeyboardButton {
    return { text, url };
}

// ============================================================================
// ENHANCED CUSTOMER NOTIFICATIONS WITH INLINE KEYBOARDS
// ============================================================================

/**
 * Send a message to customer with inline keyboard for actions
 */
export async function sendToCustomerWithKeyboard(
    tenantId: string,
    customerChatId: string,
    text: string,
    keyboard: InlineKeyboardMarkup,
    logContext?: TelegramMessage['logContext']
): Promise<boolean> {
    try {
        const [tenant] = await db
            .select({
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramEnabled: schema.tenants.telegramEnabled,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

        if (!tenant || !tenant.telegramEnabled || !tenant.telegramBotToken) {
            return false;
        }

        const response = await fetch(
            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: customerChatId,
                    text,
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                }),
            }
        );

        const result = await response.json();

        if (logContext) {
            logNotification({
                ...logContext,
                tenantId,
                recipientChatId: customerChatId,
                channel: 'telegram',
                message: text,
                status: result.ok ? 'sent' : 'failed',
                errorMessage: result.ok ? undefined : result.description
            });
        }

        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error sending to customer with keyboard:', error);
        return false;
    }
}

/**
 * Notify customer about order confirmation with action buttons
 */
export async function notifyCustomerOrderConfirmedWithActions(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; total: number; currency: string; itemCount: number },
    portalUrl?: string
): Promise<boolean> {
    if (!customer.chatId) return false;

    const buttons: InlineKeyboardButton[][] = [];

    if (portalUrl) {
        buttons.push([urlButton('📋 View Order', `${portalUrl}/orders/${order.orderNumber}`)]);
    }

    const text = `✅ <b>Order Confirmed!</b>\n\n` +
        `Hello ${escapeHtml(customer.name)},\n\n` +
        `Your order <b>#${escapeHtml(order.orderNumber)}</b> has been confirmed.\n\n` +
        `📦 Items: ${order.itemCount}\n` +
        `💰 Total: ${escapeHtml(order.currency)} ${order.total.toLocaleString()}\n\n` +
        `We'll notify you when it's out for delivery. Thank you! 🙏`;

    if (buttons.length > 0) {
        return sendToCustomerWithKeyboard(tenantId, customer.chatId, text, createInlineKeyboard(buttons), {
            tenantId,
            recipientType: 'customer',
            eventType: 'order_confirmed_interactive',
            recipientChatId: customer.chatId,
            referenceType: 'order',
            referenceId: order.orderNumber
        });
    }

    return sendToCustomer(tenantId, customer.chatId, text, {
        tenantId,
        recipientType: 'customer',
        eventType: 'order_confirmed',
        recipientChatId: customer.chatId,
        referenceType: 'order',
        referenceId: order.orderNumber
    });
}

/**
 * Notify customer about delivery with confirmation request
 */
export async function notifyCustomerDeliveredWithConfirmation(
    tenantId: string,
    customer: { chatId: string; name: string },
    order: { orderNumber: string; total: number; currency: string }
): Promise<boolean> {
    if (!customer.chatId) return false;

    const keyboard = createInlineKeyboard([
        [
            callbackButton('✅ Confirm Receipt', `confirm_delivery:${order.orderNumber}`),
            callbackButton('❌ Report Issue', `report_issue:${order.orderNumber}`)
        ]
    ]);

    const text = `📦 <b>Order Delivered!</b>\n\n` +
        `Hello ${escapeHtml(customer.name)},\n\n` +
        `Your order <b>#${escapeHtml(order.orderNumber)}</b> has been delivered.\n\n` +
        `💰 Total: ${escapeHtml(order.currency)} ${order.total.toLocaleString()}\n\n` +
        `Please confirm you received your order:`;

    return sendToCustomerWithKeyboard(tenantId, customer.chatId, text, keyboard, {
        tenantId,
        recipientType: 'customer',
        eventType: 'order_delivered_confirmation',
        recipientChatId: customer.chatId,
        referenceType: 'order',
        referenceId: order.orderNumber
    });
}

/**
 * Notify customer about payment due with pay button
 */
export async function notifyCustomerPaymentDueWithAction(
    tenantId: string,
    customer: { chatId: string; name: string },
    debt: { totalDebt: number; currency: string; daysOverdue: number; ordersCount: number },
    paymentUrl?: string
): Promise<boolean> {
    if (!customer.chatId) return false;

    const urgency = debt.daysOverdue > 7 ? '⚠️' : '💳';

    const buttons: InlineKeyboardButton[][] = [];
    if (paymentUrl) {
        buttons.push([urlButton('💳 Pay Now', paymentUrl)]);
    }
    buttons.push([callbackButton('📞 Contact Support', 'contact_support')]);

    const text = `${urgency} <b>Payment Reminder</b>\n\n` +
        `Hello ${escapeHtml(customer.name)},\n\n` +
        `You have an outstanding balance:\n\n` +
        `💰 Amount Due: ${escapeHtml(debt.currency)} ${debt.totalDebt.toLocaleString()}\n` +
        `📋 Orders: ${debt.ordersCount}\n` +
        `📅 Overdue: ${debt.daysOverdue} days\n\n` +
        `Please arrange payment at your earliest convenience.`;

    return sendToCustomerWithKeyboard(tenantId, customer.chatId, text, createInlineKeyboard(buttons), {
        tenantId,
        recipientType: 'customer',
        eventType: 'payment_due_interactive',
        recipientChatId: customer.chatId
    });
}

// ============================================================================
// CALLBACK QUERY DATA PARSER
// ============================================================================

export interface ParsedCallbackData {
    action: string;
    params: string[];
}

/**
 * Parse callback data from inline keyboard button presses
 * Format: action:param1:param2:...
 */
export function parseCallbackData(callbackData: string): ParsedCallbackData {
    const parts = callbackData.split(':');
    return {
        action: parts[0] || '',
        params: parts.slice(1)
    };
}

// ============================================================================
// FAILED NOTIFICATION RETRY QUEUE
// ============================================================================

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BATCH_SIZE = 50;

/**
 * Retry failed Telegram notifications
 * Should be called by a scheduled job (e.g., every 5 minutes)
 */
export async function retryFailedNotifications(): Promise<{ processed: number; succeeded: number; failed: number }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
        // Get failed notifications that haven't exceeded max retries
        const failedNotifs = await db
            .select()
            .from(schema.notificationLogs)
            .where(
                and(
                    eq(schema.notificationLogs.status, 'failed'),
                    eq(schema.notificationLogs.channel, 'telegram'),
                    lt(schema.notificationLogs.retryCount, MAX_RETRY_ATTEMPTS)
                )
            )
            .limit(RETRY_BATCH_SIZE);

        for (const notif of failedNotifs) {
            processed++;

            // Get tenant's bot token
            const [tenant] = await db
                .select({
                    telegramBotToken: schema.tenants.telegramBotToken,
                    telegramEnabled: schema.tenants.telegramEnabled,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, notif.tenantId))
                .limit(1);

            if (!tenant || !tenant.telegramEnabled || !tenant.telegramBotToken) {
                // Mark as permanently failed - tenant doesn't have telegram anymore
                await db
                    .update(schema.notificationLogs)
                    .set({
                        retryCount: MAX_RETRY_ATTEMPTS,
                        errorMessage: 'Tenant Telegram disabled or no bot token',
                        updatedAt: new Date()
                    })
                    .where(eq(schema.notificationLogs.id, notif.id));
                failed++;
                continue;
            }

            if (!notif.recipientChatId || !notif.message) {
                // Invalid notification, mark as failed
                await db
                    .update(schema.notificationLogs)
                    .set({
                        retryCount: MAX_RETRY_ATTEMPTS,
                        errorMessage: 'Missing chat ID or message',
                        updatedAt: new Date()
                    })
                    .where(eq(schema.notificationLogs.id, notif.id));
                failed++;
                continue;
            }

            try {
                // Attempt to send
                const response = await fetch(
                    `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: notif.recipientChatId,
                            text: notif.message,
                            parse_mode: 'HTML',
                        }),
                    }
                );

                const result = await response.json();

                if (result.ok) {
                    // Success - update status
                    await db
                        .update(schema.notificationLogs)
                        .set({
                            status: 'sent',
                            sentAt: new Date(),
                            updatedAt: new Date()
                        })
                        .where(eq(schema.notificationLogs.id, notif.id));
                    succeeded++;
                } else {
                    // Failed again - increment retry count
                    const newRetryCount = (notif.retryCount || 0) + 1;
                    await db
                        .update(schema.notificationLogs)
                        .set({
                            retryCount: newRetryCount,
                            errorMessage: result.description || 'Unknown error',
                            updatedAt: new Date()
                        })
                        .where(eq(schema.notificationLogs.id, notif.id));
                    failed++;
                }
            } catch (error) {
                // Network error - increment retry count
                const newRetryCount = (notif.retryCount || 0) + 1;
                await db
                    .update(schema.notificationLogs)
                    .set({
                        retryCount: newRetryCount,
                        errorMessage: error instanceof Error ? error.message : 'Network error',
                        updatedAt: new Date()
                    })
                    .where(eq(schema.notificationLogs.id, notif.id));
                failed++;
            }

            // Small delay between retries to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[Telegram Retry] Processed: ${processed}, Succeeded: ${succeeded}, Failed: ${failed}`);
    } catch (error) {
        console.error('[Telegram Retry] Error processing retry queue:', error);
    }

    return { processed, succeeded, failed };
}

/**
 * Get retry queue statistics
 */
export async function getRetryQueueStats(): Promise<{
    pending: number;
    maxedOut: number;
    recentFailures: number;
}> {
    try {
        const [pendingResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.notificationLogs)
            .where(
                and(
                    eq(schema.notificationLogs.status, 'failed'),
                    lt(schema.notificationLogs.retryCount, MAX_RETRY_ATTEMPTS)
                )
            );

        const [maxedOutResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.notificationLogs)
            .where(
                and(
                    eq(schema.notificationLogs.status, 'failed'),
                    sql`${schema.notificationLogs.retryCount} >= ${MAX_RETRY_ATTEMPTS}`
                )
            );

        // Failures in last 24 hours
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.notificationLogs)
            .where(
                and(
                    eq(schema.notificationLogs.status, 'failed'),
                    sql`${schema.notificationLogs.createdAt} >= ${yesterday.toISOString()}`
                )
            );

        return {
            pending: Number(pendingResult?.count || 0),
            maxedOut: Number(maxedOutResult?.count || 0),
            recentFailures: Number(recentResult?.count || 0),
        };
    } catch (error) {
        console.error('[Telegram Retry] Error getting stats:', error);
        return { pending: 0, maxedOut: 0, recentFailures: 0 };
    }
}
