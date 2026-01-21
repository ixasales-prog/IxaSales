import { createSignal } from 'solid-js';

export const [authToken, setAuthToken] = createSignal<string | null>(
    localStorage.getItem('token')
);

export const [currentUser, setCurrentUser] = createSignal<any | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
);

export function login(token: string, user: any) {
    setAuthToken(token);
    setCurrentUser(user);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

export function logout() {
    setAuthToken(null);
    setCurrentUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
