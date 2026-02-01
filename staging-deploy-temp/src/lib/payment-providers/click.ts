/**
 * Click Payment Provider Integration
 * 
 * Official Docs: https://docs.click.uz/en/
 * 
 * Click uses a two-phase process:
 * 1. Prepare - Verify the order exists and amount is correct
 * 2. Complete - Confirm the payment was successful
 */

import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ClickPrepareRequest {
    click_trans_id: number;
    service_id: number;
    click_paydoc_id: number;
    merchant_trans_id: string; // Our order reference
    amount: number;
    action: 0; // 0 = prepare
    error: number;
    error_note: string;
    sign_time: string;
    sign_string: string;
}

export interface ClickCompleteRequest {
    click_trans_id: number;
    service_id: number;
    click_paydoc_id: number;
    merchant_trans_id: string;
    merchant_prepare_id: number; // ID we returned in prepare
    amount: number;
    action: 1; // 1 = complete
    error: number;
    error_note: string;
    sign_time: string;
    sign_string: string;
}

export interface ClickResponse {
    click_trans_id: number;
    merchant_trans_id: string;
    merchant_prepare_id?: number;
    merchant_confirm_id?: number;
    error: number;
    error_note: string;
}

// Error codes
export const CLICK_ERRORS = {
    SUCCESS: 0,
    SIGN_CHECK_FAILED: -1,
    INCORRECT_AMOUNT: -2,
    ACTION_NOT_FOUND: -3,
    ALREADY_PAID: -4,
    USER_NOT_FOUND: -5,
    TRANSACTION_NOT_FOUND: -6,
    BAD_REQUEST: -8,
    TRANSACTION_CANCELLED: -9,
} as const;

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify Click signature for Prepare request
 */
export function verifyClickPrepareSignature(
    params: ClickPrepareRequest,
    secretKey: string
): boolean {
    const signString =
        params.click_trans_id.toString() +
        params.service_id.toString() +
        secretKey +
        params.merchant_trans_id +
        params.amount.toString() +
        params.action.toString() +
        params.sign_time;

    const expectedSign = crypto.createHash('md5').update(signString).digest('hex');
    return params.sign_string === expectedSign;
}

/**
 * Verify Click signature for Complete request
 */
export function verifyClickCompleteSignature(
    params: ClickCompleteRequest,
    secretKey: string
): boolean {
    const signString =
        params.click_trans_id.toString() +
        params.service_id.toString() +
        secretKey +
        params.merchant_trans_id +
        params.merchant_prepare_id.toString() +
        params.amount.toString() +
        params.action.toString() +
        params.sign_time;

    const expectedSign = crypto.createHash('md5').update(signString).digest('hex');
    return params.sign_string === expectedSign;
}

// ============================================================================
// URL GENERATION
// ============================================================================

/**
 * Generate Click payment URL
 * 
 * @param merchantId - Click Merchant ID
 * @param serviceId - Click Service ID
 * @param amount - Amount in sum (UZS)
 * @param transactionParam - Our order reference (e.g., payment token)
 * @returns Click payment URL
 */
export function generateClickUrl(
    merchantId: string,
    serviceId: string,
    amount: number,
    transactionParam: string
): string {
    const params = new URLSearchParams({
        service_id: serviceId,
        merchant_id: merchantId,
        amount: amount.toString(),
        transaction_param: transactionParam,
    });

    return `https://my.click.uz/services/pay?${params.toString()}`;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function createClickResponse(
    clickTransId: number,
    merchantTransId: string,
    error: number,
    errorNote: string,
    prepareId?: number,
    confirmId?: number
): ClickResponse {
    return {
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        ...(prepareId !== undefined && { merchant_prepare_id: prepareId }),
        ...(confirmId !== undefined && { merchant_confirm_id: confirmId }),
        error,
        error_note: errorNote,
    };
}

export function clickSuccessResponse(
    clickTransId: number,
    merchantTransId: string,
    prepareId?: number,
    confirmId?: number
): ClickResponse {
    return createClickResponse(
        clickTransId,
        merchantTransId,
        CLICK_ERRORS.SUCCESS,
        'Success',
        prepareId,
        confirmId
    );
}

export function clickErrorResponse(
    clickTransId: number,
    merchantTransId: string,
    errorCode: number,
    errorNote: string
): ClickResponse {
    return createClickResponse(
        clickTransId,
        merchantTransId,
        errorCode,
        errorNote
    );
}
