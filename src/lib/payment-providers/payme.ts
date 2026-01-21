/**
 * Payme Payment Provider Integration
 * 
 * Official Docs: https://developer.help.paycom.uz/
 * 
 * Payme uses JSON-RPC 2.0 protocol with the following methods:
 * - CheckPerformTransaction - Verify order can be paid
 * - CreateTransaction - Create a pending transaction
 * - PerformTransaction - Execute the payment
 * - CancelTransaction - Cancel/refund
 * - CheckTransaction - Check status
 * - GetStatement - Get transaction history
 * 
 * Note: Payme amounts are in TIYIN (1 UZS = 100 tiyin)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PaymeAccount {
    order_id?: string;
    payment_token?: string;
}

export interface PaymeRequest {
    id: number;
    method: PaymeMethod;
    params: {
        id?: string;
        time?: number;
        amount?: number;
        account?: PaymeAccount;
        reason?: number;
        from?: number;
        to?: number;
    };
}

export type PaymeMethod =
    | 'CheckPerformTransaction'
    | 'CreateTransaction'
    | 'PerformTransaction'
    | 'CancelTransaction'
    | 'CheckTransaction'
    | 'GetStatement';

export interface PaymeError {
    code: number;
    message: {
        uz: string;
        ru: string;
        en: string;
    };
    data?: string;
}

export interface PaymeResponse {
    id: number;
    result?: any;
    error?: PaymeError;
}

// Error codes
export const PAYME_ERRORS = {
    // Standard JSON-RPC errors
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,

    // Payme specific errors
    INSUFFICIENT_PRIVILEGE: -32504,
    TRANSACTION_NOT_FOUND: -31003,
    CANT_PERFORM_OPERATION: -31008,
    ORDER_NOT_FOUND: -31050,
    ORDER_ALREADY_PAID: -31051,
    ORDER_AMOUNT_INCORRECT: -31052,
    ORDER_CANCELLED: -31053,
    TRANSACTION_CANCELLED: -31007,
} as const;

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Verify Payme Basic Auth header
 * Payme sends: Authorization: Basic base64(Paycom:SECRET_KEY)
 */
export function verifyPaymeAuth(
    authHeader: string | undefined,
    merchantId: string,
    secretKey: string
): boolean {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return false;
    }

    const credentials = authHeader.slice(6); // Remove "Basic "
    const expected = Buffer.from(`Paycom:${secretKey}`).toString('base64');

    return credentials === expected;
}

/**
 * Extract merchant ID from Authorization header
 */
export function extractPaymeMerchantId(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return null;
    }

    try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const [login] = decoded.split(':');
        return login === 'Paycom' ? login : null;
    } catch {
        return null;
    }
}

// ============================================================================
// URL GENERATION
// ============================================================================

/**
 * Generate Payme checkout URL
 * 
 * @param merchantId - Payme Merchant ID
 * @param amount - Amount in TIYIN (1 UZS = 100 tiyin)
 * @param account - Account object with order_id
 * @returns Payme checkout URL
 */
export function generatePaymeUrl(
    merchantId: string,
    amount: number,
    account: PaymeAccount
): string {
    // Encode account as base64
    const accountBase64 = Buffer.from(JSON.stringify(account)).toString('base64');

    const params = new URLSearchParams({
        m: merchantId,
        ac: accountBase64,
        a: amount.toString(),
    });

    return `https://checkout.paycom.uz/${params.toString()}`;
}

/**
 * Convert UZS to tiyin (Payme uses tiyin internally)
 */
export function sumToTiyin(sum: number): number {
    return Math.round(sum * 100);
}

/**
 * Convert tiyin to UZS
 */
export function tiyinToSum(tiyin: number): number {
    return tiyin / 100;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function createPaymeResponse(id: number, result: any): PaymeResponse {
    return { id, result };
}

export function createPaymeError(
    id: number,
    code: number,
    messageUz: string,
    messageRu: string,
    messageEn: string,
    data?: string
): PaymeResponse {
    return {
        id,
        error: {
            code,
            message: {
                uz: messageUz,
                ru: messageRu,
                en: messageEn,
            },
            ...(data && { data }),
        },
    };
}

// Common error responses
export function paymeOrderNotFound(id: number): PaymeResponse {
    return createPaymeError(
        id,
        PAYME_ERRORS.ORDER_NOT_FOUND,
        "Buyurtma topilmadi",
        "Заказ не найден",
        "Order not found"
    );
}

export function paymeOrderAlreadyPaid(id: number): PaymeResponse {
    return createPaymeError(
        id,
        PAYME_ERRORS.ORDER_ALREADY_PAID,
        "Buyurtma allaqachon to'langan",
        "Заказ уже оплачен",
        "Order already paid"
    );
}

export function paymeAmountIncorrect(id: number): PaymeResponse {
    return createPaymeError(
        id,
        PAYME_ERRORS.ORDER_AMOUNT_INCORRECT,
        "Summa noto'g'ri",
        "Неверная сумма",
        "Amount incorrect"
    );
}

export function paymeTransactionNotFound(id: number): PaymeResponse {
    return createPaymeError(
        id,
        PAYME_ERRORS.TRANSACTION_NOT_FOUND,
        "Tranzaksiya topilmadi",
        "Транзакция не найдена",
        "Transaction not found"
    );
}

export function paymeInsufficientPrivilege(id: number): PaymeResponse {
    return createPaymeError(
        id,
        PAYME_ERRORS.INSUFFICIENT_PRIVILEGE,
        "Ruxsat yo'q",
        "Недостаточно прав",
        "Insufficient privilege"
    );
}
