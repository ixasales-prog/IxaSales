import { createSignal, createMemo, createRoot } from 'solid-js';

export interface CartItem {
    productId: string;
    name: string;
    sku: string;
    price: number;
    unit: string;
    quantity: number;
    discount?: number;
    image?: string;
}

const rootState = createRoot(() => {
    // Cart state
    const [cartItems, setCartItems] = createSignal<CartItem[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = createSignal<string | null>(null);

    // Computed values
    const cartCount = createMemo(() => cartItems().reduce((sum, item) => sum + item.quantity, 0));

    const cartSubtotal = createMemo(() =>
        cartItems().reduce((sum, item) => sum + item.price * item.quantity, 0)
    );

    const cartDiscount = createMemo(() =>
        cartItems().reduce((sum, item) => sum + (item.discount || 0), 0)
    );

    const cartTotal = createMemo(() => cartSubtotal() - cartDiscount());

    return {
        cartItems,
        setCartItems,
        selectedCustomerId,
        setSelectedCustomerId,
        cartCount,
        cartSubtotal,
        cartDiscount,
        cartTotal
    };
});

// Export reactive primitives
export const {
    cartItems,
    selectedCustomerId,
    cartCount,
    cartSubtotal,
    cartDiscount,
    cartTotal
} = rootState;

// Actions
export function addToCart(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    rootState.setCartItems((prev) => {
        const existing = prev.find((item) => item.productId === product.productId);
        if (existing) {
            return prev.map((item) =>
                item.productId === product.productId
                    ? { ...item, quantity: item.quantity + quantity }
                    : item
            );
        }
        return [...prev, { ...product, quantity }];
    });
}

export function updateCartQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    rootState.setCartItems((prev) =>
        prev.map((item) =>
            item.productId === productId ? { ...item, quantity } : item
        )
    );
}

export function removeFromCart(productId: string) {
    rootState.setCartItems((prev) => prev.filter((item) => item.productId !== productId));
}

export function clearCart() {
    rootState.setCartItems([]);
    rootState.setSelectedCustomerId(null);
}

export function setCustomer(customerId: string) {
    rootState.setSelectedCustomerId(customerId);
}
