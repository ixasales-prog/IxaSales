import { hash, verify } from '@node-rs/argon2';

// Hash password using Argon2
export async function hashPassword(password: string): Promise<string> {
    return await hash(password, {
        memoryCost: 65536, // 64MB
        timeCost: 3,
        parallelism: 4,
    });
}

// Verify password against hash
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
        return await verify(hashedPassword, password);
    } catch {
        return false;
    }
}

// Generate random token
export function generateToken(length: number = 32): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate order/payment number
export function generateNumber(prefix: string, length: number = 8): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}${random}`.substring(0, prefix.length + 1 + length);
}
