import { type Component, For, Show, createSignal, createResource, createEffect, createMemo } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
    Search,
    Plus,
    Filter,
    ChevronLeft,
    ChevronRight,
    Package,
    Loader2,
    Edit2,
    Trash2,
    MoreVertical,
    X,
    Download
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import { getImageUrl } from '../../utils/formatters';
import ImportMasterModal from '../../components/products/ImportMasterModal';
import ImageUploader from '../../components/ImageUploader';
import ImageLightbox from '../../components/ImageLightbox';

interface Product {
    id: string;
    name: string;
    sku: string;
    price: string;
    costPrice: string | null;
    stockQuantity: number;
    unit: string;
    isActive: boolean;
    brandName: string | null;
    categoryName: string | null;
    subcategoryName: string | null;
    // Added fields for edit
    description?: string;
    subcategoryId: string;
    categoryId: string;
    brandId: string;
    imageUrl?: string | null;
}

const Products: Component = () => {
    const [searchQuery, setSearchQuery] = createSignal('');
    const [page, setPage] = createSignal(1);
    const [debouncedSearch, setDebouncedSearch] = createSignal('');

    // Add Product Modal State
    const [showCreateModal, setShowCreateModal] = createSignal(false);
    const [showImportModal, setShowImportModal] = createSignal(false);
    const [submitting, setSubmitting] = createSignal(false);
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [error, setError] = createSignal<string | null>(null);

    // Multi-image support
    interface UploadedImage {
        id?: string;
        url: string;
        thumbnailUrl?: string;
        mediumUrl?: string;
        isPrimary?: boolean;
        altText?: string;
        sortOrder?: number;
    }
    const [productImages, setProductImages] = createSignal<UploadedImage[]>([]);

    // Lightbox state
    const [lightboxOpen, setLightboxOpen] = createSignal(false);
    const [lightboxIndex, setLightboxIndex] = createSignal(0);
    const [lightboxImages, setLightboxImages] = createSignal<{ url: string; altText?: string }[]>([]);

    const [formData, setFormData] = createStore({
        name: '',
        sku: '',
        description: '',
        categoryId: '',
        subcategoryId: '',
        brandId: '',
        unit: 'piece',
        price: '',
        costPrice: ''
    });

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    createEffect(() => {
        const query = searchQuery();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            setDebouncedSearch(query);
            setPage(1);
        }, 300);
    });

    // Fetch products
    const [productsResponse, { refetch }] = createResource(
        () => ({ page: page(), search: debouncedSearch() }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: '15'
            };
            if (params.search) queryParams.search = params.search;
            const result = await api<{ data: Product[]; meta: any }>('/products', { params: queryParams });
            return result;
        }
    );

    // Fetch Metadata
    const [categories] = createResource(async () => {
        const result = await api<any[]>('/products/categories');
        return result || [];
    });

    const [subcategories] = createResource(async () => {
        const result = await api<any[]>('/products/subcategories');
        return result || [];
    });

    const [brands] = createResource(async () => {
        const result = await api<any[]>('/products/brands');
        return result || [];
    });

    // Derived state for filtered subcategories
    const filteredSubcategories = createMemo(() => {
        const all = subcategories() || [];
        if (!formData.categoryId) return [];
        return all.filter(s => s.categoryId === formData.categoryId);
    });

    // Reset subcategory when category changes
    const handleCategoryChange = (e: Event) => {
        const value = (e.currentTarget as HTMLSelectElement).value;
        setFormData({
            categoryId: value,
            subcategoryId: ''
        });
    };

    // Open lightbox for a product
    const openLightbox = (imageUrl: string) => {
        setLightboxImages([{ url: imageUrl }]);
        setLightboxIndex(0);
        setLightboxOpen(true);
    };

    const handleEdit = (product: Product) => {
        setEditingId(product.id);

        // Load product images (if product has imageUrl, create initial image)
        if (product.imageUrl) {
            setProductImages([{
                url: product.imageUrl,
                mediumUrl: product.imageUrl,
                isPrimary: true,
                sortOrder: 0
            }]);
        } else {
            setProductImages([]);
        }

        // Find category from subcategory if needed
        let catId = product.categoryId || '';
        if (!catId && product.subcategoryId) {
            const sub = subcategories()?.find(s => s.id === product.subcategoryId);
            if (sub) catId = sub.categoryId;
        }

        setFormData({
            name: product.name,
            sku: product.sku,
            description: product.description || '',
            categoryId: catId,
            subcategoryId: product.subcategoryId || '',
            brandId: product.brandId || '',
            unit: product.unit || 'piece',
            price: product.price,
            costPrice: product.costPrice || ''
        });
        setShowCreateModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            await api(`/products/${id}`, { method: 'DELETE' });
            refetch();
        } catch (err: any) {
            alert(err.message || 'Failed to delete product');
        }
    };

    const products = () => (productsResponse() as any)?.data || productsResponse() || [];
    const meta = () => (productsResponse() as any)?.meta || { page: 1, totalPages: 1, total: 0 };

    // formatCurrency is now imported from settings store

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // Get primary image URL from uploaded images
            const primaryImage = productImages().find(img => img.isPrimary) || productImages()[0];
            const imageUrl = primaryImage?.mediumUrl || primaryImage?.url || undefined;



            // Save product first
            const productResult: any = await api(editingId() ? `/products/${editingId()}` : '/products', {
                method: editingId() ? 'PUT' : 'POST',
                body: JSON.stringify({
                    name: formData.name,
                    sku: formData.sku,
                    description: formData.description || undefined,
                    subcategoryId: formData.subcategoryId,
                    brandId: formData.brandId,
                    unit: formData.unit,
                    price: parseFloat(formData.price),
                    costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
                    ...(imageUrl ? { imageUrl } : {})
                })
            });

            // Save images to productImages table if we have any
            const productId = editingId() || productResult?.id;
            console.log('[Products] Saving images - productId:', productId, 'images:', productImages().length, 'productResult:', productResult);
            if (productId && productImages().length > 0) {
                try {
                    // Save all images to productImages table
                    const imageData = {
                        images: productImages().map((img, index) => ({
                            url: img.url,
                            thumbnailUrl: img.thumbnailUrl,
                            mediumUrl: img.mediumUrl,
                            isPrimary: img.isPrimary || index === 0,
                            sortOrder: img.sortOrder || index
                        }))
                    };
                    console.log('[Products] Saving image data:', JSON.stringify(imageData, null, 2));
                    const imgResult = await api.post(`/products/${productId}/images`, imageData);
                    console.log('[Products] Image save result:', imgResult);
                } catch (imgErr: any) {
                    console.error('[Products] Failed to save product images:', imgErr?.message || imgErr);
                    // Don't fail the whole operation if images fail
                }
            } else {
                console.log('[Products] Skipping image save - productId:', productId, 'images:', productImages().length);
            }

            setShowCreateModal(false);
            setEditingId(null);
            setProductImages([]);
            setFormData({
                name: '',
                sku: '',
                description: '',
                categoryId: '',
                subcategoryId: '',
                brandId: '',
                unit: 'piece',
                price: '',
                costPrice: ''
            });
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to save product.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 mt-6 lg:mt-8">
            {/* Header */}
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-white">Products</h1>
                    <p class="text-slate-400 text-sm">Manage your product catalog</p>
                </div>
                <div class="flex gap-2">
                    <button
                        onClick={() => setShowImportModal(true)}
                        class="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-300 font-medium rounded-xl hover:bg-slate-700 hover:text-white active:scale-[0.98] transition-all border border-slate-700"
                    >
                        <Download class="w-5 h-5" />
                        <span class="hidden sm:inline">Import from Master</span>
                    </button>
                    <button
                        onClick={() => {
                            setEditingId(null);
                            setProductImages([]);
                            setFormData({
                                name: '',
                                sku: '',
                                description: '',
                                categoryId: '',
                                subcategoryId: '',
                                brandId: '',
                                unit: 'piece',
                                price: '',
                                costPrice: ''
                            });
                            setShowCreateModal(true);
                        }}
                        class="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all"
                    >
                        <Plus class="w-5 h-5" />
                        Add Product
                    </button>
                </div>
            </div>

            {/* Search & Filters */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 mb-6">
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="flex-1 relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery()}
                            onInput={(e) => setSearchQuery(e.currentTarget.value)}
                            placeholder="Search products..."
                            class="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <Show when={searchQuery()}>
                            <button
                                onClick={() => setSearchQuery('')}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </Show>
                    </div>
                    <button class="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition-colors">
                        <Filter class="w-4 h-4" />
                        Filters
                    </button>
                </div>
            </div>

            {/* Table */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                {/* Loading */}
                <Show when={productsResponse.loading}>
                    <div class="flex items-center justify-center py-20">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!productsResponse.loading}>
                    {/* Desktop Table */}
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-slate-800/50 border-b border-slate-700">
                                <tr>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Product</th>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">SKU</th>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Brand</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Price</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Cost</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Stock</th>
                                    <th class="text-center text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Status</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                <For each={products()}>
                                    {(product) => (
                                        <tr class="hover:bg-slate-800/30 transition-colors">
                                            <td class="px-6 py-4">
                                                <div class="flex items-center gap-3">
                                                    <div
                                                        class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden cursor-pointer"
                                                        onClick={() => product.imageUrl && openLightbox(product.imageUrl)}
                                                    >
                                                        <Show when={product.imageUrl} fallback={<Package class="w-5 h-5 text-slate-500" />}>
                                                            <img
                                                                src={getImageUrl(product.imageUrl!)}
                                                                alt={product.name}
                                                                class="w-full h-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </Show>
                                                    </div>
                                                    <div>
                                                        <div class="text-white font-medium">{product.name}</div>
                                                        <div class="text-slate-500 text-xs">{product.categoryName || 'Uncategorized'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 text-slate-300 font-mono text-sm">{product.sku}</td>
                                            <td class="px-6 py-4 text-slate-300">{product.brandName || '-'}</td>
                                            <td class="px-6 py-4 text-right text-white font-medium">{formatCurrency(product.price)}</td>
                                            <td class="px-6 py-4 text-right text-slate-400">{formatCurrency(product.costPrice)}</td>
                                            <td class="px-6 py-4 text-right">
                                                <span class={`font-medium ${product.stockQuantity <= 0 ? 'text-red-400' : product.stockQuantity < 10 ? 'text-orange-400' : 'text-white'}`}>
                                                    {product.stockQuantity}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4 text-center">
                                                <span class={`px-2 py-1 rounded-full text-[10px] font-bold ${product.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                                                    {product.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4 text-right">
                                                <div class="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => handleEdit(product)}
                                                        class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 class="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(product.id)}
                                                        class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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

                    {/* Mobile Cards */}
                    <div class="lg:hidden divide-y divide-slate-800">
                        <For each={products()}>
                            {(product) => (
                                <div class="p-4">
                                    <div class="flex items-start gap-3">
                                        <div
                                            class="w-12 h-12 rounded-lg bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer"
                                            onClick={() => product.imageUrl && openLightbox(product.imageUrl)}
                                        >
                                            <Show when={product.imageUrl} fallback={<Package class="w-6 h-6 text-slate-500" />}>
                                                <img
                                                    src={getImageUrl(product.imageUrl!)}
                                                    alt={product.name}
                                                    class="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </Show>
                                        </div>
                                        <div class="flex-1">
                                            <div class="flex items-start justify-between mb-2">
                                                <div>
                                                    <div class="text-white font-medium">{product.name}</div>
                                                    <div class="text-slate-500 text-xs">{product.sku}</div>
                                                </div>
                                                <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${product.isActive ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                    {product.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <div class="flex items-center justify-between">
                                                <div class="text-slate-400 text-sm">{product.brandName || 'No brand'}</div>
                                                <div class="text-white font-semibold">{formatCurrency(product.price)}</div>
                                            </div>
                                            <div class="flex items-center justify-between mt-2">
                                                <div class="text-slate-500 text-xs">Stock: {product.stockQuantity}</div>
                                                <button class="p-1 text-slate-400">
                                                    <MoreVertical class="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>

                    {/* Empty State */}
                    <Show when={products().length === 0}>
                        <div class="text-center py-16">
                            <Package class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                            <h3 class="text-lg font-semibold text-white mb-2">No products found</h3>
                            <p class="text-slate-400 text-sm">Try adjusting your search or add a new product</p>
                        </div>
                    </Show>
                </Show>

                {/* Pagination */}
                <Show when={meta().totalPages > 1}>
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                        <div class="text-slate-400 text-sm">
                            Showing {((meta().page - 1) * 15) + 1} - {Math.min(meta().page * 15, meta().total)} of {meta().total}
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white font-medium px-3">{page()}</span>
                            <button
                                onClick={() => setPage(p => Math.min(meta().totalPages, p + 1))}
                                disabled={page() >= meta().totalPages}
                                class="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </Show>
            </div>

            {/* Create Product Modal */}
            <Show when={showCreateModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div class="p-6 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
                            <h2 class="text-xl font-bold text-white">{editingId() ? 'Edit Product' : 'Add New Product'}</h2>
                            <button onClick={() => setShowCreateModal(false)} class="text-slate-400 hover:text-white transition-colors">
                                <X class="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} class="p-6 space-y-4">
                            <Show when={error()}>
                                <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error()}
                                </div>
                            </Show>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Product Images</label>
                                <ImageUploader
                                    images={productImages()}
                                    onImagesChange={setProductImages}
                                    maxImages={10}
                                    disabled={submitting()}
                                />
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Product Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onInput={(e) => setFormData('name', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Product Name"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">SKU *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.sku}
                                        onInput={(e) => setFormData('sku', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Unique SKU"
                                    />
                                </div>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Description</label>
                                <textarea
                                    value={formData.description}
                                    onInput={(e) => setFormData('description', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[60px]"
                                    placeholder="Product description"
                                />
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Category *</label>
                                    <select
                                        required
                                        value={formData.categoryId}
                                        onChange={handleCategoryChange}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Select Category</option>
                                        <For each={categories()}>
                                            {(cat) => <option value={cat.id}>{cat.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Subcategory *</label>
                                    <select
                                        required
                                        value={formData.subcategoryId}
                                        onInput={(e) => setFormData('subcategoryId', e.currentTarget.value)}
                                        disabled={!formData.categoryId}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                                    >
                                        <option value="">Select Subcategory</option>
                                        <For each={filteredSubcategories()}>
                                            {(sub) => <option value={sub.id}>{sub.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Brand *</label>
                                    <select
                                        required
                                        value={formData.brandId}
                                        onInput={(e) => setFormData('brandId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Select Brand</option>
                                        <For each={brands()}>
                                            {(brand) => <option value={brand.id}>{brand.name}</option>}
                                        </For>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Price *</label>
                                    <input
                                        type="number"
                                        required
                                        step="0.01"
                                        min="0"
                                        value={formData.price}
                                        onInput={(e) => setFormData('price', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Cost Price</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.costPrice}
                                        onInput={(e) => setFormData('costPrice', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Unit *</label>
                                    <select
                                        required
                                        value={formData.unit}
                                        onInput={(e) => setFormData('unit', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="piece">Pieces (pcs)</option>
                                        <option value="kg">Kilograms (kg)</option>
                                        <option value="gram">Grams (g)</option>
                                        <option value="liter">Liters (l)</option>
                                        <option value="box">Box</option>
                                        <option value="pack">Pack / Set</option>
                                        <option value="case">Case</option>
                                    </select>
                                </div>
                            </div>

                            <div class="pt-4 flex justify-end gap-3 border-t border-slate-800 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    class="px-5 py-2.5 text-slate-300 font-medium hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting()}
                                    class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Show when={submitting()} fallback={editingId() ? 'Update Product' : 'Create Product'}>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        {editingId() ? 'Updating...' : 'Creating...'}
                                    </Show>
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            </Show >

            <ImportMasterModal
                isOpen={showImportModal()}
                onClose={() => setShowImportModal(false)}
                onSuccess={() => {
                    setShowImportModal(false);
                    refetch(); // Refresh list after import
                }}
                categories={categories() || []}
                brands={brands() || []}
            />

            {/* Image Lightbox */}
            <ImageLightbox
                images={lightboxImages()}
                initialIndex={lightboxIndex()}
                isOpen={lightboxOpen()}
                onClose={() => setLightboxOpen(false)}
            />
        </div >
    );
};

export default Products;

