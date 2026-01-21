/**
 * Security Utilities
 * 
 * Production security helpers:
 * - HTTPS enforcement
 * - Security headers
 * - Input sanitization
 */

import { Elysia } from 'elysia';

// ============================================================================
// HTTPS ENFORCEMENT
// ============================================================================

/**
 * Check if request is over HTTPS
 */
export function isHttps(request: Request): boolean {
    const proto = request.headers.get('x-forwarded-proto');
    const url = new URL(request.url);

    return proto === 'https' || url.protocol === 'https:';
}

/**
 * HTTPS enforcement middleware
 * Redirects HTTP to HTTPS in production
 */
export const httpsEnforcementPlugin = new Elysia({ name: 'https-enforcement' })
    .onBeforeHandle(({ request, set }) => {
        // Only enforce in production
        if (process.env.NODE_ENV !== 'production') {
            return;
        }

        // Skip for health checks and internal requests
        const path = new URL(request.url).pathname;
        if (path === '/health' || path.startsWith('/.well-known/')) {
            return;
        }

        // Check if already HTTPS
        if (isHttps(request)) {
            return;
        }

        // Allow if explicitly disabled
        if (process.env.DISABLE_HTTPS_REDIRECT === 'true') {
            return;
        }

        // Redirect to HTTPS
        const url = new URL(request.url);
        url.protocol = 'https:';

        set.status = 301;
        set.headers = {
            ...set.headers,
            'Location': url.toString()
        };

        return { redirecting: true };
    });

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Security headers middleware
 * Adds common security headers to all responses
 */
export const securityHeadersPlugin = new Elysia({ name: 'security-headers' })
    .onAfterHandle(({ set }) => {
        // Prevent clickjacking
        set.headers['X-Frame-Options'] = 'DENY';

        // Prevent MIME type sniffing
        set.headers['X-Content-Type-Options'] = 'nosniff';

        // XSS protection (legacy, but still useful for older browsers)
        set.headers['X-XSS-Protection'] = '1; mode=block';

        // Referrer policy
        set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

        // Permissions policy
        set.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';

        // In production, add HSTS
        if (process.env.NODE_ENV === 'production') {
            set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }
    });

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitize user input by removing potentially dangerous characters
 */
export function sanitizeInput(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .replace(/[<>]/g, '') // Remove HTML brackets
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim();
}

/**
 * Validate and sanitize phone number
 */
export function sanitizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    return phone.replace(/[^\d+\-\s()]/g, '').trim();
}

/**
 * Validate and sanitize email
 */
export function sanitizeEmail(email: string | null | undefined): string {
    if (!email) return '';
    // Basic email validation
    const cleaned = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(cleaned) ? cleaned : '';
}

// ============================================================================
// RATE LIMIT HEADERS
// ============================================================================

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
    set: { headers: Record<string, string> },
    remaining: number,
    resetMs: number
): void {
    set.headers['X-RateLimit-Remaining'] = String(remaining);
    set.headers['X-RateLimit-Reset'] = String(Math.ceil(Date.now() / 1000) + Math.ceil(resetMs / 1000));
}

// ============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// ============================================================================

interface SuspiciousActivityCheck {
    isSuspicious: boolean;
    reasons: string[];
}

/**
 * Check for suspicious request patterns
 */
export function checkSuspiciousActivity(request: Request): SuspiciousActivityCheck {
    const reasons: string[] = [];
    const userAgent = request.headers.get('user-agent') || '';
    const path = new URL(request.url).pathname;

    // Check for missing or suspicious user agent
    if (!userAgent || userAgent.length < 10) {
        reasons.push('missing_or_short_ua');
    }

    // Check for automated tool signatures
    const automatedPatterns = [
        /curl/i,
        /wget/i,
        /python-requests/i,
        /scrapy/i,
        /bot(?!.*google|.*bing|.*yahoo)/i,
    ];

    if (automatedPatterns.some(pattern => pattern.test(userAgent))) {
        reasons.push('automated_tool_detected');
    }

    // Check for path traversal attempts
    if (path.includes('..') || path.includes('%2e%2e')) {
        reasons.push('path_traversal_attempt');
    }

    // Check for SQL injection patterns
    const sqlPatterns = [
        /(\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\bupdate\b|\bdelete\b)/gi,
        /(--|\#|\/\*)/,
        /('\s*or\s+')/i,
    ];

    if (sqlPatterns.some(pattern => pattern.test(path))) {
        reasons.push('sql_injection_attempt');
    }

    return {
        isSuspicious: reasons.length > 0,
        reasons,
    };
}
