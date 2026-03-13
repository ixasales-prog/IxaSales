/**
 * Telegram Webhook Routes (Fastify)
 * 
 * Handles incoming messages from tenant Telegram bots.
 * Used for customer self-registration (phone matching).
 * 
 * Security:
 *   - Validates X-Telegram-Bot-Api-Secret-Token header
 *   - Rate limits incoming requests
 * 
 * Features:
 *   - Customer account linking via phone
 *   - Callback query handling for inline keyboard buttons
 *   - Notification preferences management
 */

import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { escapeHtml, getTenantAdminsWithTelegram, notifyUser, parseCallbackData } from '../lib/telegram';
import { getTelegramIntegration } from '../lib/tenant-integrations';

interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        chat: { id: number };
        from?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
        text?: string;
        contact?: { phone_number: string };
    };
    callback_query?: {
        id: string;
        from: { id: number; first_name?: string; last_name?: string; username?: string };
        message?: {
            message_id: number;
            chat: { id: number };
            text?: string;
        };
        data?: string;
    };
}

// Schemas
const TenantIdParamsSchema = Type.Object({
    tenantId: Type.String({
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    }),
});

const ConfigureBodySchema = Type.Optional(Type.Object({
    secretToken: Type.Optional(Type.String()),
}));

const TestBodySchema = Type.Object({
    chatId: Type.String(),
});

type TenantIdParams = Static<typeof TenantIdParamsSchema>;

// ============================================================================
// RATE LIMITING FOR WEBHOOKS
// ============================================================================

const webhookRateLimits = new Map<string, { count: number; resetAt: number }>();
const WEBHOOK_RATE_LIMIT = 100;
const WEBHOOK_RATE_WINDOW = 60000;

function checkWebhookRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const key = `webhook:${tenantId}`;
    const entry = webhookRateLimits.get(key);

    if (!entry || entry.resetAt < now) {
        webhookRateLimits.set(key, { count: 1, resetAt: now + WEBHOOK_RATE_WINDOW });
        return true;
    }

    if (entry.count >= WEBHOOK_RATE_LIMIT) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// PHONE NORMALIZATION
// ============================================================================

interface PhoneNormalizationConfig {
    defaultCountryCode: string;
    localNumberLength: number;
}

const COUNTRY_CONFIGS: Record<string, PhoneNormalizationConfig> = {
    UZ: { defaultCountryCode: '+998', localNumberLength: 9 },
    RU: { defaultCountryCode: '+7', localNumberLength: 10 },
    KZ: { defaultCountryCode: '+7', localNumberLength: 10 },
    US: { defaultCountryCode: '+1', localNumberLength: 10 },
    GB: { defaultCountryCode: '+44', localNumberLength: 10 },
};

function normalizePhone(phone: string, countryCode?: string): string {
    let normalized = phone.replace(/[^\d+]/g, '');
    if (!normalized) return '';

    if (normalized.startsWith('+')) {
        return normalized;
    }

    const config = COUNTRY_CONFIGS[countryCode || 'UZ'] || COUNTRY_CONFIGS.UZ;

    if (normalized.startsWith('998') && normalized.length >= 12) {
        return '+' + normalized;
    } else if (normalized.length === config.localNumberLength) {
        return config.defaultCountryCode + normalized;
    } else if (normalized.length > 10) {
        return '+' + normalized;
    }

    return normalized.startsWith('+') ? normalized : '+' + normalized;
}

function guessCountryFromCurrency(currency: string): string {
    const currencyToCountry: Record<string, string> = {
        UZS: 'UZ',
        RUB: 'RU',
        KZT: 'KZ',
        USD: 'US',
        GBP: 'GB',
        EUR: 'DE',
    };
    return currencyToCountry[currency] || 'UZ';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function sendBotMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                }),
            }
        );
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error sending message:', error);
        return false;
    }
}

async function sendBotMessageWithKeyboard(
    botToken: string,
    chatId: string,
    text: string,
    keyboard: object
): Promise<boolean> {
    try {
        const payload = {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: keyboard,
        };

        console.log('[Telegram] Sending message with keyboard to chat:', chatId);

        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );

        const result = await response.json();

        if (!result.ok) {
            console.error('[Telegram] API Error:', result);
        } else {
            console.log('[Telegram] Message sent successfully to chat:', chatId);
        }

        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error sending message with keyboard:', error);
        return false;
    }
}

async function answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean
): Promise<boolean> {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text,
                    show_alert: showAlert,
                }),
            }
        );
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error answering callback query:', error);
        return false;
    }
}

async function editMessage(
    botToken: string,
    chatId: string,
    messageId: number,
    text: string
): Promise<boolean> {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/editMessageText`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text,
                    parse_mode: 'HTML',
                }),
            }
        );
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('[Telegram] Error editing message:', error);
        return false;
    }
}

function createShareContactKeyboard(label = 'Share Phone Number') {
    return {
        keyboard: [[{ text: label, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
    };
}

interface TenantTelegramContext {
    id: string;
    name: string;
    subdomain: string;
    currency: string | null;
    telegramBotToken: string | null;
    telegramWebhookSecret: string | null;
    telegramBotUsername: string | null;
    telegramEnabled: boolean;
}

async function getTenantTelegramContext(tenantId: string): Promise<TenantTelegramContext | null> {
    const [tenant] = await db
        .select({
            id: schema.tenants.id,
            name: schema.tenants.name,
            subdomain: schema.tenants.subdomain,
            currency: schema.tenants.currency,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    if (!tenant) {
        return null;
    }

    const integration = await getTelegramIntegration(tenantId, true);
    return {
        ...tenant,
        telegramBotToken: integration.botToken || null,
        telegramWebhookSecret: integration.webhookSecret || null,
        telegramBotUsername: integration.botUsername || null,
        telegramEnabled: integration.enabled,
    };
}

function maskChatId(chatId: string): string {
    if (chatId.length <= 4) return '****';
    return `***${chatId.slice(-4)}`;
}

function summarizeTelegramUpdate(update: TelegramUpdate): Record<string, unknown> {
    if (update.callback_query) {
        return {
            updateId: update.update_id,
            kind: 'callback_query',
            chatId: update.callback_query.message?.chat.id
                ? maskChatId(String(update.callback_query.message.chat.id))
                : null,
            callbackData: update.callback_query.data || null,
        };
    }

    if (update.message) {
        return {
            updateId: update.update_id,
            kind: 'message',
            chatId: maskChatId(String(update.message.chat.id)),
            hasText: typeof update.message.text === 'string' && update.message.text.length > 0,
            hasContact: !!update.message.contact?.phone_number,
        };
    }

    return {
        updateId: update.update_id,
        kind: 'unknown',
    };
}

function isStrictWebhookSecretRequired(): boolean {
    // Always required in production. Optional opt-in strict mode for non-production environments.
    if (process.env.NODE_ENV === 'production') {
        return true;
    }
    return process.env.STRICT_TELEGRAM_WEBHOOK_SECRET === 'true';
}

async function ensureTenantScopedAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    tenantId: string
): Promise<boolean> {
    const user = request.user;
    if (!user) {
        await reply.code(401).send({ success: false, error: 'Authentication required' });
        return false;
    }

    if (user.role === 'super_admin') {
        return true;
    }

    if (!user.tenantId || user.tenantId !== tenantId) {
        await reply.code(403).send({ success: false, error: 'Forbidden tenant scope' });
        return false;
    }

    return true;
}

// ============================================================================
// CALLBACK QUERY HANDLER
// ============================================================================

async function handleCallbackQuery(
    tenantId: string,
    callbackQuery: NonNullable<TelegramUpdate['callback_query']>,
    headers: Record<string, string | string[] | undefined>
): Promise<{ ok: boolean }> {
    const chatId = callbackQuery.message?.chat.id.toString();
    const messageId = callbackQuery.message?.message_id;
    const callbackData = callbackQuery.data;

    if (!chatId || !callbackData) {
        return { ok: true };
    }

    const tenant = await getTenantTelegramContext(tenantId);

    if (!tenant || !tenant.telegramBotToken) {
        return { ok: true };
    }

    const secretHeader = headers['x-telegram-bot-api-secret-token'] as string | undefined;
    if (tenant.telegramWebhookSecret) {
        if (secretHeader !== tenant.telegramWebhookSecret) {
            console.warn('[Telegram Webhook] Invalid secret for callback query');
            return { ok: false };
        }
    } else if (isStrictWebhookSecretRequired()) {
        console.warn('[Telegram Webhook] Missing webhook secret for callback query');
        return { ok: false };
    }

    const { action, params } = parseCallbackData(callbackData);

    try {
        switch (action) {
            case 'confirm_delivery': {
                const orderNumber = params[0];
                if (orderNumber) {
                    await answerCallbackQuery(tenant.telegramBotToken, callbackQuery.id, 'Thank you for confirming!');

                    if (messageId) {
                        await editMessage(
                            tenant.telegramBotToken,
                            chatId,
                            messageId,
                            `вњ… <b>Delivery Confirmed</b>\n\nThank you for confirming receipt of order #${escapeHtml(orderNumber)}!\n\nWe appreciate your business. рџ™Џ`
                        );
                    }

                    console.log(`[Telegram] Customer confirmed delivery: ${orderNumber}`);
                }
                break;
            }

            case 'report_issue': {
                const orderNumber = params[0];
                await answerCallbackQuery(tenant.telegramBotToken, callbackQuery.id, 'We\'ll contact you shortly');

                if (messageId) {
                    await editMessage(
                        tenant.telegramBotToken,
                        chatId,
                        messageId,
                        `вљ пёЏ <b>Issue Reported</b>\n\nA support request has been created for order #${escapeHtml(orderNumber || '')}.\n\nOur team will contact you shortly.`
                    );
                }

                console.log(`[Telegram] Customer reported issue: ${orderNumber}`);
                break;
            }

            case 'contact_support': {
                await answerCallbackQuery(
                    tenant.telegramBotToken,
                    callbackQuery.id,
                    'Please contact our support team.',
                    true
                );
                break;
            }

            case 'toggle_notification': {
                const notificationType = params[0];
                const enabled = params[1] === 'on';

                const [customer] = await db
                    .select({ id: schema.customers.id })
                    .from(schema.customers)
                    .where(and(
                        eq(schema.customers.tenantId, tenantId),
                        eq(schema.customers.telegramChatId, chatId)
                    ))
                    .limit(1);

                if (customer) {
                    await answerCallbackQuery(
                        tenant.telegramBotToken,
                        callbackQuery.id,
                        `Notifications ${enabled ? 'enabled' : 'disabled'}`
                    );
                    console.log(`[Telegram] Customer toggled ${notificationType}: ${enabled}`);
                }
                break;
            }

            default:
                await answerCallbackQuery(tenant.telegramBotToken, callbackQuery.id);
                console.log(`[Telegram] Unknown callback action: ${action}`);
        }
    } catch (error) {
        console.error('[Telegram] Error handling callback query:', error);
        await answerCallbackQuery(tenant.telegramBotToken, callbackQuery.id, 'An error occurred');
    }

    return { ok: true };
}

// ============================================================================
// ROUTES
// ============================================================================

export const telegramWebhookRoutes: FastifyPluginAsync = async (fastify) => {
    // Webhook endpoint for tenant bots
    fastify.post<{ Params: TenantIdParams }>('/webhook/:tenantId', {
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;
        const update = request.body as TelegramUpdate;

        console.log('[Telegram Webhook] Received update', {
            tenantId,
            summary: summarizeTelegramUpdate(update),
        });

        if (!checkWebhookRateLimit(tenantId)) {
            console.log('[Telegram Webhook] Rate limited:', tenantId);
            return reply.code(429).send({ ok: false, error: 'Too many requests' });
        }

        if (update.callback_query) {
            console.log('[Telegram Webhook] Handling callback query');
            return handleCallbackQuery(tenantId, update.callback_query, request.headers as any);
        }

        if (!update.message) {
            console.log('[Telegram Webhook] No message in update, skipping');
            return { ok: true };
        }

        const chatId = update.message.chat.id.toString();
        const text = update.message.text?.trim();
        const contactPhone = update.message.contact?.phone_number;
        const from = update.message.from;

        console.log('[Telegram Webhook] Processing message summary:', {
            chatId: maskChatId(chatId),
            hasText: typeof text === 'string' && text.length > 0,
            hasContact: !!contactPhone,
        });

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            console.log('[Telegram Webhook] Tenant not found or no bot token:', tenantId);
            return { ok: true };
        }

        const secretHeader = request.headers['x-telegram-bot-api-secret-token'] as string | undefined;
        if (tenant.telegramWebhookSecret) {
            if (secretHeader !== tenant.telegramWebhookSecret) {
                console.warn('[Telegram Webhook] Invalid webhook secret for tenant:', tenantId);
                return reply.code(401).send({ ok: false, error: 'Invalid webhook secret' });
            }
        } else if (isStrictWebhookSecretRequired()) {
            console.warn('[Telegram Webhook] Rejecting webhook with missing secret configuration:', tenantId);
            return reply.code(401).send({ ok: false, error: 'Webhook secret required' });
        } else {
            console.warn('[Telegram Webhook] No webhook secret configured for tenant:', tenantId);
        }

        const startMatch = (text || '').match(/^\/start(?:\s+(.+))?$/);

        // Handle /start command (supports deep-link payloads like "/start reg_demo")
        if (startMatch) {
            console.log('[Telegram Webhook] Handling /start command for chat:', chatId);

            const result = await sendBotMessageWithKeyboard(tenant.telegramBotToken, chatId,
                `рџ‘‹ <b>${escapeHtml(tenant.name)}</b> ga xush kelibsiz!\n\n` +
                `Buyurtmalaringiz haqida bildirishnomalar olish uchun telefon raqamingizni yuboring.\n\n` +
                `Raqamni qo'lda yozishingiz mumkin (masalan, <code>+998901234567</code>) yoki quyidagi tugmani bosing.`,
                createShareContactKeyboard('рџ“± Telefon raqamni ulashish')
            );
            console.log('[Telegram Webhook] /start message sent, result:', result);
            if (startMatch[1]) {
                console.log('[Telegram Webhook] /start payload:', startMatch[1]);
            }
            return { ok: true };
        }

        // Handle /help command
        if (text === '/help') {
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `в„№пёЏ <b>Help</b>\n\n` +
                `Available commands:\n` +
                `вЂў /start - Start registration\n` +
                `вЂў /status - Check your account status\n` +
                `вЂў /unlink - Unlink your account\n` +
                `вЂў /help - Show this help\n\n` +
                `To link your account, send your registered phone number.`
            );
            return { ok: true };
        }

        // Handle /unlink command - supports both users and customers
        if (text === '/unlink') {
            // First check if this is a linked user
            const [linkedUser] = await db
                .select({
                    id: schema.users.id,
                    name: schema.users.name,
                })
                .from(schema.users)
                .where(and(
                    eq(schema.users.tenantId, tenantId),
                    eq(schema.users.telegramChatId, chatId)
                ))
                .limit(1);

            if (linkedUser) {
                await db.update(schema.users).set({
                    telegramChatId: null,
                    updatedAt: new Date(),
                }).where(eq(schema.users.id, linkedUser.id));

                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вњ… <b>Staff Account Unlinked</b>\n\n` +
                    `Your account <b>${escapeHtml(linkedUser.name)}</b> has been unlinked.\n\n` +
                    `You will no longer receive notifications here.\n` +
                    `To re-link, generate a new code from your dashboard.`
                );

                console.log(`[Telegram] User ${linkedUser.id} unlinked from chat ${chatId}`);
                return { ok: true };
            }

            // Check if customer
            const [customer] = await db
                .select({
                    id: schema.customers.id,
                    name: schema.customers.name,
                })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.tenantId, tenantId),
                    eq(schema.customers.telegramChatId, chatId)
                ))
                .limit(1);

            if (!customer) {
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вќЊ <b>No Account Linked</b>\n\n` +
                    `Your Telegram is not linked to any account.`
                );
                return { ok: true };
            }

            await db
                .update(schema.customers)
                .set({
                    telegramChatId: null,
                    updatedAt: new Date(),
                })
                .where(eq(schema.customers.id, customer.id));

            await sendBotMessage(tenant.telegramBotToken, chatId,
                `вњ… <b>Customer Account Unlinked</b>\n\n` +
                `Your account <b>${escapeHtml(customer.name)}</b> has been unlinked.\n\n` +
                `You will no longer receive notifications here.\n` +
                `To re-link, use /start and send your phone number.`
            );

            console.log(`[Telegram] Customer ${customer.id} unlinked from chat ${chatId}`);
            return { ok: true };
        }

        // Handle /status command - check both users and customers
        if (text === '/status') {
            // Check if this is a linked user (admin, sales rep, etc.)
            const [linkedUser] = await db
                .select({
                    name: schema.users.name,
                    role: schema.users.role,
                })
                .from(schema.users)
                .where(and(
                    eq(schema.users.tenantId, tenantId),
                    eq(schema.users.telegramChatId, chatId)
                ))
                .limit(1);

            if (linkedUser) {
                const roleDisplay = linkedUser.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вњ… <b>Staff Account Linked</b>\n\n` +
                    `Name: ${escapeHtml(linkedUser.name)}\n` +
                    `Role: ${roleDisplay}\n` +
                    `Status: Active\n\n` +
                    `You will receive notifications about orders and important alerts.`
                );
                return { ok: true };
            }

            // Check if this is a linked customer
            const [customer] = await db
                .select({
                    name: schema.customers.name,
                    telegramChatId: schema.customers.telegramChatId,
                })
                .from(schema.customers)
                .where(and(
                    eq(schema.customers.tenantId, tenantId),
                    eq(schema.customers.telegramChatId, chatId)
                ))
                .limit(1);

            if (customer) {
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вњ… <b>Customer Account Linked</b>\n\n` +
                    `Name: ${escapeHtml(customer.name)}\n` +
                    `Status: Active\n\n` +
                    `You will receive notifications about your orders.`
                );
            } else {
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вќЊ <b>Account Not Linked</b>\n\n` +
                    `<b>For customers:</b> Send your phone number to link.\n` +
                    `<b>For staff:</b> Get a link code from your dashboard.`
                );
            }
            return { ok: true };
        }

        // ================================================================
        // Handle user link codes (6-character alphanumeric codes)
        // Users (admins, sales reps, etc.) can link their Telegram by sending a code
        // ================================================================
        if (text && /^[A-Z0-9]{6}$/.test(text.toUpperCase())) {
            const linkCode = text.toUpperCase();
            console.log('[Telegram Webhook] Checking for user link code:', linkCode);

            // Check if this is a valid user link code
            const [linkData] = await db
                .select({
                    id: schema.userTelegramLinkCodes.id,
                    userId: schema.userTelegramLinkCodes.userId,
                    expiresAt: schema.userTelegramLinkCodes.expiresAt,
                })
                .from(schema.userTelegramLinkCodes)
                .where(and(
                    eq(schema.userTelegramLinkCodes.tenantId, tenantId),
                    eq(schema.userTelegramLinkCodes.code, linkCode)
                ))
                .limit(1);

            if (linkData) {
                // Check if expired
                if (new Date(linkData.expiresAt) < new Date()) {
                    await db.delete(schema.userTelegramLinkCodes)
                        .where(eq(schema.userTelegramLinkCodes.id, linkData.id));

                    await sendBotMessage(tenant.telegramBotToken, chatId,
                        `вќЊ <b>Link Code Expired</b>\n\n` +
                        `This code has expired. Please generate a new code from your dashboard.`
                    );
                    return { ok: true };
                }

                // Get the user info
                const [userInfo] = await db
                    .select({
                        name: schema.users.name,
                        telegramChatId: schema.users.telegramChatId,
                    })
                    .from(schema.users)
                    .where(eq(schema.users.id, linkData.userId))
                    .limit(1);

                if (!userInfo) {
                    await db.delete(schema.userTelegramLinkCodes)
                        .where(eq(schema.userTelegramLinkCodes.id, linkData.id));

                    await sendBotMessage(tenant.telegramBotToken, chatId,
                        `вќЊ <b>Invalid Code</b>\n\n` +
                        `User not found. Please generate a new code.`
                    );
                    return { ok: true };
                }

                // Check if user already linked to another chat
                if (userInfo.telegramChatId && userInfo.telegramChatId !== chatId) {
                    await sendBotMessage(tenant.telegramBotToken, chatId,
                        `вљ пёЏ <b>Already Linked</b>\n\n` +
                        `This account is already linked to another Telegram chat.\n` +
                        `Please unlink it first from your dashboard.`
                    );
                    return { ok: true };
                }

                // Link the user's Telegram
                await db.update(schema.users).set({
                    telegramChatId: chatId,
                    updatedAt: new Date(),
                }).where(eq(schema.users.id, linkData.userId));

                // Delete the used code
                await db.delete(schema.userTelegramLinkCodes)
                    .where(eq(schema.userTelegramLinkCodes.id, linkData.id));

                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `вњ… <b>Account Linked Successfully!</b>\n\n` +
                    `Welcome, <b>${escapeHtml(userInfo.name)}</b>!\n\n` +
                    `You will now receive notifications here:\n` +
                    `вЂў New orders\n` +
                    `вЂў Order status updates\n` +
                    `вЂў Payment notifications\n` +
                    `вЂў Important alerts\n\n` +
                    `Use /status to check your link status.\n` +
                    `Use /unlink to disconnect this account.`
                );

                console.log(`[Telegram] User ${linkData.userId} linked to chat ${chatId}`);
                return { ok: true };
            }
        }

        // Extract phone number from text or contact
        let phone = contactPhone || text || '';
        const countryGuess = guessCountryFromCurrency(tenant.currency || 'UZS');
        phone = normalizePhone(phone, countryGuess);

        if (!phone || phone.length < 8) {
            await sendBotMessageWithKeyboard(tenant.telegramBotToken, chatId,
                `вќ“ Please send your phone number to link your account.\n\n` +
                `Example: <code>+998901234567</code>`,
                createShareContactKeyboard('рџ“± Share Phone Number')
            );
            return { ok: true };
        }

        // Search for customer by phone
        const phoneVariants = [
            phone,
            phone.replace('+', ''),
            phone.replace(/^\+998/, ''),
        ];

        const [customer] = await db
            .select({
                id: schema.customers.id,
                name: schema.customers.name,
                telegramChatId: schema.customers.telegramChatId,
            })
            .from(schema.customers)
            .where(and(
                eq(schema.customers.tenantId, tenantId),
                or(
                    sql`${schema.customers.phone} IN (${sql.join(phoneVariants.map(p => sql`${p}`), sql`, `)})`,
                    sql`REPLACE(${schema.customers.phone}, '+', '') = ${phone.replace('+', '')}`
                )
            ))
            .limit(1);

        if (!customer) {
            const normalizedPhone = phone;
            const requestIp = ((request.headers['x-forwarded-for'] as string) || request.ip || '').split(',')[0].trim() || null;
            const telegramUsername = from?.username ? from.username.replace(/^@/, '') : null;
            const senderName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
            const requestName = senderName || (telegramUsername ? `@${telegramUsername}` : `Telegram ${chatId.slice(-4)}`);
            const [pendingRequest] = await db
                .select({
                    id: schema.customerRegistrationRequests.id,
                    status: schema.customerRegistrationRequests.status,
                })
                .from(schema.customerRegistrationRequests)
                .where(and(
                    eq(schema.customerRegistrationRequests.tenantId, tenantId),
                    eq(schema.customerRegistrationRequests.phone, normalizedPhone),
                    eq(schema.customerRegistrationRequests.status, 'pending')
                ))
                .limit(1);
            if (pendingRequest) {
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `<b>So'rov allaqachon yuborilgan</b>\n\n` +
                    `Sizning ro'yxatdan o'tish so'rovingiz ko'rib chiqilmoqda.\n` +
                    `Iltimos, admin tasdig'ini kuting.`
                );
                return { ok: true };
            }
            const [registrationRequest] = await db
                .insert(schema.customerRegistrationRequests)
                .values({
                    tenantId,
                    name: requestName,
                    phone: normalizedPhone,
                    telegramChatId: chatId,
                    telegramUsername,
                    telegramUserId: from?.id ? String(from.id) : null,
                    telegramFirstName: from?.first_name || null,
                    telegramLastName: from?.last_name || null,
                    telegramLanguageCode: from?.language_code || null,
                    registrationSource: 'telegram_bot',
                    consentGiven: true,
                    consentAt: new Date(),
                    requestIp,
                    requestUserAgent: 'telegram-webhook',
                    notes: 'Created from Telegram bot phone-share flow',
                    status: 'pending',
                })
                .returning({ id: schema.customerRegistrationRequests.id });
            const admins = await getTenantAdminsWithTelegram(tenantId);
            const requestLabel = registrationRequest.id.slice(0, 8);
            for (const admin of admins) {
                await notifyUser(
                    admin.telegramChatId,
                    `<b>Yangi ro'yxatdan o'tish so'rovi (Telegram)</b>\n\n` +
                    `ID: ${requestLabel}\n` +
                    `Ism: ${escapeHtml(requestName)}\n` +
                    `Telefon: ${escapeHtml(normalizedPhone)}\n` +
                    (telegramUsername ? `Telegram: @${escapeHtml(telegramUsername)}\n` : '') +
                    `\nTasdiqlash uchun admin paneldan ko'ring.`
                );
            }
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `<b>So'rov yuborildi</b>\n\n` +
                `Telefon raqamingiz bo'yicha ro'yxatdan o'tish so'rovi yaratildi.\n` +
                `Admin tasdiqlaganidan keyin OTP orqali tizimga kirishingiz mumkin.\n\n` +
                `Telefon: <code>${escapeHtml(normalizedPhone)}</code>`
            );
            return { ok: true };
        }
        if (customer.telegramChatId === chatId) {
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `вњ… <b>Already linked!</b>\n\n` +
                `Your account <b>${customer.name}</b> is already connected.\n` +
                `You will receive notifications about your orders here.`
            );
            return { ok: true };
        }

        // Link customer to Telegram
        await db
            .update(schema.customers)
                        .set({
                telegramChatId: chatId,
                telegramUserId: from?.id ? String(from.id) : null,
                telegramUsername: from?.username ? from.username.replace(/^@/, '') : null,
                telegramFirstName: from?.first_name || null,
                telegramLastName: from?.last_name || null,
                telegramLanguageCode: from?.language_code || null,
                telegramLinkedAt: new Date(),
                registrationSource: 'telegram_bot',
                updatedAt: new Date(),
            })
            .where(eq(schema.customers.id, customer.id));

        const portalBaseUrl = process.env.PORTAL_URL || 'https://app.ixasales.com';
        const portalUrl = `${portalBaseUrl}/customer?tenant=${tenant.subdomain}`;

        await sendBotMessage(tenant.telegramBotToken, chatId,
            `вњ… <b>Muvaffaqiyatli bog'landi!</b>\n\n` +
            `Xush kelibsiz, <b>${escapeHtml(customer.name)}</b>!\n\n` +
            `Siz endi quyidagi bildirishnomalarni olasiz:\n` +
            `вЂў Buyurtma tasdig'i\n` +
            `вЂў Yetkazib berish yangilanishlari\n` +
            `вЂў To'lov eslatmalari\n` +
            `вЂў To'lov tasdig'i\n\n` +
            `рџ“± <b>Mijoz kabinetiga kirish:</b>\n` +
            `${portalUrl}\n\n` +
            `${escapeHtml(tenant.name)} bilan bog'langaningiz uchun rahmat! рџЋ‰`
        );

        console.log(`[Telegram] Customer ${customer.id} linked to chat ${chatId}`);
        return { ok: true };
    });

    // Get webhook setup instructions
    fastify.get<{ Params: TenantIdParams }>('/setup/:tenantId', {
        preHandler: [fastify.authenticate],
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;
        if (!await ensureTenantScopedAccess(request, reply, tenantId)) {
            return;
        }

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant) {
            return reply.code(404).send({ success: false, error: 'Tenant not found' });
        }

        const webhookUrl = `${process.env.API_URL || 'https://api.ixasales.com'}/api/telegram/webhook/${tenantId}`;

        return {
            success: true,
            data: {
                instructions: [
                    '1. Create a bot using @BotFather on Telegram',
                    '2. Copy the bot token',
                    '3. Enter the token in your Telegram settings',
                    '4. The webhook will be automatically configured',
                ],
                webhookUrl,
                hasToken: !!tenant.telegramBotToken,
            },
        };
    });

    // Configure webhook for current tenant (authenticated)
    fastify.post('/configure/current', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (!user.tenantId) {
            return reply.code(401).send({ success: false, error: 'No tenant context' });
        }

        const secretToken = (request.body as any)?.secretToken;

        const tenant = await getTenantTelegramContext(user.tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            return reply.code(400).send({ success: false, error: 'No bot token configured' });
        }

        const webhookUrl = `${process.env.API_URL || 'https://api.ixasales.com'}/api/telegram/webhook/${user.tenantId}`;

        try {
            const webhookParams: any = { url: webhookUrl };
            if (secretToken) {
                webhookParams.secret_token = secretToken;
            }

            const response = await fetch(
                `https://api.telegram.org/bot${tenant.telegramBotToken}/setWebhook`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookParams),
                }
            );

            const result = await response.json();

            if (!result.ok) {
                return { success: false, error: result.description };
            }

            return {
                success: true,
                message: 'Webhook configured successfully',
                webhookUrl,
            };
        } catch (error) {
            console.error('[Telegram] Error configuring webhook:', error);
            return { success: false, error: 'Failed to configure webhook' };
        }
    });

    // Configure webhook for tenant's bot
    fastify.post<{ Params: TenantIdParams }>('/configure/:tenantId', {
        preHandler: [fastify.authenticate],
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;
        if (!await ensureTenantScopedAccess(request, reply, tenantId)) {
            return;
        }
        const secretToken = (request.body as any)?.secretToken;

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            return reply.code(400).send({ success: false, error: 'No bot token configured' });
        }

        const webhookUrl = `${process.env.API_URL || 'https://api.ixasales.com'}/api/telegram/webhook/${tenantId}`;

        try {
            const webhookParams: any = { url: webhookUrl };
            if (secretToken) {
                webhookParams.secret_token = secretToken;
            }

            const response = await fetch(
                `https://api.telegram.org/bot${tenant.telegramBotToken}/setWebhook`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookParams),
                }
            );

            const result = await response.json();

            if (!result.ok) {
                return { success: false, error: result.description };
            }

            return {
                success: true,
                message: 'Webhook configured successfully',
                webhookUrl,
            };
        } catch (error) {
            console.error('[Telegram] Error configuring webhook:', error);
            return { success: false, error: 'Failed to configure webhook' };
        }
    });

    // Get webhook status for tenant's bot
    fastify.get<{ Params: TenantIdParams }>('/status/:tenantId', {
        preHandler: [fastify.authenticate],
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;
        if (!await ensureTenantScopedAccess(request, reply, tenantId)) {
            return;
        }

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            return reply.code(400).send({ success: false, error: 'No bot token configured' });
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${tenant.telegramBotToken}/getWebhookInfo`
            );
            const result = await response.json();

            return { success: true, data: result.result };
        } catch (error) {
            console.error('[Telegram] Error getting webhook status:', error);
            return { success: false, error: 'Failed to get webhook status' };
        }
    });

    // Test endpoint (development only)
    fastify.post<{ Params: TenantIdParams; Body: Static<typeof TestBodySchema> }>('/test/:tenantId', {
        preHandler: [fastify.authenticate],
        schema: { params: TenantIdParamsSchema, body: TestBodySchema },
    }, async (request, reply) => {
        if (process.env.NODE_ENV === 'production') {
            return reply.code(403).send({ success: false, error: 'Not available in production' });
        }

        const { tenantId } = request.params;
        if (!await ensureTenantScopedAccess(request, reply, tenantId)) {
            return;
        }
        const { chatId } = request.body;

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            return reply.code(400).send({ success: false, error: 'No bot token configured' });
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `рџ‘‹ Welcome to <b>${escapeHtml(tenant.name)}</b>!\n\nTo receive notifications about your orders, please share your phone number.\n\nYou can type it manually (e.g., <code>+998901234567</code>) or tap the button below.`,
                        parse_mode: 'HTML',
                        reply_markup: {
                            keyboard: [[{ text: 'рџ“± Share Phone Number', request_contact: true }]],
                            resize_keyboard: true,
                            one_time_keyboard: true,
                        },
                    }),
                }
            );

            const result = await response.json();
            console.log('[Telegram Test] Response:', result);

            return { success: result.ok, data: result };
        } catch (error) {
            console.error('[Telegram Test] Error:', error);
            return { success: false, error: 'Failed to send message' };
        }
    });

    // Poll endpoint (development only)
    fastify.post<{ Params: TenantIdParams }>('/poll/:tenantId', {
        preHandler: [fastify.authenticate],
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        if (process.env.NODE_ENV === 'production') {
            return reply.code(403).send({ success: false, error: 'Not available in production' });
        }

        const { tenantId } = request.params;
        if (!await ensureTenantScopedAccess(request, reply, tenantId)) {
            return;
        }

        const tenant = await getTenantTelegramContext(tenantId);

        if (!tenant || !tenant.telegramBotToken) {
            return reply.code(400).send({ success: false, error: 'No bot token configured' });
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${tenant.telegramBotToken}/getUpdates`
            );
            const result = await response.json();

            if (!result.ok) {
                return { success: false, error: result.description };
            }

            const updates = result.result || [];
            console.log(`[Telegram Poll] Found ${updates.length} pending updates`);

            const processedUpdates: any[] = [];

            for (const update of updates) {
                console.log('[Telegram Poll] Processing update summary:', summarizeTelegramUpdate(update as TelegramUpdate));

                if (update.message) {
                    const chatId = update.message.chat.id.toString();
                    const text = update.message.text?.trim();
                    const contactPhone = update.message.contact?.phone_number;

                    if ((text || '').match(/^\/start(?:\s+(.+))?$/)) {
                        const sendResult = await fetch(
                            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    chat_id: chatId,
                                    text: `рџ‘‹ Welcome to <b>${escapeHtml(tenant.name)}</b>!\n\nTo receive notifications about your orders, please share your phone number.\n\nYou can type it manually (e.g., <code>+998901234567</code>) or tap the button below.`,
                                    parse_mode: 'HTML',
                                    reply_markup: createShareContactKeyboard('рџ“± Share Phone Number'),
                                }),
                            }
                        );
                        const sendResponse = await sendResult.json();
                        processedUpdates.push({
                            update_id: update.update_id,
                            type: 'start_command',
                            chatId,
                            sent: sendResponse.ok,
                        });
                    } else {
                        processedUpdates.push({
                            update_id: update.update_id,
                            type: text ? 'text' : (contactPhone ? 'contact' : 'other'),
                            chatId: maskChatId(chatId),
                            content: text ? '[text omitted]' : (contactPhone ? '[contact omitted]' : 'unknown'),
                        });
                    }

                    await fetch(
                        `https://api.telegram.org/bot${tenant.telegramBotToken}/getUpdates?offset=${update.update_id + 1}`
                    );
                }
            }

            return {
                success: true,
                data: {
                    totalUpdates: updates.length,
                    processed: processedUpdates,
                },
            };
        } catch (error) {
            console.error('[Telegram Poll] Error:', error);
            return { success: false, error: 'Failed to poll updates' };
        }
    });
};

