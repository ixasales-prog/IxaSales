/**
 * Favorites Tab Component
 * 
 * Displays customer's favorite products.
 */

import { type Component, Show, For } from 'solid-js';
import { Box, Heart, Plus } from 'lucide-solid';
import type { Product, CartItem } from '../../../types/customer-portal';
import { formatMoney, getOptimizedImage } from '../../../utils/formatters';
import { isLowStock } from '../../../utils/constants';
import { useI18n } from '../../../i18n';
import EmptyState from '../../../components/EmptyState';

interface FavoritesTabProps {
    favorites: Product[];
    cart: CartItem[];
    currency: string;
    onAddToCart: (product: Product, quantity: number) => void;
    onToggleFavorite: (product: Product) => void;
    onSelectProduct: (product: Product) => void;
    onSwitchToProducts: () => void;
}

const FavoritesTab: Component<FavoritesTabProps> = (props) => {
    const { t } = useI18n();

    const checkLowStock = (product: Product) => isLowStock(product.stockQty, product.inStock);
    const getProductQtyInCart = (productId: string) => props.cart.find(i => i.product.id === productId)?.quantity || 0;

    return (
        <>
            <Show when={props.favorites.length === 0}>
                <EmptyState
                    type="favorites"
                    title={t('favorites.empty') as string}
                    description={t('favorites.emptyDescription') as string}
                    actionLabel={t('favorites.browseProducts') as string}
                    onAction={props.onSwitchToProducts}
                />
            </Show>

            <div class="products-grid">
                <For each={props.favorites}>{(product) => {
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
                                    class="btn-favorite-card active"
                                    onClick={(e) => { e.stopPropagation(); props.onToggleFavorite(product); }}
                                >
                                    <Heart size={18} fill="currentColor" />
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
        </>
    );
};

export default FavoritesTab;
