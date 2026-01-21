import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { X, Loader2, Warehouse, Search } from 'lucide-solid';
import { api } from '../../lib/api';

interface AddAdjustmentModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
}

const AddAdjustmentModal: Component<AddAdjustmentModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const [searchQuery, setSearchQuery] = createSignal('');
    const [selectedProduct, setSelectedProduct] = createSignal<Product | null>(null);
    const [showProductSearch, setShowProductSearch] = createSignal(false);

    const [adjustmentType, setAdjustmentType] = createSignal('count');
    const [quantity, setQuantity] = createSignal('');
    const [reason, setReason] = createSignal('');

    // Product search
    const [products] = createResource(
        () => searchQuery(),
        async (query) => {
            if (!query || query.length < 2) return [];
            const result = await api.get<{ data: Product[] }>('/products', { params: { search: query, limit: '10' } });
            return result?.data || result || [];
        }
    );

    const handleSelectProduct = (product: Product) => {
        setSelectedProduct(product);
        setSearchQuery('');
        setShowProductSearch(false);
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!selectedProduct()) {
            setError('Please select a product');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await api.post('/inventory/adjustments', {
                productId: selectedProduct()!.id,
                type: adjustmentType(),
                quantity: parseInt(quantity()) || 0,
                reason: reason(),
            });

            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create adjustment');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Warehouse class="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 class="text-xl font-bold text-white">Stock Adjustment</h2>
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

                    {/* Product Search */}
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Product *</label>
                        <Show when={!selectedProduct()} fallback={
                            <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                                <div>
                                    <div class="text-white font-medium">{selectedProduct()!.name}</div>
                                    <div class="text-xs text-slate-500">SKU: {selectedProduct()!.sku} | Stock: {selectedProduct()!.stockQuantity}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProduct(null)}
                                    class="text-slate-400 hover:text-white"
                                >
                                    <X class="w-4 h-4" />
                                </button>
                            </div>
                        }>
                            <div class="relative">
                                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={searchQuery()}
                                    onInput={(e) => { setSearchQuery(e.currentTarget.value); setShowProductSearch(true); }}
                                    onFocus={() => setShowProductSearch(true)}
                                    class="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Search products..."
                                />
                                <Show when={showProductSearch() && (products() as Product[])?.length > 0}>
                                    <div class="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                                        <For each={products() as Product[]}>
                                            {(product) => (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectProduct(product)}
                                                    class="w-full px-4 py-2 text-left hover:bg-slate-700 transition-colors"
                                                >
                                                    <div class="text-white">{product.name}</div>
                                                    <div class="text-xs text-slate-500">SKU: {product.sku} | Stock: {product.stockQuantity}</div>
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        </Show>
                    </div>

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
                        <label class="text-sm font-medium text-slate-300">
                            {adjustmentType() === 'count' ? 'New Quantity' : 'Quantity'} *
                        </label>
                        <input
                            type="number"
                            min="0"
                            required
                            value={quantity()}
                            onInput={(e) => setQuantity(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={adjustmentType() === 'count' ? 'Enter total count' : 'Enter quantity to adjust'}
                        />
                        <Show when={adjustmentType() === 'count' && selectedProduct()}>
                            <p class="text-xs text-slate-500">Current stock: {selectedProduct()!.stockQuantity}</p>
                        </Show>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Reason *</label>
                        <textarea
                            required
                            value={reason()}
                            onInput={(e) => setReason(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                            placeholder="Explain why this adjustment is being made..."
                        />
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
                            disabled={submitting() || !selectedProduct()}
                            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting() ? (
                                <>
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Adjustment'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddAdjustmentModal;
