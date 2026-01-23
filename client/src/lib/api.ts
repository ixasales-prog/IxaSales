import { authToken, logout } from '../stores/auth';

const RAW_BASE_URL = import.meta.env.VITE_API_URL;

const resolveBaseUrl = () => {
    const normalized = RAW_BASE_URL?.replace(/\/$/, '') || '/api';
    if (!RAW_BASE_URL) return normalized;
    if (typeof window === 'undefined') return normalized;
    return normalized;
};

const BASE_URL = resolveBaseUrl();

interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    skipAuth?: boolean;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<{ data: T; response: Response; result: any }> {
    const token = localStorage.getItem('token') || authToken();

    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }
    if (token && !options.skipAuth) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    let url = `${BASE_URL}${path}`;
    if (options.params) {
        const searchParams = new URLSearchParams();
        Object.entries(options.params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) searchParams.append(key, value);
        });
        url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials ?? 'include',
    });

    if (response.status === 401 && token && !path.startsWith('/auth/')) {
        logout();
        throw new Error('Unauthorized');
    }

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error?.message || result.message || 'API Error');
    }

    return {
        data: result.data || result,
        response,
        result,
    };
}

export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { data } = await request<T>(path, options);
    return data;
}

export async function apiResponse<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { result } = await request<T>(path, options);
    return result;
}

export async function apiWithResponse<T = any>(path: string, options: RequestOptions = {}): Promise<{ data: T; response: Response }> {
    const { data, response } = await request<T>(path, options);
    return { data, response };
}

api.get = <T = any>(path: string, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'GET' });
api.post = <T = any>(path: string, body: any, options: RequestOptions = {}) => {
    const bodyToSend = body instanceof FormData ? body : JSON.stringify(body);
    return api<T>(path, { ...options, method: 'POST', body: bodyToSend });
};
api.put = <T = any>(path: string, body: any, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
api.patch = <T = any>(path: string, body: any, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
api.delete = <T = any>(path: string, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'DELETE' });
api.response = <T = any>(path: string, options: RequestOptions = {}) => apiResponse<T>(path, options);
api.withResponse = <T = any>(path: string, options: RequestOptions = {}) => apiWithResponse<T>(path, options);

