/**
 * Login Security - Failed Attempt Tracking
 * 
 * Tracks failed login attempts and implements temporary lockout.
 */

import { getSecuritySettings } from './systemSettings';

// In-memory store for failed attempts (use Redis in production)
const failedAttempts: Map<string, { count: number; lockedUntil: number | null }> = new Map();

const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check if an email is currently locked out
 */
export function isLockedOut(email: string): { locked: boolean; minutesRemaining?: number } {
    const record = failedAttempts.get(email.toLowerCase());

    if (!record || !record.lockedUntil) {
        return { locked: false };
    }

    const now = Date.now();
    if (record.lockedUntil > now) {
        const minutesRemaining = Math.ceil((record.lockedUntil - now) / 60000);
        return { locked: true, minutesRemaining };
    }

    // Lockout expired, reset
    failedAttempts.delete(email.toLowerCase());
    return { locked: false };
}

/**
 * Record a failed login attempt
 */
export function recordFailedAttempt(email: string): { lockedOut: boolean; attemptsRemaining: number } {
    const settings = getSecuritySettings();
    const maxAttempts = settings.maxLoginAttempts;
    const key = email.toLowerCase();

    const record = failedAttempts.get(key) || { count: 0, lockedUntil: null };
    record.count += 1;

    if (record.count >= maxAttempts) {
        record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
        failedAttempts.set(key, record);
        return { lockedOut: true, attemptsRemaining: 0 };
    }

    failedAttempts.set(key, record);
    return { lockedOut: false, attemptsRemaining: maxAttempts - record.count };
}

/**
 * Clear failed attempts (called on successful login)
 */
export function clearFailedAttempts(email: string): void {
    failedAttempts.delete(email.toLowerCase());
}
