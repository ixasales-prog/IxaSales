/**
 * Customer Portal API Service
 * 
 * Centralized API client for the Customer Portal.
 * Eliminates duplicate API calls across components.
 */

import type {
    CustomerProfile,
    Order,
    OrderDetail,
    Product,
    Payment,
    Address,
    CartItem,
    TenantBranding,
    TimelineStep,
    ApiResponse,
    PaginatedResponse
} from '../types/customer-portal';

// ============================================================================
// STORAGE HELPERS
// ============================================================================

const TOKEN_KEY = 'customer_portal_token';
const PHONE_KEY = 'customer_portal_phone';
const TENANT_KEY = 'customer_portal_tenant';

export const tokenStorage = {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
    clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const phoneStorage = {
    get: () => localStorage.getItem(PHONE_KEY) || '',
    set: (phone: string) => localStorage.setItem(PHONE_KEY, phone),
};

export const getSubdomain = (): string => {
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get('tenant');

    if (tenantParam) {
        localStorage.setItem(TENANT_KEY, tenantParam);
        return tenantParam;
    }

    const savedTenant = localStorage.getItem(TENANT_KEY);
    if (savedTenant) return savedTenant;

    const hostname = window.location.hostname;
    if (hostname.includes('.') && !hostname.startsWith('localhost')) {
        return hostname.split('.')[0];
    }

    return 'demo';
};

// ============================================================================
// API CLIENT
// ============================================================================

const RAW_BASE_URL = import.meta.env.VITE_API_URL;

const resolveBaseUrl = () => {
    const normalized = RAW_BASE_URL?.replace(/\/$/, '') || '/api';
    if (!RAW_BASE_URL) return normalized;
    if (typeof window === 'undefined') return normalized;
    try {
        const resolved = new URL(RAW_BASE_URL, window.location.origin);
        if (import.meta.env.PROD && resolved.origin !== window.location.origin) {
            return '/api';
        }
    } catch {
        return normalized;
    }
    return normalized;
};

const BASE_URL = resolveBaseUrl();

async function fetchWithAuth<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const token = tokenStorage.get();

    const headers: HeadersInit = {
        ...options.headers,
    };

    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && typeof options.body === 'string') {
        (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
        const json = await res.json();

        // If the response has an error code but no user-friendly message,
        // the frontend should translate it using the i18n system
        // The error.code is returned, and the frontend can use translateErrorCode() from i18n.ts
        return json;
    } catch (error) {
        return {
            success: false,
            error: {
                code: 'NETWORK_ERROR',
                message: 'Network error occurred'
            }
        };
    }
}

// ============================================================================
// AUTH API
// ============================================================================

export const authApi = {
    async requestOtp(phone: string): Promise<ApiResponse<{
        expiresInSeconds: number;
        maskedName: string;
        remainingAttempts: number;
    }>> {
        phoneStorage.set(phone);
        return fetchWithAuth('/customer-portal/auth/request-otp', {
            method: 'POST',
            body: JSON.stringify({ phone, tenantSubdomain: getSubdomain() })
        });
    },

    async verifyOtp(phone: string, otp: string): Promise<ApiResponse<{
        token: string;
        customer: { id: string; name: string; phone: string }
    }>> {
        return fetchWithAuth('/customer-portal/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ phone, otp, tenantSubdomain: getSubdomain() })
        });
    },
};

// ============================================================================
// PROFILE API
// ============================================================================

export const profileApi = {
    async get(): Promise<ApiResponse<CustomerProfile>> {
        const res = await fetchWithAuth<CustomerProfile>('/customer-portal/profile');
        if (res.success && res.data) {
            return {
                success: true,
                data: {
                    ...res.data,
                    debtBalance: Number(res.data.debtBalance || 0),
                    creditBalance: Number(res.data.creditBalance || 0),
                }
            };
        }
        return res;
    },

    async update(updates: { email?: string; address?: string }): Promise<ApiResponse<CustomerProfile>> {
        return fetchWithAuth('/customer-portal/profile', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },
};

// ============================================================================
// ORDERS API
// ============================================================================

export const ordersApi = {
    async list(page = 1, status?: string): Promise<PaginatedResponse<Order>> {
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (status && status !== 'all') params.append('status', status);

        const res = await fetchWithAuth<Order[]>(`/customer-portal/orders?${params}`);
        return res as PaginatedResponse<Order>;
    },

    async getDetail(orderId: string): Promise<ApiResponse<OrderDetail>> {
        return fetchWithAuth(`/customer-portal/orders/${orderId}`);
    },

    async getTimeline(orderId: string): Promise<ApiResponse<TimelineStep[]>> {
        return fetchWithAuth(`/customer-portal/orders/${orderId}/timeline`);
    },

    async create(
        items: { productId: string; quantity: number }[],
        notes?: string,
        deliveryNotes?: string
    ): Promise<ApiResponse<{ orderId: string; orderNumber: string; totalAmount: number; itemCount: number; message: string }>> {
        return fetchWithAuth('/customer-portal/orders', {
            method: 'POST',
            body: JSON.stringify({ items, notes, deliveryNotes })
        });
    },

    async cancel(orderId: string, reason?: string): Promise<ApiResponse<{ message: string; orderNumber: string }>> {
        return fetchWithAuth(`/customer-portal/orders/${orderId}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
    },

    async reorder(orderId: string): Promise<ApiResponse<{
        orderId: string;
        orderNumber: string;
        totalAmount: number;
        itemCount: number;
        message: string
    }>> {
        return fetchWithAuth(`/customer-portal/reorder/${orderId}`, { method: 'POST' });
    },
};

// ============================================================================
// PRODUCTS API
// ============================================================================

export const productsApi = {
    async list(page = 1, search = '', categoryId = ''): Promise<PaginatedResponse<Product>> {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.append('search', search);
        if (categoryId) params.append('categoryId', categoryId);

        const res = await fetchWithAuth<Product[]>(`/customer-portal/products?${params}`);
        return res as PaginatedResponse<Product>;
    },

    async getDetail(productId: string): Promise<ApiResponse<Product>> {
        return fetchWithAuth(`/customer-portal/products/${productId}`);
    },

    async getCategories(): Promise<ApiResponse<{
        categories: { id: string; name: string }[];
        subcategories: { id: string; name: string; categoryId: string }[]
    }>> {
        return fetchWithAuth('/customer-portal/categories');
    },
};

// ============================================================================
// PAYMENTS API
// ============================================================================

export const paymentsApi = {
    async list(page = 1): Promise<PaginatedResponse<Payment> & { meta?: { totalPaid?: number } }> {
        const res = await fetchWithAuth<Payment[]>(`/customer-portal/payments?page=${page}`);
        return res as PaginatedResponse<Payment>;
    },
};

// ============================================================================
// FAVORITES API
// ============================================================================

export const favoritesApi = {
    async list(): Promise<ApiResponse<Product[]>> {
        return fetchWithAuth('/customer-portal/favorites');
    },

    async add(productId: string): Promise<ApiResponse<{ message: string }>> {
        return fetchWithAuth(`/customer-portal/favorites/${productId}`, { method: 'POST' });
    },

    async remove(productId: string): Promise<ApiResponse<{ message: string }>> {
        return fetchWithAuth(`/customer-portal/favorites/${productId}`, { method: 'DELETE' });
    },
};

// ============================================================================
// ADDRESSES API
// ============================================================================

export const addressesApi = {
    async list(): Promise<ApiResponse<Address[]>> {
        return fetchWithAuth('/customer-portal/addresses');
    },

    async add(address: { name: string; address: string; isDefault?: boolean }): Promise<ApiResponse<Address>> {
        return fetchWithAuth('/customer-portal/addresses', {
            method: 'POST',
            body: JSON.stringify(address)
        });
    },

    async update(id: string, address: { name?: string; address?: string; isDefault?: boolean }): Promise<ApiResponse<Address>> {
        return fetchWithAuth(`/customer-portal/addresses/${id}`, {
            method: 'PUT',
            body: JSON.stringify(address)
        });
    },

    async delete(id: string): Promise<ApiResponse<{ message: string }>> {
        return fetchWithAuth(`/customer-portal/addresses/${id}`, { method: 'DELETE' });
    },
};

// ============================================================================
// CART API
// ============================================================================

export const cartApi = {
    async get(): Promise<ApiResponse<CartItem[]>> {
        return fetchWithAuth('/customer-portal/cart');
    },

    async update(items: { productId: string; quantity: number }[]): Promise<ApiResponse<{ message: string }>> {
        return fetchWithAuth('/customer-portal/cart', {
            method: 'PUT',
            body: JSON.stringify({ items })
        });
    },
};

// ============================================================================
// BRANDING API
// ============================================================================

export const brandingApi = {
    async getBySubdomain(subdomain: string): Promise<ApiResponse<TenantBranding>> {
        try {
            const res = await fetch(`${BASE_URL}/customer-portal/branding/${subdomain}`);
            return await res.json();
        } catch {
            return { success: false, error: { code: 'NETWORK_ERROR' } };
        }
    },
};

// ============================================================================
// DISCOUNTS API
// ============================================================================

export interface DiscountValidationResult {
    discountId: string;
    discountName: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    originalTotal: number;
    newTotal: number;
}

export interface AvailableDiscount {
    id: string;
    name: string;
    type: string;
    value: number;
    minOrderAmount: number | null;
    minQty: number | null;
    freeQty: number | null;
    expiresAt: string | null;
    description: string;
}

export interface DiscountPreview {
    id: string;
    name: string;
    type: string;
    value: number;
    discountAmount: number;
    newTotal: number;
}

export const discountsApi = {
    async validate(code: string, cartTotal: number, items?: { productId: string; quantity: number; unitPrice?: number }[]): Promise<ApiResponse<DiscountValidationResult>> {
        return fetchWithAuth('/customer-portal/discounts/validate', {
            method: 'POST',
            body: JSON.stringify({ code, cartTotal, items })
        });
    },

    async getAvailable(): Promise<ApiResponse<AvailableDiscount[]>> {
        return fetchWithAuth('/customer-portal/discounts/available');
    },

    async preview(cartTotal: number, itemsCount: number): Promise<ApiResponse<DiscountPreview | null>> {
        return fetchWithAuth('/customer-portal/discounts/preview', {
            method: 'POST',
            body: JSON.stringify({ cartTotal, itemsCount })
        });
    },
};

// ============================================================================
// REVIEWS API
// ============================================================================

export interface Review {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    customerName: string;
}

export interface ReviewStats {
    avgRating: number;
    totalReviews: number;
    distribution: Record<number, number>;
}

export const reviewsApi = {
    async getForProduct(productId: string): Promise<ApiResponse<{
        reviews: Review[];
        stats: ReviewStats;
        canReview: boolean;
    }>> {
        const res = await fetchWithAuth<Review[]>(`/customer-portal/reviews/${productId}`) as any;
        if (res.success) {
            return {
                success: true,
                data: {
                    reviews: res.data || [],
                    stats: res.stats || { avgRating: 0, totalReviews: 0, distribution: {} },
                    canReview: res.canReview || false,
                }
            };
        }
        return res;
    },

    async add(productId: string, rating: number, comment?: string): Promise<ApiResponse<{ id: string; message: string }>> {
        return fetchWithAuth(`/customer-portal/reviews/${productId}`, {
            method: 'POST',
            body: JSON.stringify({ rating, comment })
        });
    },

    async delete(reviewId: string): Promise<ApiResponse<{ message: string }>> {
        return fetchWithAuth(`/customer-portal/reviews/${reviewId}`, { method: 'DELETE' });
    },
};

// ============================================================================
// UNIFIED CUSTOMER API EXPORT
// ============================================================================

export const customerApi = {
    auth: authApi,
    profile: profileApi,
    orders: ordersApi,
    products: productsApi,
    payments: paymentsApi,
    favorites: favoritesApi,
    addresses: addressesApi,
    cart: cartApi,
    branding: brandingApi,
    discounts: discountsApi,
    reviews: reviewsApi,

    // Storage helpers
    token: tokenStorage,
    phone: phoneStorage,
    getSubdomain,
};

export default customerApi;
