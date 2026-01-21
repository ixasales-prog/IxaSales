import { authToken, logout } from '../stores/auth';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    skipAuth?: boolean;
}

export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    // Read token directly from localStorage to avoid reactivity timing issues
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
    });

    // Only logout on 401 if we had a token and it's not an auth endpoint
    if (response.status === 401 && token && !path.startsWith('/auth/')) {
        logout();
        throw new Error('Unauthorized');
    }

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error?.message || result.message || 'API Error');
    }

    return result.data || result;
}

api.get = <T = any>(path: string, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'GET' });
api.post = <T = any>(path: string, body: any, options: RequestOptions = {}) => {
    // Don't stringify FormData
    const bodyToSend = body instanceof FormData ? body : JSON.stringify(body);
    return api<T>(path, { ...options, method: 'POST', body: bodyToSend });
};
api.put = <T = any>(path: string, body: any, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
api.patch = <T = any>(path: string, body: any, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
api.delete = <T = any>(path: string, options: RequestOptions = {}) => api<T>(path, { ...options, method: 'DELETE' });

