import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Search, Package, Loader2, RefreshCw, Edit, Trash2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import AddBrandModal from './AddBrandModal';

const AdminBrands: Component = () => {
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [search, setSearch] = createSignal('');
    const [selectedBrand, setSelectedBrand] = createSignal<any>(null);

    const [brands, { refetch }] = createResource(async () => {
        const response = await api.get('/products/brands');
        return response;
    });

    const filteredBrands = () => {
        const query = search().toLowerCase();
        return brands()?.filter((b: any) =>
            b.name.toLowerCase().includes(query)
        ) || [];
    };

    const handleEdit = (brand: any) => {
        setSelectedBrand(brand);
        setShowAddModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this brand?')) return;
        try {
            await api.delete(`/products/brands/${id}`);
            toast.success('Brand deleted successfully');
            refetch();
        } catch (error: any) {
            console.error('Failed to delete brand:', error);
            toast.error(error.message || 'Failed to delete brand');
        }
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setSelectedBrand(null);
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Brands</h1>
                    <p class="text-slate-400 mt-1">Manage product brands</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    Add Brand
                </button>
            </div>

            {/* Search and Filter */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search brands..."
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
                <Show when={!brands.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading brands...</p>
                    </div>
                }>
                    <Show when={filteredBrands().length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Package class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No brands found</p>
                            <p class="text-sm">Get started by creating a new brand.</p>
                        </div>
                    }>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead class="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th class="px-6 py-4">Name</th>
                                        <th class="px-6 py-4">Status</th>
                                        <th class="px-6 py-4">Created</th>
                                        <th class="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800">
                                    <For each={filteredBrands()}>
                                        {(brand) => (
                                            <tr class="hover:bg-slate-800/50 transition-colors group">
                                                <td class="px-6 py-4">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                                            <Package class="w-5 h-5" />
                                                        </div>
                                                        <span class="font-semibold text-slate-200">{brand.name}</span>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${brand.isActive
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                        {brand.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-slate-500 font-mono text-sm">
                                                    {new Date(brand.createdAt).toLocaleDateString()}
                                                </td>
                                                <td class="px-6 py-4 text-right">
                                                    <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleEdit(brand)}
                                                            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit class="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(brand.id)}
                                                            class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 class="w-4 h-4" />
                                                        </button>
                                                    </div>
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
                <AddBrandModal
                    brand={selectedBrand()}
                    onClose={handleCloseModal}
                    onSuccess={() => refetch()}
                />
            </Show>
        </div>
    );
};

export default AdminBrands;

