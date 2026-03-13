import { authToken, getStoredAuthToken, logout } from '../stores/auth';

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

// Export for components that need direct file downloads
export const API_BASE_URL = BASE_URL;

interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    skipAuth?: boolean;
    timeoutMs?: number;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<{ data: T; response: Response; result: any }> {
    const token = getStoredAuthToken() || authToken();

    const headers = new Headers(options.headers);
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !(options.body instanceof FormData)) {
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

    const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? 60_000));
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(`Request timeout after ${timeoutMs}ms`), timeoutMs);

    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            credentials: options.credentials ?? 'include',
            signal: options.signal ?? controller.signal,
        });
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`Request timed out (${Math.round(timeoutMs / 1000)}s): ${path}`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutHandle);
    }

    if (response.status === 401 && token && !path.startsWith('/auth/')) {
        logout();
        throw new Error('Unauthorized');
    }

    let result: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        result = await response.json();
    } else {
        const text = await response.text();
        result = { message: text };
    }

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
