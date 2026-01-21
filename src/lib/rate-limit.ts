/**
 * Redis Rate Limiting
 * 
 * Production-ready rate limiting with Redis backend.
 * Falls back to in-memory if Redis is not available.
 */

import Redis from 'ioredis';

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitConfig {
    maxAttempts: number;
    windowMs: number;
    blockDurationMs: number;
}

interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    retryAfterMs?: number;
    suspicious?: boolean;
}

// ============================================================================
// REDIS CLIENT
// ============================================================================

let redis: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection
 */
export async function initRedisRateLimiter(): Promise<boolean> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('[RateLimit] REDIS_URL not set, using in-memory rate limiting');
        return false;
    }

    try {
        redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) return null;
                return Math.min(times * 100, 3000);
            },
            lazyConnect: true
        });

        await redis.connect();
        await redis.ping();

        redisAvailable = true;
        console.log('[RateLimit] Redis connected successfully');
        return true;
    } catch (error) {
        console.error('[RateLimit] Redis connection failed, using in-memory:', error);
        redis = null;
        redisAvailable = false;
        return false;
    }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
    return redisAvailable && redis !== null;
}

// ============================================================================
// REDIS RATE LIMIT FUNCTIONS
// ============================================================================

/**
 * Check rate limit using Redis
 */
async function checkRedisRateLimit(
    prefix: string,
    key: string,
    config: RateLimitConfig,
    ip?: string
): Promise<RateLimitResult> {
    if (!redis) {
        throw new Error('Redis not available');
    }

    const redisKey = `ratelimit:${prefix}:${key}`;
    const ipKey = `ratelimit:${prefix}:${key}:ips`;
    const now = Date.now();

    const pipeline = redis.pipeline();
    pipeline.get(redisKey);
    pipeline.ttl(redisKey);
    if (ip) {
        pipeline.sadd(ipKey, ip);
        pipeline.scard(ipKey);
    }

    const results = await pipeline.exec();
    if (!results) {
        throw new Error('Redis pipeline failed');
    }

    const currentCount = results[0]?.[1] ? parseInt(results[0][1] as string) : 0;
    const ttl = results[1]?.[1] as number || -1;
    const ipCount = ip && results[3] ? results[3][1] as number : 0;
    const suspicious = ipCount > 3;

    // Check if blocked
    if (currentCount >= config.maxAttempts) {
        return {
            allowed: false,
            remainingAttempts: 0,
            retryAfterMs: ttl > 0 ? ttl * 1000 : config.blockDurationMs,
            suspicious
        };
    }

    // Increment counter
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    if (currentCount === 0) {
        await redis.setex(redisKey, windowSeconds, 1);
        if (ip) {
            await redis.expire(ipKey, windowSeconds);
        }
    } else {
        await redis.incr(redisKey);
    }

    return {
        allowed: true,
        remainingAttempts: Math.max(0, config.maxAttempts - currentCount - 1),
        suspicious
    };
}

/**
 * Clear rate limit in Redis
 */
async function clearRedisRateLimit(prefix: string, key: string): Promise<void> {
    if (!redis) return;

    const redisKey = `ratelimit:${prefix}:${key}`;
    const ipKey = `ratelimit:${prefix}:${key}:ips`;

    await redis.del(redisKey, ipKey);
}

// ============================================================================
// IN-MEMORY FALLBACK (for non-Redis environments)
// ============================================================================

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lastAttempt: number;
    ips: Set<string>;
}

const memoryStores: Record<string, Map<string, RateLimitEntry>> = {
    otp_request: new Map(),
    otp_verify: new Map()
};

function checkMemoryRateLimit(
    prefix: string,
    key: string,
    config: RateLimitConfig,
    ip?: string
): RateLimitResult {
    const store = memoryStores[prefix] || new Map();
    if (!memoryStores[prefix]) memoryStores[prefix] = store;

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.firstAttempt > config.windowMs) {
        const ips = new Set<string>();
        if (ip) ips.add(ip);
        store.set(key, { count: 1, firstAttempt: now, lastAttempt: now, ips });
        return { allowed: true, remainingAttempts: config.maxAttempts - 1 };
    }

    if (ip) entry.ips.add(ip);
    const suspicious = entry.ips.size > 3;

    if (entry.count >= config.maxAttempts) {
        const retryAfterMs = config.blockDurationMs - (now - entry.lastAttempt);
        if (retryAfterMs > 0) {
            return { allowed: false, remainingAttempts: 0, retryAfterMs, suspicious };
        }
        const ips = new Set<string>();
        if (ip) ips.add(ip);
        store.set(key, { count: 1, firstAttempt: now, lastAttempt: now, ips });
        return { allowed: true, remainingAttempts: config.maxAttempts - 1 };
    }

    entry.count++;
    entry.lastAttempt = now;

    return {
        allowed: true,
        remainingAttempts: Math.max(0, config.maxAttempts - entry.count),
        suspicious
    };
}

function clearMemoryRateLimit(prefix: string, key: string): void {
    memoryStores[prefix]?.delete(key);
}

// ============================================================================
// UNIFIED API (uses Redis if available, falls back to memory)
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
    API_GENERAL: {
        maxAttempts: 100,
        windowMs: 60 * 1000, // 1 minute
        blockDurationMs: 60 * 1000 // 1 minute block
    },
    MAX_LIMIT: 100,
    MAX_SEARCH_LENGTH: 100
} as const;

/**
 * Check OTP request rate limit
 */
export async function checkOtpRequestLimitAsync(key: string, ip?: string): Promise<RateLimitResult> {
    if (isRedisAvailable()) {
        try {
            return await checkRedisRateLimit('otp_request', key, RATE_LIMIT_CONFIG.OTP_REQUEST, ip);
        } catch {
            // Fall back to memory on Redis error
        }
    }
    return checkMemoryRateLimit('otp_request', key, RATE_LIMIT_CONFIG.OTP_REQUEST, ip);
}

/**
 * Check OTP verify rate limit
 */
export async function checkOtpVerifyLimitAsync(key: string, ip?: string): Promise<RateLimitResult> {
    if (isRedisAvailable()) {
        try {
            return await checkRedisRateLimit('otp_verify', key, RATE_LIMIT_CONFIG.OTP_VERIFY, ip);
        } catch {
            // Fall back to memory on Redis error
        }
    }
    return checkMemoryRateLimit('otp_verify', key, RATE_LIMIT_CONFIG.OTP_VERIFY, ip);
}

/**
 * Check general API rate limit
 */
export async function checkApiRateLimitAsync(key: string, ip?: string): Promise<RateLimitResult> {
    if (isRedisAvailable()) {
        try {
            return await checkRedisRateLimit('api', key, RATE_LIMIT_CONFIG.API_GENERAL, ip);
        } catch {
            // Fall back to memory on Redis error
        }
    }
    return checkMemoryRateLimit('api', key, RATE_LIMIT_CONFIG.API_GENERAL, ip);
}

/**
 * Clear OTP verify rate limit on successful verification
 */
export async function clearOtpVerifyLimitAsync(key: string): Promise<void> {
    if (isRedisAvailable()) {
        try {
            await clearRedisRateLimit('otp_verify', key);
            return;
        } catch {
            // Fall back to memory
        }
    }
    clearMemoryRateLimit('otp_verify', key);
}

// ============================================================================
// SYNCHRONOUS API (for backward compatibility, uses memory only)
// ============================================================================

export function checkOtpRequestLimit(key: string, ip?: string): RateLimitResult {
    return checkMemoryRateLimit('otp_request', key, RATE_LIMIT_CONFIG.OTP_REQUEST, ip);
}

export function checkOtpVerifyLimit(key: string, ip?: string): RateLimitResult {
    return checkMemoryRateLimit('otp_verify', key, RATE_LIMIT_CONFIG.OTP_VERIFY, ip);
}

export function clearOtpVerifyLimit(key: string): void {
    clearMemoryRateLimit('otp_verify', key);
}

// ============================================================================
// CLEANUP (for memory store)
// ============================================================================

setInterval(() => {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    for (const store of Object.values(memoryStores)) {
        for (const [key, entry] of store) {
            if (now - entry.lastAttempt > maxAge) {
                store.delete(key);
            }
        }
    }
}, 30 * 60 * 1000);
