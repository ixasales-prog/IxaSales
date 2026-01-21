import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { X, Loader2, Settings, Plus } from 'lucide-solid';
import { api } from '../../lib/api';

interface TierRulesModalProps {
    tierId: string;
    onClose: () => void;
}

interface DowngradeRule {
    id: string;
    fromTierId: string;
    toTierId: string;
    conditionType: 'days_since_order' | 'debt_over_limit' | 'debt_overdue_days';
    conditionValue: number;
    isActive: boolean;
}

interface Tier {
    id: string;
    name: string;
}

const conditionLabels: Record<string, string> = {
    days_since_order: 'Days since last order',
    debt_over_limit: 'Debt exceeds limit by %',
    debt_overdue_days: 'Debt overdue for days',
};

const TierRulesModal: Component<TierRulesModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [showAddForm, setShowAddForm] = createSignal(false);

    // Form state
    const [toTierId, setToTierId] = createSignal('');
    const [conditionType, setConditionType] = createSignal<string>('days_since_order');
    const [conditionValue, setConditionValue] = createSignal('30');

    // Fetch rules for this tier
    const [rules, { refetch }] = createResource(async () => {
        const response = await api.get<DowngradeRule[]>(`/customers/tiers/${props.tierId}/rules`);
        return response || [];
    });

    // Fetch all tiers for dropdown
    const [tiers] = createResource(async () => {
        const response = await api.get<Tier[]>('/customers/tiers');
        return response || [];
    });

    const currentTier = () => tiers()?.find(t => t.id === props.tierId);
    const otherTiers = () => tiers()?.filter(t => t.id !== props.tierId) || [];

    const handleAddRule = async (e: Event) => {
        e.preventDefault();
        if (!toTierId()) return;

        setSubmitting(true);
        setError(null);

        try {
            await api.post(`/customers/tiers/${props.tierId}/rules`, {
                toTierId: toTierId(),
                conditionType: conditionType(),
                conditionValue: parseInt(conditionValue()) || 0,
            });

            setShowAddForm(false);
            setToTierId('');
            setConditionType('days_since_order');
            setConditionValue('30');
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to add rule');
        } finally {
            setSubmitting(false);
        }
    };

    const getTierName = (tierId: string) => {
        return tiers()?.find(t => t.id === tierId)?.name || 'Unknown';
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Settings class="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-white">Downgrade Rules</h2>
                            <p class="text-sm text-slate-400">For tier: {currentTier()?.name || 'Loading...'}</p>
                        </div>
                    </div>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-6 space-y-4">
                    {error() && (
                        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {error()}
                        </div>
                    )}

                    <Show when={!rules.loading} fallback={
                        <div class="flex items-center justify-center py-8">
                            <Loader2 class="w-6 h-6 animate-spin text-blue-500" />
                        </div>
                    }>
                        {/* Existing Rules */}
                        <Show when={rules()!.length > 0} fallback={
                            <div class="text-center py-8 text-slate-500">
                                <p class="mb-2">No downgrade rules configured</p>
                                <p class="text-sm">Add rules to automatically downgrade customers based on conditions.</p>
                            </div>
                        }>
                            <div class="space-y-3">
                                <For each={rules()}>
                                    {(rule) => (
                                        <div class="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                                            <div class="flex items-start justify-between">
                                                <div>
                                                    <div class="text-white font-medium">
                                                        Downgrade to: <span class="text-blue-400">{getTierName(rule.toTierId)}</span>
                                                    </div>
                                                    <div class="text-sm text-slate-400 mt-1">
                                                        When: {conditionLabels[rule.conditionType]} ≥ {rule.conditionValue}
                                                    </div>
                                                </div>
                                                <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${rule.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                    {rule.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>

                        {/* Add Rule Form */}
                        <Show when={showAddForm()}>
                            <form onSubmit={handleAddRule} class="p-4 bg-slate-800/50 rounded-xl border border-blue-500/30 space-y-4">
                                <h3 class="text-white font-medium">Add New Rule</h3>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Downgrade To</label>
                                    <select
                                        value={toTierId()}
                                        onChange={(e) => setToTierId(e.currentTarget.value)}
                                        required
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Select a tier...</option>
                                        <For each={otherTiers()}>
                                            {(tier) => <option value={tier.id}>{tier.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Condition</label>
                                    <select
                                        value={conditionType()}
                                        onChange={(e) => setConditionType(e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="days_since_order">Days since last order</option>
                                        <option value="debt_over_limit">Debt exceeds limit by %</option>
                                        <option value="debt_overdue_days">Debt overdue for days</option>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Threshold Value</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={conditionValue()}
                                        onInput={(e) => setConditionValue(e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="30"
                                    />
                                </div>

                                <div class="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddForm(false)}
                                        class="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting()}
                                        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {submitting() ? <Loader2 class="w-4 h-4 animate-spin" /> : null}
                                        Add Rule
                                    </button>
                                </div>
                            </form>
                        </Show>

                        {/* Add Rule Button */}
                        <Show when={!showAddForm()}>
                            <button
                                onClick={() => setShowAddForm(true)}
                                class="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-blue-500 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus class="w-5 h-5" />
                                Add Downgrade Rule
                            </button>
                        </Show>
                    </Show>
                </div>

                <div class="p-6 border-t border-slate-800">
                    <button
                        onClick={props.onClose}
                        class="w-full py-3 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TierRulesModal;
