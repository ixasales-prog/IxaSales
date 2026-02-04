import { type Component, For, Show, createSignal, createResource, createEffect } from 'solid-js';
import { A } from '@solidjs/router';
import {
    Search,
    Filter,
    X,
    Plus,
    Minus,
    ShoppingCart,
    Package,
    ChevronDown,
    Loader2,
    ScanLine
} from 'lucide-solid';
import { api } from '../../lib/api';
import { cartItems, addToCart, cartCount, updateCartQuantity } from '../../stores/cart';
import { formatCurrency } from '../../stores/settings';
import { useI18n } from '../../i18n';
import ProductDetailModal from './ProductDetailModal';
import BarcodeScanner from '../../components/BarcodeScanner';

interface Product {
    id: string;
    name: string;
    sku: string;
    price: string;
    unit: string;
    stockQuantity: number;
    brandName: string | null;
    categoryName: string | null;
    subcategoryName: string | null;
    imageUrl: string | null;
    barcode?: string;
}

interface Category {
    id: string;
    name: string;
}

interface Brand {
    id: string;
    name: string;
}

const Catalog: Component = () => {
    const { t } = useI18n();

    // State
    const [searchQuery, setSearchQuery] = createSignal('');
    const [selectedCategory, setSelectedCategory] = createSignal<string>('');
    const [selectedBrand, setSelectedBrand] = createSignal<string>('');
    const [showFilters, setShowFilters] = createSignal(false);
    const [showScanner, setShowScanner] = createSignal(false);
    const [page, setPage] = createSignal(1);
    const [selectedProductId, setSelectedProductId] = createSignal<string | null>(null);

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = createSignal('');
    let searchTimeout: ReturnType<typeof setTimeout>;

    createEffect(() => {
        const query = searchQuery();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            setDebouncedSearch(query);
            setPage(1);
        }, 300);
    });

    // Fetch categories for pills
    const [categories] = createResource<Category[]>(async () => {
        const data = await api<Category[]>('/products/categories');
        return data || [];
    });

    // Fetch brands
    const [brands] = createResource<Brand[]>(async () => {
        const data = await api<Brand[]>('/products/brands');
        return data;
    });

    // Fetch products
    const [productsResponse] = createResource(
        () => ({
            page: page(),
            search: debouncedSearch(),
            category: selectedCategory(),
            brand: selectedBrand()
        }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: '20',
                isActive: 'true'
            };
            if (params.search) queryParams.search = params.search;
            if (params.brand) queryParams.brandId = params.brand;
            if (params.category) queryParams.categoryId = params.category;

            const result = await api<{ data: Product[]; meta: { total: number; totalPages: number } }>('/products', { params: queryParams });
            return result;
        }
    );

    const products = () => (productsResponse() as any)?.data || productsResponse() || [];

    // Check if product is in cart
    const getCartQuantity = (productId: string): number => {
        const item = cartItems().find(i => i.productId === productId);
        return item?.quantity || 0;
    };

    // Handle add to cart
    const handleAddToCart = (product: Product) => {
        addToCart({
            productId: product.id,
            name: product.name,
            sku: product.sku,
            price: parseFloat(product.price),
            unit: product.unit,
            image: product.imageUrl || undefined
        });
    };

    const handleQuantityChange = (productId: string, delta: number) => {
        const currentQty = getCartQuantity(productId);
        updateCartQuantity(productId, currentQty + delta);
    };

    // Barcode scanning
    const handleBarcodeScanned = (barcode: string) => {
        setSearchQuery(barcode);
        // Try to find and auto-add to cart
        const allProducts = products();
        const match = allProducts.find((p: Product) =>
            p.barcode === barcode || p.sku === barcode
        );
        if (match && match.stockQuantity > 0) {
            handleAddToCart(match);
        }
    };

    // Filter counts
    const activeFilters = () => {
        let count = 0;
        if (selectedCategory()) count++;
        if (selectedBrand()) count++;
        return count;
    };

    const clearFilters = () => {
        setSelectedCategory('');
        setSelectedBrand('');
        setSearchQuery('');
    };

    return (
        <div class="min-h-screen pb-safe">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-3">
                    {/* Search Bar */}
                    <div class="flex gap-2">
                        <div class="flex-1 relative">
                            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery()}
                                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                                placeholder={t('salesApp.catalog.search')}
                                class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
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

                        <button
                            onClick={() => setShowScanner(true)}
                            class="p-2.5 rounded-xl border transition-all bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30"
                            title="Scan Barcode"
                        >
                            <ScanLine class="w-5 h-5 text-emerald-400" />
                        </button>

                        <button
                            onClick={() => setShowFilters(!showFilters())}
                            class={`relative p-2.5 rounded-xl border transition-all ${showFilters() || activeFilters()
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                                }`}
                        >
                            <Filter class="w-5 h-5" />
                            <Show when={activeFilters() > 0}>
                                <span class="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[10px] flex items-center justify-center font-bold">
                                    {activeFilters()}
                                </span>
                            </Show>
                        </button>
                    </div>

                    {/* Category Pills */}
                    <div class="flex gap-2 mt-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
                        <button
                            onClick={() => { setSelectedCategory(''); setPage(1); }}
                            class={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${selectedCategory() === ''
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                                }`}
                        >
                            {t('salesApp.catalog.all')}
                        </button>
                        <For each={categories()}>
                            {(cat) => (
                                <button
                                    onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                                    class={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${selectedCategory() === cat.id
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400'
                                        }`}
                                >
                                    {cat.name}
                                </button>
                            )}
                        </For>
                    </div>

                    {/* Filter Panel (Brand) */}
                    <Show when={showFilters()}>
                        <div class="mt-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800/50 space-y-3">
                            {/* Brand Filter */}
                            <div>
                                <label class="block text-xs text-slate-400 mb-1.5">{t('salesApp.catalog.brand')}</label>
                                <div class="relative">
                                    <select
                                        value={selectedBrand()}
                                        onChange={(e) => { setSelectedBrand(e.currentTarget.value); setPage(1); }}
                                        class="w-full appearance-none px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    >
                                        <option value="">{t('salesApp.catalog.allBrands')}</option>
                                        <For each={brands()}>
                                            {(brand) => <option value={brand.id}>{brand.name}</option>}
                                        </For>
                                    </select>
                                    <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Clear Filters */}
                            <Show when={activeFilters() > 0}>
                                <button
                                    onClick={clearFilters}
                                    class="w-full py-2 text-sm text-orange-400 hover:text-orange-300 font-medium"
                                >
                                    {t('salesApp.catalog.clearFilters')}
                                </button>
                            </Show>
                        </div>
                    </Show>
                </div>
            </div>

            {/* Barcode Scanner Modal */}
            <Show when={showScanner()}>
                <BarcodeScanner
                    title={t('salesApp.catalog.scanBarcode')}
                    onScan={handleBarcodeScanned}
                    onClose={() => setShowScanner(false)}
                />
            </Show>

            {/* Content with top padding for fixed header + category pills */}
            <div class="px-4" style={{ "padding-top": showFilters() ? "210px" : "110px" }}>
                {/* Loading */}
                <Show when={productsResponse.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                </Show>

                {/* Empty State */}
                <Show when={!productsResponse.loading && products().length === 0}>
                    <div class="text-center py-12">
                        <Package class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">{t('salesApp.catalog.noProducts')}</h3>
                        <p class="text-slate-400 text-sm">
                            {searchQuery() || activeFilters() > 0
                                ? t('salesApp.catalog.adjustSearch')
                                : t('salesApp.catalog.productsAppear')
                            }
                        </p>
                    </div>
                </Show>

                {/* Product Grid */}
                <Show when={!productsResponse.loading && products().length > 0}>
                    <div class="grid grid-cols-2 gap-3">
                        <For each={products()}>
                            {(product) => {
                                const qty = () => getCartQuantity(product.id);
                                const inCart = () => qty() > 0;

                                return (
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm group">
                                        {/* Product Image - Tap to view details */}
                                        <div
                                            onClick={() => setSelectedProductId(product.id)}
                                            class="aspect-square bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center overflow-hidden cursor-pointer"
                                        >
                                            <Show when={product.imageUrl} fallback={
                                                <Package class="w-12 h-12 text-slate-700" />
                                            }>
                                                <img
                                                    src={product.imageUrl!}
                                                    alt={product.name}
                                                    class="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </Show>
                                            <Show when={product.stockQuantity <= 0}>
                                                <div class="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                                                    <span class="text-red-400 text-xs font-bold px-2 py-1 bg-red-500/20 rounded-full border border-red-500/30">
                                                        {t('salesApp.catalog.outOfStock')}
                                                    </span>
                                                </div>
                                            </Show>
                                            <Show when={inCart()}>
                                                <div class="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-green-500/30">
                                                    {qty()}
                                                </div>
                                            </Show>
                                        </div>

                                        {/* Product Info - Compact */}
                                        <div class="p-2">
                                            {/* Line 1: Name (with optional brand prefix) */}
                                            <h3 class="text-white font-medium text-sm line-clamp-1 leading-tight">
                                                <Show when={product.brandName}>
                                                    <span class="text-blue-400">{product.brandName}</span>{' '}
                                                </Show>
                                                {product.name}
                                            </h3>

                                            {/* Line 2: Price + Stock + Add Button */}
                                            <div class="flex items-center justify-between mt-1.5">
                                                <div class="flex items-center gap-2">
                                                    <span class="text-white font-bold text-sm">
                                                        {formatCurrency(product.price)}
                                                    </span>
                                                    <span class={`text-[10px] font-medium ${product.stockQuantity <= 0
                                                        ? 'text-red-400'
                                                        : product.stockQuantity <= 10
                                                            ? 'text-amber-400'
                                                            : 'text-emerald-400'
                                                        }`}>
                                                        {product.stockQuantity <= 0 ? 'Out' : product.stockQuantity}
                                                    </span>
                                                </div>

                                                <Show when={product.stockQuantity > 0}>
                                                    <Show when={!inCart()} fallback={
                                                        <div class="flex items-center gap-0.5">
                                                            <button
                                                                onClick={() => handleQuantityChange(product.id, -1)}
                                                                class="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center active:scale-95"
                                                            >
                                                                <Minus class="w-3 h-3" />
                                                            </button>
                                                            <span class="w-6 text-center text-white font-medium text-xs">{qty()}</span>
                                                            <button
                                                                onClick={() => handleQuantityChange(product.id, 1)}
                                                                class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center active:scale-95"
                                                            >
                                                                <Plus class="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    }>
                                                        <button
                                                            onClick={() => handleAddToCart(product)}
                                                            class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center active:scale-95 shadow-lg shadow-blue-600/20"
                                                        >
                                                            <Plus class="w-4 h-4" />
                                                        </button>
                                                    </Show>
                                                </Show>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Cart FAB */}
            <Show when={cartCount() > 0}>
                <A
                    href="/sales/cart"
                    class="fixed bottom-20 right-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center gap-2 text-white shadow-xl shadow-blue-600/30 active:scale-95 transition-all z-40"
                >
                    <ShoppingCart class="w-5 h-5" />
                    <span class="font-semibold">{cartCount()}</span>
                    <span class="text-blue-200">items</span>
                </A>
            </Show>

            {/* Product Detail Modal */}
            <Show when={selectedProductId()}>
                {(() => {
                    const currentProducts = products();
                    const currentIndex = currentProducts.findIndex((p: Product) => p.id === selectedProductId());
                    const hasNext = currentIndex < currentProducts.length - 1;
                    const hasPrev = currentIndex > 0;

                    const handleNext = () => {
                        if (hasNext) setSelectedProductId(currentProducts[currentIndex + 1].id);
                    };

                    const handlePrev = () => {
                        if (hasPrev) setSelectedProductId(currentProducts[currentIndex - 1].id);
                    };

                    return (
                        <ProductDetailModal
                            productId={selectedProductId()}
                            onClose={() => setSelectedProductId(null)}
                            onNext={handleNext}
                            onPrev={handlePrev}
                            hasNext={hasNext}
                            hasPrev={hasPrev}
                        />
                    );
                })()}
            </Show>
        </div>
    );
};

export default Catalog;
