/**
 * Customer Dashboard Component (Refactored)
 * 
 * Main dashboard with tabs: orders, products, favorites, payments, and profile.
 * Uses modular tab components for better maintainability.
 * Enhanced with: theme toggle, language selector, and all previous features.
 */

import { type Component, createSignal, Show, onMount, createEffect, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
    Package, User, LogOut, RefreshCw, AlertCircle, CreditCard,
    ShoppingCart, Store, Heart, Loader2
} from 'lucide-solid';
import { customerApi } from '../../services/customer-api';
import type {
    CustomerProfile, Order, Product, Payment, Address, CartItem, PortalTab
} from '../../types/customer-portal';
import { toast } from '../../components/Toast';
import { useI18n } from '../../i18n';
import CartModal from './CartModal';
import ProductModal from './ProductModal';
import OrderConfirmationModal from '../../components/OrderConfirmationModal';
import AddressModal from '../../components/AddressModal';
import ThemeToggle from '../../components/ThemeToggle';
import LanguageSelector from '../../components/LanguageSelector';

// Import tab components
import { OrdersTab, ProductsTab, FavoritesTab, PaymentsTab, ProfileTab } from './tabs';

// Search history storage key
const SEARCH_HISTORY_KEY = 'customer_portal_search_history';
const MAX_SEARCH_HISTORY = 5;

interface CustomerDashboardProps {
    token: string;
    onLogout: () => void;
}

const CustomerDashboard: Component<CustomerDashboardProps> = (props) => {
    const { t } = useI18n();
    const navigate = useNavigate();

    // Profile & Data
    const [profile, setProfile] = createSignal<CustomerProfile | null>(null);
    const [orders, setOrders] = createSignal<Order[]>([]);
    const [products, setProducts] = createSignal<Product[]>([]);
    const [favorites, setFavorites] = createSignal<Product[]>([]);
    const [addresses, setAddresses] = createSignal<Address[]>([]);
    const [payments, setPayments] = createSignal<Payment[]>([]);
    const [categories, setCategories] = createSignal<{ id: string; name: string }[]>([]);

    // UI State
    const [loading, setLoading] = createSignal(true);
    const [activeTab, setActiveTab] = createSignal<PortalTab>('orders');
    const [cart, setCart] = createSignal<CartItem[]>([]);
    const [showCart, setShowCart] = createSignal(false);
    const [selectedProduct, setSelectedProduct] = createSignal<Product | null>(null);
    const [refreshing, setRefreshing] = createSignal(false);

    // Pagination
    const [ordersPage, setOrdersPage] = createSignal(1);
    const [productsPage, setProductsPage] = createSignal(1);
    const [hasMoreOrders, setHasMoreOrders] = createSignal(false);
    const [hasMoreProducts, setHasMoreProducts] = createSignal(false);
    const [loadingMore, setLoadingMore] = createSignal(false);

    // Search & Filters
    const [searchQuery, setSearchQuery] = createSignal('');
    const [debouncedSearch, setDebouncedSearch] = createSignal('');
    const [selectedCategory, setSelectedCategory] = createSignal<string>('');
    const [searchHistory, setSearchHistory] = createSignal<string[]>([]);

    // Actions State
    const [reordering, setReordering] = createSignal<string | null>(null);
    const [cancelling, setCancelling] = createSignal<string | null>(null);
    const [checkingOut, setCheckingOut] = createSignal(false);
    const [totalPaid, setTotalPaid] = createSignal(0);

    // Address State
    const [showAddressModal, setShowAddressModal] = createSignal(false);
    const [editingAddress, setEditingAddress] = createSignal<Address | null>(null);

    // Order Confirmation Modal
    const [orderConfirmation, setOrderConfirmation] = createSignal<{
        orderNumber: string;
        orderId: string;
        totalAmount: number;
        itemCount: number;
    } | null>(null);

    // Load search history from localStorage
    onMount(() => {
        const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (saved) {
            try {
                setSearchHistory(JSON.parse(saved));
            } catch { /* ignore */ }
        }
    });

    // Save search to history
    const saveToSearchHistory = (query: string) => {
        if (!query.trim()) return;
        const current = searchHistory().filter(h => h.toLowerCase() !== query.toLowerCase());
        const updated = [query, ...current].slice(0, MAX_SEARCH_HISTORY);
        setSearchHistory(updated);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
    };

    const clearSearchHistory = () => {
        setSearchHistory([]);
        localStorage.removeItem(SEARCH_HISTORY_KEY);
    };

    // Infinite Scroll - use callback ref for proper timing
    const setupLoadMoreObserver = (el: HTMLDivElement) => {
        if (!el) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !loadingMore()) {
                const tab = activeTab();
                if (tab === 'orders' && hasMoreOrders()) {
                    loadMoreOrders();
                } else if (tab === 'products' && hasMoreProducts()) {
                    loadMoreProducts();
                }
            }
        }, { rootMargin: '100px' });

        observer.observe(el);
        onCleanup(() => observer.disconnect());
    };

    // Search handler with debounce
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        // Debounce already handled in ProductsTab
        setDebouncedSearch(value);
        if (value.trim()) {
            saveToSearchHistory(value.trim());
        }
    };

    // Initial Load
    onMount(async () => {

        try {
            // Load cart first
            const cartData = await customerApi.cart.get();
            if (cartData.success && cartData.data) setCart(cartData.data);

            // Load profile and orders in parallel
            const [profileRes, ordersRes] = await Promise.all([
                customerApi.profile.get(),
                customerApi.orders.list()
            ]);

            if (profileRes.success && profileRes.data) {
                setProfile(profileRes.data);
            }

            if (ordersRes.success && ordersRes.data) {
                setOrders(ordersRes.data);
                setHasMoreOrders(ordersRes.meta?.hasMore || false);
            }

            // Background load addresses and favorites
            customerApi.addresses.list().then(r => r.success && r.data && setAddresses(r.data));
            customerApi.favorites.list().then(r => r.success && r.data && setFavorites(r.data));

        } catch {
            props.onLogout();
        } finally {
            setLoading(false);
        }
    });

    // Tab Change Effect
    createEffect(async () => {
        if (activeTab() === 'products') {
            const data = await customerApi.products.list(1, debouncedSearch(), selectedCategory());
            if (data.success && data.data) {
                setProducts(data.data);
                setProductsPage(1);
                setHasMoreProducts(data.meta?.hasMore || false);
            }

            if (categories().length === 0) {
                const catData = await customerApi.products.getCategories();
                if (catData.success && catData.data) {
                    setCategories(catData.data.subcategories || []);
                }
            }
        }

        if (activeTab() === 'payments' && payments().length === 0) {
            const data = await customerApi.payments.list();
            if (data.success && data.data) {
                setPayments(data.data);
                setTotalPaid(data.meta?.totalPaid || 0);
            }
        }

        if (activeTab() === 'favorites') {
            const res = await customerApi.favorites.list();
            if (res.success && res.data) setFavorites(res.data);
        }
    });

    // Cart Sync
    let cartSyncTimeout: ReturnType<typeof setTimeout> | null = null;
    const syncCart = (newCart: CartItem[]) => {
        setCart(newCart);
        if (cartSyncTimeout) clearTimeout(cartSyncTimeout);
        cartSyncTimeout = setTimeout(() => {
            customerApi.cart.update(newCart.map(i => ({ productId: i.product.id, quantity: i.quantity })));
        }, 1000);
    };

    // Helpers
    const currency = () => profile()?.currency || 'UZS';
    const cartCount = () => cart().reduce((s, i) => s + i.quantity, 0);

    // Actions
    const toggleFavorite = async (p: Product) => {
        if (favorites().some(f => f.id === p.id)) {
            setFavorites(favorites().filter(f => f.id !== p.id));
            await customerApi.favorites.remove(p.id);
        } else {
            setFavorites([...favorites(), p]);
            await customerApi.favorites.add(p.id);
        }
    };

    const addToCart = (p: Product, q: number) => {
        const existing = cart().find(i => i.product.id === p.id);
        const newCart = existing
            ? cart().map(i => i.product.id === p.id ? { ...i, quantity: Math.min(i.quantity + q, p.stockQty) } : i)
            : [...cart(), { product: p, quantity: q }];
        syncCart(newCart);
        toast.success(t('products.addToCart') as string);
    };

    const handleCheckout = async (notes: string, address: string, _discountId?: string) => {
        setCheckingOut(true);
        try {
            const items = cart().map(i => ({ productId: i.product.id, quantity: i.quantity }));
            const result = await customerApi.orders.create(items, notes, address);

            if (result.success && result.data) {
                syncCart([]);
                setShowCart(false);

                // Show order confirmation modal
                setOrderConfirmation({
                    orderNumber: result.data.orderNumber,
                    orderId: result.data.orderId,
                    totalAmount: result.data.totalAmount,
                    itemCount: result.data.itemCount
                });

                // Refresh orders and profile in background
                customerApi.orders.list().then(r => r.success && r.data && setOrders(r.data));
                customerApi.profile.get().then(r => r.success && r.data && setProfile(r.data));
            } else {
                toast.error(result.error?.message || t('cart.error') as string);
            }
        } catch {
            toast.error(t('errors.generic') as string);
        } finally {
            setCheckingOut(false);
        }
    };

    const handleReorder = async (id: string) => {
        setReordering(id);
        try {
            const result = await customerApi.orders.reorder(id);
            if (result.success && result.data) {
                // Refresh orders list - reset pagination like handleRefresh does
                const ordersRes = await customerApi.orders.list();
                if (ordersRes.success && ordersRes.data) {
                    setOrders(ordersRes.data);
                    setOrdersPage(1);
                    setHasMoreOrders(ordersRes.meta?.hasMore || false);
                }

                const profileRes = await customerApi.profile.get();
                if (profileRes.success && profileRes.data) setProfile(profileRes.data);

                toast.success(result.data.message);
            } else {
                toast.error(result.error?.message || t('errors.generic') as string);
            }
        } finally {
            setReordering(null);
        }
    };

    const handleCancelOrder = async (id: string) => {
        if (!confirm(t('modals.cancelOrder') as string)) return;
        setCancelling(id);
        try {
            const result = await customerApi.orders.cancel(id);

            if (result.success) {
                // Refresh orders list - reset pagination like handleRefresh does
                const ordersRes = await customerApi.orders.list();

                if (ordersRes.success && ordersRes.data) {
                    setOrders(ordersRes.data);
                    setOrdersPage(1);
                    setHasMoreOrders(ordersRes.meta?.hasMore || false);
                }

                const profileRes = await customerApi.profile.get();
                if (profileRes.success && profileRes.data) setProfile(profileRes.data);

                toast.success(t('orders.cancel') as string);
            } else {
                toast.error(result.error?.message || t('errors.generic') as string);
            }
        } catch {
            // Error already handled
        } finally {
            setCancelling(null);
        }
    };

    const loadMoreOrders = async () => {
        if (loadingMore()) return;
        setLoadingMore(true);
        const nextPage = ordersPage() + 1;
        const data = await customerApi.orders.list(nextPage);
        if (data.success && data.data) {
            setOrders([...orders(), ...data.data]);
            setOrdersPage(nextPage);
            setHasMoreOrders(data.meta?.hasMore || false);
        }
        setLoadingMore(false);
    };

    const loadMoreProducts = async () => {
        if (loadingMore()) return;
        setLoadingMore(true);
        const nextPage = productsPage() + 1;
        const data = await customerApi.products.list(nextPage, debouncedSearch(), selectedCategory());
        if (data.success && data.data) {
            setProducts([...products(), ...data.data]);
            setProductsPage(nextPage);
            setHasMoreProducts(data.meta?.hasMore || false);
        }
        setLoadingMore(false);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            // Refresh everything that might have changed
            const p = await customerApi.profile.get();
            if (p.success && p.data) setProfile(p.data);

            if (activeTab() === 'orders') {
                const data = await customerApi.orders.list();
                if (data.success && data.data) {
                    setOrders(data.data);
                    setOrdersPage(1);
                    setHasMoreOrders(data.meta?.hasMore || false);
                }
            } else if (activeTab() === 'products') {
                const data = await customerApi.products.list();
                if (data.success && data.data) {
                    setProducts(data.data);
                    setProductsPage(1);
                    setHasMoreProducts(data.meta?.hasMore || false);
                }
            } else if (activeTab() === 'favorites') {
                const res = await customerApi.favorites.list();
                if (res.success && res.data) setFavorites(res.data);
            } else if (activeTab() === 'payments') {
                const data = await customerApi.payments.list();
                if (data.success && data.data) {
                    setPayments(data.data);
                    setTotalPaid(data.meta?.totalPaid || 0);
                }
            } else if (activeTab() === 'profile') {
                const addrs = await customerApi.addresses.list();
                if (addrs.success && addrs.data) setAddresses(addrs.data);
            }
        } finally {
            setRefreshing(false);
        }
    };

    // Address handlers
    const handleSaveAddress = async (addressData: { name: string; address: string; isDefault: boolean }) => {
        if (editingAddress()) {
            const res = await customerApi.addresses.update(editingAddress()!.id, addressData);
            if (res.success) {
                const addressesRes = await customerApi.addresses.list();
                if (addressesRes.success && addressesRes.data) setAddresses(addressesRes.data);
                toast.success(t('profile.addressUpdated') as string);
            }
        } else {
            const res = await customerApi.addresses.add(addressData);
            if (res.success) {
                const addressesRes = await customerApi.addresses.list();
                if (addressesRes.success && addressesRes.data) setAddresses(addressesRes.data);
                toast.success(t('profile.addressAdded') as string);
            }
        }
        setEditingAddress(null);
        setShowAddressModal(false);
    };

    const handleEditAddress = (addr: Address) => {
        setEditingAddress(addr);
        setShowAddressModal(true);
    };

    const handleSetDefaultAddress = async (id: string) => {
        const res = await customerApi.addresses.update(id, { isDefault: true });
        if (res.success) {
            const addressesRes = await customerApi.addresses.list();
            if (addressesRes.success && addressesRes.data) setAddresses(addressesRes.data);
            toast.success(t('profile.defaultChanged') as string);
        }
    };

    const handleDeleteAddress = async (id: string) => {
        if (confirm(t('modals.deleteAddress') as string)) {
            await customerApi.addresses.delete(id);
            setAddresses(addresses().filter(a => a.id !== id));
            toast.success(t('profile.addressDeleted') as string);
        }
    };

    const handleSaveProfile = async (updates: { email: string; address: string }) => {
        const res = await customerApi.profile.update(updates);
        if (res.success && res.data) {
            setProfile({ ...profile()!, ...res.data });
            toast.success(t('profile.profileUpdated') as string);
        }
    };

    const handleLogout = () => {
        if (confirm(t('modals.logout') as string)) {
            props.onLogout();
        }
    };

    return (
        <div class="portal-dashboard">
            <header class="dashboard-header-compact">
                <h1>{t('dashboard.hello', { name: profile()?.name?.split(' ')[0] || 'Mijoz' })}</h1>
                <div class="header-controls">
                    <LanguageSelector />
                    <ThemeToggle />
                    <button class={`btn-icon-xs ${refreshing() ? 'spin' : ''}`} onClick={handleRefresh} title={t('dashboard.update') as string}>
                        <RefreshCw size={16} />
                    </button>
                    <button class="btn-icon-xs logout" onClick={handleLogout} title={t('dashboard.logout') as string}>
                        <LogOut size={16} />
                    </button>
                </div>
            </header>



            <Show when={!loading()} fallback={
                <div class="loading-state">
                    <Loader2 size={32} class="spin" />
                    <p>{t('dashboard.loading')}</p>
                </div>
            }>

                <div class="tabs-container">
                    <div class="tabs">
                        <button class={`tab ${activeTab() === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                            <Package size={18} /> {t('tabs.orders')}
                        </button>
                        <button class={`tab ${activeTab() === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
                            <Store size={18} /> {t('tabs.catalog')}
                        </button>
                        <button class={`tab ${activeTab() === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
                            <Heart size={18} /> {t('tabs.favorites')}
                        </button>
                        <button class={`tab ${activeTab() === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
                            <CreditCard size={18} /> {t('tabs.payments')}
                        </button>
                        <button class={`tab ${activeTab() === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                            <User size={18} /> {t('tabs.profile')}
                        </button>
                    </div>
                </div>

                {/* Orders Tab */}
                <Show when={activeTab() === 'orders'}>
                    <OrdersTab
                        orders={orders()}
                        currency={currency()}
                        hasMore={hasMoreOrders()}
                        loadingMore={loadingMore()}
                        onLoadMore={loadMoreOrders}
                        onReorder={handleReorder}
                        onCancel={handleCancelOrder}
                        reordering={reordering()}
                        cancelling={cancelling()}
                        onSwitchToProducts={() => setActiveTab('products')}
                        setupLoadMoreObserver={setupLoadMoreObserver}
                        debtBalance={profile()?.debtBalance}
                    />
                </Show>

                {/* Products Tab */}
                <Show when={activeTab() === 'products'}>
                    <ProductsTab
                        products={products()}
                        categories={categories()}
                        currency={currency()}
                        hasMore={hasMoreProducts()}
                        loadingMore={loadingMore()}
                        searchQuery={searchQuery()}
                        selectedCategory={selectedCategory()}
                        favorites={favorites()}
                        cart={cart()}
                        searchHistory={searchHistory()}
                        onSearchChange={handleSearchChange}
                        onCategoryChange={setSelectedCategory}
                        onClearSearchHistory={clearSearchHistory}
                        onSelectFromHistory={(q) => { setSearchQuery(q); setDebouncedSearch(q); }}
                        onAddToCart={addToCart}
                        onToggleFavorite={toggleFavorite}
                        onSelectProduct={setSelectedProduct}
                        setupLoadMoreObserver={setupLoadMoreObserver}
                    />
                </Show>

                {/* Favorites Tab */}
                <Show when={activeTab() === 'favorites'}>
                    <FavoritesTab
                        favorites={favorites()}
                        cart={cart()}
                        currency={currency()}
                        onAddToCart={addToCart}
                        onToggleFavorite={toggleFavorite}
                        onSelectProduct={setSelectedProduct}
                        onSwitchToProducts={() => setActiveTab('products')}
                    />
                </Show>

                {/* Payments Tab */}
                <Show when={activeTab() === 'payments'}>
                    <PaymentsTab
                        payments={payments()}
                        totalPaid={totalPaid()}
                        currency={currency()}
                    />
                </Show>

                {/* Profile Tab */}
                <Show when={activeTab() === 'profile'}>
                    <ProfileTab
                        profile={profile()}
                        addresses={addresses()}
                        onSaveProfile={handleSaveProfile}
                        onAddAddress={() => { setEditingAddress(null); setShowAddressModal(true); }}
                        onEditAddress={handleEditAddress}
                        onSetDefaultAddress={handleSetDefaultAddress}
                        onDeleteAddress={handleDeleteAddress}
                    />
                </Show>
            </Show>

            {/* Cart FAB */}
            <Show when={cart().length > 0}>
                <button class="cart-fab" onClick={() => setShowCart(true)}>
                    <ShoppingCart size={24} />
                    <span class="cart-badge">{cartCount()}</span>
                </button>
            </Show>

            {/* Cart Modal */}
            <Show when={showCart()}>
                <CartModal
                    cart={cart()}
                    addresses={addresses()}
                    currency={currency()}
                    onClose={() => setShowCart(false)}
                    onUpdateCart={syncCart}
                    onCheckout={handleCheckout}
                    checkingOut={checkingOut()}
                />
            </Show>

            {/* Product Modal */}
            <Show when={selectedProduct()}>
                <ProductModal
                    product={selectedProduct()!}
                    currency={currency()}
                    isFavorite={favorites().some(f => f.id === selectedProduct()!.id)}
                    onToggleFavorite={toggleFavorite}
                    onClose={() => setSelectedProduct(null)}
                    onAddToCart={addToCart}
                    token={props.token}
                />
            </Show>

            {/* Order Confirmation Modal */}
            <Show when={orderConfirmation()}>
                <OrderConfirmationModal
                    orderNumber={orderConfirmation()!.orderNumber}
                    totalAmount={orderConfirmation()!.totalAmount}
                    itemCount={orderConfirmation()!.itemCount}
                    currency={currency()}
                    onViewOrder={() => {
                        navigate(`/customer/orders/${orderConfirmation()!.orderId}`);
                        setOrderConfirmation(null);
                    }}
                    onContinueShopping={() => {
                        setActiveTab('products');
                        setOrderConfirmation(null);
                    }}
                    onClose={() => setOrderConfirmation(null)}
                />
            </Show>

            {/* Address Modal */}
            <Show when={showAddressModal()}>
                <AddressModal
                    address={editingAddress()}
                    onSave={handleSaveAddress}
                    onClose={() => { setShowAddressModal(false); setEditingAddress(null); }}
                />
            </Show>
        </div>
    );
};

export default CustomerDashboard;
