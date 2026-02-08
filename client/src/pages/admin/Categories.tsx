import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Search, Tag, Loader2, RefreshCw, ChevronDown, ChevronRight, FolderOpen, Edit, Trash2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import AddCategoryModal from './AddCategoryModal';
import AddSubcategoryModal from './AddSubcategoryModal';

interface Category {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: string;
}

interface Subcategory {
    id: string;
    categoryId: string;
    name: string;
    isActive: boolean;
    createdAt: string;
}

const AdminCategories: Component = () => {
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [selectedCategory, setSelectedCategory] = createSignal<Category | null>(null);
    const [showSubcategoryModal, setShowSubcategoryModal] = createSignal<{ categoryId: string; categoryName: string; subcategory?: Subcategory } | null>(null);

    const [search, setSearch] = createSignal('');
    const [expandedCategory, setExpandedCategory] = createSignal<string | null>(null);

    const [categories, { refetch }] = createResource(async () => {
        const response = await api.get('/products/categories');
        return response;
    });

    const [subcategories, { refetch: refetchSubcategories }] = createResource(async () => {
        const response = await api.get<Subcategory[]>('/products/subcategories');
        return response || [];
    });

    const filteredCategories = () => {
        const query = search().toLowerCase();
        return categories()?.filter((c: any) =>
            c.name.toLowerCase().includes(query)
        ) || [];
    };

    const getSubcategories = (categoryId: string) => {
        return (subcategories() || []).filter((s: Subcategory) => s.categoryId === categoryId);
    };

    const toggleExpand = (categoryId: string) => {
        setExpandedCategory(current => current === categoryId ? null : categoryId);
    };

    const handleSubcategorySuccess = () => {
        refetchSubcategories();
    };

    const handleEditCategory = (category: Category) => {
        setSelectedCategory(category);
        setShowAddModal(true);
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm('Are you sure you want to delete this category?')) return;
        try {
            await api.delete(`/products/categories/${id}`);
            toast.success('Category deleted successfully');
            refetch();
        } catch (error: any) {
            console.error('Failed to delete category:', error);
            toast.error(error.message || 'Failed to delete category');
        }
    };

    const handleEditSubcategory = (category: Category, subcategory: Subcategory) => {
        setShowSubcategoryModal({
            categoryId: category.id,
            categoryName: category.name,
            subcategory
        });
    };

    const handleDeleteSubcategory = async (id: string) => {
        if (!confirm('Are you sure you want to delete this subcategory?')) return;
        try {
            await api.delete(`/products/subcategories/${id}`);
            toast.success('Subcategory deleted successfully');
            refetchSubcategories();
        } catch (error: any) {
            console.error('Failed to delete subcategory:', error);
            toast.error(error.message || 'Failed to delete subcategory');
        }
    };

    const handleCloseCategoryModal = () => {
        setShowAddModal(false);
        setSelectedCategory(null);
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Categories</h1>
                    <p class="text-slate-400 mt-1">Manage product categories and subcategories</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    Add Category
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
                        placeholder="Search categories..."
                        class="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                    />
                </div>
                <button
                    onClick={() => { refetch(); refetchSubcategories(); }}
                    class="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                    title="Refresh list"
                >
                    <RefreshCw class="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!categories.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading categories...</p>
                    </div>
                }>
                    <Show when={filteredCategories().length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Tag class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No categories found</p>
                            <p class="text-sm">Get started by creating a new category.</p>
                        </div>
                    }>
                        <div class="divide-y divide-slate-800">
                            <For each={filteredCategories()}>
                                {(category) => {
                                    const subs = () => getSubcategories(category.id);
                                    const isExpanded = () => expandedCategory() === category.id;
                                    return (
                                        <>
                                            {/* Category Row */}
                                            <div class="flex items-center hover:bg-slate-800/30 transition-colors group pr-4">
                                                <button
                                                    onClick={() => toggleExpand(category.id)}
                                                    class="p-4 text-slate-500 hover:text-white transition-colors"
                                                >
                                                    <Show when={isExpanded()} fallback={<ChevronRight class="w-5 h-5" />}>
                                                        <ChevronDown class="w-5 h-5" />
                                                    </Show>
                                                </button>
                                                <div class="flex-1 flex items-center gap-3 py-4">
                                                    <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                        <Tag class="w-5 h-5" />
                                                    </div>
                                                    <div class="flex-1">
                                                        <span class="font-semibold text-slate-200">{category.name}</span>
                                                        <div class="text-xs text-slate-500">
                                                            {subs().length} subcategories
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="px-4">
                                                    <span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${category.isActive
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                        {category.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>

                                                <div class="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleEditCategory(category)}
                                                        class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Edit Category"
                                                    >
                                                        <Edit class="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCategory(category.id)}
                                                        class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Delete Category"
                                                    >
                                                        <Trash2 class="w-4 h-4" />
                                                    </button>
                                                    <div class="w-px h-4 bg-slate-800 mx-2"></div>
                                                    <button
                                                        onClick={() => setShowSubcategoryModal({ categoryId: category.id, categoryName: category.name })}
                                                        class="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                                                    >
                                                        + Subcategory
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Subcategories (Expanded) */}
                                            <Show when={isExpanded() && subs().length > 0}>
                                                <div class="bg-slate-950/50">
                                                    <For each={subs()}>
                                                        {(sub) => (
                                                            <div class="flex items-center pl-14 pr-6 py-3 border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors group/sub">
                                                                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mr-3">
                                                                    <FolderOpen class="w-4 h-4" />
                                                                </div>
                                                                <span class="flex-1 text-slate-300">{sub.name}</span>
                                                                <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-4 ${sub.isActive
                                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                                    : 'bg-red-500/10 text-red-400'
                                                                    }`}>
                                                                    {sub.isActive ? 'Active' : 'Inactive'}
                                                                </span>

                                                                <div class="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => handleEditSubcategory(category, sub)}
                                                                        class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                                                        title="Edit Subcategory"
                                                                    >
                                                                        <Edit class="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteSubcategory(sub.id)}
                                                                        class="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                                        title="Delete Subcategory"
                                                                    >
                                                                        <Trash2 class="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </For>
                                                </div>
                                            </Show>

                                            {/* No subcategories message */}
                                            <Show when={isExpanded() && subs().length === 0}>
                                                <div class="bg-slate-950/50 py-4 pl-14 pr-6 border-t border-slate-800/50">
                                                    <p class="text-slate-500 text-sm">No subcategories. Click "+ Subcategory" to add one.</p>
                                                </div>
                                            </Show>
                                        </>
                                    );
                                }}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={showAddModal()}>
                <AddCategoryModal
                    category={selectedCategory()}
                    onClose={handleCloseCategoryModal}
                    onSuccess={() => refetch()}
                />
            </Show>

            <Show when={showSubcategoryModal()}>
                <AddSubcategoryModal
                    categoryId={showSubcategoryModal()!.categoryId}
                    categoryName={showSubcategoryModal()!.categoryName}
                    subcategory={showSubcategoryModal()!.subcategory}
                    onClose={() => setShowSubcategoryModal(null)}
                    onSuccess={handleSubcategorySuccess}
                />
            </Show>
        </div>
    );
};

export default AdminCategories;

