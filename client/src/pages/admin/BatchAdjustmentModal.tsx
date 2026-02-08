import { type Component, createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { X, Loader2, Warehouse, Search, Plus, Trash2, Package } from 'lucide-solid';
import { api } from '../../lib/api';

interface BatchAdjustmentModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
}

interface AdjustmentItem {
    product: Product;
    quantity: string;
}

const BatchAdjustmentModal: Component<BatchAdjustmentModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const [searchQuery, setSearchQuery] = createSignal('');
    const [showProductSearch, setShowProductSearch] = createSignal(false);
    const [items, setItems] = createSignal<AdjustmentItem[]>([]);

    const [adjustmentType, setAdjustmentType] = createSignal('count');
    const [reason, setReason] = createSignal('');

    // Product search
    const [products] = createResource(
        () => searchQuery(),
        async (query) => {
            if (!query || query.length < 2) return [];
            const result = await api.get<{ data: Product[] }>('/products', { params: { search: query, limit: '20' } });
            return result?.data || result || [];
        }
    );

    // Filter out already added products
    const availableProducts = createMemo(() => {
        const addedIds = new Set(items().map(item => item.product.id));
        return ((products() as Product[]) || []).filter(p => !addedIds.has(p.id));
    });

    const handleAddProduct = (product: Product) => {
        setItems([...items(), {
            product,
            quantity: adjustmentType() === 'count' ? String(product.stockQuantity) : '0'
        }]);
        setSearchQuery('');
        setShowProductSearch(false);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items().filter((_, i) => i !== index));
    };

    const handleQuantityChange = (index: number, value: string) => {
        const updated = [...items()];
        updated[index].quantity = value;
        setItems(updated);
    };

    const totalItems = createMemo(() => items().length);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();

        if (items().length === 0) {
            setError('Please add at least one product');
            return;
        }

        if (!reason().trim()) {
            setError('Please provide a reason');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await api.post('/inventory/adjustments/batch', {
                type: adjustmentType(),
                reason: reason(),
                items: items().map(item => ({
                    productId: item.product.id,
                    quantity: parseInt(item.quantity) || 0,
                })),
            });

            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create batch adjustment');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                            <Warehouse class="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-white">Batch Stock Adjustment</h2>
                            <p class="text-sm text-slate-500">Adjust multiple products at once</p>
                        </div>
                    </div>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} class="flex-1 overflow-y-auto">
                    <div class="p-6 space-y-6">
                        {error() && (
                            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                {error()}
                            </div>
                        )}

                        {/* Adjustment Type & Reason */}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Adjustment Type</label>
                                <select
                                    value={adjustmentType()}
                                    onChange={(e) => setAdjustmentType(e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="count">Physical Count (Set exact quantity)</option>
                                    <option value="found">Found (Add to stock)</option>
                                    <option value="damage">Damage (Remove from stock)</option>
                                    <option value="loss">Loss (Remove from stock)</option>
                                    <option value="correction">Correction</option>
                                </select>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Reason *</label>
                                <input
                                    type="text"
                                    required
                                    value={reason()}
                                    onInput={(e) => setReason(e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g., Monthly inventory count"
                                />
                            </div>
                        </div>

                        {/* Product Search */}
                        <div class="space-y-3">
                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-300">Products ({totalItems()} added)</label>
                            </div>

                            <div class="relative">
                                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={searchQuery()}
                                    onInput={(e) => { setSearchQuery(e.currentTarget.value); setShowProductSearch(true); }}
                                    onFocus={() => setShowProductSearch(true)}
                                    class="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Search products to add..."
                                />
                                <Show when={showProductSearch() && availableProducts().length > 0}>
                                    <div class="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                                        <For each={availableProducts()}>
                                            {(product) => (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddProduct(product)}
                                                    class="w-full px-4 py-2 text-left hover:bg-slate-700 transition-colors flex items-center gap-3"
                                                >
                                                    <Plus class="w-4 h-4 text-emerald-400" />
                                                    <div class="flex-1 min-w-0">
                                                        <div class="text-white truncate">{product.name}</div>
                                                        <div class="text-xs text-slate-500">SKU: {product.sku} | Stock: {product.stockQuantity}</div>
                                                    </div>
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        </div>

                        {/* Added Products List */}
                        <Show when={items().length > 0}>
                            <div class="space-y-2">
                                <div class="grid grid-cols-12 gap-3 px-3 text-xs font-medium text-slate-500 uppercase">
                                    <div class="col-span-5">Product</div>
                                    <div class="col-span-2 text-center">Current</div>
                                    <div class="col-span-3 text-center">
                                        {adjustmentType() === 'count' ? 'New Qty' : 'Qty to Adjust'}
                                    </div>
                                    <div class="col-span-2 text-right">Action</div>
                                </div>

                                <div class="space-y-2 max-h-64 overflow-y-auto">
                                    <For each={items()}>
                                        {(item, index) => (
                                            <div class="grid grid-cols-12 gap-3 items-center p-3 bg-slate-800/50 rounded-xl">
                                                <div class="col-span-5 min-w-0">
                                                    <div class="text-white font-medium truncate">{item.product.name}</div>
                                                    <div class="text-xs text-slate-500">{item.product.sku}</div>
                                                </div>
                                                <div class="col-span-2 text-center">
                                                    <span class="text-slate-400">{item.product.stockQuantity}</span>
                                                </div>
                                                <div class="col-span-3">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.quantity}
                                                        onInput={(e) => handleQuantityChange(index(), e.currentTarget.value)}
                                                        class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>
                                                <div class="col-span-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(index())}
                                                        class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 class="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>

                        {/* Empty state */}
                        <Show when={items().length === 0}>
                            <div class="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                <Package class="w-10 h-10 text-slate-600 mx-auto mb-2" />
                                <p class="text-slate-500">No products added yet</p>
                                <p class="text-sm text-slate-600">Search and add products above</p>
                            </div>
                        </Show>
                    </div>

                    {/* Footer */}
                    <div class="p-6 border-t border-slate-800 flex justify-between items-center shrink-0 bg-slate-900">
                        <div class="text-sm text-slate-400">
                            <Show when={items().length > 0}>
                                {items().length} product{items().length !== 1 ? 's' : ''} will be adjusted
                            </Show>
                        </div>
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
                                disabled={submitting() || items().length === 0}
                                class="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {submitting() ? (
                                    <>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Warehouse class="w-4 h-4" />
                                        Apply Batch Adjustment
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BatchAdjustmentModal;
