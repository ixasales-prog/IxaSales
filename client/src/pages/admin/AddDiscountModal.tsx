import { type Component, createSignal, Show, For, createResource } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, Save, Loader2, Tag, Percent, Calendar, Layers, Search, Check } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface AddDiscountModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const AddDiscountModal: Component<AddDiscountModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [formData, setFormData] = createSignal({
        name: '',
        type: 'percentage', // percentage, fixed, buy_x_get_y, volume
        value: '',
        minQty: '',
        freeQty: '',
        minOrderAmount: '',
        maxDiscountAmount: '',
        startsAt: '',
        endsAt: '',
    });

    // Scope State
    const [scopeType, setScopeType] = createSignal('all'); // all, category, brand, product
    const [selectedItems, setSelectedItems] = createSignal<string[]>([]);
    const [itemSearch, setItemSearch] = createSignal('');

    const discountTypes = [
        { id: 'percentage', label: 'Percentage Off' },
        { id: 'fixed', label: 'Fixed Amount Off' },
        { id: 'buy_x_get_y', label: 'Buy X Get Y' },
        { id: 'volume', label: 'Volume Discount' },
    ];

    const scopeTypes = [
        { id: 'all', label: 'All Products' },
        { id: 'category', label: 'Specific Categories' },
        { id: 'brand', label: 'Specific Brands' },
        // { id: 'product', label: 'Specific Products' }, // Omitting for now to keep it simple, can add later if needed or if requested specifically. The user asked for "product/products" so I should probably support it, but let's stick to Categories/Brands first as they are easier to list. Wait, user explicitly asked for "product/products". I better include it but maybe just top 20 search.
        { id: 'product', label: 'Specific Products' },
    ];

    // Resources
    const [categories] = createResource(async () => {
        try {
            const res = await api.get('/products/categories');
            return Array.isArray(res) ? res : (res as any)?.data || [];
        } catch (e) { return []; }
    });

    const [brands] = createResource(async () => {
        try {
            const res = await api.get('/products/brands');
            return Array.isArray(res) ? res : (res as any)?.data || [];
        } catch (e) { return []; }
    });

    const [products] = createResource(
        () => ({ search: itemSearch(), type: scopeType() }),
        async ({ search, type }) => {
            if (type !== 'product') return [];
            try {
                const res = await api.get('/products', { params: { search, limit: '20' } });
                return Array.isArray(res) ? res : (res as any)?.data || [];
            } catch (e) { return []; }
        }
    );

    const toggleItem = (id: string) => {
        const current = selectedItems();
        if (current.includes(id)) {
            setSelectedItems(current.filter(i => i !== id));
        } else {
            setSelectedItems([...current, id]);
        }
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: any = {
                ...formData(),
                value: formData().value ? Number(formData().value) : undefined,
                minQty: formData().minQty ? Number(formData().minQty) : undefined,
                freeQty: formData().freeQty ? Number(formData().freeQty) : undefined,
                minOrderAmount: formData().minOrderAmount ? Number(formData().minOrderAmount) : undefined,
                maxDiscountAmount: formData().maxDiscountAmount ? Number(formData().maxDiscountAmount) : undefined,
            };

            // Cleanup empty strings
            Object.keys(payload).forEach(key => {
                if (payload[key] === '' || payload[key] === null) delete payload[key];
            });

            // 1. Create Discount
            const res = await api.post('/discounts', payload);
            const discountId = res.id;

            // 2. Add Scopes
            if (scopeType() !== 'all') {
                const scopes = selectedItems().map(id => ({
                    scopeType: scopeType(),
                    scopeId: id
                }));

                await api.put(`/discounts/${discountId}/scopes`, { scopes });
            } else {
                // Determine if we need to send an 'all' scope explicitly. 
                // Usually 'all' is default if no scopes, but let's be explicit if the backend requires it.
                // The backend query logic: if scopes exist, checking them. If no scopes exist, is it "all"? 
                // Let's look at `discounts.ts`: `const scopes = await db...` 
                // `if (scopes.length > 0 && !hasAccessibleScope)`...
                // It seems if NO scopes are defined, it might not default to ALL automatically for sales reps unless we add a scopeType: 'all'.
                // Ideally, explicit is better.
                await api.put(`/discounts/${discountId}/scopes`, {
                    scopes: [{ scopeType: 'all' }]
                });
            }

            toast.success('Discount created successfully');
            props.onSuccess();
            props.onClose();
        } catch (error: any) {
            console.error('Failed to create discount:', error);
            toast.error(error.message || 'Failed to create discount');
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
                            <h2 class="text-xl font-bold text-white">New Discount</h2>
                            <p class="text-slate-400 text-sm mt-1">Create a new promotion rule</p>
                        </div>
                        <button
                            onClick={props.onClose}
                            class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-6">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div class="space-y-6">
                                {/* Basic Info */}
                                <div class="space-y-4">
                                    <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                        <Tag class="w-4 h-4 text-blue-400" /> Basic Information
                                    </h3>
                                    <div class="space-y-3">
                                        <div>
                                            <label class="text-xs font-medium text-slate-400 ml-1">Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData().name}
                                                onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
                                                placeholder="e.g. Summer Sale"
                                                class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label class="text-xs font-medium text-slate-400 ml-1">Type</label>
                                            <select
                                                value={formData().type}
                                                onChange={(e) => setFormData({ ...formData(), type: e.currentTarget.value })}
                                                class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none"
                                            >
                                                <For each={discountTypes}>
                                                    {(type) => <option value={type.id}>{type.label}</option>}
                                                </For>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Discount Rules */}
                                <div class="space-y-4">
                                    <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                        <Percent class="w-4 h-4 text-emerald-400" /> Discount Value
                                    </h3>
                                    <div class="p-4 bg-slate-950/50 rounded-xl border border-slate-800/50 space-y-4">
                                        <Show when={['percentage', 'fixed'].includes(formData().type)}>
                                            <div>
                                                <label class="text-xs font-medium text-slate-400 ml-1">
                                                    Value ({formData().type === 'percentage' ? '%' : '$'})
                                                </label>
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="0.01"
                                                    value={formData().value}
                                                    onInput={(e) => setFormData({ ...formData(), value: e.currentTarget.value })}
                                                    class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                />
                                            </div>
                                        </Show>

                                        <Show when={formData().type === 'percentage'}>
                                            <div>
                                                <label class="text-xs font-medium text-slate-400 ml-1">Max Amount ($)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={formData().maxDiscountAmount}
                                                    onInput={(e) => setFormData({ ...formData(), maxDiscountAmount: e.currentTarget.value })}
                                                    placeholder="Optional limit"
                                                    class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                />
                                            </div>
                                        </Show>

                                        <Show when={formData().type === 'buy_x_get_y'}>
                                            <div class="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label class="text-xs font-medium text-slate-400 ml-1">Buy Qty</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="1"
                                                        value={formData().minQty}
                                                        onInput={(e) => setFormData({ ...formData(), minQty: e.currentTarget.value })}
                                                        class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label class="text-xs font-medium text-slate-400 ml-1">Get Free</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="1"
                                                        value={formData().freeQty}
                                                        onInput={(e) => setFormData({ ...formData(), freeQty: e.currentTarget.value })}
                                                        class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </Show>

                                        <div>
                                            <label class="text-xs font-medium text-slate-400 ml-1">Min Order Amount ($)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={formData().minOrderAmount}
                                                onInput={(e) => setFormData({ ...formData(), minOrderAmount: e.currentTarget.value })}
                                                placeholder="Optional threshold"
                                                class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-6">
                                {/* Validity */}
                                <div class="space-y-4">
                                    <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                        <Calendar class="w-4 h-4 text-orange-400" /> Validity Period
                                    </h3>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="text-xs font-medium text-slate-400 ml-1">Start Date</label>
                                            <input
                                                type="datetime-local"
                                                value={formData().startsAt}
                                                onInput={(e) => setFormData({ ...formData(), startsAt: e.currentTarget.value })}
                                                class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label class="text-xs font-medium text-slate-400 ml-1">End Date</label>
                                            <input
                                                type="datetime-local"
                                                value={formData().endsAt}
                                                onInput={(e) => setFormData({ ...formData(), endsAt: e.currentTarget.value })}
                                                class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Scopes */}
                                <div class="space-y-4">
                                    <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                        <Layers class="w-4 h-4 text-purple-400" /> Applicability
                                    </h3>

                                    <div class="flex flex-wrap gap-2">
                                        <For each={scopeTypes}>
                                            {(st) => (
                                                <button
                                                    type="button"
                                                    onClick={() => { setScopeType(st.id); setSelectedItems([]); }}
                                                    class={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${scopeType() === st.id
                                                        ? 'bg-blue-600 border-blue-500 text-white'
                                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                                        }`}
                                                >
                                                    {st.label}
                                                </button>
                                            )}
                                        </For>
                                    </div>

                                    {/* Selection Area */}
                                    <Show when={scopeType() !== 'all'}>
                                        <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-3 h-[250px] flex flex-col">
                                            <div class="relative mb-3">
                                                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="text"
                                                    value={itemSearch()}
                                                    onInput={(e) => setItemSearch(e.currentTarget.value)}
                                                    placeholder={`Search ${scopeType()}...`}
                                                    class="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                            </div>

                                            <div class="flex-1 overflow-y-auto space-y-1 pr-1">
                                                <Show when={scopeType() === 'category'}>
                                                    <For each={categories().filter((c: any) => c.name.toLowerCase().includes(itemSearch().toLowerCase()))}>
                                                        {(item: any) => (
                                                            <div
                                                                onClick={() => toggleItem(item.id)}
                                                                class={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${selectedItems().includes(item.id) ? 'bg-blue-600/20 border border-blue-600/40' : 'hover:bg-slate-900'}`}
                                                            >
                                                                <span class={`text-sm ${selectedItems().includes(item.id) ? 'text-blue-200' : 'text-slate-300'}`}>{item.name}</span>
                                                                <Show when={selectedItems().includes(item.id)}>
                                                                    <Check class="w-4 h-4 text-blue-400" />
                                                                </Show>
                                                            </div>
                                                        )}
                                                    </For>
                                                </Show>

                                                <Show when={scopeType() === 'brand'}>
                                                    <For each={brands().filter((b: any) => b.name.toLowerCase().includes(itemSearch().toLowerCase()))}>
                                                        {(item: any) => (
                                                            <div
                                                                onClick={() => toggleItem(item.id)}
                                                                class={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${selectedItems().includes(item.id) ? 'bg-blue-600/20 border border-blue-600/40' : 'hover:bg-slate-900'}`}
                                                            >
                                                                <span class={`text-sm ${selectedItems().includes(item.id) ? 'text-blue-200' : 'text-slate-300'}`}>{item.name}</span>
                                                                <Show when={selectedItems().includes(item.id)}>
                                                                    <Check class="w-4 h-4 text-blue-400" />
                                                                </Show>
                                                            </div>
                                                        )}
                                                    </For>
                                                </Show>

                                                <Show when={scopeType() === 'product'}>
                                                    <Show when={products.loading}>
                                                        <div class="flex justify-center p-4"><Loader2 class="w-5 h-5 animate-spin text-slate-500" /></div>
                                                    </Show>
                                                    <For each={products()}>
                                                        {(item: any) => (
                                                            <div
                                                                onClick={() => toggleItem(item.id)}
                                                                class={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${selectedItems().includes(item.id) ? 'bg-blue-600/20 border border-blue-600/40' : 'hover:bg-slate-900'}`}
                                                            >
                                                                <div class="flex flex-col">
                                                                    <span class={`text-sm ${selectedItems().includes(item.id) ? 'text-blue-200' : 'text-slate-300'}`}>{item.name}</span>
                                                                    <span class="text-xs text-slate-500">{item.sku}</span>
                                                                </div>
                                                                <Show when={selectedItems().includes(item.id)}>
                                                                    <Check class="w-4 h-4 text-blue-400" />
                                                                </Show>
                                                            </div>
                                                        )}
                                                    </For>
                                                </Show>
                                            </div>

                                            <div class="mt-2 text-xs text-slate-500 text-right">
                                                {selectedItems().length} selected
                                            </div>
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </div>

                        <div class="pt-4 flex gap-3 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={props.onClose}
                                class="flex-1 py-3.5 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 active:scale-[0.98] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading()}
                                class="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Show when={!loading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                    <Save class="w-5 h-5" />
                                    Save Discount
                                </Show>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default AddDiscountModal;
