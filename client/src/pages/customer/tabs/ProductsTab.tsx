/**
 * Products Tab Component
 * 
 * Displays product catalog with search, filtering, and sorting.
 */

import { type Component, Show, For, createSignal } from 'solid-js';
import { Search, X, Clock, Box, Heart, Plus, Loader2 } from 'lucide-solid';
import type { Product } from '../../../types/customer-portal';
import { formatMoney, getOptimizedImage } from '../../../utils/formatters';
import { isLowStock } from '../../../utils/constants';
import { useI18n } from '../../../i18n';
import EmptyState from '../../../components/EmptyState';

// Sort options
type SortOption = 'default' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';

interface ProductsTabProps {
    products: Product[];
    categories: { id: string; name: string }[];
    currency: string;
    hasMore: boolean;
    loadingMore: boolean;
    searchQuery: string;
    selectedCategory: string;
    favorites: Product[];
    cart: { product: Product; quantity: number }[];
    searchHistory: string[];
    onSearchChange: (query: string) => void;
    onCategoryChange: (categoryId: string) => void;
    onClearSearchHistory: () => void;
    onSelectFromHistory: (query: string) => void;
    onAddToCart: (product: Product, quantity: number) => void;
    onToggleFavorite: (product: Product) => void;
    onSelectProduct: (product: Product) => void;
    setupLoadMoreObserver: (el: HTMLDivElement) => void;
}

const ProductsTab: Component<ProductsTabProps> = (props) => {
    const { t } = useI18n();
    const [sortOption, setSortOption] = createSignal<SortOption>('default');
    const [showSearchHistory, setShowSearchHistory] = createSignal(false);
    const [localSearch, setLocalSearch] = createSignal(props.searchQuery);

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleSearchInput = (value: string) => {
        setLocalSearch(value);
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            props.onSearchChange(value);
        }, 300);
    };

    // Sort products
    const sortedProducts = () => {
        const prods = [...props.products];
        switch (sortOption()) {
            case 'price_asc':
                return prods.sort((a, b) => a.sellingPrice - b.sellingPrice);
            case 'price_desc':
                return prods.sort((a, b) => b.sellingPrice - a.sellingPrice);
            case 'name_asc':
                return prods.sort((a, b) => a.name.localeCompare(b.name));
            case 'name_desc':
                return prods.sort((a, b) => b.name.localeCompare(a.name));
            default:
                return prods;
        }
    };

    const isFavorite = (productId: string) => props.favorites.some(f => f.id === productId);
    const checkLowStock = (product: Product) => isLowStock(product.stockQty, product.inStock);
    const getProductQtyInCart = (productId: string) => props.cart.find(i => i.product.id === productId)?.quantity || 0;

    return (
        <>
            <div class="search-container">
                <div class="search-with-history">
                    <div class="search-input-wrapper">
                        <Search size={20} />
                        <input
                            type="text"
                            class="search-input"
                            placeholder={t('products.search') as string}
                            value={localSearch()}
                            onInput={(e) => handleSearchInput(e.currentTarget.value)}
                            onFocus={() => setShowSearchHistory(true)}
                            onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                        />
                        <Show when={localSearch()}>
                            <button class="search-clear" onClick={() => { setLocalSearch(''); props.onSearchChange(''); }}>
                                <X size={18} />
                            </button>
                        </Show>
                    </div>

                    {/* Search History Dropdown */}
                    <Show when={showSearchHistory() && props.searchHistory.length > 0 && !localSearch()}>
                        <div class="search-history-dropdown">
                            <div class="search-history-header">
                                <span><Clock size={14} /> {t('products.recentSearches')}</span>
                                <button class="search-history-clear" onClick={props.onClearSearchHistory}>
                                    {t('products.clearHistory')}
                                </button>
                            </div>
                            <div class="search-history-list">
                                <For each={props.searchHistory}>{(query) => (
                                    <div class="search-history-item" onClick={() => props.onSelectFromHistory(query)}>
                                        <Clock size={14} />
                                        <span>{query}</span>
                                    </div>
                                )}</For>
                            </div>
                        </div>
                    </Show>
                </div>

                {/* Category and Sort Filters */}
                <div class="filter-dropdown-wrapper">
                    <Show when={props.categories.length > 0}>
                        <select
                            class="category-filter"
                            value={props.selectedCategory}
                            onChange={(e) => props.onCategoryChange(e.currentTarget.value)}
                        >
                            <option value="">{t('products.allCategories')}</option>
                            <For each={props.categories}>{(cat) =>
                                <option value={cat.id}>{cat.name}</option>
                            }</For>
                        </select>
                    </Show>
                    <select
                        class="sort-select"
                        value={sortOption()}
                        onChange={(e) => setSortOption(e.currentTarget.value as SortOption)}
                    >
                        <option value="default">{t('products.sort.default')}</option>
                        <option value="price_asc">{t('products.sort.priceAsc')}</option>
                        <option value="price_desc">{t('products.sort.priceDesc')}</option>
                        <option value="name_asc">{t('products.sort.nameAsc')}</option>
                        <option value="name_desc">{t('products.sort.nameDesc')}</option>
                    </select>
                </div>
            </div>

            {/* Empty State */}
            <Show when={sortedProducts().length === 0}>
                <EmptyState
                    type="products"
                    title={t('products.empty') as string}
                />
            </Show>

            <div class="products-grid">
                <For each={sortedProducts()}>{(product) => {
                    const qtyInCart = () => getProductQtyInCart(product.id);
                    return (
                        <div class="product-card">
                            <div class="product-image-container" onClick={() => props.onSelectProduct(product)}>
                                {/* Low Stock Badge */}
                                <Show when={checkLowStock(product)}>
                                    <div class="low-stock-badge">
                                        {t('products.lowStock', { qty: product.stockQty })}
                                    </div>
                                </Show>

                                <Show when={product.imageUrl} fallback={
                                    <div class="product-image-placeholder"><Box size={40} /></div>
                                }>
                                    <img src={getOptimizedImage(product.imageUrl, 400)} alt={product.name} class="product-image" loading="lazy" />
                                </Show>
                                <button
                                    class={`btn-favorite-card ${isFavorite(product.id) ? 'active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); props.onToggleFavorite(product); }}
                                >
                                    <Heart size={18} fill={isFavorite(product.id) ? 'currentColor' : 'none'} />
                                </button>
                                <Show when={qtyInCart() > 0}>
                                    <div class="product-cart-badge">{qtyInCart()}</div>
                                </Show>
                            </div>
                            <div class="product-info">
                                <div class="product-name">{product.name}</div>
                                <div class="product-footer">
                                    <div class="product-price">{formatMoney(product.sellingPrice)} {props.currency}</div>
                                    <Show when={product.inStock}>
                                        <button class="btn-quick-add" onClick={(e) => { e.stopPropagation(); props.onAddToCart(product, 1); }}>
                                            <Plus size={18} />
                                        </button>
                                    </Show>
                                </div>
                            </div>
                        </div>
                    );
                }}</For>
            </div>
            <Show when={props.hasMore}>
                <div ref={props.setupLoadMoreObserver} class="load-more-trigger">
                    <Show when={props.loadingMore}><Loader2 size={24} class="spin" /></Show>
                </div>
            </Show>
        </>
    );
};

export default ProductsTab;
