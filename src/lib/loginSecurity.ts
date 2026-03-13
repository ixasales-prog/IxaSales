/**
 * Login Security - Failed Attempt Tracking
 * 
 * Tracks failed login attempts and implements temporary lockout.
 */

import { getSecuritySettings } from './systemSettings';
import Redis from 'ioredis';

// In-memory store for failed attempts (use Redis in production)
const failedAttempts: Map<string, { count: number; lockedUntil: number | null }> = new Map();

const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const REDIS_PREFIX = 'auth:failed-login';

let redisClient: Redis | null = null;
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
    try {
        redisClient = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableReadyCheck: true,
        });
    } catch {
        redisClient = null;
    }
}

async function getRedis() {
    if (!redisClient) return null;
    try {
        if (redisClient.status !== 'ready') {
            await redisClient.connect();
        }
        return redisClient;
    } catch {
        return null;
    }
}

/**
 * Check if an email is currently locked out
 */
export async function isLockedOut(email: string): Promise<{ locked: boolean; minutesRemaining?: number }> {
    const key = email.toLowerCase();
    const redis = await getRedis();
    if (redis) {
        try {
            const recordRaw = await redis.get(`${REDIS_PREFIX}:${key}`);
            if (!recordRaw) return { locked: false };
            const record = JSON.parse(recordRaw) as { count: number; lockedUntil: number | null };
            if (!record.lockedUntil) return { locked: false };
            const now = Date.now();
            if (record.lockedUntil > now) {
                const minutesRemaining = Math.ceil((record.lockedUntil - now) / 60000);
                return { locked: true, minutesRemaining };
            }
            await redis.del(`${REDIS_PREFIX}:${key}`);
            return { locked: false };
        } catch {
            // fall through to in-memory fallback
        }
    }

    const record = failedAttempts.get(key);

    if (!record || !record.lockedUntil) {
        return { locked: false };
    }

    const now = Date.now();
    if (record.lockedUntil > now) {
        const minutesRemaining = Math.ceil((record.lockedUntil - now) / 60000);
        return { locked: true, minutesRemaining };
    }

    // Lockout expired, reset
    failedAttempts.delete(key);
    return { locked: false };
}

/**
 * Record a failed login attempt
 */
export async function recordFailedAttempt(email: string): Promise<{ lockedOut: boolean; attemptsRemaining: number }> {
    const settings = getSecuritySettings();
    const maxAttempts = settings.maxLoginAttempts;
    const key = email.toLowerCase();
    const redis = await getRedis();

    if (redis) {
        try {
            const redisKey = `${REDIS_PREFIX}:${key}`;
            const existing = await redis.get(redisKey);
            const record = existing
                ? (JSON.parse(existing) as { count: number; lockedUntil: number | null })
                : { count: 0, lockedUntil: null };

            record.count += 1;

            if (record.count >= maxAttempts) {
                record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
                await redis.set(redisKey, JSON.stringify(record), 'PX', LOCKOUT_DURATION_MS);
                return { lockedOut: true, attemptsRemaining: 0 };
            }

            await redis.set(redisKey, JSON.stringify(record), 'PX', LOCKOUT_DURATION_MS);
            return { lockedOut: false, attemptsRemaining: maxAttempts - record.count };
        } catch {
            // fall through to in-memory fallback
        }
    }

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
export async function clearFailedAttempts(email: string): Promise<void> {
    const key = email.toLowerCase();
    const redis = await getRedis();
    if (redis) {
        try {
            await redis.del(`${REDIS_PREFIX}:${key}`);
        } catch {
            // ignore, fallback clear still happens
        }
    }
    failedAttempts.delete(key);
}
