import { type Component, For, Show, createSignal, createResource, createMemo } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ArrowLeft, Plus, Trash2, Package, Loader2, Search, X, Check, Building2, Calendar, FileText } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';

interface Supplier {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    costPrice: string | null;
    stockQuantity: number;
    reorderPoint?: number;
}

interface CartItem {
    product: Product;
    quantity: number;
    unitPrice: number;
}

const CreatePurchaseOrder: Component = () => {
    const navigate = useNavigate();
    const { t } = useI18n();

    const [selectedSupplier, setSelectedSupplier] = createSignal<Supplier | null>(null);
    const [cartItems, setCartItems] = createSignal<CartItem[]>([]);
    const [expectedDate, setExpectedDate] = createSignal('');
    const [notes, setNotes] = createSignal('');
    const [submitting, setSubmitting] = createSignal(false);

    // Product search
    const [searchQuery, setSearchQuery] = createSignal('');
    const [showProductSearch, setShowProductSearch] = createSignal(false);
    const [showSupplierSelect, setShowSupplierSelect] = createSignal(false);

    // Fetch suppliers
    const [suppliers] = createResource(async () => {
        const result = await api<{ data: Supplier[] }>('/warehouse/suppliers');
        return (result as any)?.data ?? result ?? [];
    });

    // Search products
    const [searchResults] = createResource(
        () => searchQuery().length >= 2 ? searchQuery() : null,
        async (query) => {
            if (!query) return [];
            const result = await api<{ data: Product[] }>(`/warehouse/products/search?q=${encodeURIComponent(query)}&limit=20`);
            return (result as any)?.data ?? result ?? [];
        }
    );

    // Fetch low stock products for quick add
    const [lowStockProducts] = createResource(async () => {
        const result = await api<{ data: Product[] }>('/warehouse/products/low-stock');
        return (result as any)?.data ?? result ?? [];
    });

    const cartTotal = createMemo(() => {
        return cartItems().reduce((sum: number, item: CartItem) => sum + (item.quantity * item.unitPrice), 0);
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const addToCart = (product: Product) => {
        const existingIndex = cartItems().findIndex((item: CartItem) => item.product.id === product.id);
        if (existingIndex >= 0) {
            // Increase quantity
            const updated = [...cartItems()];
            updated[existingIndex].quantity += 1;
            setCartItems(updated);
        } else {
            // Add new item
            setCartItems([...cartItems(), {
                product,
                quantity: 1,
                unitPrice: parseFloat(product.costPrice || '0')
            }]);
        }
        setSearchQuery('');
        setShowProductSearch(false);
    };

    const updateQuantity = (index: number, quantity: number) => {
        if (quantity < 1) return;
        const updated = [...cartItems()];
        updated[index].quantity = quantity;
        setCartItems(updated);
    };

    const updatePrice = (index: number, price: number) => {
        if (price < 0) return;
        const updated = [...cartItems()];
        updated[index].unitPrice = price;
        setCartItems(updated);
    };

    const removeFromCart = (index: number) => {
        setCartItems(cartItems().filter((_: CartItem, i: number) => i !== index));
    };

    const handleSubmit = async () => {
        if (!selectedSupplier()) {
            showToast(t('warehouseApp.createPo.selectSupplierFirst'), 'error');
            return;
        }
        if (cartItems().length === 0) {
            showToast(t('warehouseApp.createPo.addProductsFirst'), 'error');
            return;
        }

        setSubmitting(true);
        try {
            const result = await api<{ data: { id: string; poNumber: string } }>('/warehouse/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: selectedSupplier()!.id,
                    expectedDate: expectedDate() || undefined,
                    notes: notes() || undefined,
                    items: cartItems().map((item: CartItem) => ({
                        productId: item.product.id,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice
                    }))
                })
            });

            const data = (result as any)?.data ?? result;
            showToast(`${t('warehouseApp.createPo.created')}: ${data.poNumber}`, 'success');
            navigate('/warehouse/receiving');
        } catch (error) {
            console.error('Failed to create PO:', error);
            showToast(t('warehouseApp.createPo.createFailed'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const isInCart = (productId: string) => {
        return cartItems().some((item: CartItem) => item.product.id === productId);
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    onClick={() => navigate('/warehouse/receiving')}
                    class="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
                >
                    <ArrowLeft class="w-5 h-5" />
                    {t('warehouseApp.receiving.back')}
                </button>
                <h1 class="text-xl font-bold text-white">{t('warehouseApp.createPo.title')}</h1>
                <p class="text-slate-500 text-sm">{t('warehouseApp.createPo.subtitle')}</p>
            </div>

            <div class="px-4 pt-4 space-y-4">
                {/* Supplier Selection */}
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                    <div class="flex items-center gap-2 mb-3">
                        <Building2 class="w-5 h-5 text-indigo-400" />
                        <h3 class="text-white font-semibold">{t('warehouseApp.createPo.supplier')}</h3>
                    </div>

                    <Show when={selectedSupplier()}>
                        <div class="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                            <div>
                                <div class="text-white font-medium">{selectedSupplier()!.name}</div>
                                <Show when={selectedSupplier()!.phone}>
                                    <div class="text-slate-400 text-sm">{selectedSupplier()!.phone}</div>
                                </Show>
                            </div>
                            <button
                                onClick={() => setShowSupplierSelect(true)}
                                class="text-indigo-400 text-sm hover:text-indigo-300"
                            >
                                {t('warehouseApp.common.change')}
                            </button>
                        </div>
                    </Show>

                    <Show when={!selectedSupplier()}>
                        <button
                            onClick={() => setShowSupplierSelect(true)}
                            class="w-full py-3 rounded-xl border-2 border-dashed border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-400 transition flex items-center justify-center gap-2"
                        >
                            <Plus class="w-5 h-5" />
                            {t('warehouseApp.createPo.selectSupplier')}
                        </button>
                    </Show>
                </div>

                {/* Expected Date & Notes */}
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <div>
                        <label class="flex items-center gap-2 text-slate-400 text-sm mb-2">
                            <Calendar class="w-4 h-4" />
                            {t('warehouseApp.createPo.expectedDate')}
                        </label>
                        <input
                            type="date"
                            value={expectedDate()}
                            onInput={(e) => setExpectedDate(e.currentTarget.value)}
                            class="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-white focus:outline-none focus:border-emerald-500/50"
                        />
                    </div>
                    <div>
                        <label class="flex items-center gap-2 text-slate-400 text-sm mb-2">
                            <FileText class="w-4 h-4" />
                            {t('warehouseApp.createPo.notes')}
                        </label>
                        <textarea
                            value={notes()}
                            onInput={(e) => setNotes(e.currentTarget.value)}
                            placeholder={t('warehouseApp.createPo.notesPlaceholder')}
                            class="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none"
                            rows={2}
                        />
                    </div>
                </div>

                {/* Products */}
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <Package class="w-5 h-5 text-emerald-400" />
                            <h3 class="text-white font-semibold">{t('warehouseApp.createPo.products')}</h3>
                            <Show when={cartItems().length > 0}>
                                <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                                    {cartItems().length}
                                </span>
                            </Show>
                        </div>
                        <button
                            onClick={() => setShowProductSearch(true)}
                            class="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                        >
                            <Plus class="w-5 h-5 text-emerald-400" />
                        </button>
                    </div>

                    {/* Cart Items */}
                    <Show when={cartItems().length > 0}>
                        <div class="space-y-2 mb-4">
                            <For each={cartItems()}>
                                {(item, index) => (
                                    <div class="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40">
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex-1 min-w-0">
                                                <div class="text-white font-medium text-sm truncate">{item.product.name}</div>
                                                <div class="text-slate-500 text-xs">{item.product.sku}</div>
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(index())}
                                                class="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition"
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="flex-1">
                                                <label class="text-slate-500 text-xs">{t('warehouseApp.receiving.quantity')}</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onInput={(e) => updateQuantity(index(), parseInt(e.currentTarget.value) || 1)}
                                                    class="w-full px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-700/60 text-white text-sm text-center focus:outline-none focus:border-emerald-500/50"
                                                />
                                            </div>
                                            <div class="flex-1">
                                                <label class="text-slate-500 text-xs">{t('warehouseApp.createPo.unitPrice')}</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.unitPrice}
                                                    onInput={(e) => updatePrice(index(), parseFloat(e.currentTarget.value) || 0)}
                                                    class="w-full px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-700/60 text-white text-sm text-center focus:outline-none focus:border-emerald-500/50"
                                                />
                                            </div>
                                            <div class="text-right">
                                                <label class="text-slate-500 text-xs">{t('warehouseApp.createPo.lineTotal')}</label>
                                                <div class="text-emerald-400 font-semibold text-sm">
                                                    {formatCurrency(item.quantity * item.unitPrice)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>

                    <Show when={cartItems().length === 0}>
                        <div class="py-8 text-center">
                            <Package class="w-10 h-10 text-slate-600 mx-auto mb-2" />
                            <p class="text-slate-500 text-sm">{t('warehouseApp.createPo.noProducts')}</p>
                        </div>
                    </Show>

                    {/* Low Stock Quick Add */}
                    <Show when={(lowStockProducts() || []).length > 0 && cartItems().length === 0}>
                        <div class="pt-3 border-t border-slate-800/60">
                            <div class="text-slate-400 text-xs mb-2">{t('warehouseApp.createPo.lowStockSuggestions')}</div>
                            <div class="flex flex-wrap gap-2">
                                <For each={(lowStockProducts() || []).slice(0, 5)}>
                                    {(product: Product) => (
                                        <button
                                            onClick={() => addToCart(product)}
                                            class="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20 transition"
                                        >
                                            + {product.name}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                    </Show>
                </div>

                {/* Total & Submit */}
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-slate-400">{t('warehouseApp.createPo.total')}</span>
                        <span class="text-2xl font-bold text-emerald-400">{formatCurrency(cartTotal())}</span>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={submitting() || !selectedSupplier() || cartItems().length === 0}
                        class="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500 transition"
                    >
                        <Show when={submitting()}>
                            <Loader2 class="w-5 h-5 animate-spin" />
                        </Show>
                        <Show when={!submitting()}>
                            <Check class="w-5 h-5" />
                        </Show>
                        {t('warehouseApp.createPo.createOrder')}
                    </button>
                </div>
            </div>

            {/* Supplier Selection Modal */}
            <Show when={showSupplierSelect()}>
                <div class="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
                    <div class="w-full max-w-lg bg-slate-900 rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h3 class="text-white font-semibold">{t('warehouseApp.createPo.selectSupplier')}</h3>
                            <button
                                onClick={() => setShowSupplierSelect(false)}
                                class="p-2 rounded-lg hover:bg-slate-800"
                            >
                                <X class="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4 space-y-2">
                            <Show when={suppliers.loading}>
                                <div class="flex items-center justify-center py-8">
                                    <Loader2 class="w-6 h-6 text-emerald-400 animate-spin" />
                                </div>
                            </Show>
                            <For each={suppliers() || []}>
                                {(supplier: Supplier) => (
                                    <button
                                        onClick={() => {
                                            setSelectedSupplier(supplier);
                                            setShowSupplierSelect(false);
                                        }}
                                        class="w-full p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 transition text-left"
                                    >
                                        <div class="text-white font-medium">{supplier.name}</div>
                                        <Show when={supplier.phone || supplier.contactPerson}>
                                            <div class="text-slate-400 text-sm">
                                                {supplier.contactPerson}{supplier.contactPerson && supplier.phone && ' • '}{supplier.phone}
                                            </div>
                                        </Show>
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Product Search Modal */}
            <Show when={showProductSearch()}>
                <div class="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
                    <div class="w-full max-w-lg bg-slate-900 rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div class="p-4 border-b border-slate-800">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-white font-semibold">{t('warehouseApp.createPo.addProduct')}</h3>
                                <button
                                    onClick={() => {
                                        setShowProductSearch(false);
                                        setSearchQuery('');
                                    }}
                                    class="p-2 rounded-lg hover:bg-slate-800"
                                >
                                    <X class="w-5 h-5 text-slate-400" />
                                </button>
                            </div>
                            <div class="relative">
                                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    value={searchQuery()}
                                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                                    placeholder={t('warehouseApp.receiving.searchProducts')}
                                    class="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                                    autofocus
                                />
                            </div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4 space-y-2">
                            <Show when={searchResults.loading}>
                                <div class="flex items-center justify-center py-8">
                                    <Loader2 class="w-6 h-6 text-emerald-400 animate-spin" />
                                </div>
                            </Show>
                            <Show when={!searchResults.loading && searchQuery().length < 2}>
                                <p class="text-slate-500 text-sm text-center py-4">{t('warehouseApp.createPo.typeToSearch')}</p>
                            </Show>
                            <Show when={!searchResults.loading && searchQuery().length >= 2 && (searchResults() || []).length === 0}>
                                <p class="text-slate-500 text-sm text-center py-4">{t('warehouseApp.inventory.noResults')}</p>
                            </Show>
                            <For each={searchResults() || []}>
                                {(product: Product) => (
                                    <button
                                        onClick={() => addToCart(product)}
                                        disabled={isInCart(product.id)}
                                        class="w-full p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition text-left flex items-center justify-between"
                                    >
                                        <div>
                                            <div class="text-white font-medium">{product.name}</div>
                                            <div class="text-slate-500 text-sm">{product.sku}</div>
                                        </div>
                                        <Show when={isInCart(product.id)}>
                                            <Check class="w-5 h-5 text-emerald-400" />
                                        </Show>
                                        <Show when={!isInCart(product.id) && product.costPrice}>
                                            <span class="text-emerald-400 text-sm">{formatCurrency(parseFloat(product.costPrice!))}</span>
                                        </Show>
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default CreatePurchaseOrder;
