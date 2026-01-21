/**
 * Payment Portal
 * 
 * Public payment page for customers to pay their orders.
 * Updated with i18n support for multilingual payments.
 */

import { createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { useI18n } from '../i18n';
import '../styles/PaymentPortal.css';

interface PaymentInfo {
    status: 'pending' | 'paid' | 'expired' | 'cancelled';
    order: {
        orderNumber: string;
        customerName: string;
        amount: number;
        currency: string;
    };
    expiresAt: string;
    clickUrl?: string;
    paymeUrl?: string;
}

const PaymentPortal: Component = () => {
    const { t } = useI18n();
    const params = useParams<{ token: string }>();
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [paymentInfo, setPaymentInfo] = createSignal<PaymentInfo | null>(null);

    onMount(() => {
        if (!params.token) {
            setError(t('paymentPortal.tokenNotFound') as string);
            setLoading(false);
            return;
        }
        fetchPaymentStatus();
    });

    const fetchPaymentStatus = async () => {
        try {
            const response = await fetch(`/api/payment-gateway/status/${params.token}`);
            const data = await response.json();

            if (!data.success) {
                setError(data.error?.message || t('paymentPortal.paymentNotFound') as string);
                return;
            }

            setPaymentInfo(data.data);
        } catch {
            setError(t('paymentPortal.genericError') as string);
        } finally {
            setLoading(false);
        }
    };

    const formatMoney = (amount: number) => {
        return amount.toLocaleString('ru-RU').replace(/,/g, ' ');
    };

    return (
        <Show when={!loading()} fallback={
            <div class="payment-portal loading">
                <div class="spinner"></div>
                <p>{t('paymentPortal.loading')}</p>
            </div>
        }>
            <Show when={error()}>
                <div class="payment-portal error">
                    <div class="error-icon">❌</div>
                    <h2>{t('paymentPortal.error')}</h2>
                    <p>{error()}</p>
                    <a href="/" class="btn-back">{t('paymentPortal.backToHome')}</a>
                </div>
            </Show>

            <Show when={!error() && paymentInfo()}>
                {/* Payment completed */}
                <Show when={paymentInfo()?.status === 'paid'}>
                    <div class="payment-portal success">
                        <div class="success-icon">✅</div>
                        <h2>{t('paymentPortal.paymentSuccess')}</h2>
                        <div class="order-details">
                            <p><strong>{t('paymentPortal.order')}:</strong> #{paymentInfo()?.order.orderNumber}</p>
                            <p><strong>{t('paymentPortal.amount')}:</strong> {formatMoney(paymentInfo()?.order.amount || 0)} {paymentInfo()?.order.currency}</p>
                        </div>
                        <p class="thank-you">{t('paymentPortal.thankYou')}</p>
                    </div>
                </Show>

                {/* Payment expired */}
                <Show when={paymentInfo()?.status === 'expired'}>
                    <div class="payment-portal expired">
                        <div class="expired-icon">⏰</div>
                        <h2>{t('paymentPortal.expired')}</h2>
                        <p>{t('paymentPortal.expiredMessage')}</p>
                        <p>{t('paymentPortal.contactSeller')}</p>
                    </div>
                </Show>

                {/* Payment cancelled */}
                <Show when={paymentInfo()?.status === 'cancelled'}>
                    <div class="payment-portal cancelled">
                        <div class="cancelled-icon">🚫</div>
                        <h2>{t('paymentPortal.cancelled')}</h2>
                        <p>{t('paymentPortal.cancelledMessage')}</p>
                    </div>
                </Show>

                {/* Pending payment - show payment options */}
                <Show when={paymentInfo()?.status === 'pending'}>
                    <div class="payment-portal pending">
                        <div class="header">
                            <h1>💳 {t('paymentPortal.title')}</h1>
                        </div>

                        <div class="order-summary">
                            <div class="customer-info">
                                <span class="label">{t('paymentPortal.customer')}:</span>
                                <span class="value">{paymentInfo()?.order.customerName}</span>
                            </div>
                            <div class="order-info">
                                <span class="label">{t('paymentPortal.order')}:</span>
                                <span class="value">#{paymentInfo()?.order.orderNumber}</span>
                            </div>
                            <div class="amount-info">
                                <span class="label">{t('paymentPortal.paymentAmount')}:</span>
                                <span class="amount">
                                    {formatMoney(paymentInfo()?.order.amount || 0)} {paymentInfo()?.order.currency}
                                </span>
                            </div>
                        </div>

                        <div class="payment-methods">
                            <h3>{t('paymentPortal.selectPaymentMethod')}</h3>

                            <Show when={paymentInfo()?.clickUrl}>
                                <a href={paymentInfo()?.clickUrl} class="payment-btn click">
                                    <span>{t('paymentPortal.payWithClick')}</span>
                                </a>
                            </Show>

                            <Show when={paymentInfo()?.paymeUrl}>
                                <a href={paymentInfo()?.paymeUrl} class="payment-btn payme">
                                    <span>{t('paymentPortal.payWithPayme')}</span>
                                </a>
                            </Show>

                            <Show when={!paymentInfo()?.clickUrl && !paymentInfo()?.paymeUrl}>
                                <p class="no-methods">{t('paymentPortal.noPaymentMethods')}</p>
                            </Show>
                        </div>

                        <div class="footer">
                            <p class="security-note">{t('paymentPortal.securePayment')}</p>
                            <p class="powered-by">{t('paymentPortal.poweredBy')}</p>
                        </div>
                    </div>
                </Show>
            </Show>
        </Show>
    );
};

export default PaymentPortal;
