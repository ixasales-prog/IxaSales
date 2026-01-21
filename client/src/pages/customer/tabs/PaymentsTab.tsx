/**
 * Payments Tab Component
 * 
 * Displays customer's payment history.
 */

import { type Component, Show, For } from 'solid-js';
import { CreditCard } from 'lucide-solid';
import type { Payment } from '../../../types/customer-portal';
import { formatMoney, formatDate } from '../../../utils/formatters';
import { useI18n } from '../../../i18n';
import EmptyState from '../../../components/EmptyState';

interface PaymentsTabProps {
    payments: Payment[];
    totalPaid: number;
    currency: string;
}

const PaymentsTab: Component<PaymentsTabProps> = (props) => {
    const { t } = useI18n();

    return (
        <Show when={props.payments.length > 0} fallback={
            <EmptyState
                type="payments"
                title={t('payments.empty') as string}
                description={t('payments.emptyDescription') as string}
            />
        }>
            <div class="payments-summary">
                <div class="summary-item">
                    <span>{t('payments.totalPaid')}</span>
                    <strong>{formatMoney(props.totalPaid)} {props.currency}</strong>
                </div>
            </div>
            <div class="payments-list">
                <For each={props.payments}>{(payment) => (
                    <div class="payment-card-item">
                        <div class="payment-icon"><CreditCard size={24} /></div>
                        <div class="payment-details">
                            <div class="payment-order">#{payment.orderNumber}</div>
                            <div class="payment-meta">
                                <span>{payment.method}</span>
                                <span>{formatDate(payment.createdAt)}</span>
                            </div>
                        </div>
                        <div class="payment-amount-value">+{formatMoney(payment.amount)} {props.currency}</div>
                    </div>
                )}</For>
            </div>
        </Show>
    );
};

export default PaymentsTab;
