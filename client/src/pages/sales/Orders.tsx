import { type Component, createSignal, createResource, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
    ArrowLeft,
    Package,
    Search
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../stores/settings';
import { OrderStatusBadge, getPaymentStatusConfig } from '../../components/shared/order';

interface Order {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    paymentStatus: string;
    itemCount: number;
    createdAt: string;
}

const Orders: Component = () => {
    const [statusFilter, setStatusFilter] = createSignal('');
    const [search, setSearch] = createSignal('');

    const [orders] = createResource(
        () => ({ status: statusFilter(), search: search() }),
        async ({ status, search }) => {
            try {
                const params: any = { limit: '50' };

                if (status === 'paid') {
                    params.paymentStatus = 'paid';
                } else if (status) {
                    params.status = status;
                } else {
                    params.status = 'pending,delivered,returned';
                }

                if (search) params.search = search;

                const res = await api.get('/orders', { params });
                return (res as any)?.data || res || [];
            } catch (_e) {
                return [];
            }
        }
    );





    const formatOrderDate = (date: string) => {
        return formatDate(date, { month: 'short', day: 'numeric' });
    };

    return (
        <div class="min-h-screen pb-safe">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center justify-between px-4 py-3">
                    <div class="flex items-center gap-3">
                        <A href="/sales" class="p-2 -ml-2 text-slate-400 hover:text-white">
                            <ArrowLeft class="w-5 h-5" />
                        </A>
                        <div>
                            <h1 class="text-lg font-bold text-white">My Orders</h1>
                            <p class="text-slate-500 text-xs">{orders()?.length || 0} orders</p>
                        </div>
                    </div>
                </div>

                {/* Search & Filter */}
                <div class="px-4 pb-3 space-y-2">
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            value={search()}
                            onInput={(e) => setSearch(e.currentTarget.value)}
                            placeholder="Search order number..."
                            class="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                        />
                    </div>
                    <div class="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
                        {['', 'pending', 'delivered', 'returned', 'paid'].map(status => (
                            <button
                                onClick={() => setStatusFilter(status)}
                                class={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${statusFilter() === status
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}
                            >
                                {status === '' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div class="px-4 pt-2">
                {/* Loading State */}
                <Show when={orders.loading}>
                    <div class="text-center py-12 text-slate-500">
                        <div class="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                </Show>

                {/* Empty State */}
                <Show when={!orders.loading && (!orders() || orders()!.length === 0)}>
                    <div class="text-center py-12">
                        <Package class="w-12 h-12 text-slate-700 mx-auto mb-3" />
                        <p class="text-slate-400">No orders found</p>
                        <A href="/sales/catalog" class="text-blue-400 text-sm mt-2 inline-block">
                            Create an order →
                        </A>
                    </div>
                </Show>

                {/* Compact Orders List */}
                <div class="space-y-1">
                    <For each={orders()}>
                        {(order: Order) => (
                            <A
                                href={`/sales/orders/${order.id}`}
                                class="block w-full relative overflow-hidden bg-slate-900/60 border border-slate-800/50 rounded-xl hover:bg-slate-800/60 active:scale-[0.99] transition-all text-left group"
                            >
                                <OrderStatusBadge
                                    status={order.status}
                                    variant="strip"
                                    className="absolute left-0 top-0 bottom-0 w-1.5 transition-all group-hover:w-2"
                                />

                                <div class="p-4 pl-5 space-y-2">
                                    {/* Top Row: Customer Name & Amount */}
                                    <div class="flex justify-between items-start gap-4">
                                        <div class="text-white font-semibold text-[15px] truncate flex-1 pr-2">
                                            {order.customerName}
                                        </div>
                                        <div class="text-white font-bold text-[15px] whitespace-nowrap">
                                            {formatCurrency(order.totalAmount)}
                                        </div>
                                    </div>

                                    {/* Bottom Row: Status/Date & Payment/Items */}
                                    <div class="flex justify-between items-end gap-3 text-xs">
                                        <div class="text-slate-400 font-medium truncate pr-2">
                                            {formatOrderDate(order.createdAt)}
                                            <span class="mx-1.5 text-slate-700">|</span>
                                            <span class="text-slate-300">{order.orderNumber}</span>
                                        </div>

                                        <div class="flex items-center gap-2 shrink-0">
                                            <span class={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getPaymentStatusConfig(order.paymentStatus).bg} ${getPaymentStatusConfig(order.paymentStatus).text}`}>
                                                {order.paymentStatus}
                                            </span>
                                            <span class="text-slate-500 font-medium">
                                                {order.itemCount} items
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </A>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
};

export default Orders;
