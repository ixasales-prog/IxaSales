import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { api } from '../../lib/api';
import {
    Search,
    Plus,
    Package,
    Edit,
    Trash2,
    X,
    Image,
    Save,
    LayoutGrid,
    Table as TableIcon,
    List,
    ChevronLeft,
    ChevronRight
} from 'lucide-solid';

const MasterCatalog: Component = () => {
    const [page, setPage] = createSignal(0);
    const [search, setSearch] = createSignal('');
    const [isModalOpen, setIsModalOpen] = createSignal(false);
    const [editingProduct, setEditingProduct] = createSignal<any>(null);
    const storedView = localStorage.getItem('master_catalog_view_mode') as 'grid' | 'table' | 'list' | null;
    const [viewMode, setViewMode] = createSignal<'grid' | 'table' | 'list'>(storedView || 'table');

    createEffect(() => {
        localStorage.setItem('master_catalog_view_mode', viewMode());
    });

    // Form State
    const [formData, setFormData] = createSignal({
        name: '',
        sku: '',
        barcode: '',
        category: '',
        description: '',
        imageUrl: ''
    });

    const [products, { refetch }] = createResource(
        () => ({ page: page(), search: search() }),
        async ({ page, search }) => {
            const qs = new URLSearchParams({
                limit: '50',
                offset: String(page * 50),
                search
            });
            return await api<any[]>(`/super/master-products?${qs}`);
        }
    );

    const handleEdit = (product: any) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            sku: product.sku,
            barcode: product.barcode || '',
            category: product.category || '',
            description: product.description || '',
            imageUrl: product.imageUrl || ''
        });
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingProduct(null);
        setFormData({
            name: '', // Placeholder: 'Coca Cola 1.5L' (Uzbek: 'Coca Cola 1.5L')
            sku: '',
            barcode: '',
            category: '',
            description: '',
            imageUrl: ''
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        const data = formData();

        try {
            if (editingProduct()) {
                await api.put(`/super/master-products/${editingProduct().id}`, data);
            } else {
                await api.post('/super/master-products', data);
            }
            setIsModalOpen(false);
            refetch();
        } catch (error) {
            console.error('Failed to save product:', error);
            alert('Error saving product. SKU might be duplicate.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this master product? This will not affect existing tenant products.')) return;

        try {
            await api.delete(`/super/master-products/${id}`);
            refetch();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    return (
        <div class="p-6 lg:p-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <Package class="w-8 h-8 text-blue-500" />
                        Master Catalog
                    </h1>
                    <p class="text-slate-400">Manage global products for all tenants</p>
                </div>
                <button
                    onClick={handleAdd}
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                    <Plus class="w-4 h-4" />
                    Add Product
                </button>
            </div>

            {/* Controls */}
            <div class="flex flex-col sm:flex-row gap-4 mb-6">
                {/* Search */}
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search products, SKU, or barcode..."
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        class="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>

                <div class="flex items-center gap-4">
                    {/* View Toggle */}
                    <div class="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Grid View"
                        >
                            <LayoutGrid class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Table View"
                        >
                            <TableIcon class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'list' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="List View"
                        >
                            <List class="w-5 h-5" />
                        </button>
                    </div>

                    {/* Pagination */}
                    <div class="flex gap-2">
                        <button
                            disabled={page() === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft class="w-5 h-5" />
                        </button>
                        <button
                            disabled={products() && products()!.length < 50}
                            onClick={() => setPage(p => p + 1)}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronRight class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Views */}
            <div class="space-y-4">
                {/* TABLE VIEW */}
                <Show when={viewMode() === 'table'}>
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="border-b border-slate-800 text-xs uppercase text-slate-500 font-medium bg-slate-950/50">
                                        <th class="p-4 pl-6">Product</th>
                                        <th class="p-4">SKU / Barcode</th>
                                        <th class="p-4">Category</th>
                                        <th class="p-4 text-right pr-6">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <Show when={!products.loading} fallback={
                                        <tr><td colspan="4" class="p-8 text-center text-slate-500">Loading...</td></tr>
                                    }>
                                        {products()?.map((product) => (
                                            <tr class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                                                <td class="p-4 pl-6">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                            <Show when={product.imageUrl} fallback={<Package class="w-5 h-5 text-slate-600" />}>
                                                                <img src={product.imageUrl} alt={product.name} class="w-full h-full object-cover" />
                                                            </Show>
                                                        </div>
                                                        <div>
                                                            <div class="font-medium text-white">{product.name}</div>
                                                            <div class="text-xs text-slate-500 truncate max-w-[200px]">{product.description}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="p-4">
                                                    <div class="text-sm text-slate-300 font-mono">{product.sku}</div>
                                                    <div class="text-xs text-slate-500 font-mono">{product.barcode}</div>
                                                </td>
                                                <td class="p-4">
                                                    <span class="px-2 py-1 rounded-md bg-slate-800 text-xs text-slate-300 border border-slate-700">
                                                        {product.category || 'General'}
                                                    </span>
                                                </td>
                                                <td class="p-4 pr-6 text-right">
                                                    <div class="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEdit(product)}
                                                            class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit class="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(product.id)}
                                                            class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 class="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {products()?.length === 0 && (
                                            <tr>
                                                <td colspan="4" class="p-8 text-center text-slate-500">
                                                    No master products found. Add one to get started.
                                                </td>
                                            </tr>
                                        )}
                                    </Show>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Show>

                {/* GRID VIEW */}
                <Show when={viewMode() === 'grid'}>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <Show when={!products.loading} fallback={<div class="col-span-4 p-8 text-center text-slate-500">Loading...</div>}>
                            {products()?.map((product) => (
                                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-all group flex flex-col">
                                    <div class="flex items-start justify-between mb-3">
                                        <div class="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                            <Show when={product.imageUrl} fallback={<Package class="w-8 h-8 text-slate-600" />}>
                                                <img src={product.imageUrl} alt={product.name} class="w-full h-full object-cover" />
                                            </Show>
                                        </div>
                                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(product)} class="p-2 text-blue-400 bg-blue-500/10 rounded-lg hover:bg-blue-500/20">
                                                <Edit class="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDelete(product.id)} class="p-2 text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20">
                                                <Trash2 class="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div class="flex-1">
                                        <h3 class="font-medium text-white mb-1">{product.name}</h3>
                                        <p class="text-xs text-slate-500 line-clamp-2 mb-3">{product.description}</p>

                                        <div class="flex flex-wrap gap-2 mb-3">
                                            <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                                                {product.category || 'General'}
                                            </span>
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-800 mt-auto">
                                        <div>
                                            <div class="text-slate-500">SKU</div>
                                            <div class="text-slate-200 font-mono truncate" title={product.sku}>{product.sku}</div>
                                        </div>
                                        <div>
                                            <div class="text-slate-500">Barcode</div>
                                            <div class="text-slate-200 font-mono truncate" title={product.barcode}>{product.barcode || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </Show>
                    </div>
                </Show>

                {/* LIST VIEW */}
                <Show when={viewMode() === 'list'}>
                    <div class="space-y-1">
                        <Show when={!products.loading} fallback={<div class="p-8 text-center text-slate-500">Loading...</div>}>
                            {products()?.map((product) => (
                                <div class="group flex items-center justify-between p-2 pl-4 bg-slate-900/40 border border-slate-800/40 rounded-lg hover:border-slate-700 hover:bg-slate-800/60 transition-all">
                                    <div class="flex items-center gap-4 flex-1 min-w-0">
                                        <div class="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-700/50">
                                            <Show when={product.imageUrl} fallback={<Package class="w-4 h-4 text-slate-600" />}>
                                                <img src={product.imageUrl} alt={product.name} class="w-full h-full object-cover" />
                                            </Show>
                                        </div>
                                        <div class="min-w-0 w-48 lg:w-64">
                                            <div class="font-medium text-white truncate">{product.name}</div>
                                            <div class="text-xs text-slate-500 truncate">{product.description}</div>
                                        </div>

                                        <div class="hidden sm:block text-xs font-mono text-slate-400 w-32 truncate">{product.sku}</div>

                                        <div class="hidden md:block">
                                            <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                                                {product.category || 'General'}
                                            </span>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2 pl-4 border-l border-slate-800/50">
                                        <button
                                            onClick={() => handleEdit(product)}
                                            class="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                            title="Edit"
                                        >
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id)}
                                            class="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </Show>
                    </div>
                </Show>
            </div>

            <div class="flex justify-end gap-2 mt-4">
                <button
                    disabled={page() === 0}
                    class="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 disabled:opacity-50 hover:text-white"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                    Previous
                </button>
                <button
                    class="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white"
                    onClick={() => setPage(p => p + 1)}
                >
                    Next
                </button>
            </div>

            {/* Edit/Create Modal */}
            <Show when={isModalOpen()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl relative">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            class="absolute right-4 top-4 text-slate-400 hover:text-white"
                        >
                            <X class="w-5 h-5" />
                        </button>

                        <div class="p-6 border-b border-slate-800">
                            <h2 class="text-xl font-bold text-white">
                                {editingProduct() ? 'Edit Master Product' : 'Add Master Product'}
                            </h2>
                        </div>

                        <form onSubmit={handleSubmit} class="p-6 space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1">Product Name (Uzbek)</label>
                                <input
                                    type="text"
                                    required
                                    class="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    placeholder="e.g. Coca Cola 1.5L, Choy Yashil 100g"
                                    value={formData().name}
                                    onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
                                />
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-slate-400 mb-1">SKU</label>
                                    <input
                                        type="text"
                                        required
                                        class="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                        value={formData().sku}
                                        onInput={(e) => setFormData({ ...formData(), sku: e.currentTarget.value })}
                                    />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-400 mb-1">Barcode</label>
                                    <input
                                        type="text"
                                        class="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                        value={formData().barcode}
                                        onInput={(e) => setFormData({ ...formData(), barcode: e.currentTarget.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1">Category</label>
                                <input
                                    type="text"
                                    class="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    placeholder="e.g. Ichimliklar, Oziq-ovqat"
                                    value={formData().category}
                                    onInput={(e) => setFormData({ ...formData(), category: e.currentTarget.value })}
                                />
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1">Description</label>
                                <textarea
                                    class="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none h-24 resize-none"
                                    value={formData().description}
                                    onInput={(e) => setFormData({ ...formData(), description: e.currentTarget.value })}
                                />
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1">Image URL</label>
                                <div class="relative">
                                    <Image class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="url"
                                        class="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                        placeholder="https://..."
                                        value={formData().imageUrl}
                                        onInput={(e) => setFormData({ ...formData(), imageUrl: e.currentTarget.value })}
                                    />
                                </div>
                            </div>

                            <div class="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    class="px-4 py-2 text-slate-400 hover:text-white font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center gap-2"
                                >
                                    <Save class="w-4 h-4" />
                                    Save Product
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default MasterCatalog;
