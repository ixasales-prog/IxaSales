/**
 * Product Modal Component
 * 
 * Product detail modal with image gallery and add to cart.
 */

import { type Component, createSignal, Show, For, onMount } from 'solid-js';
import { X, ChevronLeft, ChevronRight, ShoppingCart, Heart, Box, Loader2 } from 'lucide-solid';
import type { Product } from '../../types/customer-portal';
import { formatMoney, getOptimizedImage } from '../../utils/formatters';
import { customerApi, type Review, type ReviewStats } from '../../services/customer-api';
import { useI18n } from '../../i18n';
import ProductReviews from '../../components/ProductReviews';

interface ProductModalProps {
    product: Product;
    currency: string;
    onClose: () => void;
    onAddToCart: (product: Product, qty: number) => void;
    onToggleFavorite: (product: Product) => void;
    isFavorite: boolean;
    token: string;
}

const ProductModal: Component<ProductModalProps> = (props) => {
    const { t } = useI18n();
    const [qty, setQty] = createSignal(1);
    const [currentImageIdx, setCurrentImageIdx] = createSignal(0);
    const [fullProduct, setFullProduct] = createSignal<Product | null>(null);
    const [loading, setLoading] = createSignal(true);
    const [reviews, setReviews] = createSignal<Review[]>([]);
    const [reviewStats, setReviewStats] = createSignal<ReviewStats>({ avgRating: 0, totalReviews: 0, distribution: {} });
    const [canReview, setCanReview] = createSignal(false);

    onMount(async () => {
        const [productResult, reviewsResult] = await Promise.all([
            customerApi.products.getDetail(props.product.id),
            customerApi.reviews.getForProduct(props.product.id)
        ]);

        if (productResult.success && productResult.data) {
            setFullProduct(productResult.data);
        }

        if (reviewsResult.success && reviewsResult.data) {
            setReviews(reviewsResult.data.reviews);
            setReviewStats(reviewsResult.data.stats);
            setCanReview(reviewsResult.data.canReview);
        }

        setLoading(false);
    });

    const handleSubmitReview = async (rating: number, comment: string) => {
        const result = await customerApi.reviews.add(props.product.id, rating, comment);
        if (result.success) {
            // Refresh reviews
            const reviewsResult = await customerApi.reviews.getForProduct(props.product.id);
            if (reviewsResult.success && reviewsResult.data) {
                setReviews(reviewsResult.data.reviews);
                setReviewStats(reviewsResult.data.stats);
                setCanReview(false); // Can't review twice
            }
        }
    };

    const product = () => fullProduct() || props.product;

    const allImages = (): string[] => {
        const p = product();
        if (p.images && p.images.length > 0) {
            return p.images.map(img => img.imageUrl).filter(Boolean) as string[];
        }
        return p.imageUrl ? [p.imageUrl] : [];
    };

    const nextImage = () => {
        if (currentImageIdx() < allImages().length - 1) {
            setCurrentImageIdx(currentImageIdx() + 1);
        }
    };

    const prevImage = () => {
        if (currentImageIdx() > 0) {
            setCurrentImageIdx(currentImageIdx() - 1);
        }
    };

    return (
        <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
            <div class="product-modal">
                <div class="product-gallery">
                    <Show when={!loading()} fallback={
                        <div class="product-gallery-loading">
                            <Loader2 size={32} class="spin" />
                        </div>
                    }>
                        <Show when={allImages().length > 0} fallback={
                            <div class="product-modal-image" style="background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
                                <Box size={64} color="#94a3b8" />
                            </div>
                        }>
                            <img
                                src={getOptimizedImage(allImages()[currentImageIdx()], 800)}
                                alt={product().name}
                                class="product-modal-image"
                                loading="lazy"
                            />

                            <Show when={allImages().length > 1}>
                                <button
                                    class="gallery-nav gallery-prev"
                                    onClick={prevImage}
                                    disabled={currentImageIdx() === 0}
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    class="gallery-nav gallery-next"
                                    onClick={nextImage}
                                    disabled={currentImageIdx() === allImages().length - 1}
                                >
                                    <ChevronRight size={24} />
                                </button>

                                <div class="gallery-dots">
                                    <For each={allImages()}>{(_, idx) => (
                                        <button
                                            class={`gallery-dot ${currentImageIdx() === idx() ? 'active' : ''}`}
                                            onClick={() => setCurrentImageIdx(idx())}
                                        />
                                    )}</For>
                                </div>
                            </Show>
                        </Show>
                    </Show>

                    <button
                        class={`btn-favorite-float ${props.isFavorite ? 'active' : ''}`}
                        onClick={() => props.onToggleFavorite(product())}
                    >
                        <Heart size={24} fill={props.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                </div>

                <div class="product-modal-content">
                    <button class="btn-icon btn-close-modal" onClick={props.onClose}>
                        <X size={20} />
                    </button>

                    <h2>{product().name}</h2>
                    <p class="sku">SKU: {product().sku}</p>

                    <Show when={product().description}>
                        <p class="description">{product().description}</p>
                    </Show>

                    <div class="price">{formatMoney(product().sellingPrice)} {props.currency}</div>

                    <p class="product-stock">
                        {product().inStock
                            ? t('products.inStock', { qty: product().stockQty })
                            : t('products.outOfStock')
                        }
                    </p>

                    <Show when={product().inStock}>
                        <div class="add-to-cart-section">
                            <div class="cart-item-qty">
                                <button class="qty-btn" onClick={() => setQty(Math.max(1, qty() - 1))}>−</button>
                                <span class="qty-value">{qty()}</span>
                                <button class="qty-btn" onClick={() => setQty(Math.min(product().stockQty, qty() + 1))}>+</button>
                            </div>

                            <button
                                class="btn-add-cart"
                                onClick={() => {
                                    props.onAddToCart(product(), qty());
                                    props.onClose();
                                }}
                            >
                                <ShoppingCart size={18} /> {t('products.addToCart')}
                            </button>
                        </div>
                    </Show>

                    {/* Product Reviews Section */}
                    <Show when={!loading()}>
                        <ProductReviews
                            productId={props.product.id}
                            reviews={reviews()}
                            stats={reviewStats()}
                            canReview={canReview()}
                            onSubmitReview={handleSubmitReview}
                        />
                    </Show>
                </div>
            </div>
        </div>
    );
};

export default ProductModal;
