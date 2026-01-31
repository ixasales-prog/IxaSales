import { type Component, Show, createResource } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { ArrowLeft, Package, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../stores/settings';

interface OrderDetail {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    paymentStatus: string;
    itemCount: number;
    createdAt: string;
    notes?: string;
    items: Array<{
        id: string;
        productName: string;
        sku: string;
        unitPrice: string;
        qtyOrdered: number;
        qtyDelivered: number;
        lineTotal: string;
    }>;
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'pending': return 'text-amber-400';
        case 'confirmed': return 'text-blue-400';
        case 'processing': return 'text-purple-400';
        case 'delivering': return 'text-indigo-400';
        case 'delivered':
        case 'completed': return 'text-emerald-400';
        case 'cancelled': return 'text-red-400';
        default: return 'text-slate-400';
    }
};

const getPaymentBadge = (status: string) => {
    switch (status) {
        case 'paid': return 'bg-emerald-500/20 text-emerald-400';
        case 'partial': return 'bg-amber-500/20 text-amber-400';
        case 'unpaid': return 'bg-red-500/20 text-red-400';
        default: return 'bg-slate-500/20 text-slate-400';
    }
};

const OrderDetailPage: Component = () => {
    const params = useParams<{ id: string }>();

    const [order] = createResource(
        () => params.id,
        async (id) => {
            if (!id) return null;
            try {
                const res = await api.get(`/orders/${id}`);
                return (res as any)?.data || res || null;
            } catch (_e) {
                return null;
            }
        }
    );

    return (
        <div class="min-h-screen pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center gap-3 px-4 py-3">
                    <A href="/sales/orders" class="p-2 -ml-2 text-slate-400 hover:text-white">
                        <ArrowLeft class="w-5 h-5" />
                    </A>
                    <div>
                        <h1 class="text-lg font-bold text-white">Order Details</h1>
                        <p class="text-slate-500 text-xs">{params.id}</p>
                    </div>
                </div>
            </div>

            <div class="px-4 pt-4">
                <Show when={order.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 animate-spin text-blue-400" />
                    </div>
                </Show>

                <Show when={!order.loading && order()} fallback={
                    <div class="text-center py-12 text-slate-400">Order not found.</div>
                }>
                    {(detail: () => OrderDetail) => (
                        <div class="space-y-4">
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                <div class="flex justify-between items-start mb-3">
                                    <div>
                                        <div class="text-white font-bold">{detail().orderNumber}</div>
                                        <div class="text-slate-400 text-sm">{detail().customerName}</div>
                                    </div>
                                    <span class={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentBadge(detail().paymentStatus)}`}>
                                        {detail().paymentStatus}
                                    </span>
                                </div>
                                <div class="flex gap-4 text-sm">
                                    <div>
                                        <span class="text-slate-500">Status: </span>
                                        <span class={getStatusColor(detail().status)}>{detail().status}</span>
                                    </div>
                                    <div>
                                        <span class="text-slate-500">Total: </span>
                                        <span class="text-white font-bold">{formatCurrency(detail().totalAmount)}</span>
                                    </div>
                                </div>
                                <div class="mt-3 text-xs text-slate-500">
                                    {formatDate(detail().createdAt, { month: 'short', day: 'numeric' })}
                                </div>
                            </div>

                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
                                <div class="p-3 border-b border-slate-800/50">
                                    <h3 class="text-white font-semibold text-sm">Products</h3>
                                </div>
                                <div class="divide-y divide-slate-800/50">
                                    {detail().items?.map((item) => (
                                        <div class="p-3 flex items-center gap-3">
                                            <div class="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                                                <Package class="w-5 h-5 text-slate-500" />
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="text-white text-sm font-medium truncate">{item.productName}</div>
                                                <div class="text-slate-500 text-xs">{item.sku} • Qty: {item.qtyOrdered}</div>
                                            </div>
                                            <div class="text-right shrink-0">
                                                <div class="text-white font-medium text-sm">{formatCurrency(item.lineTotal)}</div>
                                                <div class="text-slate-500 text-[10px]">{formatCurrency(item.unitPrice)} each</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Show when={detail().notes}>
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                    <h3 class="text-white font-semibold text-sm mb-2">Notes</h3>
                                    <p class="text-slate-400 text-sm">{detail().notes}</p>
                                </div>
                            </Show>
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
};

export default OrderDetailPage;
