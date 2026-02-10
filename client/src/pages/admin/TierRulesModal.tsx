import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { X, Loader2, Settings, Plus, Trash2, ToggleLeft, ToggleRight, TrendingDown, TrendingUp } from 'lucide-solid';
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

interface UpgradeRule {
    id: string;
    fromTierId: string;
    toTierId: string;
    conditionType: 'orders_count' | 'total_spend' | 'on_time_payment_pct';
    conditionValue: number;
    periodDays: number;
    cooldownDays: number;
    isActive: boolean;
}

interface Tier {
    id: string;
    name: string;
    sortOrder: number;
}

const downgradeConditionLabels: Record<string, string> = {
    days_since_order: 'Days since last order',
    debt_over_limit: 'Debt exceeds limit by %',
    debt_overdue_days: 'Debt overdue for days',
};

const upgradeConditionLabels: Record<string, string> = {
    orders_count: 'Orders placed in period',
    total_spend: 'Total spend in period',
    on_time_payment_pct: 'On-time payment %',
};

type Tab = 'downgrade' | 'upgrade';

const TierRulesModal: Component<TierRulesModalProps> = (props) => {
    const [activeTab, setActiveTab] = createSignal<Tab>('downgrade');
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [showAddForm, setShowAddForm] = createSignal(false);

    // Downgrade form state
    const [toTierId, setToTierId] = createSignal('');
    const [conditionType, setConditionType] = createSignal<string>('days_since_order');
    const [conditionValue, setConditionValue] = createSignal('30');

    // Upgrade form state
    const [upgradeToTierId, setUpgradeToTierId] = createSignal('');
    const [upgradeConditionType, setUpgradeConditionType] = createSignal<string>('orders_count');
    const [upgradeConditionValue, setUpgradeConditionValue] = createSignal('10');
    const [periodDays, setPeriodDays] = createSignal('90');
    const [cooldownDays, setCooldownDays] = createSignal('30');

    // Fetch rules
    const [downgradeRules, { refetch: refetchDowngrade }] = createResource(async () => {
        const response = await api.get<DowngradeRule[]>(`/customers/tiers/${props.tierId}/rules`);
        return response || [];
    });

    const [upgradeRules, { refetch: refetchUpgrade }] = createResource(async () => {
        const response = await api.get<UpgradeRule[]>(`/customers/tiers/${props.tierId}/upgrade-rules`);
        return response || [];
    });

    // Fetch all tiers for dropdown
    const [tiers] = createResource(async () => {
        const response = await api.get<Tier[]>('/customers/tiers');
        return response || [];
    });

    const currentTier = () => tiers()?.find(t => t.id === props.tierId);
    const lowerTiers = () => {
        const current = currentTier();
        if (!current) return [];
        return (tiers() || []).filter(t => t.id !== props.tierId && t.sortOrder < current.sortOrder);
    };
    const higherTiers = () => {
        const current = currentTier();
        if (!current) return [];
        return (tiers() || []).filter(t => t.id !== props.tierId && t.sortOrder > current.sortOrder);
    };

    // Downgrade handlers
    const handleAddDowngradeRule = async (e: Event) => {
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
            refetchDowngrade();
        } catch (err: any) {
            setError(err.message || 'Failed to add rule');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleDowngradeRule = async (ruleId: string) => {
        setError(null);
        try {
            await api.patch(`/customers/tiers/${props.tierId}/rules/${ruleId}/toggle`, {});
            refetchDowngrade();
        } catch (err: any) {
            setError(err.message || 'Failed to toggle rule');
        }
    };

    const handleDeleteDowngradeRule = async (ruleId: string) => {
        setError(null);
        try {
            await api.delete(`/customers/tiers/${props.tierId}/rules/${ruleId}`);
            refetchDowngrade();
        } catch (err: any) {
            setError(err.message || 'Failed to delete rule');
        }
    };

    // Upgrade handlers
    const handleAddUpgradeRule = async (e: Event) => {
        e.preventDefault();
        if (!upgradeToTierId()) return;

        setSubmitting(true);
        setError(null);

        try {
            await api.post(`/customers/tiers/${props.tierId}/upgrade-rules`, {
                toTierId: upgradeToTierId(),
                conditionType: upgradeConditionType(),
                conditionValue: parseInt(upgradeConditionValue()) || 0,
                periodDays: parseInt(periodDays()) || 90,
                cooldownDays: parseInt(cooldownDays()) || 30,
            });

            setShowAddForm(false);
            setUpgradeToTierId('');
            setUpgradeConditionType('orders_count');
            setUpgradeConditionValue('10');
            setPeriodDays('90');
            setCooldownDays('30');
            refetchUpgrade();
        } catch (err: any) {
            setError(err.message || 'Failed to add rule');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleUpgradeRule = async (ruleId: string) => {
        setError(null);
        try {
            await api.patch(`/customers/tiers/${props.tierId}/upgrade-rules/${ruleId}/toggle`, {});
            refetchUpgrade();
        } catch (err: any) {
            setError(err.message || 'Failed to toggle rule');
        }
    };

    const handleDeleteUpgradeRule = async (ruleId: string) => {
        setError(null);
        try {
            await api.delete(`/customers/tiers/${props.tierId}/upgrade-rules/${ruleId}`);
            refetchUpgrade();
        } catch (err: any) {
            setError(err.message || 'Failed to delete rule');
        }
    };

    const getTierName = (tierId: string) => {
        return tiers()?.find(t => t.id === tierId)?.name || 'Unknown';
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Settings class="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-white">Tier Rules</h2>
                            <p class="text-sm text-slate-400">{currentTier()?.name || 'Loading...'}</p>
                        </div>
                    </div>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div class="flex border-b border-slate-800">
                    <button
                        onClick={() => { setActiveTab('downgrade'); setShowAddForm(false); setError(null); }}
                        class={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab() === 'downgrade'
                            ? 'text-red-400 border-red-400 bg-red-500/5'
                            : 'text-slate-400 border-transparent hover:text-slate-300'
                            }`}
                    >
                        <TrendingDown class="w-4 h-4" />
                        Downgrade Rules
                    </button>
                    <button
                        onClick={() => { setActiveTab('upgrade'); setShowAddForm(false); setError(null); }}
                        class={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab() === 'upgrade'
                            ? 'text-emerald-400 border-emerald-400 bg-emerald-500/5'
                            : 'text-slate-400 border-transparent hover:text-slate-300'
                            }`}
                    >
                        <TrendingUp class="w-4 h-4" />
                        Upgrade Rules
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-6 space-y-4">
                    {error() && (
                        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {error()}
                        </div>
                    )}

                    {/* ===== DOWNGRADE TAB ===== */}
                    <Show when={activeTab() === 'downgrade'}>
                        <Show when={!downgradeRules.loading} fallback={
                            <div class="flex items-center justify-center py-8">
                                <Loader2 class="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                        }>
                            <Show when={downgradeRules()!.length > 0} fallback={
                                <div class="text-center py-8 text-slate-500">
                                    <TrendingDown class="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p class="mb-1">No downgrade rules</p>
                                    <p class="text-sm">Auto-demote customers when conditions are met.</p>
                                </div>
                            }>
                                <div class="space-y-3">
                                    <For each={downgradeRules()}>
                                        {(rule) => (
                                            <div class={`p-4 rounded-xl border transition-colors ${rule.isActive ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800/20 border-slate-800 opacity-60'}`}>
                                                <div class="flex items-start justify-between gap-3">
                                                    <div class="flex-1">
                                                        <div class="text-white font-medium">
                                                            ↘ <span class="text-red-400">{getTierName(rule.toTierId)}</span>
                                                        </div>
                                                        <div class="text-sm text-slate-400 mt-1">
                                                            {downgradeConditionLabels[rule.conditionType]} ≥ {rule.conditionValue}
                                                        </div>
                                                    </div>
                                                    <div class="flex items-center gap-1.5 flex-shrink-0">
                                                        <button
                                                            onClick={() => handleToggleDowngradeRule(rule.id)}
                                                            class={`p-1.5 rounded-lg transition-colors ${rule.isActive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-700'}`}
                                                            title={rule.isActive ? 'Disable' : 'Enable'}
                                                        >
                                                            {rule.isActive ? <ToggleRight class="w-5 h-5" /> : <ToggleLeft class="w-5 h-5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDowngradeRule(rule.id)}
                                                            class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 class="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>

                            <Show when={showAddForm()}>
                                <form onSubmit={handleAddDowngradeRule} class="p-4 bg-slate-800/50 rounded-xl border border-red-500/30 space-y-4">
                                    <h3 class="text-white font-medium text-sm">New Downgrade Rule</h3>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Downgrade To</label>
                                        <select value={toTierId()} onChange={(e) => setToTierId(e.currentTarget.value)} required
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="">Select a tier...</option>
                                            <For each={lowerTiers()}>{(tier) => <option value={tier.id}>{tier.name}</option>}</For>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Condition</label>
                                        <select value={conditionType()} onChange={(e) => setConditionType(e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="days_since_order">Days since last order</option>
                                            <option value="debt_over_limit">Debt exceeds limit by %</option>
                                            <option value="debt_overdue_days">Debt overdue for days</option>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Threshold</label>
                                        <input type="number" min="1" value={conditionValue()} onInput={(e) => setConditionValue(e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="30" />
                                    </div>
                                    <div class="flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowAddForm(false)} class="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                                        <button type="submit" disabled={submitting()} class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                                            {submitting() ? <Loader2 class="w-4 h-4 animate-spin" /> : null} Add Rule
                                        </button>
                                    </div>
                                </form>
                            </Show>

                            <Show when={!showAddForm()}>
                                <button onClick={() => setShowAddForm(true)}
                                    class="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors flex items-center justify-center gap-2">
                                    <Plus class="w-5 h-5" /> Add Downgrade Rule
                                </button>
                            </Show>
                        </Show>
                    </Show>

                    {/* ===== UPGRADE TAB ===== */}
                    <Show when={activeTab() === 'upgrade'}>
                        <Show when={!upgradeRules.loading} fallback={
                            <div class="flex items-center justify-center py-8">
                                <Loader2 class="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                        }>
                            <Show when={upgradeRules()!.length > 0} fallback={
                                <div class="text-center py-8 text-slate-500">
                                    <TrendingUp class="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p class="mb-1">No upgrade rules</p>
                                    <p class="text-sm">Auto-promote customers who meet achievement targets.</p>
                                </div>
                            }>
                                <div class="space-y-3">
                                    <For each={upgradeRules()}>
                                        {(rule) => (
                                            <div class={`p-4 rounded-xl border transition-colors ${rule.isActive ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800/20 border-slate-800 opacity-60'}`}>
                                                <div class="flex items-start justify-between gap-3">
                                                    <div class="flex-1">
                                                        <div class="text-white font-medium">
                                                            ↗ <span class="text-emerald-400">{getTierName(rule.toTierId)}</span>
                                                        </div>
                                                        <div class="text-sm text-slate-400 mt-1">
                                                            {upgradeConditionLabels[rule.conditionType]} ≥ {rule.conditionValue}
                                                        </div>
                                                        <div class="text-xs text-slate-500 mt-0.5">
                                                            Window: {rule.periodDays}d · Cooldown: {rule.cooldownDays}d
                                                        </div>
                                                    </div>
                                                    <div class="flex items-center gap-1.5 flex-shrink-0">
                                                        <button
                                                            onClick={() => handleToggleUpgradeRule(rule.id)}
                                                            class={`p-1.5 rounded-lg transition-colors ${rule.isActive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-700'}`}
                                                            title={rule.isActive ? 'Disable' : 'Enable'}
                                                        >
                                                            {rule.isActive ? <ToggleRight class="w-5 h-5" /> : <ToggleLeft class="w-5 h-5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUpgradeRule(rule.id)}
                                                            class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 class="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>

                            <Show when={showAddForm()}>
                                <form onSubmit={handleAddUpgradeRule} class="p-4 bg-slate-800/50 rounded-xl border border-emerald-500/30 space-y-4">
                                    <h3 class="text-white font-medium text-sm">New Upgrade Rule</h3>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Upgrade To</label>
                                        <select value={upgradeToTierId()} onChange={(e) => setUpgradeToTierId(e.currentTarget.value)} required
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="">Select a tier...</option>
                                            <For each={higherTiers()}>{(tier) => <option value={tier.id}>{tier.name}</option>}</For>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Achievement Condition</label>
                                        <select value={upgradeConditionType()} onChange={(e) => setUpgradeConditionType(e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="orders_count">Orders placed in period</option>
                                            <option value="total_spend">Total spend in period</option>
                                            <option value="on_time_payment_pct">On-time payment %</option>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">
                                            {upgradeConditionType() === 'on_time_payment_pct' ? 'Minimum %' : 'Minimum Value'}
                                        </label>
                                        <input type="number" min="1" value={upgradeConditionValue()} onInput={(e) => setUpgradeConditionValue(e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder={upgradeConditionType() === 'on_time_payment_pct' ? '80' : '10'} />
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="text-sm font-medium text-slate-300">Period (days)</label>
                                            <input type="number" min="7" value={periodDays()} onInput={(e) => setPeriodDays(e.currentTarget.value)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="90" />
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="text-sm font-medium text-slate-300">Cooldown (days)</label>
                                            <input type="number" min="1" value={cooldownDays()} onInput={(e) => setCooldownDays(e.currentTarget.value)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="30" />
                                        </div>
                                    </div>
                                    <div class="flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowAddForm(false)} class="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                                        <button type="submit" disabled={submitting()} class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                                            {submitting() ? <Loader2 class="w-4 h-4 animate-spin" /> : null} Add Rule
                                        </button>
                                    </div>
                                </form>
                            </Show>

                            <Show when={!showAddForm()}>
                                <button onClick={() => setShowAddForm(true)}
                                    class="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors flex items-center justify-center gap-2">
                                    <Plus class="w-5 h-5" /> Add Upgrade Rule
                                </button>
                            </Show>
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
