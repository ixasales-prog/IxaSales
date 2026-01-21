import { type Component, createSignal, createResource, For, Show, createEffect } from 'solid-js';
import { A } from '@solidjs/router';
import { X, ChevronLeft, ChevronRight, Plus, Minus, ShoppingCart, Package, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { addToCart, cartItems, updateCartQuantity, cartCount } from '../../stores/cart';
import { formatCurrency } from '../../stores/settings';

interface ProductImage {
    id: string;
    url: string;
    thumbnailUrl?: string;
    mediumUrl?: string;
    altText?: string;
    isPrimary?: boolean;
}

interface ProductDetail {
    id: string;
    name: string;
    sku: string;
    description?: string;
    price: string;
    unit: string;
    stockQuantity: number;
    brandName?: string;
    categoryName?: string;
    subcategoryName?: string;
    images: ProductImage[];
}

interface ProductDetailModalProps {
    productId: string | null;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
}

const ProductDetailModal: Component<ProductDetailModalProps> = (props) => {
    const [currentImageIndex, setCurrentImageIndex] = createSignal(0);

    // Reset image index when product changes
    createEffect(() => {
        if (props.productId) {
            setCurrentImageIndex(0);
        }
    });

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!props.productId) return;

        if (e.key === 'ArrowLeft') {
            props.onPrev?.();
        } else if (e.key === 'ArrowRight') {
            props.onNext?.();
        } else if (e.key === 'Escape') {
            props.onClose();
        }
    };

    createEffect(() => {
        if (props.productId) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    });

    const [productDetail] = createResource(
        () => props.productId,
        async (id) => {
            if (!id) return null;
            try {
                const res = await api.get(`/products/${id}`);
                return res as ProductDetail;
            } catch (e) {
                return null;
            }
        }
    );

    const getCartQuantity = (productId: string): number => {
        const item = cartItems().find(i => i.productId === productId);
        return item?.quantity || 0;
    };

    const handleAddToCart = () => {
        const product = productDetail();
        if (!product) return;

        addToCart({
            productId: product.id,
            name: product.name,
            sku: product.sku,
            price: parseFloat(product.price),
            unit: product.unit,
            image: product.images.find(i => i.isPrimary)?.thumbnailUrl || product.images[0]?.thumbnailUrl || product.images[0]?.url
        });
    };

    const handleQuantityChange = (delta: number) => {
        const product = productDetail();
        if (!product) return;

        const currentQty = getCartQuantity(product.id);
        updateCartQuantity(product.id, currentQty + delta);
    };

    const nextImage = () => {
        const images = productDetail()?.images || [];
        if (images.length > 0) {
            setCurrentImageIndex(i => (i + 1) % images.length);
        }
    };

    const prevImage = () => {
        const images = productDetail()?.images || [];
        if (images.length > 0) {
            setCurrentImageIndex(i => (i - 1 + images.length) % images.length);
        }
    };

    return (
        <Show when={props.productId}>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex flex-col">
                {/* Header */}
                <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800/50">
                    <div class="flex items-center gap-2">
                        <button
                            onClick={props.onClose}
                            class="p-2 text-slate-400 hover:text-white"
                        >
                            <X class="w-5 h-5" />
                        </button>
                        <h2 class="text-lg font-bold text-white">Details</h2>
                    </div>

                    {/* Navigation Buttons */}
                    <div class="flex items-center gap-2">
                        <A href="/sales/cart" class="relative p-2 text-slate-400 hover:text-white">
                            <ShoppingCart class="w-6 h-6" />
                            <Show when={cartCount() > 0}>
                                <span class="absolute top-0 right-0 w-4 h-4 bg-blue-600 rounded-full text-[10px] flex items-center justify-center text-white font-bold border-2 border-slate-900">
                                    {cartCount()}
                                </span>
                            </Show>
                        </A>
                        <div class="flex items-center gap-1">
                            <button
                                onClick={props.onPrev}
                                disabled={!props.hasPrev}
                                class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft class="w-6 h-6" />
                            </button>
                            <button
                                onClick={props.onNext}
                                disabled={!props.hasNext}
                                class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight class="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div class="flex-1 overflow-y-auto">
                    <Show when={productDetail.loading}>
                        <div class="flex items-center justify-center h-64">
                            <Loader2 class="w-8 h-8 animate-spin text-blue-400" />
                        </div>
                    </Show>

                    <Show when={!productDetail.loading && productDetail()}>
                        {(product) => {
                            const images = () => product().images || [];
                            const currentImage = () => images()[currentImageIndex()];

                            return (
                                <div class="pb-24">
                                    {/* Image Gallery */}
                                    <div class="relative bg-slate-900">
                                        <div class="aspect-square">
                                            <Show when={currentImage()} fallback={
                                                <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                                                    <Package class="w-20 h-20 text-slate-700" />
                                                </div>
                                            }>
                                                <img
                                                    src={currentImage()?.mediumUrl || currentImage()?.url}
                                                    alt={currentImage()?.altText || product().name}
                                                    class="w-full h-full object-contain bg-slate-900"
                                                />
                                            </Show>
                                        </div>

                                        {/* Navigation Arrows */}
                                        <Show when={images().length > 1}>
                                            <button
                                                onClick={prevImage}
                                                class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
                                            >
                                                <ChevronLeft class="w-6 h-6" />
                                            </button>
                                            <button
                                                onClick={nextImage}
                                                class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
                                            >
                                                <ChevronRight class="w-6 h-6" />
                                            </button>

                                            {/* Dots */}
                                            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                <For each={images()}>
                                                    {(_, index) => (
                                                        <button
                                                            onClick={() => setCurrentImageIndex(index())}
                                                            class={`w-2 h-2 rounded-full transition-colors ${index() === currentImageIndex()
                                                                ? 'bg-white'
                                                                : 'bg-white/40'
                                                                }`}
                                                        />
                                                    )}
                                                </For>
                                            </div>
                                        </Show>

                                        {/* Out of Stock Overlay */}
                                        <Show when={product().stockQuantity <= 0}>
                                            <div class="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
                                                <span class="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 font-bold">
                                                    Out of Stock
                                                </span>
                                            </div>
                                        </Show>
                                    </div>

                                    {/* Thumbnail Strip */}
                                    <Show when={images().length > 1}>
                                        <div class="flex gap-2 p-3 overflow-x-auto bg-slate-900/50">
                                            <For each={images()}>
                                                {(img, index) => (
                                                    <button
                                                        onClick={() => setCurrentImageIndex(index())}
                                                        class={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${index() === currentImageIndex()
                                                            ? 'border-blue-500'
                                                            : 'border-transparent'
                                                            }`}
                                                    >
                                                        <img
                                                            src={img.thumbnailUrl || img.url}
                                                            alt=""
                                                            class="w-full h-full object-cover"
                                                        />
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Show>

                                    {/* Product Info */}
                                    <div class="p-4 space-y-4">
                                        {/* Brand & Category */}
                                        <div class="flex items-center gap-2 text-xs">
                                            <Show when={product().brandName}>
                                                <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full font-medium">
                                                    {product().brandName}
                                                </span>
                                            </Show>
                                            <Show when={product().categoryName}>
                                                <span class="text-slate-500">
                                                    {product().categoryName}
                                                    {product().subcategoryName && ` > ${product().subcategoryName}`}
                                                </span>
                                            </Show>
                                        </div>

                                        {/* Name & SKU */}
                                        <div>
                                            <h1 class="text-xl font-bold text-white">{product().name}</h1>
                                            <p class="text-slate-500 text-sm mt-1">SKU: {product().sku}</p>
                                        </div>

                                        {/* Price & Stock */}
                                        <div class="flex items-end justify-between">
                                            <div>
                                                <div class="text-3xl font-bold text-white">
                                                    {formatCurrency(product().price)}
                                                </div>
                                                <div class="text-slate-500 text-sm">per {product().unit}</div>
                                            </div>
                                            <div class={`text-sm font-medium ${product().stockQuantity <= 0
                                                ? 'text-red-400'
                                                : product().stockQuantity <= 10
                                                    ? 'text-amber-400'
                                                    : 'text-emerald-400'
                                                }`}>
                                                {product().stockQuantity <= 0
                                                    ? 'Out of stock'
                                                    : `${product().stockQuantity} in stock`}
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <Show when={product().description}>
                                            <div class="pt-4 border-t border-slate-800">
                                                <h3 class="text-sm font-semibold text-slate-300 mb-2">Description</h3>
                                                <p class="text-slate-400 text-sm leading-relaxed">
                                                    {product().description}
                                                </p>
                                            </div>
                                        </Show>
                                    </div>
                                </div>
                            );
                        }}
                    </Show>
                </div>

                {/* Bottom Action Bar */}
                <Show when={productDetail() && productDetail()!.stockQuantity > 0}>
                    <div class="fixed bottom-16 left-0 right-0 p-4 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/50 z-50">
                        {(() => {
                            const product = productDetail()!;
                            const qty = getCartQuantity(product.id);
                            const inCart = qty > 0;

                            return inCart ? (
                                <div class="flex items-center justify-between gap-4">
                                    <div class="flex items-center gap-3">
                                        <button
                                            onClick={() => handleQuantityChange(-1)}
                                            class="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center active:scale-95"
                                        >
                                            <Minus class="w-5 h-5" />
                                        </button>
                                        <span class="text-xl font-bold text-white w-12 text-center">{qty}</span>
                                        <button
                                            onClick={() => handleQuantityChange(1)}
                                            class="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center active:scale-95"
                                        >
                                            <Plus class="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-white font-bold">
                                            {formatCurrency(parseFloat(product.price) * qty)}
                                        </div>
                                        <div class="text-slate-500 text-xs">in cart</div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleAddToCart}
                                    class="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-blue-600/20"
                                >
                                    <ShoppingCart class="w-5 h-5" />
                                    Add to Cart
                                </button>
                            );
                        })()}
                    </div>
                </Show>
            </div>
        </Show>
    );
};

export default ProductDetailModal;
