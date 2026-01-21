/**
 * Shared Formatters
 * 
 * Common formatting utilities used across the application.
 * 
 * NOTE: For currency and date formatting, prefer using the tenant-aware
 * formatters from stores/settings.ts which respect tenant timezone and currency.
 */

// Re-export tenant-aware formatters for convenience
// These should be preferred over the local implementations below
export { 
    formatCurrency as formatTenantCurrency,
    formatCurrencyShort,
    formatDate as formatTenantDate,
    formatDateTime as formatTenantDateTime,
    formatRelativeTime as formatTenantRelativeTime,
    formatTime,
    getCurrencySymbol,
} from '../stores/settings';

// ============================================================================
// NUMBER FORMATTERS
// ============================================================================

/**
 * Format a number as currency (without currency symbol)
 * Use this for simple number formatting without tenant settings
 */
export function formatMoney(amount: number, locale = 'uz-UZ'): string {
    return new Intl.NumberFormat(locale).format(amount);
}

/**
 * Format a number with compact notation (1K, 1M, etc.)
 */
export function formatCompact(amount: number, locale = 'en-US'): string {
    return new Intl.NumberFormat(locale, { notation: 'compact' }).format(amount);
}

// ============================================================================
// SIMPLE DATE FORMATTERS (for non-tenant contexts)
// ============================================================================

/**
 * Format date as localized string
 * For tenant-aware formatting, use formatTenantDate from stores/settings
 */
export function formatDate(dateString: string | Date, locale = 'uz-UZ'): string {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Format date with time
 * For tenant-aware formatting, use formatTenantDateTime from stores/settings
 */
export function formatDateTime(dateString: string | Date, locale = 'uz-UZ'): string {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string | Date, locale = 'en'): string {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return '-';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return locale === 'uz' ? 'hozirgina' : 'just now';
    if (diffMins < 60) return `${diffMins} ${locale === 'uz' ? 'daqiqa oldin' : 'min ago'}`;
    if (diffHours < 24) return `${diffHours} ${locale === 'uz' ? 'soat oldin' : 'hours ago'}`;
    if (diffDays < 7) return `${diffDays} ${locale === 'uz' ? 'kun oldin' : 'days ago'}`;

    return formatDate(date, locale === 'uz' ? 'uz-UZ' : 'en-US');
}

// ============================================================================
// STRING FORMATTERS
// ============================================================================

/**
 * Mask a string (e.g., phone number: +998*****12)
 */
export function maskString(str: string, visibleStart = 4, visibleEnd = 2): string {
    if (str.length <= visibleStart + visibleEnd) return str;
    const start = str.slice(0, visibleStart);
    const end = str.slice(-visibleEnd);
    const masked = '*'.repeat(Math.min(str.length - visibleStart - visibleEnd, 5));
    return `${start}${masked}${end}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ============================================================================
// IMAGE HELPERS
// ============================================================================

/**
 * Get optimized image URL with width parameter
 */
export function getOptimizedImage(url?: string | null, width = 400): string {
    if (!url) return '';
    // If it's already a full URL, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    // Transform /uploads/ paths to /api/images/ with optimization
    if (url.startsWith('/uploads/')) {
        const filename = url.replace(/^\/uploads\//, '');
        return `/api/images/${filename}?w=${width}`;
    }
    // Return as-is for other paths
    return url;
}

// ============================================================================
// SIMPLE CURRENCY FORMAT (for components using $ symbol)
// ============================================================================

/**
 * Format as simple dollar currency (e.g., "$1,234.56")
 */
export function formatCurrencySimple(value: string | number | null): string {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return `$${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ============================================================================
// STATUS BADGE UTILITIES
// ============================================================================

export interface StatusBadge {
    bg: string;
    text: string;
    label: string;
    color?: string;
}

/**
 * Get order status badge styling
 */
export function getOrderStatusBadge(status: string): StatusBadge {
    switch (status) {
        case 'pending':
            return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending', color: '#eab308' };
        case 'confirmed':
            return { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Confirmed', color: '#3b82f6' };
        case 'approved':
            return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', label: 'Approved', color: '#6366f1' };
        case 'processing':
            return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', label: 'Processing', color: '#6366f1' };
        case 'ready_for_delivery':
            return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Ready', color: '#06b6d4' };
        case 'out_for_delivery':
        case 'delivering':
            return { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Out for Delivery', color: '#a855f7' };
        case 'delivered':
            return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Delivered', color: '#10b981' };
        case 'cancelled':
            return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Cancelled', color: '#ef4444' };
        case 'returned':
            return { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Returned', color: '#f97316' };
        default:
            return { bg: 'bg-slate-500/10', text: 'text-slate-400', label: capitalize(status.replace(/_/g, ' ')), color: '#64748b' };
    }
}

/**
 * Get payment status badge styling
 */
export function getPaymentStatusBadge(status: string): StatusBadge {
    switch (status) {
        case 'paid':
            return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Paid' };
        case 'partial':
            return { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Partial' };
        case 'unpaid':
            return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Unpaid' };
        case 'refunded':
            return { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Refunded' };
        default:
            return { bg: 'bg-slate-500/10', text: 'text-slate-400', label: capitalize(status) };
    }
}

/**
 * Get return status badge styling
 */
export function getReturnStatusBadge(status: string): StatusBadge {
    switch (status) {
        case 'pending':
            return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending' };
        case 'approved':
            return { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Approved' };
        case 'received':
            return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Received' };
        case 'completed':
            return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Completed' };
        case 'rejected':
            return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' };
        default:
            return { bg: 'bg-slate-500/10', text: 'text-slate-400', label: capitalize(status) };
    }
}

/**
 * Get delivery trip status badge styling
 */
export function getTripStatusBadge(status: string): StatusBadge {
    switch (status) {
        case 'scheduled':
            return { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Scheduled' };
        case 'in_progress':
            return { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'In Progress' };
        case 'completed':
            return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Completed' };
        case 'cancelled':
            return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Cancelled' };
        default:
            return { bg: 'bg-slate-500/10', text: 'text-slate-400', label: capitalize(status.replace(/_/g, ' ')) };
    }
}

