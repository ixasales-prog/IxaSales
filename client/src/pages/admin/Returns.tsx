import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-solid';
import { api } from '../../lib/api';
import ProcessReturnModal from './ProcessReturnModal';

interface Return {
    id: string;
    orderId: string;
    orderNumber?: string;
    productName?: string;
    qtyReturned: number;
    reason: string;
    reasonNotes: string | null;
    status: 'pending' | 'approved' | 'rejected';
    refundAmount: string | null;
    condition: string | null;
    createdAt: string;
}

const reasonLabels: Record<string, string> = {
    damaged: 'Damaged',
    wrong_item: 'Wrong Item',
    quality_issue: 'Quality Issue',
    expired: 'Expired',
    customer_changed_mind: 'Customer Changed Mind',
    other: 'Other',
};

const Returns: Component = () => {
    const [statusFilter, setStatusFilter] = createSignal<string>('');
    const [selectedReturn, setSelectedReturn] = createSignal<Return | null>(null);

    const [returns, { refetch }] = createResource(
        () => ({ status: statusFilter() }),
        async (params) => {
            const queryParams: Record<string, string> = { limit: '50' };
            if (params.status) queryParams.status = params.status;
            const response = await api.get<{ data: Return[]; meta: any }>('/returns', { params: queryParams });
            return response?.data || response || [];
        }
    );

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', label: 'Pending' };
            case 'approved':
                return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Approved' };
            case 'rejected':
                return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', label: 'Rejected' };
            default:
                return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', label: status };
        }
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Returns</h1>
                    <p class="text-slate-400 mt-1">Manage product returns, refunds, and restocking</p>
                </div>
            </div>

            {/* Filters */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <select
                    value={statusFilter()}
                    onChange={(e) => setStatusFilter(e.currentTarget.value)}
                    class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                </select>
                <button
                    onClick={() => refetch()}
                    class="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                    title="Refresh list"
                >
                    <RefreshCw class="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!returns.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading returns...</p>
                    </div>
                }>
                    <Show when={(returns() as Return[])?.length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <RotateCcw class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No returns found</p>
                            <p class="text-sm">Returns will appear here when customers request them.</p>
                        </div>
                    }>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead class="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th class="px-6 py-4">Order / Product</th>
                                        <th class="px-6 py-4">Qty</th>
                                        <th class="px-6 py-4">Reason</th>
                                        <th class="px-6 py-4">Status</th>
                                        <th class="px-6 py-4">Refund</th>
                                        <th class="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800">
                                    <For each={returns() as Return[]}>
                                        {(ret) => {
                                            const badge = getStatusBadge(ret.status);
                                            return (
                                                <tr class="hover:bg-slate-800/50 transition-colors">
                                                    <td class="px-6 py-4">
                                                        <div>
                                                            <div class="text-white font-medium">{ret.productName || 'Product'}</div>
                                                            <div class="text-slate-500 text-xs">{ret.orderNumber || ret.orderId}</div>
                                                        </div>
                                                    </td>
                                                    <td class="px-6 py-4 text-white">{ret.qtyReturned}</td>
                                                    <td class="px-6 py-4">
                                                        <span class="text-slate-300">{reasonLabels[ret.reason] || ret.reason}</span>
                                                        <Show when={ret.reasonNotes}>
                                                            <div class="text-slate-500 text-xs mt-0.5 truncate max-w-[150px]">{ret.reasonNotes}</div>
                                                        </Show>
                                                    </td>
                                                    <td class="px-6 py-4">
                                                        <span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text} border ${badge.border}`}>
                                                            {badge.label}
                                                        </span>
                                                    </td>
                                                    <td class="px-6 py-4 text-slate-300">
                                                        {ret.refundAmount ? `$${parseFloat(ret.refundAmount).toFixed(2)}` : '-'}
                                                    </td>
                                                    <td class="px-6 py-4 text-right">
                                                        <Show when={ret.status === 'pending'}>
                                                            <button
                                                                onClick={() => setSelectedReturn(ret)}
                                                                class="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
                                                            >
                                                                Process
                                                            </button>
                                                        </Show>
                                                        <Show when={ret.status !== 'pending'}>
                                                            <span class="text-slate-500 text-sm">Processed</span>
                                                        </Show>
                                                    </td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                </tbody>
                            </table>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={selectedReturn()}>
                <ProcessReturnModal
                    returnItem={selectedReturn()!}
                    onClose={() => setSelectedReturn(null)}
                    onSuccess={() => { setSelectedReturn(null); refetch(); }}
                />
            </Show>
        </div>
    );
};

export default Returns;

