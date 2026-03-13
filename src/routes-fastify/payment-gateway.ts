/**
 * Payment Gateway Routes (Fastify)
 *
 * Handles:
 * - Payment link generation
 * - Payment status checking
 * - Click webhook callbacks
 * - Payme webhook callbacks
 */

import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { finalizePaymentTokenPayment } from '../services/payment-finalization.service';

import {
    createPaymentLink,
    getPaymentToken,
    verifyClickPrepareSignature,
    verifyClickCompleteSignature,
    clickSuccessResponse,
    clickErrorResponse,
    CLICK_ERRORS,
    type ClickPrepareRequest,
    type ClickCompleteRequest,
    verifyPaymeAuth,
    createPaymeResponse,
    paymeOrderNotFound,
    paymeOrderAlreadyPaid,
    paymeAmountIncorrect,
    paymeInsufficientPrivilege,
    PAYME_ERRORS,
    type PaymeRequest,
} from '../lib/payment-providers';

const TokenParamsSchema = Type.Object({
    token: Type.String(),
});

const CreateLinkBodySchema = Type.Object({
    orderId: Type.String(),
    amount: Type.Optional(Type.Number({ minimum: 0 })),
});

type TokenParams = Static<typeof TokenParamsSchema>;
type CreateLinkBody = Static<typeof CreateLinkBodySchema>;

async function processPaymentComplete(token: string, provider: 'click' | 'payme', providerTransactionId: string) {
    const result = await finalizePaymentTokenPayment({
        token,
        provider,
        providerTransactionId,
    });

    const tokenInfo = await getPaymentToken(token);
    if (!tokenInfo) {
        throw new Error('PAYMENT_TOKEN_NOT_FOUND');
    }

    const paymentToken = tokenInfo.token;
    const amount = Number(paymentToken.amount);

    try {
        const { notifyPaymentReceived, notifyCustomerPaymentReceived, getTenantAdminsWithTelegram } = await import('../lib/telegram');

        const [customer] = await db
            .select({
                name: schema.customers.name,
                telegramChatId: schema.customers.telegramChatId,
                debtBalance: schema.customers.debtBalance,
            })
            .from(schema.customers)
            .where(eq(schema.customers.id, paymentToken.customerId))
            .limit(1);

        const [orderInfo] = await db
            .select({ orderNumber: schema.orders.orderNumber })
            .from(schema.orders)
            .where(eq(schema.orders.id, paymentToken.orderId))
            .limit(1);

        const currency = paymentToken.currency || 'UZS';
        const admins = await getTenantAdminsWithTelegram(paymentToken.tenantId);

        for (const admin of admins) {
            notifyPaymentReceived(admin.telegramChatId, {
                amount,
                currency,
                customerName: customer?.name || 'Unknown',
                orderNumber: orderInfo?.orderNumber,
            });
        }

        if (customer?.telegramChatId) {
            notifyCustomerPaymentReceived(
                paymentToken.tenantId,
                { chatId: customer.telegramChatId, name: customer.name },
                {
                    amount,
                    currency,
                    remainingBalance: result.balanceState?.debtBalance ?? Number(customer.debtBalance || 0),
                    orderNumber: orderInfo?.orderNumber,
                }
            );
        }
    } catch (e) {
        console.error('[Payment Gateway] Telegram notification error:', e);
    }

    console.log(`[Payment Gateway] Payment completed: ${result.paymentNumber || result.paymentId} for ${amount} ${paymentToken.currency}`);
}

export const paymentGatewayRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Params: TokenParams }>('/status/:token', {
        schema: { params: TokenParamsSchema },
    }, async (request, reply) => {
        const { token } = request.params;
        const result = await getPaymentToken(token);

        if (!result) {
            return reply.code(404).send({ success: false, error: { code: 'TOKEN_NOT_FOUND' } });
        }

        const isExpired = new Date() > result.token.expiresAt;
        const status = isExpired && result.token.status === 'pending' ? 'expired' : result.token.status;

        let clickUrl: string | undefined;
        let paymeUrl: string | undefined;

        if (status === 'pending') {
            const [tenant] = await db
                .select({
                    clickMerchantId: schema.tenants.clickMerchantId,
                    clickServiceId: schema.tenants.clickServiceId,
                    paymeMerchantId: schema.tenants.paymeMerchantId,
                })
                .from(schema.tenants)
                .where(eq(schema.tenants.id, result.token.tenantId))
                .limit(1);

            const amount = Number(result.token.amount);

            if (tenant?.clickMerchantId && tenant?.clickServiceId) {
                const { generateClickUrl } = await import('../lib/payment-providers/click');
                clickUrl = generateClickUrl(
                    tenant.clickMerchantId,
                    tenant.clickServiceId,
                    amount,
                    token
                );
            }

            if (tenant?.paymeMerchantId) {
                const { generatePaymeUrl, sumToTiyin } = await import('../lib/payment-providers/payme');
                paymeUrl = generatePaymeUrl(
                    tenant.paymeMerchantId,
                    sumToTiyin(amount),
                    { payment_token: token }
                );
            }
        }

        return {
            success: true,
            data: {
                status,
                order: {
                    orderNumber: result.order.orderNumber,
                    customerName: result.order.customerName,
                    amount: Number(result.token.amount),
                    currency: result.token.currency,
                },
                expiresAt: result.token.expiresAt,
                clickUrl,
                paymeUrl,
            },
        };
    });

    fastify.post<{ Body: CreateLinkBody }>('/create-link', {
        preHandler: [fastify.authenticate, fastify.requirePermission('payments.collect')],
        schema: { body: CreateLinkBodySchema },
    }, async (request, reply) => {
        const user = request.user!;

        const [order] = await db
            .select({
                id: schema.orders.id,
                tenantId: schema.orders.tenantId,
                customerId: schema.orders.customerId,
                driverId: schema.orders.driverId,
                totalAmount: schema.orders.totalAmount,
                paidAmount: schema.orders.paidAmount,
                paymentStatus: schema.orders.paymentStatus,
            })
            .from(schema.orders)
            .where(
                and(
                    eq(schema.orders.id, request.body.orderId),
                    eq(schema.orders.tenantId, user.tenantId)
                )
            )
            .limit(1);

        if (!order) {
            return reply.code(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND' } });
        }

        if (user.role === 'sales_rep') {
            const [customer] = await db
                .select({ assignedSalesRepId: schema.customers.assignedSalesRepId })
                .from(schema.customers)
                .where(eq(schema.customers.id, order.customerId))
                .limit(1);

            if (!customer || customer.assignedSalesRepId !== user.id) {
                return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            }
        }

        if (user.role === 'driver' && order.driverId !== user.id) {
            return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        if (order.paymentStatus === 'paid') {
            return reply.code(400).send({ success: false, error: { code: 'ORDER_ALREADY_PAID' } });
        }

        const totalAmount = Number(order.totalAmount);
        const paidAmount = Number(order.paidAmount || 0);
        const amount = request.body.amount || (totalAmount - paidAmount);

        if (amount <= 0) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_AMOUNT' } });
        }

        const [tenant] = await db
            .select({ currency: schema.tenants.currency })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, user.tenantId))
            .limit(1);

        const result = await createPaymentLink({
            tenantId: user.tenantId,
            orderId: order.id,
            customerId: order.customerId,
            amount,
            currency: tenant?.currency || 'UZS',
        });

        if (!result) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: 'PAYMENT_PORTAL_DISABLED',
                    message: 'Payment portal is not configured for this tenant',
                },
            });
        }

        return { success: true, data: result };
    });

    fastify.post('/webhook/click', async (request) => {
        const params = request.body as ClickPrepareRequest | ClickCompleteRequest;
        const token = params.merchant_trans_id;

        const tokenInfo = await getPaymentToken(token);
        if (!tokenInfo) {
            return clickErrorResponse(
                params.click_trans_id,
                token,
                CLICK_ERRORS.USER_NOT_FOUND,
                'Payment token not found'
            );
        }

        const [tenant] = await db
            .select({ clickSecretKey: schema.tenants.clickSecretKey })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tokenInfo.token.tenantId))
            .limit(1);

        if (!tenant?.clickSecretKey) {
            return clickErrorResponse(
                params.click_trans_id,
                token,
                CLICK_ERRORS.BAD_REQUEST,
                'Click not configured'
            );
        }

        if (params.action === 0) {
            const prepareParams = params as ClickPrepareRequest;

            if (!verifyClickPrepareSignature(prepareParams, tenant.clickSecretKey)) {
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.SIGN_CHECK_FAILED,
                    'Invalid signature'
                );
            }

            if (tokenInfo.token.status === 'paid') {
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.ALREADY_PAID,
                    'Already paid'
                );
            }

            const expectedAmount = Number(tokenInfo.token.amount);
            if (Math.abs(params.amount - expectedAmount) > 0.01) {
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.INCORRECT_AMOUNT,
                    'Amount mismatch'
                );
            }

            if (new Date() > tokenInfo.token.expiresAt) {
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.TRANSACTION_CANCELLED,
                    'Token expired'
                );
            }

            return clickSuccessResponse(params.click_trans_id, token, 1);
        }

        if (params.action === 1) {
            const completeParams = params as ClickCompleteRequest;

            if (!verifyClickCompleteSignature(completeParams, tenant.clickSecretKey)) {
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.SIGN_CHECK_FAILED,
                    'Invalid signature'
                );
            }

            if (completeParams.error < 0) {
                console.log(`[Click] Payment failed for ${token}: ${completeParams.error_note}`);
                return clickSuccessResponse(params.click_trans_id, token, undefined, 1);
            }

            try {
                await processPaymentComplete(token, 'click', params.click_trans_id.toString());
            } catch (error) {
                console.error('[Click] Payment completion failed:', error);
                return clickErrorResponse(
                    params.click_trans_id,
                    token,
                    CLICK_ERRORS.BAD_REQUEST,
                    'Payment finalization failed'
                );
            }
            return clickSuccessResponse(params.click_trans_id, token, undefined, 1);
        }

        return clickErrorResponse(
            (params as ClickPrepareRequest).click_trans_id,
            token,
            CLICK_ERRORS.ACTION_NOT_FOUND,
            'Unknown action'
        );
    });

    fastify.post('/webhook/payme', async (request) => {
        const req = request.body as PaymeRequest;
        const authHeader = request.headers['authorization'] as string | undefined;

        const account = req.params?.account;
        const token = account?.payment_token || account?.order_id;

        if (!token) {
            return paymeOrderNotFound(req.id);
        }

        const tokenInfo = await getPaymentToken(token);
        if (!tokenInfo) {
            return paymeOrderNotFound(req.id);
        }

        const [tenant] = await db
            .select({
                paymeMerchantId: schema.tenants.paymeMerchantId,
                paymeSecretKey: schema.tenants.paymeSecretKey,
            })
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tokenInfo.token.tenantId))
            .limit(1);

        if (!tenant?.paymeSecretKey) {
            return paymeInsufficientPrivilege(req.id);
        }

        if (!verifyPaymeAuth(authHeader, tenant.paymeMerchantId || '', tenant.paymeSecretKey)) {
            return paymeInsufficientPrivilege(req.id);
        }

        switch (req.method) {
            case 'CheckPerformTransaction': {
                if (tokenInfo.token.status === 'paid') {
                    return paymeOrderAlreadyPaid(req.id);
                }

                if (new Date() > tokenInfo.token.expiresAt) {
                    return paymeOrderNotFound(req.id);
                }

                const expectedTiyin = Number(tokenInfo.token.amount) * 100;
                if (req.params.amount && Math.abs(req.params.amount - expectedTiyin) > 1) {
                    return paymeAmountIncorrect(req.id);
                }

                return createPaymeResponse(req.id, { allow: true });
            }

            case 'CreateTransaction': {
                if (tokenInfo.token.status === 'paid') {
                    return paymeOrderAlreadyPaid(req.id);
                }

                return createPaymeResponse(req.id, {
                    create_time: Date.now(),
                    transaction: req.params.id,
                    state: 1,
                });
            }

            case 'PerformTransaction': {
                try {
                    await processPaymentComplete(token, 'payme', req.params.id || '');
                } catch (error) {
                    console.error('[Payme] Payment completion failed:', error);
                    return paymeInsufficientPrivilege(req.id);
                }

                return createPaymeResponse(req.id, {
                    transaction: req.params.id,
                    perform_time: Date.now(),
                    state: 2,
                });
            }

            case 'CancelTransaction': {
                if (tokenInfo.token.status === 'paid') {
                    return createPaymeResponse(req.id, {
                        transaction: req.params.id,
                        cancel_time: 0,
                        state: 2,
                    });
                }

                await db
                    .update(schema.paymentTokens)
                    .set({ status: 'cancelled' })
                    .where(eq(schema.paymentTokens.token, token));

                return createPaymeResponse(req.id, {
                    transaction: req.params.id,
                    cancel_time: Date.now(),
                    state: -1,
                });
            }

            case 'CheckTransaction': {
                const state = tokenInfo.token.status === 'paid'
                    ? 2
                    : tokenInfo.token.status === 'cancelled'
                        ? -1
                        : 1;

                return createPaymeResponse(req.id, {
                    create_time: tokenInfo.token.createdAt?.getTime(),
                    perform_time: tokenInfo.token.paidAt?.getTime() || 0,
                    cancel_time: 0,
                    transaction: tokenInfo.token.providerTransactionId,
                    state,
                });
            }

            case 'GetStatement': {
                return createPaymeResponse(req.id, { transactions: [] });
            }

            default:
                return {
                    id: req.id,
                    error: {
                        code: PAYME_ERRORS.METHOD_NOT_FOUND,
                        message: { uz: 'Metod topilmadi', ru: 'РњРµС‚РѕРґ РЅРµ РЅР°Р№РґРµРЅ', en: 'Method not found' },
                    },
                };
        }
    });
};
