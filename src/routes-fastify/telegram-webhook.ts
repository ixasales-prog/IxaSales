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

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { escapeHtml, parseCallbackData } from '../lib/telegram';

interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        chat: { id: number };
        from?: { id: number; first_name?: string; last_name?: string; username?: string };
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
    tenantId: Type.String(),
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

    const [tenant] = await db
        .select({
            telegramBotToken: schema.tenants.telegramBotToken,
            telegramWebhookSecret: schema.tenants.telegramWebhookSecret,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

    if (!tenant || !tenant.telegramBotToken) {
        return { ok: true };
    }

    const secretHeader = headers['x-telegram-bot-api-secret-token'] as string | undefined;
    if (tenant.telegramWebhookSecret && secretHeader !== tenant.telegramWebhookSecret) {
        console.warn('[Telegram Webhook] Invalid secret for callback query');
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
                            `✅ <b>Delivery Confirmed</b>\n\nThank you for confirming receipt of order #${escapeHtml(orderNumber)}!\n\nWe appreciate your business. 🙏`
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
                        `⚠️ <b>Issue Reported</b>\n\nA support request has been created for order #${escapeHtml(orderNumber || '')}.\n\nOur team will contact you shortly.`
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

        console.log('[Telegram Webhook] Received update for tenant:', tenantId);
        console.log('[Telegram Webhook] Update:', JSON.stringify(update, null, 2));

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

        console.log('[Telegram Webhook] Processing message:', { chatId, text, contactPhone });

        const [tenant] = await db
            .select({
                id: schema.tenants.id,
                name: schema.tenants.name,
                subdomain: schema.tenants.subdomain,
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramWebhookSecret: schema.tenants.telegramWebhookSecret,
                currency: schema.tenants.currency,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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
        } else {
            console.warn('[Telegram Webhook] No webhook secret configured for tenant:', tenantId);
        }

        // Handle /start command
        if (text === '/start') {
            console.log('[Telegram Webhook] Handling /start command for chat:', chatId);

            const result = await sendBotMessageWithKeyboard(tenant.telegramBotToken, chatId,
                `👋 <b>${escapeHtml(tenant.name)}</b> ga xush kelibsiz!\n\n` +
                `Buyurtmalaringiz haqida bildirishnomalar olish uchun telefon raqamingizni yuboring.\n\n` +
                `Raqamni qo'lda yozishingiz mumkin (masalan, <code>+998901234567</code>) yoki quyidagi tugmani bosing.`,
                {
                    keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                }
            );
            console.log('[Telegram Webhook] /start message sent, result:', result);
            return { ok: true };
        }

        // Handle /help command
        if (text === '/help') {
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `ℹ️ <b>Help</b>\n\n` +
                `Available commands:\n` +
                `• /start - Start registration\n` +
                `• /status - Check your account status\n` +
                `• /unlink - Unlink your account\n` +
                `• /help - Show this help\n\n` +
                `To link your account, send your registered phone number.`
            );
            return { ok: true };
        }

        // Handle /unlink command
        if (text === '/unlink') {
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
                    `❌ <b>No Account Linked</b>\n\n` +
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
                `✅ <b>Account Unlinked</b>\n\n` +
                `Your account <b>${escapeHtml(customer.name)}</b> has been unlinked.\n\n` +
                `You will no longer receive notifications here.\n` +
                `To re-link, use /start and send your phone number.`
            );

            console.log(`[Telegram] Customer ${customer.id} unlinked from chat ${chatId}`);
            return { ok: true };
        }

        // Handle /status command
        if (text === '/status') {
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
                    `✅ <b>Account Linked</b>\n\n` +
                    `Name: ${customer.name}\n` +
                    `Status: Active\n\n` +
                    `You will receive notifications about your orders.`
                );
            } else {
                await sendBotMessage(tenant.telegramBotToken, chatId,
                    `❌ <b>Account Not Linked</b>\n\n` +
                    `Send your phone number to link your account.`
                );
            }
            return { ok: true };
        }

        // Extract phone number from text or contact
        let phone = contactPhone || text || '';
        const countryGuess = guessCountryFromCurrency(tenant.currency || 'UZS');
        phone = normalizePhone(phone, countryGuess);

        if (!phone || phone.length < 8) {
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `❓ Please send your phone number to link your account.\n\n` +
                `Example: <code>+998901234567</code>`
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
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `❌ <b>Phone number not found</b>\n\n` +
                `We couldn't find an account with phone number <code>${phone}</code>.\n\n` +
                `Please make sure you're using the same phone number registered with ${tenant.name}.`
            );
            return { ok: true };
        }

        if (customer.telegramChatId === chatId) {
            await sendBotMessage(tenant.telegramBotToken, chatId,
                `✅ <b>Already linked!</b>\n\n` +
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
                updatedAt: new Date(),
            })
            .where(eq(schema.customers.id, customer.id));

        const portalBaseUrl = process.env.PORTAL_URL || 'https://app.ixasales.com';
        const portalUrl = `${portalBaseUrl}/customer?tenant=${tenant.subdomain}`;

        await sendBotMessage(tenant.telegramBotToken, chatId,
            `✅ <b>Muvaffaqiyatli bog'landi!</b>\n\n` +
            `Xush kelibsiz, <b>${escapeHtml(customer.name)}</b>!\n\n` +
            `Siz endi quyidagi bildirishnomalarni olasiz:\n` +
            `• Buyurtma tasdig'i\n` +
            `• Yetkazib berish yangilanishlari\n` +
            `• To'lov eslatmalari\n` +
            `• To'lov tasdig'i\n\n` +
            `📱 <b>Mijoz kabinetiga kirish:</b>\n` +
            `${portalUrl}\n\n` +
            `${escapeHtml(tenant.name)} bilan bog'langaningiz uchun rahmat! 🎉`
        );

        console.log(`[Telegram] Customer ${customer.id} linked to chat ${chatId}`);
        return { ok: true };
    });

    // Get webhook setup instructions
    fastify.get<{ Params: TenantIdParams }>('/setup/:tenantId', {
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;

        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                telegramBotToken: schema.tenants.telegramBotToken,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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

        const [tenant] = await db
            .select({ telegramBotToken: schema.tenants.telegramBotToken })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

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
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;
        const secretToken = (request.body as any)?.secretToken;

        const [tenant] = await db
            .select({ telegramBotToken: schema.tenants.telegramBotToken })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        const { tenantId } = request.params;

        const [tenant] = await db
            .select({ telegramBotToken: schema.tenants.telegramBotToken })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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
        schema: { params: TenantIdParamsSchema, body: TestBodySchema },
    }, async (request, reply) => {
        if (process.env.NODE_ENV === 'production') {
            return reply.code(403).send({ success: false, error: 'Not available in production' });
        }

        const { tenantId } = request.params;
        const { chatId } = request.body;

        const [tenant] = await db
            .select({
                name: schema.tenants.name,
                telegramBotToken: schema.tenants.telegramBotToken,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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
                        text: `👋 Welcome to <b>${escapeHtml(tenant.name)}</b>!\n\nTo receive notifications about your orders, please share your phone number.\n\nYou can type it manually (e.g., <code>+998901234567</code>) or tap the button below.`,
                        parse_mode: 'HTML',
                        reply_markup: {
                            keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
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
        schema: { params: TenantIdParamsSchema },
    }, async (request, reply) => {
        if (process.env.NODE_ENV === 'production') {
            return reply.code(403).send({ success: false, error: 'Not available in production' });
        }

        const { tenantId } = request.params;

        const [tenant] = await db
            .select({
                id: schema.tenants.id,
                name: schema.tenants.name,
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramWebhookSecret: schema.tenants.telegramWebhookSecret,
                currency: schema.tenants.currency,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

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
                console.log('[Telegram Poll] Processing update:', JSON.stringify(update, null, 2));

                if (update.message) {
                    const chatId = update.message.chat.id.toString();
                    const text = update.message.text?.trim();
                    const contactPhone = update.message.contact?.phone_number;

                    if (text === '/start') {
                        const sendResult = await fetch(
                            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    chat_id: chatId,
                                    text: `👋 Welcome to <b>${escapeHtml(tenant.name)}</b>!\n\nTo receive notifications about your orders, please share your phone number.\n\nYou can type it manually (e.g., <code>+998901234567</code>) or tap the button below.`,
                                    parse_mode: 'HTML',
                                    reply_markup: {
                                        keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
                                        resize_keyboard: true,
                                        one_time_keyboard: true,
                                    },
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
                            chatId,
                            content: text || contactPhone || 'unknown',
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
