import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { api } from '../../lib/api';
import { Search, Loader2, X, Download, Package } from 'lucide-solid';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    categories: any[];
    brands: any[];
}

const ImportMasterModal: Component<Props> = (props) => {
    const [search, setSearch] = createSignal('');
    const [selectedProduct, setSelectedProduct] = createSignal<any>(null);
    const [step, setStep] = createSignal<'list' | 'config'>('list');

    // Config Form
    const [config, setConfig] = createSignal({
        categoryId: '',
        subcategoryId: '',
        brandId: '', // Default to standard brand?
        price: '',
        costPrice: '',
        stock: '0'
    });
    const [submitting, setSubmitting] = createSignal(false);

    // Fetch Master Products
    const [masterProducts] = createResource(search, async (s) => {
        const result = await api<any[]>(`/products/master-catalog?search=${s}&limit=20`);
        return result || [];
    });

    const [subcategories] = createResource(async () => {
        // Optimization: pass this down from parent instead to avoid refetch? 
        // For now, simple fetch is fine
        return await api<any[]>('/products/subcategories');
    });

    const filteredSubcategories = () => {
        if (!config().categoryId) return [];
        return subcategories()?.filter((s: any) => s.categoryId === config().categoryId) || [];
    };

    const handleSelect = (product: any) => {
        setSelectedProduct(product);
        // Pre-fill some defaults if possible
        setConfig(c => ({ ...c, price: '0', costPrice: '0', stock: '0' }));
        setStep('config');
    };

    const handleImport = async (e: Event) => {
        e.preventDefault();
        if (!selectedProduct()) return;
        setSubmitting(true);

        try {
            await api.post('/products/import-master', {
                masterProductId: selectedProduct().id,
                subcategoryId: config().subcategoryId,
                brandId: config().brandId,
                price: parseFloat(config().price),
                costPrice: config().costPrice ? parseFloat(config().costPrice) : 0,
                stock: parseInt(config().stock)
            });
            props.onSuccess();
            props.onClose();
            // Reset
            setStep('list');
            setSelectedProduct(null);
        } catch (error) {
            console.error(error);
            alert('Failed to import product');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div class="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                        <h2 class="text-xl font-bold text-white">Import from Master Catalog</h2>
                        <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                            <X class="w-6 h-6" />
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto p-6">
                        <Show when={step() === 'list'}>
                            {/* Search */}
                            <div class="relative mb-6">
                                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={search()}
                                    onInput={(e) => setSearch(e.currentTarget.value)}
                                    placeholder="Search global products..."
                                    class="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    autofocus
                                />
                            </div>

                            {/* List */}
                            <div class="space-y-2">
                                <For each={masterProducts()}>
                                    {(product) => (
                                        <div class="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-800 hover:border-blue-500/30 transition-colors">
                                            <div class="flex items-center gap-3">
                                                <div class="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                                    <Show when={product.imageUrl} fallback={<Package class="w-6 h-6 text-slate-600" />}>
                                                        <img src={product.imageUrl} alt="" class="w-full h-full object-cover" />
                                                    </Show>
                                                </div>
                                                <div>
                                                    <div class="font-medium text-white">{product.name}</div>
                                                    <div class="text-sm text-slate-500 font-mono">{product.sku}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleSelect(product)}
                                                class="px-3 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                                Select
                                            </button>
                                        </div>
                                    )}
                                </For>
                                <Show when={!masterProducts.loading && masterProducts()?.length === 0}>
                                    <div class="text-center py-12 text-slate-500">
                                        No products found matching "{search()}"
                                    </div>
                                </Show>
                                <Show when={masterProducts.loading}>
                                    <div class="flex justify-center py-12">
                                        <Loader2 class="w-8 h-8 text-blue-500 animate-spin" />
                                    </div>
                                </Show>
                            </div>
                        </Show>

                        <Show when={step() === 'config'}>
                            <div class="mb-6 bg-slate-800/50 p-4 rounded-xl flex items-center gap-4">
                                <div class="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                    <Show when={selectedProduct()?.imageUrl} fallback={<Package class="w-8 h-8 text-slate-600" />}>
                                        <img src={selectedProduct()?.imageUrl} alt="" class="w-full h-full object-cover" />
                                    </Show>
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-white">{selectedProduct()?.name}</h3>
                                    <p class="text-slate-400 text-sm">{selectedProduct()?.sku} • {selectedProduct()?.category || 'General'}</p>
                                </div>
                            </div>

                            <form onSubmit={handleImport} class="space-y-4">
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-slate-300 mb-1">Category *</label>
                                        <select
                                            required
                                            class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                                            value={config().categoryId}
                                            onChange={(e) => setConfig(c => ({ ...c, categoryId: e.currentTarget.value, subcategoryId: '' }))}
                                        >
                                            <option value="">Select Category</option>
                                            <For each={props.categories}>
                                                {cat => <option value={cat.id}>{cat.name}</option>}
                                            </For>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-slate-300 mb-1">Subcategory *</label>
                                        <select
                                            required
                                            class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white disabled:opacity-50"
                                            value={config().subcategoryId}
                                            onChange={(e) => setConfig(c => ({ ...c, subcategoryId: e.currentTarget.value }))}
                                            disabled={!config().categoryId}
                                        >
                                            <option value="">Select Subcategory</option>
                                            <For each={filteredSubcategories()}>
                                                {sub => <option value={sub.id}>{sub.name}</option>}
                                            </For>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-slate-300 mb-1">Brand *</label>
                                    <select
                                        required
                                        class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                                        value={config().brandId}
                                        onChange={(e) => setConfig(c => ({ ...c, brandId: e.currentTarget.value }))}
                                    >
                                        <option value="">Select Brand</option>
                                        <For each={props.brands}>
                                            {b => <option value={b.id}>{b.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="grid grid-cols-3 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-slate-300 mb-1">Price *</label>
                                        <input
                                            type="number"
                                            required
                                            step="0.01"
                                            class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                                            value={config().price}
                                            onInput={(e) => setConfig(c => ({ ...c, price: e.currentTarget.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-slate-300 mb-1">Cost Price</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                                            value={config().costPrice}
                                            onInput={(e) => setConfig(c => ({ ...c, costPrice: e.currentTarget.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-slate-300 mb-1">Initial Stock</label>
                                        <input
                                            type="number"
                                            class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                                            value={config().stock}
                                            onInput={(e) => setConfig(c => ({ ...c, stock: e.currentTarget.value }))}
                                        />
                                    </div>
                                </div>

                                <div class="flex justify-end gap-3 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setStep('list')}
                                        class="px-4 py-2 text-slate-400 hover:text-white"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting()}
                                        class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                                    >
                                        <Show when={submitting()} fallback={<Download class="w-4 h-4" />}>
                                            <Loader2 class="w-4 h-4 animate-spin" />
                                        </Show>
                                        Import Product
                                    </button>
                                </div>
                            </form>
                        </Show>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default ImportMasterModal;
