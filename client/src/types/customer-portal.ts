/**
 * Customer Portal Types
 * 
 * Shared TypeScript types for the Customer Portal.
 * Ensures type consistency between components.
 */

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message?: string;
        details?: string[];
        remainingAttempts?: number;
    };
    message?: string;
    warnings?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    meta?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasMore: boolean;
        currency?: string;
        totalPaid?: number;
    };
}

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface CustomerProfile {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    debtBalance: number;
    creditBalance: number;
    currency: string;
    tenant?: TenantInfo;
}

export interface TenantInfo {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    telegramBotUsername?: string;
}

export interface TenantBranding {
    name: string;
    logo?: string;
    phone?: string;
    email?: string;
    address?: string;
    currency: string;
    telegramBotUsername?: string;
}

export interface Order {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    createdAt: string;
    deliveredAt?: string;
}

export interface OrderDetail extends Order {
    subtotalAmount: string;
    discountAmount: string;
    notes?: string;
    deliveryNotes?: string;
    items: OrderItem[];
    paymentUrl?: string;
}

export interface OrderItem {
    id: string;
    productName: string;
    sku: string;
    imageUrl?: string;
    unitPrice: number;
    qtyOrdered: number;
    qtyDelivered: number;
    lineTotal: number;
}

export interface Product {
    id: string;
    name: string;
    sku: string;
    description?: string;
    sellingPrice: number;
    imageUrl?: string;
    images?: ProductImage[];
    stockQty: number;
    inStock: boolean;
    categoryId?: string;
    isFavorite?: boolean;
}

export interface ProductImage {
    id: string;
    imageUrl: string;
    sortOrder?: number;
}

export interface Payment {
    id: string;
    orderId: string;
    orderNumber: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    createdAt: string;
}

export interface Address {
    id: string;
    name: string;
    address: string;
    latitude?: string;
    longitude?: string;
    isDefault: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface CartItem {
    product: Product;
    quantity: number;
}

export interface TimelineStep {
    status: string;
    label: string;
    icon: string;
    completed: boolean;
    current: boolean;
    date: string | null;
}

// ============================================================================
// ENUM TYPES
// ============================================================================

export type OrderStatus =
    | 'pending'
    | 'confirmed'
    | 'approved'
    | 'delivering'
    | 'delivered'
    | 'cancelled'
    | 'returned';

export type PaymentStatus =
    | 'unpaid'
    | 'partial'
    | 'paid';

// ============================================================================
// UI STATE TYPES
// ============================================================================

export type PortalTab = 'orders' | 'products' | 'favorites' | 'payments' | 'profile';

export interface CartState {
    items: CartItem[];
    isOpen: boolean;
    isCheckingOut: boolean;
}

export interface SearchState {
    query: string;
    debouncedQuery: string;
    categoryId: string;
}
