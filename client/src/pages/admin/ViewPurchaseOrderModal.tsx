import { type Component, createSignal, createResource, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, Save, Loader2, Package, Building2, Calendar, FileText, CheckCircle } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface ViewPurchaseOrderModalProps {
    orderId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const ViewPurchaseOrderModal: Component<ViewPurchaseOrderModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [status, setStatus] = createSignal('');

    const [order] = createResource(async () => {
        try {
            const res = await api.get(`/procurement/purchase-orders/${props.orderId}`);
            const data = (res as any)?.data || res;
            setStatus(data.status || 'draft');
            return data;
        } catch (e) {
            console.error('Failed to load PO:', e);
            return null;
        }
    });

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'received': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
            case 'ordered': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
            case 'draft': return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
            case 'cancelled': return 'text-red-400 bg-red-400/10 border-red-400/30';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
        }
    };

    const handleStatusChange = async () => {
        if (!status() || status() === order()?.status) {
            toast.error('Please select a different status');
            return;
        }

        setLoading(true);
        try {
            await api.patch(`/procurement/purchase-orders/${props.orderId}/status`, {
                status: status()
            });
            toast.success(`Status updated to "${status()}"`);
            props.onSuccess();
            props.onClose();
        } catch (error: any) {
            console.error('Failed to update status:', error);
            toast.error(error.message || 'Failed to update status');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] overflow-y-auto flex items-end sm:items-center justify-center p-4">
                <div class="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h2 class="text-xl font-bold text-white">Purchase Order Details</h2>
                            <p class="text-slate-400 text-sm mt-1">View and update order status</p>
                        </div>
                        <button onClick={props.onClose} class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <Show when={order.loading}>
                        <div class="flex items-center justify-center py-12">
                            <Loader2 class="w-8 h-8 animate-spin text-blue-400" />
                        </div>
                    </Show>

                    <Show when={!order.loading && order()}>
                        <div class="space-y-6">
                            {/* Header Info */}
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div class="bg-slate-800/50 rounded-xl p-4">
                                    <div class="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-1">
                                        <FileText class="w-4 h-4" />
                                        PO Number
                                    </div>
                                    <div class="text-white font-bold">{order()?.poNumber}</div>
                                </div>
                                <div class="bg-slate-800/50 rounded-xl p-4">
                                    <div class="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-1">
                                        <Building2 class="w-4 h-4" />
                                        Supplier
                                    </div>
                                    <div class="text-white font-bold">{order()?.supplierName}</div>
                                </div>
                                <div class="bg-slate-800/50 rounded-xl p-4">
                                    <div class="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-1">
                                        <Calendar class="w-4 h-4" />
                                        Created
                                    </div>
                                    <div class="text-white font-bold">
                                        {new Date(order()?.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <div class="bg-slate-800/50 rounded-xl p-4">
                                    <div class="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-1">
                                        <CheckCircle class="w-4 h-4" />
                                        Current Status
                                    </div>
                                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(order()?.status)}`}>
                                        <span class="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                        {order()?.status?.charAt(0).toUpperCase() + order()?.status?.slice(1)}
                                    </span>
                                </div>
                            </div>

                            {/* Status Change */}
                            <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
                                <h3 class="text-sm font-semibold text-white mb-3">Change Status</h3>
                                <div class="flex items-center gap-4">
                                    <select
                                        value={status()}
                                        onChange={(e) => setStatus(e.currentTarget.value)}
                                        class="flex-1 px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium appearance-none"
                                    >
                                        <option value="draft">Draft</option>
                                        <option value="ordered">Ordered</option>
                                        <option value="received">Received (updates stock)</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                    <button
                                        onClick={handleStatusChange}
                                        disabled={loading() || status() === order()?.status}
                                        class="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center gap-2 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Show when={!loading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                            <Save class="w-5 h-5" />
                                            Update
                                        </Show>
                                    </button>
                                </div>
                                <Show when={status() === 'received' && order()?.status !== 'received'}>
                                    <p class="text-amber-400 text-xs mt-2">
                                        ⚠️ Changing to "Received" will automatically increase product stock quantities.
                                    </p>
                                </Show>
                            </div>

                            {/* Items Table */}
                            <div class="bg-slate-950/30 rounded-xl border border-slate-800 overflow-hidden">
                                <div class="p-4 border-b border-slate-800">
                                    <h3 class="text-sm font-semibold text-white">Order Items</h3>
                                </div>
                                <table class="w-full text-left text-sm">
                                    <thead class="bg-slate-950/50 text-slate-400 font-medium">
                                        <tr>
                                            <th class="p-4">Product</th>
                                            <th class="p-4 w-24 text-center">Qty Ordered</th>
                                            <th class="p-4 w-24 text-center">Qty Received</th>
                                            <th class="p-4 w-28 text-right">Unit Price</th>
                                            <th class="p-4 w-28 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-800/50">
                                        <For each={order()?.items}>
                                            {(item: any) => (
                                                <tr class="hover:bg-slate-800/20 transition-colors">
                                                    <td class="p-4">
                                                        <div class="flex items-center gap-3">
                                                            <div class="p-2 bg-slate-800 rounded-lg">
                                                                <Package class="w-4 h-4 text-blue-400" />
                                                            </div>
                                                            <span class="font-medium text-white">{item.productName}</span>
                                                        </div>
                                                    </td>
                                                    <td class="p-4 text-center text-slate-300">{item.qtyOrdered}</td>
                                                    <td class="p-4 text-center text-slate-300">{item.qtyReceived || 0}</td>
                                                    <td class="p-4 text-right font-mono text-slate-300">${Number(item.unitPrice).toFixed(2)}</td>
                                                    <td class="p-4 text-right font-mono text-slate-300">${Number(item.lineTotal).toFixed(2)}</td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                    <tfoot class="bg-slate-950/50 font-semibold text-white">
                                        <tr>
                                            <td colSpan={4} class="p-4 text-right">Total Amount</td>
                                            <td class="p-4 text-right font-mono text-xl text-blue-400">
                                                ${Number(order()?.totalAmount || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Notes */}
                            <Show when={order()?.notes}>
                                <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
                                    <h3 class="text-sm font-semibold text-white mb-2">Notes</h3>
                                    <p class="text-slate-400 text-sm">{order()?.notes}</p>
                                </div>
                            </Show>
                        </div>
                    </Show>

                    <div class="pt-6 flex justify-end">
                        <button
                            onClick={props.onClose}
                            class="px-6 py-3 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 active:scale-[0.98] transition-all"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default ViewPurchaseOrderModal;
