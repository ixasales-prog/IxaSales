import { type Component, For, Show, createSignal, onMount } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
    ArrowLeft,
    Trash2,
    Plus,
    Minus,
    User,
    ShoppingBag,
    Send,
    AlertCircle,
    CheckCircle2
} from 'lucide-solid';
import {
    cartItems,
    cartSubtotal,
    cartTotal,
    cartCount,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    selectedCustomerId,
    setCustomer
} from '../../stores/cart';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import { useI18n } from '../../i18n';
import AddCustomerModal from './AddCustomerModal';

const Cart: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [success, setSuccess] = createSignal(false);
    const [showCustomerSelect, setShowCustomerSelect] = createSignal(false);
    const [customerName, setCustomerName] = createSignal<string>('');
    
    // Initialize customer name when component mounts if customer is already selected
    onMount(async () => {
        if (selectedCustomerId()) {
            try {
                const customerRes = await api.get(`/customers/${selectedCustomerId()}`);
                const customer = customerRes.data || customerRes;
                if (customer?.name) {
                    setCustomerName(customer.name);
                }
            } catch (error) {
                console.error('Failed to fetch customer name:', error);
            }
        }
    });

    const handleQuantityChange = (productId: string, delta: number) => {
        const item = cartItems().find(i => i.productId === productId);
        if (item) {
            updateCartQuantity(productId, item.quantity + delta);
        }
    };

    const handleSubmitOrder = async () => {
        if (!selectedCustomerId()) {
            setError(t('salesApp.cart.selectCustomerFirst'));
            return;
        }

        if (cartItems().length === 0) {
            setError('Cart is empty');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Build order items with correct field names
            const orderItems = cartItems().map(item => ({
                productId: item.productId,
                qtyOrdered: item.quantity,
                unitPrice: Number(item.price),
                lineTotal: Number(item.price) * item.quantity
            }));

            // Calculate totals
            const subtotal = cartSubtotal();
            const total = cartTotal();

            await api.post('/orders', {
                customerId: selectedCustomerId(),
                subtotalAmount: subtotal,
                totalAmount: total,
                items: orderItems
            });

            setSuccess(true);
            clearCart();

            setTimeout(() => {
                navigate('/sales');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to create order');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="min-h-screen pb-32">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center justify-between px-4 py-3">
                    <div class="flex items-center gap-3">
                        <A href="/sales/catalog" class="p-2 -ml-2 text-slate-400 hover:text-white">
                            <ArrowLeft class="w-5 h-5" />
                        </A>
                        <div>
                            <h1 class="text-lg font-bold text-white">Shopping Cart</h1>
                            <p class="text-slate-500 text-xs">{cartCount()} items</p>
                        </div>
                    </div>
                    <Show when={cartCount() > 0}>
                        <button
                            onClick={() => clearCart()}
                            class="text-red-400 text-sm font-medium active:scale-95"
                        >
                            Clear All
                        </button>
                    </Show>
                </div>
            </div>

            {/* Success Message */}
            <Show when={success()}>
                <div class="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div class="text-center animate-in fade-in zoom-in">
                        <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 class="w-10 h-10 text-green-400" />
                        </div>
                        <h2 class="text-xl font-bold text-white mb-2">Order Submitted!</h2>
                        <p class="text-slate-400">Redirecting to dashboard...</p>
                    </div>
                </div>
            </Show>

            {/* Content */}
            <div class="pt-20 px-4">
                {/* Empty State */}
                <Show when={cartCount() === 0}>
                    <div class="text-center py-16">
                        <div class="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag class="w-10 h-10 text-slate-600" />
                        </div>
                        <h2 class="text-xl font-bold text-white mb-2">Cart is empty</h2>
                        <p class="text-slate-400 mb-6">Add products to start an order</p>
                        <A
                            href="/sales/catalog"
                            class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl active:scale-95 transition-transform"
                        >
                            <ShoppingBag class="w-5 h-5" />
                            Browse Catalog
                        </A>
                    </div>
                </Show>

                {/* Cart Items */}
                <Show when={cartCount() > 0}>
                    {/* Customer Selection */}
                    <button
                        onClick={() => setShowCustomerSelect(true)}
                        class="w-full p-4 mb-4 bg-slate-900/60 border border-slate-800/50 rounded-2xl flex items-center justify-between active:scale-[0.99] transition-transform"
                    >
                        <div class="flex items-center gap-3">
                            <div class={`w-10 h-10 rounded-full flex items-center justify-center ${selectedCustomerId() ? 'bg-green-500/20' : 'bg-slate-800'}`}>
                                <User class={`w-5 h-5 ${selectedCustomerId() ? 'text-green-400' : 'text-slate-500'}`} />
                            </div>
                            <div class="text-left">
                                <div class="text-white font-medium">
                                    {customerName() || 'Select Customer'}
                                </div>
                                <div class="text-slate-500 text-xs">
                                    {selectedCustomerId() ? 'Tap to change' : 'Required for order'}
                                </div>
                            </div>
                        </div>
                        <div class={`text-sm ${selectedCustomerId() ? 'text-green-400' : 'text-orange-400'}`}>
                            {selectedCustomerId() ? '✓' : 'Required'}
                        </div>
                    </button>

                    {/* Error Message */}
                    <Show when={error()}>
                        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle class="w-5 h-5 flex-shrink-0" />
                            {error()}
                        </div>
                    </Show>

                    {/* Items List */}
                    <div class="space-y-3">
                        <For each={cartItems()}>
                            {(item) => (
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3 flex items-center gap-3">
                                    {/* Product Image */}
                                    <div class="w-12 h-12 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                                        <Show when={item.image} fallback={
                                            <ShoppingBag class="w-5 h-5 text-slate-600" />
                                        }>
                                            <img src={item.image} alt={item.name} class="w-full h-full object-cover" />
                                        </Show>
                                    </div>

                                    <div class="flex-1 min-w-0">
                                        <h3 class="text-white font-medium text-sm line-clamp-1">{item.name}</h3>
                                        <div class="flex items-center gap-2 mt-0.5">
                                            <span class="text-slate-500 text-xs">{formatCurrency(item.price)}</span>
                                            <span class="text-slate-700 text-xs">|</span>
                                            <span class="text-blue-400 text-xs font-semibold">Total: {formatCurrency(item.price * item.quantity)}</span>
                                        </div>
                                    </div>

                                    {/* Quantity Controls */}
                                    <div class="flex items-center bg-slate-800 rounded-lg h-8">
                                        <button
                                            onClick={() => handleQuantityChange(item.productId, -1)}
                                            class="w-8 h-full flex items-center justify-center text-slate-400 hover:text-white active:bg-slate-700/50 rounded-l-lg transition-colors"
                                        >
                                            <Minus class="w-3.5 h-3.5" />
                                        </button>
                                        <span class="w-6 text-center text-white text-sm font-medium">{item.quantity}</span>
                                        <button
                                            onClick={() => handleQuantityChange(item.productId, 1)}
                                            class="w-8 h-full flex items-center justify-center text-blue-400 hover:text-blue-300 active:bg-slate-700/50 rounded-r-lg transition-colors"
                                        >
                                            <Plus class="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => removeFromCart(item.productId)}
                                        class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Customer Selection Modal */}
            <Show when={showCustomerSelect()}>
                <CustomerSelectModal
                    onSelect={(id, name) => {
                        setCustomer(id);
                        setCustomerName(name);
                        setShowCustomerSelect(false);
                        setError(null);
                    }}
                    onClose={() => setShowCustomerSelect(false)}
                />
            </Show>

            {/* Bottom Summary & Submit */}
            <Show when={cartCount() > 0}>
                <div class="fixed bottom-16 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/50 p-4 z-30">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-slate-400">Subtotal</span>
                        <span class="text-white font-medium">{formatCurrency(cartSubtotal())}</span>
                    </div>
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-white font-semibold text-lg">Total</span>
                        <span class="text-white font-bold text-xl">{formatCurrency(cartTotal())}</span>
                    </div>
                    <button
                        onClick={handleSubmitOrder}
                        disabled={loading() || !selectedCustomerId()}
                        class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Show when={loading()} fallback={
                            <>
                                <Send class="w-5 h-5" />
                                Submit Order
                            </>
                        }>
                            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Submitting...
                        </Show>
                    </button>
                </div>
            </Show>
        </div>
    );
};

// Customer Selection Modal Component
const CustomerSelectModal: Component<{
    onSelect: (id: string, name: string) => void;
    onClose: () => void;
}> = (props) => {
    const [search, setSearch] = createSignal('');
    const [customers, setCustomers] = createSignal<Array<{ id: string; name: string; phone: string }>>([]);
    const [loading, setLoading] = createSignal(true);
    const [showAddModal, setShowAddModal] = createSignal(false);

    // Fetch customers
    (async () => {
        try {
            const data = await api<Array<{ id: string; name: string; phone: string }>>('/customers', {
                params: { limit: '50' }
            });
            setCustomers(data);
        } finally {
            setLoading(false);
        }
    })();

    const filteredCustomers = () => {
        const query = search().toLowerCase();
        if (!query) return customers();
        return customers().filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.phone?.includes(query)
        );
    };

    return (
        <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50">
            <div class="h-full flex flex-col">
                {/* Header */}
                <div class="p-4 border-b border-slate-800/50">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-lg font-bold text-white">Select Customer</h2>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setShowAddModal(true)}
                                class="p-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-600/30 flex items-center gap-1 active:scale-95 transition-all"
                            >
                                <Plus class="w-4 h-4" />
                                New
                            </button>
                            <button onClick={props.onClose} class="text-slate-400 hover:text-white p-2">
                                ✕
                            </button>
                        </div>
                    </div>
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search customers..."
                        class="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>

                {/* Customer List */}
                <div class="flex-1 overflow-y-auto p-4 space-y-2">
                    <Show when={loading()}>
                        <div class="text-center py-8 text-slate-500">Loading customers...</div>
                    </Show>
                    <Show when={!loading() && filteredCustomers().length === 0}>
                        <div class="text-center py-8 text-slate-500">No customers found</div>
                    </Show>
                    <For each={filteredCustomers()}>
                        {(customer) => (
                            <button
                                onClick={() => props.onSelect(customer.id, customer.name)}
                                class="w-full p-4 bg-slate-900/60 border border-slate-800/50 rounded-xl text-left hover:bg-slate-800/60 active:scale-[0.99] transition-all"
                            >
                                <div class="text-white font-medium">{customer.name}</div>
                                <div class="text-slate-500 text-sm">{customer.phone}</div>
                            </button>
                        )}
                    </For>
                </div>
            </div>

            {/* Add Customer Modal */}
            <Show when={showAddModal()}>
                <AddCustomerModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={(newCustomer) => {
                        if (newCustomer) {
                            props.onSelect(newCustomer.id, newCustomer.name);
                        }
                        setShowAddModal(false);
                    }}
                />
            </Show>
        </div>
    );
};

export default Cart;
