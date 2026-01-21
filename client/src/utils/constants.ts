/**
 * Shared Constants
 * 
 * Application-wide constants used across components.
 */

// ============================================================================
// STOCK THRESHOLDS
// ============================================================================

/**
 * Threshold for low stock warning indicator
 */
export const LOW_STOCK_THRESHOLD = 5;

// ============================================================================
// STATUS COLORS
// ============================================================================

/**
 * Order status color mapping
 * Used for status stripes, badges, and indicators
 */
export const ORDER_STATUS_COLORS: Record<string, string> = {
    pending: '#f59e0b',       // Amber/Yellow
    confirmed: '#3b82f6',     // Blue
    approved: '#6366f1',      // Indigo
    picked: '#8b5cf6',        // Purple
    loaded: '#6366f1',        // Indigo
    ready_for_delivery: '#06b6d4', // Cyan
    out_for_delivery: '#a855f7',   // Purple
    delivering: '#06b6d4',    // Cyan
    delivered: '#22c55e',     // Green
    partial: '#eab308',       // Yellow
    cancelled: '#ef4444',     // Red
    returned: '#f97316',      // Orange
};

/**
 * Payment status color mapping
 */
export const PAYMENT_STATUS_COLORS: Record<string, string> = {
    paid: '#10b981',      // Emerald
    partial: '#f97316',   // Orange
    unpaid: '#ef4444',    // Red
    refunded: '#a855f7',  // Purple
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get color for order status
 */
export function getOrderStatusColor(status: string): string {
    return ORDER_STATUS_COLORS[status] || '#64748b';
}

/**
 * Get color for payment status
 */
export function getPaymentStatusColor(status: string): string {
    return PAYMENT_STATUS_COLORS[status] || '#64748b';
}

/**
 * Check if product is low on stock
 */
export function isLowStock(stockQty: number, inStock: boolean): boolean {
    return inStock && stockQty <= LOW_STOCK_THRESHOLD;
}
