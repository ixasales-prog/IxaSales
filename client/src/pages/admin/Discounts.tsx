import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Tag, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import AddDiscountModal from './AddDiscountModal';

const AdminDiscounts: Component = () => {
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [search] = createSignal('');

    const [discounts, { refetch }] = createResource(async () => {
        const response = await api.get('/discounts');
        return response;
    });

    const filteredDiscounts = () => {
        const query = search().toLowerCase();
        return discounts()?.filter((d: any) =>
            d.name.toLowerCase().includes(query)
        ) || [];
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'percentage': return 'Percentage';
            case 'fixed': return 'Fixed Amount';
            case 'buy_x_get_y': return 'Buy X Get Y';
            case 'volume': return 'Volume';
            default: return type;
        }
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Discounts</h1>
                    <p class="text-slate-400 mt-1">Manage promotions and special offers</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    New Discount
                </button>
            </div>

            {/* Content */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!discounts.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading discounts...</p>
                    </div>
                }>
                    <Show when={filteredDiscounts().length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Tag class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No discounts found</p>
                            <p class="text-sm">Create a new discount to get started.</p>
                        </div>
                    }>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead class="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th class="px-6 py-4">Name</th>
                                        <th class="px-6 py-4">Type</th>
                                        <th class="px-6 py-4">Value</th>
                                        <th class="px-6 py-4">Validity</th>
                                        <th class="px-6 py-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800">
                                    <For each={filteredDiscounts()}>
                                        {(discount) => (
                                            <tr class="hover:bg-slate-800/50 transition-colors group">
                                                <td class="px-6 py-4">
                                                    <div class="font-semibold text-slate-200">{discount.name}</div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                                                        {getTypeLabel(discount.type)}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-slate-300">
                                                    {discount.type === 'percentage' && `${discount.value}%`}
                                                    {discount.type === 'fixed' && `$${discount.value}`}
                                                    {discount.type === 'buy_x_get_y' && `Buy ${discount.minQty} Get ${discount.freeQty}`}
                                                    {discount.type === 'volume' && 'Tiered'}
                                                </td>
                                                <td class="px-6 py-4 text-sm text-slate-400">
                                                    <div class="flex flex-col gap-0.5">
                                                        <span class="text-xs uppercase tracking-wide opacity-50">Starts</span>
                                                        {discount.startsAt ? new Date(discount.startsAt).toLocaleDateString() : 'Now'}
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${discount.isActive
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                        {discount.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={showAddModal()}>
                <AddDiscountModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => refetch()}
                />
            </Show>
        </div>
    );
};

export default AdminDiscounts;

