/**
 * Customer Order Detail Page
 * 
 * Displays detailed order information with timeline.
 * Updated with i18n support and theme compatibility.
 */

import { type Component, createSignal, Show, For, onMount } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ArrowLeft, Package, Loader2, CreditCard, CheckCircle, Clock, Truck, XCircle, AlertCircle, Box, Check, RefreshCw } from 'lucide-solid';
import { customerApi } from '../services/customer-api';
import type { OrderDetail, TimelineStep } from '../types/customer-portal';
import { formatMoney } from '../utils/formatters';
import { formatDateTime } from '../stores/settings';
import { toast } from '../components/Toast';
import { useI18n } from '../i18n';
import { ThemeProvider } from '../context/ThemeContext';
import '../styles/CustomerPortal.css';

// Timeline Component
const OrderTimeline: Component<{ timeline: TimelineStep[] }> = (props) => {
    const getIcon = (iconName: string, completed: boolean, current: boolean) => {
        const iconClass = completed ? 'timeline-icon completed' : current ? 'timeline-icon current' : 'timeline-icon';
        const size = 20;

        switch (iconName) {
            case 'package': return <div class={iconClass}><Package size={size} /></div>;
            case 'check': return <div class={iconClass}><Check size={size} /></div>;
            case 'box': return <div class={iconClass}><Box size={size} /></div>;
            case 'truck': return <div class={iconClass}><Truck size={size} /></div>;
            case 'check-circle': return <div class={iconClass}><CheckCircle size={size} /></div>;
            case 'x-circle': return <div class={iconClass}><XCircle size={size} /></div>;
            default: return <div class={iconClass}><Clock size={size} /></div>;
        }
    };

    // Use shared formatDateTime from settings store

    return (
        <div class="order-timeline">
            <For each={props.timeline}>
                {(step, index) => (
                    <div class={`timeline-step ${step.completed ? 'completed' : ''} ${step.current ? 'current' : ''}`}>
                        <div class="timeline-connector">
                            {getIcon(step.icon, step.completed, step.current)}
                            <Show when={index() < props.timeline.length - 1}>
                                <div class={`timeline-line ${step.completed ? 'completed' : ''}`}></div>
                            </Show>
                        </div>
                        <div class="timeline-content">
                            <div class="timeline-label">{step.label}</div>
                            <Show when={step.date}>
                                <div class="timeline-date">{formatDateTime(step.date)}</div>
                            </Show>
                        </div>
                    </div>
                )}
            </For>
        </div>
    );
};

const CustomerOrderDetailContent: Component = () => {
    const { t } = useI18n();
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = createSignal<OrderDetail | null>(null);
    const [timeline, setTimeline] = createSignal<TimelineStep[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal('');
    const [reordering, setReordering] = createSignal(false);

    onMount(async () => {
        const token = customerApi.token.get();
        if (!token) {
            navigate('/customer', { replace: true });
            return;
        }

        const [orderRes, timelineRes] = await Promise.all([
            customerApi.orders.getDetail(params.id),
            customerApi.orders.getTimeline(params.id)
        ]);

        if (orderRes.success && orderRes.data) {
            setOrder(orderRes.data);
        } else {
            setError(t('orderDetail.notFound') as string);
        }

        if (timelineRes.success && timelineRes.data) {
            setTimeline(timelineRes.data);
        }

        setLoading(false);
    });

    const handlePayNow = () => {
        const url = order()?.paymentUrl;
        if (url) {
            window.location.href = url;
        }
    };

    const handleReorder = async () => {
        if (!order()) return;

        setReordering(true);
        try {
            const result = await customerApi.orders.reorder(order()!.id);
            if (result.success && result.data) {
                toast.success(result.data.message);
                navigate('/customer');
            } else {
                toast.error(result.error?.message || t('errors.generic') as string);
            }
        } catch {
            toast.error(t('errors.generic') as string);
        } finally {
            setReordering(false);
        }
    };

    return (
        <div class="order-detail-page">
            {/* Header */}
            <header class="detail-header">
                <button class="btn-back" onClick={() => navigate('/customer')}>
                    <ArrowLeft size={20} />
                </button>
                <h1>{t('orderDetail.title')} #{order()?.orderNumber || '...'}</h1>
            </header>

            <Show when={loading()}>
                <div class="loading-state">
                    <Loader2 size={32} class="spin" />
                    <p>{t('orderDetail.loading')}</p>
                </div>
            </Show>

            <Show when={error()}>
                <div class="error-state">
                    <AlertCircle size={48} />
                    <p>{error()}</p>
                    <button class="btn-secondary" onClick={() => navigate('/customer')}>
                        {t('orderDetail.back')}
                    </button>
                </div>
            </Show>

            <Show when={!loading() && !error() && order()}>
                <div class="detail-content">
                    {/* Order Timeline */}
                    <Show when={timeline().length > 0}>
                        <div class="section">
                            <h2 class="section-title">
                                <Clock size={18} />
                                {t('orderDetail.orderStatus')}
                            </h2>
                            <OrderTimeline timeline={timeline()} />
                        </div>
                    </Show>

                    {/* Payment Status */}
                    <Show when={order()!.paymentStatus !== 'paid'}>
                        <div class="payment-card unpaid">
                            <div class="payment-info">
                                <CreditCard size={20} />
                                <div>
                                    <div class="payment-label">{t('orderDetail.unpaidAmount')}</div>
                                    <div class="payment-amount">
                                        {formatMoney(order()!.remainingAmount)} UZS
                                    </div>
                                </div>
                            </div>
                            <Show when={order()!.paymentUrl}>
                                <button class="btn-pay" onClick={handlePayNow}>
                                    💳 {t('orderDetail.pay')}
                                </button>
                            </Show>
                        </div>
                    </Show>

                    <Show when={order()!.paymentStatus === 'paid'}>
                        <div class="payment-card paid">
                            <CheckCircle size={20} />
                            <span>{t('orderDetail.fullyPaid')}</span>
                        </div>
                    </Show>

                    {/* Order Items */}
                    <div class="section">
                        <h2 class="section-title">
                            <Package size={18} />
                            {t('orderDetail.products')} ({order()!.items.length})
                        </h2>
                        <div class="items-list">
                            <For each={order()!.items}>
                                {(item) => (
                                    <div class="item-row">
                                        <Show when={item.imageUrl} fallback={
                                            <div class="item-image-placeholder"><Box size={24} /></div>
                                        }>
                                            <img src={item.imageUrl} alt={item.productName} class="item-image" />
                                        </Show>
                                        <div class="item-info">
                                            <div class="item-name">{item.productName}</div>
                                            <div class="item-sku">{item.sku}</div>
                                        </div>
                                        <div class="item-qty">
                                            {item.qtyOrdered} x {formatMoney(item.unitPrice)}
                                        </div>
                                        <div class="item-total">
                                            {formatMoney(item.lineTotal)} UZS
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div class="section">
                        <h2 class="section-title">{t('orderDetail.summary')}</h2>
                        <div class="summary-card">
                            <div class="summary-row">
                                <span>{t('orderDetail.subtotal')}</span>
                                <span>{formatMoney(Number(order()!.subtotalAmount))} UZS</span>
                            </div>
                            <Show when={Number(order()!.discountAmount) > 0}>
                                <div class="summary-row discount">
                                    <span>{t('orderDetail.discount')}</span>
                                    <span>-{formatMoney(Number(order()!.discountAmount))} UZS</span>
                                </div>
                            </Show>
                            <div class="summary-row total">
                                <span>{t('orderDetail.total')}</span>
                                <span>{formatMoney(order()!.totalAmount)} UZS</span>
                            </div>
                            <div class="summary-row">
                                <span>{t('orderDetail.paid')}</span>
                                <span class="paid">{formatMoney(order()!.paidAmount)} UZS</span>
                            </div>
                            <Show when={order()!.remainingAmount > 0}>
                                <div class="summary-row remaining">
                                    <span>{t('orderDetail.remaining')}</span>
                                    <span>{formatMoney(order()!.remainingAmount)} UZS</span>
                                </div>
                            </Show>
                        </div>
                    </div>

                    {/* Notes */}
                    <Show when={order()!.notes}>
                        <div class="section">
                            <h2 class="section-title">{t('orderDetail.notes')}</h2>
                            <div class="notes-card">{order()!.notes}</div>
                        </div>
                    </Show>

                    {/* Reorder Button */}
                    <div class="section">
                        <button
                            class="btn-reorder-full"
                            onClick={handleReorder}
                            disabled={reordering()}
                        >
                            <Show when={reordering()} fallback={
                                <><RefreshCw size={20} /> {t('orders.reorder')}</>
                            }>
                                <Loader2 size={20} class="spin" /> {t('orderDetail.loading')}
                            </Show>
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
};

const CustomerOrderDetail: Component = () => {
    return (
        <ThemeProvider>
            <div class="customer-portal">
                <CustomerOrderDetailContent />
            </div>
        </ThemeProvider>
    );
};

export default CustomerOrderDetail;
