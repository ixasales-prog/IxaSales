import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Search, Crown, Loader2, RefreshCw, ChevronDown, ChevronRight, Settings } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import AddTierModal from './AddTierModal';
import TierRulesModal from './TierRulesModal';

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
    createdAt: string;
}

const CustomerTiers: Component = () => {
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [showRulesModal, setShowRulesModal] = createSignal<string | null>(null);
    const [search, setSearch] = createSignal('');
    const [expandedTier, setExpandedTier] = createSignal<string | null>(null);

    const [tiers, { refetch }] = createResource(async () => {
        const response = await api.get<Tier[]>('/customers/tiers');
        return response || [];
    });

    const filteredTiers = () => {
        const query = search().toLowerCase();
        return tiers()?.filter((t: Tier) =>
            t.name.toLowerCase().includes(query)
        ) || [];
    };

    // formatCurrency is now imported from settings store

    const toggleExpand = (tierId: string) => {
        setExpandedTier(current => current === tierId ? null : tierId);
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Customer Tiers</h1>
                    <p class="text-slate-400 mt-1">Manage pricing tiers, credit limits, and auto-downgrade rules</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    Add Tier
                </button>
            </div>

            {/* Search */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search tiers..."
                        class="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                    />
                </div>
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
                <Show when={!tiers.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading tiers...</p>
                    </div>
                }>
                    <Show when={filteredTiers().length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Crown class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No tiers found</p>
                            <p class="text-sm">Get started by creating a new customer tier.</p>
                        </div>
                    }>
                        <div class="divide-y divide-slate-800">
                            <For each={filteredTiers()}>
                                {(tier) => (
                                    <div class="hover:bg-slate-800/30 transition-colors">
                                        {/* Tier Row */}
                                        <div class="px-6 py-4 flex items-center gap-4">
                                            {/* Expand Button */}
                                            <button
                                                onClick={() => toggleExpand(tier.id)}
                                                class="p-1 text-slate-500 hover:text-white transition-colors"
                                            >
                                                <Show when={expandedTier() === tier.id} fallback={<ChevronRight class="w-5 h-5" />}>
                                                    <ChevronDown class="w-5 h-5" />
                                                </Show>
                                            </button>

                                            {/* Tier Icon & Name */}
                                            <div class="flex items-center gap-3 flex-1">
                                                <div
                                                    class="w-10 h-10 rounded-lg flex items-center justify-center"
                                                    style={{ background: tier.color ? `${tier.color}20` : 'rgba(59, 130, 246, 0.1)' }}
                                                >
                                                    <Crown class="w-5 h-5" style={{ color: tier.color || '#3b82f6' }} />
                                                </div>
                                                <div>
                                                    <span class="font-semibold text-slate-200">{tier.name}</span>
                                                    <div class="flex items-center gap-2 mt-0.5">
                                                        <Show when={tier.creditAllowed}>
                                                            <span class="text-xs text-emerald-400">Credit Allowed</span>
                                                        </Show>
                                                        <Show when={!tier.creditAllowed}>
                                                            <span class="text-xs text-slate-500">Cash Only</span>
                                                        </Show>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div class="hidden md:flex items-center gap-8 text-sm">
                                                <div class="text-center">
                                                    <div class="text-slate-500 text-xs">Credit Limit</div>
                                                    <div class="text-white font-medium">{formatCurrency(tier.creditLimit)}</div>
                                                </div>
                                                <div class="text-center">
                                                    <div class="text-slate-500 text-xs">Max Order</div>
                                                    <div class="text-white font-medium">{formatCurrency(tier.maxOrderAmount)}</div>
                                                </div>
                                                <div class="text-center">
                                                    <div class="text-slate-500 text-xs">Payment Terms</div>
                                                    <div class="text-white font-medium">{tier.paymentTermsDays} days</div>
                                                </div>
                                                <div class="text-center">
                                                    <div class="text-slate-500 text-xs">Discount</div>
                                                    <div class="text-white font-medium">{parseFloat(tier.discountPercent || '0')}%</div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div class="flex items-center gap-2">
                                                <button
                                                    onClick={() => setShowRulesModal(tier.id)}
                                                    class="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                                    title="Manage downgrade rules"
                                                >
                                                    <Settings class="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Details (Mobile) */}
                                        <Show when={expandedTier() === tier.id}>
                                            <div class="md:hidden px-6 pb-4 pl-14">
                                                <div class="grid grid-cols-2 gap-4 text-sm bg-slate-800/50 rounded-lg p-3">
                                                    <div>
                                                        <div class="text-slate-500 text-xs">Credit Limit</div>
                                                        <div class="text-white font-medium">{formatCurrency(tier.creditLimit)}</div>
                                                    </div>
                                                    <div>
                                                        <div class="text-slate-500 text-xs">Max Order</div>
                                                        <div class="text-white font-medium">{formatCurrency(tier.maxOrderAmount)}</div>
                                                    </div>
                                                    <div>
                                                        <div class="text-slate-500 text-xs">Payment Terms</div>
                                                        <div class="text-white font-medium">{tier.paymentTermsDays} days</div>
                                                    </div>
                                                    <div>
                                                        <div class="text-slate-500 text-xs">Discount</div>
                                                        <div class="text-white font-medium">{parseFloat(tier.discountPercent || '0')}%</div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => setShowRulesModal(tier.id)}
                                                    class="mt-3 w-full py-2 px-4 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Settings class="w-4 h-4" />
                                                    Manage Downgrade Rules
                                                </button>
                                            </div>
                                        </Show>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={showAddModal()}>
                <AddTierModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => refetch()}
                />
            </Show>

            <Show when={showRulesModal()}>
                <TierRulesModal
                    tierId={showRulesModal()!}
                    onClose={() => setShowRulesModal(null)}
                />
            </Show>
        </div>
    );
};

export default CustomerTiers;

