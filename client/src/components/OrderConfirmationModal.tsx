/**
 * Order Confirmation Modal Component
 * 
 * Displayed after successful order placement with order details,
 * estimated delivery, and sharing options.
 */

import { type Component, createSignal, Show } from 'solid-js';
import { Check, Package, Clock, Share2, ShoppingBag, ArrowRight, CheckCircle } from 'lucide-solid';
import { useI18n } from '../i18n';
import { formatMoney } from '../utils/formatters';

interface OrderConfirmationModalProps {
    orderNumber: string;
    totalAmount: number;
    itemCount: number;
    currency: string;
    onViewOrder: () => void;
    onContinueShopping: () => void;
    onClose: () => void;
}

const OrderConfirmationModal: Component<OrderConfirmationModalProps> = (props) => {
    const { t } = useI18n();
    const [copied, setCopied] = createSignal(false);

    const getEstimatedDelivery = () => {
        // Simple estimate: 1-3 business days
        const today = new Date();
        const dayOfWeek = today.getDay();

        // If ordered before 2pm, could be today
        if (today.getHours() < 14) {
            return t('orderConfirmation.today');
        }
        // Otherwise tomorrow or next business day
        if (dayOfWeek === 5) { // Friday
            return t('orderConfirmation.days', { days: 3 });
        } else if (dayOfWeek === 6) { // Saturday
            return t('orderConfirmation.days', { days: 2 });
        }
        return t('orderConfirmation.tomorrow');
    };

    const handleShare = async () => {
        const shareText = `Buyurtma #${props.orderNumber} - ${formatMoney(props.totalAmount)} ${props.currency}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: t('orderConfirmation.title') as string,
                    text: shareText
                });
            } catch {
                // User cancelled or share failed
            }
        } else {
            // Fallback: copy to clipboard
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div class="modal-overlay order-confirmation-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
            <div class="order-confirmation-modal">
                <div class="confirmation-header">
                    <div class="success-icon">
                        <div class="success-icon-ring" />
                        <Check size={40} />
                    </div>
                    <h2>{t('orderConfirmation.title')}</h2>
                    <p class="thank-you">{t('orderConfirmation.thankYou')}</p>
                </div>

                <div class="confirmation-details">
                    <div class="detail-row">
                        <div class="detail-icon">
                            <Package size={20} />
                        </div>
                        <div class="detail-content">
                            <span class="detail-label">{t('orderConfirmation.orderNumber')}</span>
                            <span class="detail-value order-number">#{props.orderNumber}</span>
                        </div>
                    </div>

                    <div class="detail-row">
                        <div class="detail-icon">
                            <ShoppingBag size={20} />
                        </div>
                        <div class="detail-content">
                            <span class="detail-label">{t('orderConfirmation.total')}</span>
                            <span class="detail-value">
                                {t('orderConfirmation.items', { count: props.itemCount })} • <strong>{formatMoney(props.totalAmount)} {props.currency}</strong>
                            </span>
                        </div>
                    </div>

                    <div class="detail-row">
                        <div class="detail-icon">
                            <Clock size={20} />
                        </div>
                        <div class="detail-content">
                            <span class="detail-label">{t('orderConfirmation.estimatedDelivery')}</span>
                            <span class="detail-value">{getEstimatedDelivery()}</span>
                        </div>
                    </div>
                </div>

                <p class="notification-hint">
                    {t('orderConfirmation.notification')}
                </p>

                <div class="confirmation-actions">
                    <button class="btn-primary" onClick={props.onViewOrder}>
                        {t('orderConfirmation.trackOrder')} <ArrowRight size={18} />
                    </button>

                    <div class="secondary-actions">
                        <button class="btn-secondary-action" onClick={props.onContinueShopping}>
                            <ShoppingBag size={18} />
                            {t('orderConfirmation.continueShopping')}
                        </button>

                        <button class="btn-secondary-action" onClick={handleShare}>
                            <Show when={copied()} fallback={<Share2 size={18} />}>
                                <CheckCircle size={18} />
                            </Show>
                            {copied() ? t('actions.copy') : t('orderConfirmation.shareOrder')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderConfirmationModal;
