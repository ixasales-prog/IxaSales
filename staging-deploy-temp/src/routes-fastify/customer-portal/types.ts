/**
 * Customer Portal - Shared Types (Fastify)
 * 
 * Types and utilities shared across all customer portal route files.
 */

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface CustomerTokenPayload {
    customerId: string;
    tenantId: string;
    type: 'customer';
}

// ============================================================================
// TRANSACTION RESULT TYPES
// ============================================================================

export interface TransactionError {
    code: string;
    message: string;
    details?: string[];
    status: number;
}

export type TransactionResult<T> = T | { error: TransactionError };

// ============================================================================
// ORDER ITEM TYPE
// ============================================================================

export interface OrderItemInput {
    productId: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    productName: string;
}

// ============================================================================
// RATE LIMIT CONFIG
// ============================================================================

export const RATE_LIMIT_CONFIG = {
    OTP_REQUEST: {
        maxAttempts: 5,
        windowMs: 60 * 60 * 1000, // 1 hour
        blockDurationMs: 60 * 60 * 1000 // 1 hour block
    },
    OTP_VERIFY: {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDurationMs: 15 * 60 * 1000 // 15 minute block
    },
    MAX_LIMIT: 100,
    MAX_SEARCH_LENGTH: 100
} as const;

// ============================================================================
// OTP CONFIG
// ============================================================================

export const OTP_EXPIRY_MINUTES = 5;
export const MAX_PENDING_ORDERS = 3;
