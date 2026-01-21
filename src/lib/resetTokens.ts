/**
 * Password Reset Token Management
 * 
 * Generates, stores, and validates password reset tokens.
 * In production, store tokens in Redis or DB. Using in-memory for simplicity.
 */

import { randomBytes } from 'crypto';

interface ResetToken {
    userId: string;
    email: string;
    expiresAt: number;
}

// In-memory token store (use Redis/DB in production)
const resetTokens: Map<string, ResetToken> = new Map();

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a password reset token for a user
 */
export function generateResetToken(userId: string, email: string): string {
    // Clean up any existing tokens for this user
    for (const [token, data] of resetTokens.entries()) {
        if (data.userId === userId) {
            resetTokens.delete(token);
        }
    }

    const token = randomBytes(32).toString('hex');

    resetTokens.set(token, {
        userId,
        email,
        expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    });

    return token;
}

/**
 * Validate a reset token and return user info if valid
 */
export function validateResetToken(token: string): ResetToken | null {
    const data = resetTokens.get(token);

    if (!data) {
        return null;
    }

    if (Date.now() > data.expiresAt) {
        resetTokens.delete(token);
        return null;
    }

    return data;
}

/**
 * Consume (invalidate) a reset token after use
 */
export function consumeResetToken(token: string): ResetToken | null {
    const data = validateResetToken(token);

    if (data) {
        resetTokens.delete(token);
    }

    return data;
}

/**
 * Clean up expired tokens (call periodically)
 */
export function cleanupExpiredTokens(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of resetTokens.entries()) {
        if (now > data.expiresAt) {
            resetTokens.delete(token);
            cleaned++;
        }
    }

    return cleaned;
}
