import { createSignal } from 'solid-js';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const IMPERSONATION_ORIGINAL_TOKEN_KEY = 'impersonation_original_token';
const IMPERSONATION_ORIGINAL_USER_KEY = 'impersonation_original_user';

function readStorage(key: string): string | null {
    if (typeof window === 'undefined') return null;
    const sessionValue = window.sessionStorage.getItem(key);
    if (sessionValue !== null) return sessionValue;

    const legacyValue = window.localStorage.getItem(key);
    if (legacyValue !== null) {
        window.sessionStorage.setItem(key, legacyValue);
        window.localStorage.removeItem(key);
        return legacyValue;
    }

    return null;
}

function writeStorage(key: string, value: string) {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, value);
    window.localStorage.removeItem(key);
}

function removeStorage(key: string) {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
}

export function getStoredAuthToken(): string | null {
    return readStorage(TOKEN_KEY);
}

export const [authToken, setAuthToken] = createSignal<string | null>(
    getStoredAuthToken()
);

export const [currentUser, setCurrentUser] = createSignal<any | null>(
    JSON.parse(readStorage(USER_KEY) || 'null')
);

export function login(token: string, user: any) {
    setAuthToken(token);
    setCurrentUser(user);
    writeStorage(TOKEN_KEY, token);
    writeStorage(USER_KEY, JSON.stringify(user));
}

export async function logout() {
    const token = getStoredAuthToken();
    try {
        const headers: Record<string, string> = {};
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers,
            credentials: 'include',
        });
    } catch {
        // Best effort. Local logout still proceeds.
    }

    setAuthToken(null);
    setCurrentUser(null);
    clearImpersonationState();
    removeStorage(TOKEN_KEY);
    removeStorage(USER_KEY);
    window.location.href = '/login';
}

export function getOriginalImpersonationSession(): { token: string; user: any } | null {
    const token = readStorage(IMPERSONATION_ORIGINAL_TOKEN_KEY);
    const rawUser = readStorage(IMPERSONATION_ORIGINAL_USER_KEY);
    if (!token || !rawUser) return null;

    try {
        return { token, user: JSON.parse(rawUser) };
    } catch {
        return null;
    }
}

export function isImpersonating(): boolean {
    return !!currentUser()?.impersonatedBy && !!getOriginalImpersonationSession();
}

export function startImpersonation(nextToken: string, nextUser: any) {
    const existingOriginal = getOriginalImpersonationSession();
    if (!existingOriginal && authToken() && currentUser()) {
        writeStorage(IMPERSONATION_ORIGINAL_TOKEN_KEY, authToken()!);
        writeStorage(IMPERSONATION_ORIGINAL_USER_KEY, JSON.stringify(currentUser()));
    }

    login(nextToken, nextUser);
}

export function stopImpersonation() {
    const original = getOriginalImpersonationSession();
    if (!original) return false;

    setAuthToken(original.token);
    setCurrentUser(original.user);
    writeStorage(TOKEN_KEY, original.token);
    writeStorage(USER_KEY, JSON.stringify(original.user));
    clearImpersonationState();
    return true;
}

export function clearImpersonationState() {
    removeStorage(IMPERSONATION_ORIGINAL_TOKEN_KEY);
    removeStorage(IMPERSONATION_ORIGINAL_USER_KEY);
}
