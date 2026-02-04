/**
 * User Telegram Link Routes (Fastify)
 * 
 * Endpoints for users to link their Telegram accounts for notifications.
 * 
 * Flow:
 * 1. User requests a link code via POST /api/users/telegram/link
 * 2. System generates a unique 6-char code (e.g., "ABC123")
 * 3. User sends this code to the tenant's Telegram bot
 * 4. Bot validates the code and links the user's telegram chat ID
 * 5. User can check status via GET /api/users/telegram/status
 * 6. User can unlink via DELETE /api/users/telegram/unlink
 */

import { FastifyPluginAsync } from 'fastify';
import { db, schema } from '../db';
import { eq, and, gt, sql } from 'drizzle-orm';

// Generate a 6-character alphanumeric code (uppercase for readability)
function generateLinkCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0/O, 1/I
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export const userTelegramLinkRoutes: FastifyPluginAsync = async (fastify) => {
    // Get current user's Telegram link status
    fastify.get('/telegram/status', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        try {
            // Get user's current Telegram status
            const [userData] = await db.select({
                telegramChatId: schema.users.telegramChatId,
            }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);

            // Get any pending link code
            const [pendingCode] = await db.select({
                code: schema.userTelegramLinkCodes.code,
                expiresAt: schema.userTelegramLinkCodes.expiresAt,
            }).from(schema.userTelegramLinkCodes)
                .where(and(
                    eq(schema.userTelegramLinkCodes.userId, user.id),
                    gt(schema.userTelegramLinkCodes.expiresAt, new Date())
                ))
                .limit(1);

            // Get tenant's bot info
            let botUsername: string | null = null;
            if (user.tenantId) {
                const [tenant] = await db.select({
                    telegramBotUsername: schema.tenants.telegramBotUsername,
                    telegramEnabled: schema.tenants.telegramEnabled,
                    hasBotToken: sql<boolean>`${schema.tenants.telegramBotToken} IS NOT NULL`,
                }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

                botUsername = tenant?.telegramBotUsername || null;
            }

            return {
                success: true,
                data: {
                    isLinked: !!userData?.telegramChatId,
                    pendingCode: pendingCode?.code || null,
                    pendingCodeExpiresAt: pendingCode?.expiresAt || null,
                    botUsername,
                },
            };
        } catch (error: any) {
            console.error('Error getting Telegram status:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'SERVER_ERROR', message: 'Failed to get Telegram status' },
            });
        }
    });

    // Generate a new link code for the current user
    fastify.post('/telegram/link', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        if (!user.tenantId) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: 'Tenant context required' },
            });
        }

        try {
            // Check if user is already linked
            const [userData] = await db.select({
                telegramChatId: schema.users.telegramChatId,
            }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);

            if (userData?.telegramChatId) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'ALREADY_LINKED', message: 'Your Telegram account is already linked' },
                });
            }

            // Check if tenant has Telegram configured
            const [tenant] = await db.select({
                telegramBotToken: schema.tenants.telegramBotToken,
                telegramBotUsername: schema.tenants.telegramBotUsername,
            }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1);

            if (!tenant?.telegramBotToken) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'BOT_NOT_CONFIGURED', message: 'Telegram bot is not configured for this tenant' },
                });
            }

            // Delete any existing pending codes for this user
            await db.delete(schema.userTelegramLinkCodes)
                .where(eq(schema.userTelegramLinkCodes.userId, user.id));

            // Generate a unique code
            let code: string;
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                code = generateLinkCode();

                // Check if code already exists for this tenant
                const [existing] = await db.select({ id: schema.userTelegramLinkCodes.id })
                    .from(schema.userTelegramLinkCodes)
                    .where(and(
                        eq(schema.userTelegramLinkCodes.tenantId, user.tenantId),
                        eq(schema.userTelegramLinkCodes.code, code)
                    ))
                    .limit(1);

                if (!existing) break;
                attempts++;
            }

            if (attempts >= maxAttempts) {
                return reply.code(500).send({
                    success: false,
                    error: { code: 'SERVER_ERROR', message: 'Failed to generate unique code' },
                });
            }

            // Code expires in 15 minutes
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            // Insert the link code
            await db.insert(schema.userTelegramLinkCodes).values({
                tenantId: user.tenantId,
                userId: user.id,
                code: code!,
                expiresAt,
            });

            return {
                success: true,
                data: {
                    code: code!,
                    expiresAt,
                    expiresInMinutes: 15,
                    botUsername: tenant.telegramBotUsername,
                    instructions: tenant.telegramBotUsername
                        ? `Open Telegram, search for @${tenant.telegramBotUsername}, and send the code: ${code!}`
                        : `Open your company's Telegram bot and send this code: ${code!}`,
                },
            };
        } catch (error: any) {
            console.error('Error generating Telegram link code:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'SERVER_ERROR', message: 'Failed to generate link code' },
            });
        }
    });

    // Unlink Telegram account
    fastify.delete('/telegram/unlink', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user!;

        try {
            // Check if user is linked
            const [userData] = await db.select({
                telegramChatId: schema.users.telegramChatId,
            }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);

            if (!userData?.telegramChatId) {
                return reply.code(400).send({
                    success: false,
                    error: { code: 'NOT_LINKED', message: 'Your Telegram account is not linked' },
                });
            }

            // Unlink
            await db.update(schema.users).set({
                telegramChatId: null,
                updatedAt: new Date(),
            }).where(eq(schema.users.id, user.id));

            // Delete any pending link codes
            await db.delete(schema.userTelegramLinkCodes)
                .where(eq(schema.userTelegramLinkCodes.userId, user.id));

            return {
                success: true,
                message: 'Telegram account unlinked successfully',
            };
        } catch (error: any) {
            console.error('Error unlinking Telegram:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'SERVER_ERROR', message: 'Failed to unlink Telegram' },
            });
        }
    });
};
