/**
 * Tenant Settings Store
 * 
 * Fetches and caches tenant business settings (currency, timezone, etc.)
 * for use across the app. All formatting functions use these settings.
 */

import { createSignal, createRoot } from 'solid-js';
import { api } from '../lib/api';

export interface TenantSettings {
    currency: string;
    timezone: string;
    orderNumberPrefix: string;
    invoiceNumberPrefix: string;
    defaultPaymentTerms: number;
    yandexGeocoderApiKey: string;
}

// Currency symbols mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    UZS: "so'm",
    USD: '$',
    EUR: '€',
    RUB: '₽',
    KZT: '₸',
    GBP: '£',
};

// Currency formatting options
const CURRENCY_FORMATS: Record<string, { locale: string; decimals: number }> = {
    UZS: { locale: 'uz-UZ', decimals: 0 },      // Uzbek Sum typically has no decimals
    USD: { locale: 'en-US', decimals: 2 },
    EUR: { locale: 'de-DE', decimals: 2 },
    RUB: { locale: 'ru-RU', decimals: 2 },
    KZT: { locale: 'kk-KZ', decimals: 0 },
    GBP: { locale: 'en-GB', decimals: 2 },
};

const DEFAULT_SETTINGS: TenantSettings = {
    currency: '',  // Empty = no symbol, just formatted number
    timezone: 'Asia/Tashkent',
    orderNumberPrefix: 'ORD-',
    invoiceNumberPrefix: 'INV-',
    defaultPaymentTerms: 7,
    yandexGeocoderApiKey: '',
};

// Create a singleton store
function createSettingsStore() {
    const [settings, setSettings] = createSignal<TenantSettings>(DEFAULT_SETTINGS);
    const [loaded, setLoaded] = createSignal(false);
    const [loading, setLoading] = createSignal(false);

    // Fetch settings
    const fetchSettings = async () => {
        if (loading()) return;

        // Check if user is logged in
        const token = localStorage.getItem('token');
        if (!token) {
            setLoaded(true);
            return;
        }

        setLoading(true);

        try {
            const data = await api<any>(`/display-settings?_t=${Date.now()}`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                skipAuth: true // Manually handling auth header above for safety
            });

            const resolved = data?.data ?? data;
            if (resolved) {
                setSettings({
                    currency: resolved.currency ?? '',  // Allow empty string
                    timezone: resolved.timezone ?? 'Asia/Tashkent',
                    orderNumberPrefix: resolved.orderNumberPrefix ?? 'ORD-',
                    invoiceNumberPrefix: resolved.invoiceNumberPrefix ?? 'INV-',
                    defaultPaymentTerms: resolved.defaultPaymentTerms ?? 7,
                    yandexGeocoderApiKey: resolved.yandexGeocoderApiKey ?? '',
                });
            }
        } catch (error) {
            console.error('Failed to fetch tenant settings:', error);
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    };

    return {
        settings,
        loaded,
        loading,
        refetch: fetchSettings,
    };
}

// Export singleton
export const settingsStore = createRoot(createSettingsStore);

// Convenience accessors
export const useSettings = () => settingsStore.settings();
export const getCurrency = () => settingsStore.settings().currency;
export const getTimezone = () => settingsStore.settings().timezone;
export const getYandexGeocoderApiKey = () => settingsStore.settings().yandexGeocoderApiKey;

/**
 * Initialize settings store - call this after login
 */
export async function initSettings() {
    await settingsStore.refetch();
}

/**
 * Format a number as currency using tenant settings
 */
export function formatCurrency(amount: number | string | null | undefined): string {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
    const currency = settingsStore.settings().currency;

    // If currency is blank/empty, just format the number without symbol
    if (!currency) {
        // Use space as thousand separator, comma as decimal separator (like: 12 400,00)
        const formatted = numAmount.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return formatted;
    }

    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    const format = CURRENCY_FORMATS[currency] || { locale: 'en-US', decimals: 2 };

    // Format the number
    const formatted = numAmount.toLocaleString(format.locale, {
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
    });

    // For currencies where symbol goes after (like UZS), format accordingly
    if (currency === 'UZS') {
        return `${formatted} ${symbol}`;
    }

    return `${symbol}${formatted}`;
}

/**
 * Format a short currency amount (for compact display)
 */
export function formatCurrencyShort(amount: number | string | null | undefined): string {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
    const currency = settingsStore.settings().currency;
    const symbol = currency ? (CURRENCY_SYMBOLS[currency] || currency) : '';

    // Shorten large numbers
    if (numAmount >= 1_000_000) {
        const shortened = (numAmount / 1_000_000).toFixed(1);
        return symbol ? (currency === 'UZS' ? `${shortened}M ${symbol}` : `${symbol}${shortened}M`) : `${shortened}M`;
    }
    if (numAmount >= 1_000) {
        const shortened = (numAmount / 1_000).toFixed(1);
        return symbol ? (currency === 'UZS' ? `${shortened}K ${symbol}` : `${symbol}${shortened}K`) : `${shortened}K`;
    }

    return formatCurrency(numAmount);
}

/**
 * Get the currency symbol only
 */
export function getCurrencySymbol(): string {
    const currency = settingsStore.settings().currency;
    if (!currency) return '';
    return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Format a date using tenant timezone
 */
export function formatDate(
    date: Date | string | null | undefined,
    options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }
): string {
    if (!date) return '-';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';

    const timezone = settingsStore.settings().timezone;

    try {
        return dateObj.toLocaleDateString('en-US', {
            ...options,
            timeZone: timezone,
        });
    } catch {
        // Fallback if timezone is invalid
        return dateObj.toLocaleDateString('en-US', options);
    }
}

/**
 * Format a datetime using tenant timezone
 */
export function formatDateTime(
    date: Date | string | null | undefined,
    options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }
): string {
    if (!date) return '-';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';

    const timezone = settingsStore.settings().timezone;

    try {
        return dateObj.toLocaleString('en-US', {
            ...options,
            timeZone: timezone,
        });
    } catch {
        // Fallback if timezone is invalid
        return dateObj.toLocaleString('en-US', options);
    }
}

/**
 * Format a relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
    if (!date) return '-';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDate(date);
}

/**
 * Format time only
 */
export function formatTime(date: Date | string | null | undefined): string {
    if (!date) return '-';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';

    const timezone = settingsStore.settings().timezone;

    try {
        return dateObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        });
    } catch {
        return dateObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}
