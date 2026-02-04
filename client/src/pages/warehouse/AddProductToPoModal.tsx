import { type Component, createSignal, Show, For, createResource } from 'solid-js';
import { X, Plus, Search, Package, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';

interface Product {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    costPrice: string | null;
    price: string | null;
    stockQuantity: number;
}

interface AddProductToPoModalProps {
    poId: string;
    onClose: () => void;
    onProductAdded: () => void;
}

const AddProductToPoModal: Component<AddProductToPoModalProps> = (props) => {
    const { t } = useI18n();
    const [searchQuery, setSearchQuery] = createSignal('');
    const [selectedProduct, setSelectedProduct] = createSignal<Product | null>(null);
    const [quantity, setQuantity] = createSignal(1);
    const [adding, setAdding] = createSignal(false);

    const [searchResults] = createResource(
        () => searchQuery().length >= 2 ? searchQuery() : null,
        async (query) => {
            if (!query) return [];
            const result = await api<{ data: Product[] }>(`/warehouse/products/search?q=${encodeURIComponent(query)}`);
            return (result as any)?.data ?? result ?? [];
        }
    );

    const handleAddProduct = async () => {
        const product = selectedProduct();
        if (!product) return;

        setAdding(true);
        try {
            await api(`/warehouse/receiving/${props.poId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    quantity: quantity()
                })
            });

            showToast(t('warehouseApp.receiving.productAdded'), 'success');
            props.onProductAdded();
            props.onClose();
        } catch (error) {
            console.error('Failed to add product:', error);
            showToast(t('warehouseApp.receiving.addProductFailed'), 'error');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <div class="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700/50 max-h-[90vh] flex flex-col animate-slide-up">
                {/* Header */}
                <div class="flex items-center justify-between p-4 border-b border-slate-800/60">
                    <h2 class="text-lg font-bold text-white">{t('warehouseApp.receiving.addProduct')}</h2>
                    <button
                        onClick={props.onClose}
                        class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
                    >
                        <X class="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Search Input */}
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t('warehouseApp.receiving.searchProducts')}
                            value={searchQuery()}
                            onInput={(e) => {
                                setSearchQuery(e.currentTarget.value);
                                setSelectedProduct(null);
                            }}
                            class="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
                        />
                    </div>

                    {/* Search Results */}
                    <Show when={searchQuery().length >= 2 && !selectedProduct()}>
                        <div class="space-y-2 max-h-60 overflow-y-auto">
                            <Show when={searchResults.loading}>
                                <div class="flex items-center justify-center py-4">
                                    <Loader2 class="w-6 h-6 text-emerald-400 animate-spin" />
                                </div>
                            </Show>

                            <Show when={!searchResults.loading && (searchResults() || []).length === 0}>
                                <div class="text-center text-slate-500 py-4">
                                    {t('warehouseApp.inventory.noResults')}
                                </div>
                            </Show>

                            <For each={searchResults() || []}>
                                {(product) => (
                                    <button
                                        onClick={() => setSelectedProduct(product)}
                                        class="w-full p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-left hover:bg-slate-800/60 hover:border-slate-600/60 transition"
                                    >
                                        <div class="flex items-center gap-3">
                                            <Package class="w-5 h-5 text-emerald-400" />
                                            <div class="flex-1">
                                                <div class="text-white font-medium">{product.name}</div>
                                                <div class="text-slate-400 text-xs">
                                                    {product.sku && <span>SKU: {product.sku}</span>}
                                                    {product.sku && product.barcode && <span> • </span>}
                                                    {product.barcode && <span>{product.barcode}</span>}
                                                </div>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-emerald-400 font-medium text-sm">
                                                    {parseFloat(product.costPrice || '0').toLocaleString()}
                                                </div>
                                                <div class="text-slate-500 text-xs">
                                                    {t('warehouseApp.inventory.available')}: {product.stockQuantity}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>

                    {/* Selected Product */}
                    <Show when={selectedProduct()}>
                        <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                            <div class="flex items-start gap-3">
                                <Package class="w-6 h-6 text-emerald-400 mt-0.5" />
                                <div class="flex-1">
                                    <div class="text-white font-medium">{selectedProduct()!.name}</div>
                                    <div class="text-slate-400 text-sm">
                                        {selectedProduct()!.sku && <span>SKU: {selectedProduct()!.sku}</span>}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedProduct(null)}
                                    class="p-1 rounded text-slate-400 hover:text-white transition"
                                >
                                    <X class="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Quantity Input */}
                        <div class="space-y-2">
                            <label class="text-slate-400 text-sm">{t('warehouseApp.receiving.quantity')}</label>
                            <div class="flex items-center gap-3">
                                <button
                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                    class="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white text-xl font-bold hover:bg-slate-700/60 transition"
                                >
                                    -
                                </button>
                                <input
                                    type="number"
                                    min="1"
                                    value={quantity()}
                                    onInput={(e) => setQuantity(Math.max(1, parseInt(e.currentTarget.value) || 1))}
                                    class="flex-1 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white text-center text-xl font-bold focus:outline-none focus:border-emerald-500/50 transition"
                                />
                                <button
                                    onClick={() => setQuantity(q => q + 1)}
                                    class="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white text-xl font-bold hover:bg-slate-700/60 transition"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </Show>
                </div>

                {/* Footer */}
                <div class="p-4 border-t border-slate-800/60">
                    <button
                        onClick={handleAddProduct}
                        disabled={!selectedProduct() || adding()}
                        class="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500 transition"
                    >
                        {adding() ? (
                            <Loader2 class="w-5 h-5 animate-spin" />
                        ) : (
                            <Plus class="w-5 h-5" />
                        )}
                        {t('warehouseApp.receiving.addProduct')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddProductToPoModal;
