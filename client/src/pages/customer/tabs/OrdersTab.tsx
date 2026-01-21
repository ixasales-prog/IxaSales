/**
 * Orders Tab Component
 * 
 * Displays customer orders with colored status stripes.
 */

import { type Component, Show, For, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, XCircle, RefreshCw, Loader2, SlidersHorizontal } from 'lucide-solid';
import type { Order } from '../../../types/customer-portal';
import { formatMoney, formatDate } from '../../../utils/formatters';
import { getOrderStatusColor } from '../../../utils/constants';
import { useI18n } from '../../../i18n';
import EmptyState from '../../../components/EmptyState';

interface OrdersTabProps {
    orders: Order[];
    currency: string;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    onReorder: (id: string) => Promise<void>;
    onCancel: (id: string) => Promise<void>;
    reordering: string | null;
    cancelling: string | null;
    onSwitchToProducts: () => void;
    setupLoadMoreObserver: (el: HTMLDivElement) => void;
    debtBalance?: number;
}

const OrdersTab: Component<OrdersTabProps> = (props) => {
    const { t } = useI18n();
    const [showFilter, setShowFilter] = createSignal(false);
    const [orderStatusFilter, setOrderStatusFilter] = createSignal<string>('all');

    const filteredOrders = () => {
        const filter = orderStatusFilter();
        if (filter === 'all') return props.orders;
        return props.orders.filter(o => o.status === filter);
    };

    const filterOptions = ['all', 'pending', 'delivering', 'delivered', 'cancelled'];

    return (
        <div class="orders-tab-content">
            {/* Header with count, debt, and filter */}
            <div class="orders-tab-header">
                <div class="orders-info">
                    <span class="orders-total">{filteredOrders().length}</span>
                    <span class="orders-label">{t('orders.ordersCount')}</span>
                    <Show when={(props.debtBalance || 0) > 0}>
                        <span class="debt-chip">
                            {t('orders.debt')}: <strong>{formatMoney(props.debtBalance || 0)} {props.currency}</strong>
                        </span>
                    </Show>
                </div>
                <button
                    class={`filter-btn ${showFilter() ? 'active' : ''}`}
                    onClick={() => setShowFilter(!showFilter())}
                    title={t('orders.filter') as string}
                >
                    <SlidersHorizontal size={18} />
                </button>
            </div>

            {/* Collapsible Filter Pills */}
            <Show when={showFilter()}>
                <div class="order-filter-pills">
                    <For each={filterOptions}>{(s) => (
                        <button
                            class={`filter-pill ${orderStatusFilter() === s ? 'active' : ''}`}
                            onClick={() => setOrderStatusFilter(s)}
                        >
                            <Show when={s !== 'all'}>
                                <span class="pill-dot" style={{ background: getOrderStatusColor(s) }} />
                            </Show>
                            {t(`orders.filters.${s}` as any)}
                        </button>
                    )}</For>
                </div>
            </Show>

            <Show when={filteredOrders().length === 0}>
                <EmptyState
                    type="orders"
                    title={t('orders.empty') as string}
                    actionLabel={t('cart.browseProducts') as string}
                    onAction={props.onSwitchToProducts}
                />
            </Show>

            <div class="orders-list">
                <For each={filteredOrders()}>{(order) => (
                    <div class="order-card-container">
                        {/* Status stripe */}
                        <div class="order-status-stripe" style={{ background: getOrderStatusColor(order.status) }} />

                        <A href={`/customer/orders/${order.id}`} class="order-card-link">
                            <div class="order-main">
                                <div class="order-top">
                                    <span class="order-number">#{order.orderNumber}</span>
                                    <span class="order-amount">{formatMoney(order.totalAmount)} {props.currency}</span>
                                </div>
                                <div class="order-middle">
                                    <span class="order-date">{formatDate(order.createdAt)}</span>
                                </div>
                                <div class="order-bottom">
                                    <span
                                        class="order-status-badge"
                                        style={{
                                            background: `${getOrderStatusColor(order.status)}15`,
                                            color: getOrderStatusColor(order.status)
                                        }}
                                    >
                                        {t(`orders.status.${order.status}` as any)}
                                    </span>
                                    <ChevronRight size={18} class="order-arrow" />
                                </div>
                            </div>
                        </A>

                        <div class="order-actions-bar">
                            <Show when={order.status === 'pending'}>
                                <button
                                    class="action-btn cancel"
                                    onClick={() => props.onCancel(order.id)}
                                    disabled={props.cancelling === order.id}
                                >
                                    <Show when={props.cancelling === order.id} fallback={<><XCircle size={14} /> {t('orders.cancel')}</>}>
                                        <Loader2 size={14} class="spin" />
                                    </Show>
                                </button>
                            </Show>
                            <button
                                class="action-btn reorder"
                                onClick={() => props.onReorder(order.id)}
                                disabled={props.reordering === order.id}
                            >
                                <Show when={props.reordering === order.id} fallback={<><RefreshCw size={14} /> {t('orders.reorder')}</>}>
                                    <Loader2 size={14} class="spin" />
                                </Show>
                            </button>
                        </div>
                    </div>
                )}</For>

                <Show when={props.hasMore}>
                    <div ref={props.setupLoadMoreObserver} class="load-more-trigger">
                        <Show when={props.loadingMore}><Loader2 size={24} class="spin" /></Show>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default OrdersTab;
