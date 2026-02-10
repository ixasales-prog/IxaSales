import { type Component, createSignal, Show } from 'solid-js';
import { X, Loader2, Crown, Trash2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface Tier {
    id: string;
    name: string;
    color: string | null;
    creditAllowed: boolean;
    creditLimit: string;
    maxOrderAmount: string | null;
    paymentTermsDays: number;
    discountPercent: string;
    canCreateOrders: boolean;
    sortOrder: number;
}

interface EditTierModalProps {
    tier: Tier;
    onClose: () => void;
    onSuccess: () => void;
}

const EditTierModal: Component<EditTierModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    const [confirmDelete, setConfirmDelete] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const [name, setName] = createSignal(props.tier.name);
    const [color, setColor] = createSignal(props.tier.color || '#3b82f6');
    const [creditAllowed, setCreditAllowed] = createSignal(props.tier.creditAllowed);
    const [creditLimit, setCreditLimit] = createSignal(props.tier.creditLimit || '0');
    const [maxOrderAmount, setMaxOrderAmount] = createSignal(props.tier.maxOrderAmount || '');
    const [paymentTermsDays, setPaymentTermsDays] = createSignal(String(props.tier.paymentTermsDays));
    const [discountPercent, setDiscountPercent] = createSignal(props.tier.discountPercent || '0');
    const [canCreateOrders, setCanCreateOrders] = createSignal(props.tier.canCreateOrders);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api.patch(`/customers/tiers/${props.tier.id}`, {
                name: name(),
                color: color(),
                creditAllowed: creditAllowed(),
                creditLimit: creditAllowed() ? parseFloat(creditLimit()) || 0 : 0,
                maxOrderAmount: maxOrderAmount() ? parseFloat(maxOrderAmount()) : undefined,
                paymentTermsDays: parseInt(paymentTermsDays()) || 0,
                discountPercent: parseFloat(discountPercent()) || 0,
                canCreateOrders: canCreateOrders(),
            });

            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to update tier');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);

        try {
            await api.delete(`/customers/tiers/${props.tier.id}`);
            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to delete tier');
            setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div
                            class="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: color() ? `${color()}20` : 'rgba(59, 130, 246, 0.1)' }}
                        >
                            <Crown class="w-5 h-5" style={{ color: color() || '#3b82f6' }} />
                        </div>
                        <h2 class="text-xl font-bold text-white">Edit Tier</h2>
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

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Tier Name *</label>
                        <input
                            type="text"
                            required
                            value={name()}
                            onInput={(e) => setName(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Gold, Silver, Bronze"
                        />
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Color</label>
                        <div class="flex items-center gap-3">
                            <input
                                type="color"
                                value={color()}
                                onInput={(e) => setColor(e.currentTarget.value)}
                                class="w-12 h-10 rounded-lg border border-slate-700 cursor-pointer"
                            />
                            <input
                                type="text"
                                value={color()}
                                onInput={(e) => setColor(e.currentTarget.value)}
                                class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                            />
                        </div>
                    </div>

                    <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                        <input
                            type="checkbox"
                            id="editCanCreateOrders"
                            checked={canCreateOrders()}
                            onChange={(e) => setCanCreateOrders(e.currentTarget.checked)}
                            class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                        />
                        <label for="editCanCreateOrders" class="text-sm font-medium text-slate-300">
                            Allow Order Creation
                        </label>
                    </div>

                    <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                        <input
                            type="checkbox"
                            id="editCreditAllowed"
                            checked={creditAllowed()}
                            onChange={(e) => setCreditAllowed(e.currentTarget.checked)}
                            class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                        />
                        <label for="editCreditAllowed" class="text-sm font-medium text-slate-300">
                            Allow Credit Purchases
                        </label>
                    </div>

                    {creditAllowed() && (
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-slate-300">Credit Limit</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={creditLimit()}
                                onInput={(e) => setCreditLimit(e.currentTarget.value)}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    )}

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-slate-300">Max Order Amount</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={maxOrderAmount()}
                                onInput={(e) => setMaxOrderAmount(e.currentTarget.value)}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="No limit"
                            />
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-slate-300">Payment Terms (days)</label>
                            <input
                                type="number"
                                min="0"
                                value={paymentTermsDays()}
                                onInput={(e) => setPaymentTermsDays(e.currentTarget.value)}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Discount Percent (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={discountPercent()}
                            onInput={(e) => setDiscountPercent(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="0"
                        />
                    </div>

                    <div class="pt-4 flex justify-between items-center border-t border-slate-800">
                        <Show when={!confirmDelete()}>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                class="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all flex items-center gap-2 text-sm"
                            >
                                <Trash2 class="w-4 h-4" />
                                Delete
                            </button>
                        </Show>
                        <Show when={confirmDelete()}>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting()}
                                    class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deleting() ? <Loader2 class="w-4 h-4 animate-spin" /> : <Trash2 class="w-4 h-4" />}
                                    Confirm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(false)}
                                    class="px-3 py-2 text-slate-400 text-sm hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </Show>

                        <div class="flex gap-3">
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
                                class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {submitting() ? (
                                    <>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditTierModal;
