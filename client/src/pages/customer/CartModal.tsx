/**
 * Cart Modal Component
 * 
 * Shopping cart modal with discount code support, line totals, and checkout.
 */

import { type Component, createSignal, Show, For, onMount, createEffect } from 'solid-js';
import { X, ShoppingCart, Box, ArrowRight, Loader2, Tag, Sparkles } from 'lucide-solid';
import type { CartItem, Address } from '../../types/customer-portal';
import { formatMoney, getOptimizedImage } from '../../utils/formatters';
import { useI18n } from '../../i18n';
import { discountsApi, type DiscountValidationResult, type DiscountPreview } from '../../services/customer-api';

interface CartModalProps {
    cart: CartItem[];
    addresses: Address[];
    currency: string;
    onClose: () => void;
    onUpdateCart: (cart: CartItem[]) => void;
    onCheckout: (notes: string, address: string, discountId?: string) => void;
    checkingOut: boolean;
}

const CartModal: Component<CartModalProps> = (props) => {
    const { t } = useI18n();
    const [notes, setNotes] = createSignal('');
    const [customAddress, setCustomAddress] = createSignal('');
    const [selectedAddress, setSelectedAddress] = createSignal<string>('');

    // Discount state
    const [discountCode, setDiscountCode] = createSignal('');
    const [applyingDiscount, setApplyingDiscount] = createSignal(false);
    const [appliedDiscount, setAppliedDiscount] = createSignal<DiscountValidationResult | null>(null);
    const [discountError, setDiscountError] = createSignal('');

    // Auto-discount preview
    const [autoDiscount, setAutoDiscount] = createSignal<DiscountPreview | null>(null);
    const [loadingAutoDiscount, setLoadingAutoDiscount] = createSignal(false);

    const subtotal = () => props.cart.reduce((s, i) => s + i.product.sellingPrice * i.quantity, 0);
    const totalQty = () => props.cart.reduce((s, i) => s + i.quantity, 0);
    const discountAmount = () => appliedDiscount()?.discountAmount || autoDiscount()?.discountAmount || 0;
    const total = () => subtotal() - discountAmount();

    // Fetch auto-discount preview when cart changes
    createEffect(async () => {
        const cartTotal = subtotal();
        const itemsCount = totalQty();

        if (cartTotal > 0 && !appliedDiscount()) {
            setLoadingAutoDiscount(true);
            try {
                const result = await discountsApi.preview(cartTotal, itemsCount);
                if (result.success && result.data) {
                    setAutoDiscount(result.data);
                } else {
                    setAutoDiscount(null);
                }
            } catch {
                // Ignore errors in preview
            } finally {
                setLoadingAutoDiscount(false);
            }
        } else if (cartTotal === 0) {
            setAutoDiscount(null);
        }
    });

    // Auto-select default address
    onMount(() => {
        const defaultAddr = props.addresses.find(a => a.isDefault);
        if (defaultAddr) setSelectedAddress(defaultAddr.address);
    });

    const updateQty = (id: string, delta: number) => {
        const newCart = props.cart
            .map(i => i.product.id === id
                ? { ...i, quantity: Math.max(0, Math.min(i.quantity + delta, i.product.stockQty)) }
                : i
            )
            .filter(i => i.quantity > 0);
        props.onUpdateCart(newCart);

        // Clear discount when cart changes (might invalidate it)
        if (appliedDiscount()) {
            setAppliedDiscount(null);
        }
    };

    const getDeliveryAddress = () => {
        if (selectedAddress() === 'other' || props.addresses.length === 0) {
            return customAddress();
        }
        return selectedAddress();
    };

    const handleApplyDiscount = async () => {
        if (!discountCode().trim()) return;

        setApplyingDiscount(true);
        setDiscountError('');

        try {
            const items = props.cart.map(i => ({
                productId: i.product.id,
                quantity: i.quantity,
                unitPrice: i.product.sellingPrice
            }));

            const result = await discountsApi.validate(discountCode().trim(), subtotal(), items);

            if (result.success && result.data) {
                setAppliedDiscount(result.data);
                setDiscountCode('');
            } else {
                setDiscountError(result.error?.message || t('cart.invalidDiscount') as string);
            }
        } catch {
            setDiscountError(t('errors.generic') as string);
        } finally {
            setApplyingDiscount(false);
        }
    };

    const handleRemoveDiscount = () => {
        setAppliedDiscount(null);
        setDiscountError('');
    };

    const handleCheckout = () => {
        props.onCheckout(
            notes(),
            getDeliveryAddress(),
            appliedDiscount()?.discountId
        );
    };

    return (
        <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
            <div class="cart-modal">
                <div class="cart-header">
                    <h2>{t('cart.title', { count: props.cart.length })}</h2>
                    <button class="btn-icon" onClick={props.onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div class="cart-content">
                    <Show when={props.cart.length === 0}>
                        <div class="empty-state" style="color:#64748b;padding:3rem;">
                            <ShoppingCart size={48} />
                            <p>{t('cart.empty')}</p>
                            <p style="font-size:0.85rem;opacity:0.7">{t('cart.emptyDescription')}</p>
                        </div>
                    </Show>

                    <For each={props.cart}>{(item) => (
                        <div class="cart-item">
                            <Show
                                when={item.product.imageUrl}
                                fallback={
                                    <div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;">
                                        <Box size={24} color="#94a3b8" />
                                    </div>
                                }
                            >
                                <img
                                    src={getOptimizedImage(item.product.imageUrl, 100)}
                                    alt={item.product.name}
                                    class="cart-item-image"
                                    loading="lazy"
                                />
                            </Show>

                            <div class="cart-item-info">
                                <div class="cart-item-name">{item.product.name}</div>
                                <div class="cart-item-price">
                                    {formatMoney(item.product.sellingPrice)} {props.currency}
                                </div>
                                <div class="cart-item-line-total">
                                    {t('cart.lineTotal', {
                                        qty: item.quantity,
                                        price: `${formatMoney(item.product.sellingPrice * item.quantity)} ${props.currency}`
                                    })}
                                </div>
                            </div>

                            <div class="cart-item-qty">
                                <button class="qty-btn" onClick={() => updateQty(item.product.id, -1)}>−</button>
                                <span class="qty-value">{item.quantity}</span>
                                <button class="qty-btn" onClick={() => updateQty(item.product.id, 1)}>+</button>
                            </div>

                            <button
                                class="btn-icon"
                                onClick={() => props.onUpdateCart(props.cart.filter(c => c.product.id !== item.product.id))}
                                style="color:#f43f5e"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}</For>
                </div>

                <Show when={props.cart.length > 0}>
                    <div class="cart-footer">
                        {/* Discount Code Section */}
                        <div class="discount-section">
                            <Show when={!appliedDiscount()}>
                                <div class="discount-input-row">
                                    <input
                                        type="text"
                                        placeholder={t('cart.discountCode') as string}
                                        value={discountCode()}
                                        onInput={(e) => {
                                            setDiscountCode(e.currentTarget.value);
                                            setDiscountError('');
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleApplyDiscount()}
                                    />
                                    <button
                                        class="btn-apply-discount"
                                        onClick={handleApplyDiscount}
                                        disabled={applyingDiscount() || !discountCode().trim()}
                                    >
                                        <Show when={applyingDiscount()} fallback={t('cart.applyDiscount')}>
                                            <Loader2 size={16} class="spin" />
                                        </Show>
                                    </button>
                                </div>
                                <Show when={discountError()}>
                                    <p style="color:#dc2626;font-size:0.85rem;margin:0.5rem 0 0">{discountError()}</p>
                                </Show>
                            </Show>

                            <Show when={appliedDiscount()}>
                                <div class="discount-applied">
                                    <div class="discount-applied-info">
                                        <Tag size={18} />
                                        <span class="discount-applied-name">{appliedDiscount()!.discountName}</span>
                                        <span class="discount-applied-value">
                                            ({appliedDiscount()!.discountType === 'percentage'
                                                ? `${appliedDiscount()!.discountValue}%`
                                                : formatMoney(appliedDiscount()!.discountValue)}
                                            )
                                        </span>
                                    </div>
                                    <button class="btn-remove-discount" onClick={handleRemoveDiscount}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </Show>
                        </div>

                        {/* Cart Summary */}
                        <div class="cart-summary">
                            <div class="cart-summary-row">
                                <span>{t('cart.subtotal')}</span>
                                <span>{formatMoney(subtotal())} {props.currency}</span>
                            </div>

                            {/* Show manual discount */}
                            <Show when={appliedDiscount()}>
                                <div class="cart-summary-row discount">
                                    <span><Tag size={14} /> {appliedDiscount()!.discountName}</span>
                                    <span>-{formatMoney(discountAmount())} {props.currency}</span>
                                </div>
                            </Show>

                            {/* Show auto discount preview when no manual discount */}
                            <Show when={!appliedDiscount() && autoDiscount()}>
                                <div class="cart-summary-row discount auto-discount">
                                    <span><Sparkles size={14} /> {autoDiscount()!.name}</span>
                                    <span>-{formatMoney(autoDiscount()!.discountAmount)} {props.currency}</span>
                                </div>
                                <div class="auto-discount-hint">
                                    {t('cart.autoDiscountHint')}
                                </div>
                            </Show>

                            {/* Loading state for auto discount */}
                            <Show when={!appliedDiscount() && !autoDiscount() && loadingAutoDiscount()}>
                                <div class="cart-summary-row discount loading">
                                    <span><Loader2 size={14} class="spin" /> {t('cart.checkingDiscounts')}</span>
                                </div>
                            </Show>

                            <div class="cart-summary-row total">
                                <span>{t('cart.total')}</span>
                                <span>{formatMoney(total())} {props.currency}</span>
                            </div>
                        </div>

                        <div class="cart-address">
                            <label>{t('cart.deliveryAddress')}</label>
                            <div class="address-selector">
                                <Show
                                    when={props.addresses.length > 0}
                                    fallback={
                                        <textarea
                                            placeholder={t('cart.enterAddress') as string}
                                            value={customAddress()}
                                            onInput={(e) => setCustomAddress(e.currentTarget.value)}
                                            rows={2}
                                        />
                                    }
                                >
                                    <select
                                        value={selectedAddress()}
                                        onChange={(e) => setSelectedAddress(e.currentTarget.value)}
                                    >
                                        <option value="">{t('cart.selectAddress')}</option>
                                        <For each={props.addresses}>{(addr) => (
                                            <option value={addr.address}>
                                                {addr.name} - {addr.address}
                                            </option>
                                        )}</For>
                                        <option value="other">{t('cart.otherAddress')}</option>
                                    </select>

                                    <Show when={selectedAddress() === 'other'}>
                                        <textarea
                                            placeholder={t('cart.enterAddress') as string}
                                            value={customAddress()}
                                            onInput={(e) => setCustomAddress(e.currentTarget.value)}
                                            rows={2}
                                            style="margin-top:0.5rem"
                                        />
                                    </Show>
                                </Show>
                            </div>
                        </div>

                        <div class="cart-notes">
                            <textarea
                                placeholder={t('cart.notes') as string}
                                value={notes()}
                                onInput={(e) => setNotes(e.currentTarget.value)}
                                rows={2}
                            />
                        </div>

                        <button
                            class="btn-checkout"
                            onClick={handleCheckout}
                            disabled={props.checkingOut || !getDeliveryAddress().trim()}
                            title={!getDeliveryAddress().trim() ? t('cart.addressRequired') as string : ''}
                        >
                            <Show when={props.checkingOut} fallback={
                                <>{t('cart.checkout')} <ArrowRight size={18} /></>
                            }>
                                <Loader2 size={18} class="spin" /> {t('cart.processing')}
                            </Show>
                        </button>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default CartModal;
