import { type Component, For, Show, createSignal, createResource, createMemo } from 'solid-js';
import {
    Search,
    Filter,
    Eye,
    Truck,
    CheckCircle2,
    Clock,
    XCircle,
    Package,
    Loader2,
    ChevronLeft,
    ChevronRight
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDateTime } from '../../stores/settings';

interface Order {
    id: string;
    orderNumber: string;
    customer: { name: string; code: string } | null;
    salesRep: { name: string } | null;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    paidAmount: string;
    createdAt: string;
}

const Orders: Component = () => {
    const [search, setSearch] = createSignal('');
    const [statusFilter, setStatusFilter] = createSignal('');
    const [page, setPage] = createSignal(1);
    const limit = 20;

    const [orders] = createResource(
        () => ({ search: search(), status: statusFilter(), page: page() }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: limit.toString(),
            };
            if (params.search) queryParams.search = params.search;
            if (params.status) queryParams.status = params.status;

            const result = await api<{ data: Order[]; total: number }>('/orders', { params: queryParams });
            return result;
        }
    );

    const orderList = createMemo(() => (orders() as any)?.data || orders() || []);
    const total = createMemo(() => (orders() as any)?.total || orderList().length);
    const totalPages = createMemo(() => Math.ceil(total() / limit));

    const statusOptions = [
        { value: '', label: 'All Status' },
        { value: 'pending', label: 'Pending' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'picked', label: 'Picked' },
        { value: 'loaded', label: 'Loaded' },
        { value: 'in_transit', label: 'In Transit' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' },
    ];

    const getStatusConfig = (status: string) => {
        const configs: Record<string, { bg: string; text: string; icon: any }> = {
            pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: Clock },
            confirmed: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: CheckCircle2 },
            picked: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: Package },
            loaded: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', icon: Truck },
            in_transit: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: Truck },
            delivered: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
            cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
        };
        return configs[status] || configs.pending;
    };

    // Using shared formatDateTime from settings store

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white">Orders</h1>
                    <p class="text-slate-400">Manage customer orders</p>
                </div>
            </div>

            {/* Filters */}
            <div class="flex flex-col sm:flex-row gap-4 mb-6">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search orders..."
                        value={search()}
                        onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
                        class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>
                <div class="relative">
                    <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                        value={statusFilter()}
                        onChange={(e) => { setStatusFilter(e.currentTarget.value); setPage(1); }}
                        class="pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                        <For each={statusOptions}>
                            {(option) => <option value={option.value}>{option.label}</option>}
                        </For>
                    </select>
                </div>
            </div>

            {/* Loading */}
            <Show when={orders.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            {/* Table */}
            <Show when={!orders.loading && orderList().length > 0}>
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                    {/* Desktop Table */}
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-slate-800/50">
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Order</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Customer</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Sales Rep</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Status</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Amount</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Date</th>
                                    <th class="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50">
                                <For each={orderList()}>
                                    {(order) => {
                                        const statusConfig = getStatusConfig(order.status);
                                        const StatusIcon = statusConfig.icon;
                                        return (
                                            <tr class="hover:bg-slate-800/30 transition-colors">
                                                <td class="px-6 py-4">
                                                    <span class="text-white font-medium">{order.orderNumber}</span>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <div>
                                                        <span class="text-white">{order.customer?.name || 'N/A'}</span>
                                                        <Show when={order.customer?.code}>
                                                            <span class="text-slate-500 text-xs ml-2">{order.customer?.code}</span>
                                                        </Show>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4 text-slate-400">
                                                    {order.salesRep?.name || 'N/A'}
                                                </td>
                                                <td class="px-6 py-4">
                                                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                        <StatusIcon class="w-3.5 h-3.5" />
                                                        {order.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <div class="text-white font-medium">${parseFloat(order.totalAmount).toFixed(2)}</div>
                                                    <div class="text-xs text-slate-500">Paid: ${parseFloat(order.paidAmount).toFixed(2)}</div>
                                                </td>
                                                <td class="px-6 py-4 text-slate-400 text-sm">
                                                    {formatDateTime(order.createdAt)}
                                                </td>
                                                <td class="px-6 py-4 text-right">
                                                    <button class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                                        <Eye class="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card List */}
                    <div class="lg:hidden divide-y divide-slate-800/50">
                        <For each={orderList()}>
                            {(order) => {
                                const statusConfig = getStatusConfig(order.status);
                                const StatusIcon = statusConfig.icon;
                                return (
                                    <div class="p-4 hover:bg-slate-800/30 transition-colors">
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                    <Package class="w-5 h-5 text-blue-400" />
                                                </div>
                                                <div>
                                                    <div class="text-white font-medium">{order.orderNumber}</div>
                                                    <div class="text-slate-400 text-xs">{formatDateTime(order.createdAt)}</div>
                                                </div>
                                            </div>
                                            <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                <StatusIcon class="w-3.5 h-3.5" />
                                                {order.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div class="mb-3">
                                            <div class="text-sm text-white mb-0.5">{order.customer?.name || 'N/A'}</div>
                                            <Show when={order.customer?.code}>
                                                <div class="text-xs text-slate-500">{order.customer?.code}</div>
                                            </Show>
                                        </div>

                                        <div class="flex items-center justify-between pt-3 border-t border-slate-800/50">
                                            <div>
                                                <div class="text-xs text-slate-500">Total Amount</div>
                                                <div class="text-white font-medium">${parseFloat(order.totalAmount).toFixed(2)}</div>
                                            </div>
                                            <button class="px-3 py-1.5 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2">
                                                <Eye class="w-3.5 h-3.5" /> View
                                            </button>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

                    {/* Pagination */}
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800/50">
                        <span class="text-slate-400 text-sm">
                            Showing {(page() - 1) * limit + 1} to {Math.min(page() * limit, total())} of {total()} orders
                        </span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white text-sm px-3">
                                Page {page()} of {totalPages()}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages(), p + 1))}
                                disabled={page() >= totalPages()}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={!orders.loading && orderList().length === 0}>
                <div class="text-center py-20">
                    <Package class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-white mb-2">No orders found</h3>
                    <p class="text-slate-400">Orders will appear here once created</p>
                </div>
            </Show>
        </div>
    );
};

export default Orders;
