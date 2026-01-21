import { type Component, createSignal } from 'solid-js';
import { X, Loader2, RotateCcw } from 'lucide-solid';
import { api } from '../../lib/api';

interface ProcessReturnModalProps {
    returnItem: {
        id: string;
        productName?: string;
        qtyReturned: number;
        reason: string;
    };
    onClose: () => void;
    onSuccess: () => void;
}

const ProcessReturnModal: Component<ProcessReturnModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const [condition, setCondition] = createSignal('good');
    const [restock, setRestock] = createSignal(true);
    const [refundAmount, setRefundAmount] = createSignal('');

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api.patch(`/returns/${props.returnItem.id}/process`, {
                condition: condition(),
                restock: restock(),
                refundAmount: refundAmount() ? parseFloat(refundAmount()) : undefined,
            });

            props.onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to process return');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <RotateCcw class="w-5 h-5 text-orange-400" />
                        </div>
                        <h2 class="text-xl font-bold text-white">Process Return</h2>
                    </div>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} class="p-6 space-y-4">
                    {error() && (
                        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {error()}
                        </div>
                    )}

                    {/* Return Info */}
                    <div class="p-4 bg-slate-800/50 rounded-xl">
                        <div class="text-sm text-slate-400">Product</div>
                        <div class="text-white font-medium">{props.returnItem.productName || 'Unknown Product'}</div>
                        <div class="text-sm text-slate-500 mt-1">Qty: {props.returnItem.qtyReturned} | Reason: {props.returnItem.reason}</div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Condition</label>
                        <select
                            value={condition()}
                            onChange={(e) => setCondition(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="good">Good - Can be restocked</option>
                            <option value="damaged">Damaged - Cannot be restocked</option>
                            <option value="expired">Expired - Dispose</option>
                        </select>
                    </div>

                    <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                        <input
                            type="checkbox"
                            id="restock"
                            checked={restock()}
                            onChange={(e) => setRestock(e.currentTarget.checked)}
                            class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                        />
                        <label for="restock" class="text-sm font-medium text-slate-300">
                            Restock items to inventory
                        </label>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Refund Amount ($) <span class="text-slate-500 text-xs">(optional)</span></label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={refundAmount()}
                            onInput={(e) => setRefundAmount(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="0.00"
                        />
                        <p class="text-xs text-slate-500">Leave empty if no refund is issued.</p>
                    </div>

                    <div class="pt-4 flex justify-end gap-3 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={props.onClose}
                            class="px-5 py-2.5 text-slate-300 font-medium hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting()}
                            class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting() ? (
                                <>
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                'Approve Return'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProcessReturnModal;
