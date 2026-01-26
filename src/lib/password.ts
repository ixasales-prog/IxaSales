import bcrypt from 'bcryptjs';

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

// Verify password against hash (bcrypt only)
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
        // Legacy argon2 hashes are no longer supported
        // Users with argon2 hashes must reset their passwords
        if (hashedPassword.startsWith('$argon2')) {
            console.warn('Argon2 password hash detected - password reset required');
            return false;
        }
        
        // Verify bcrypt hash
        return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
        console.error('Password verification error:', error);
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
