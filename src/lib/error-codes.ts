/**
 * Customer Portal Error Codes
 * 
 * Centralized error codes with translations for i18n.
 */

export type ErrorCode =
    | 'UNAUTHORIZED'
    | 'INVALID_TOKEN'
    | 'RATE_LIMITED'
    | 'TENANT_NOT_FOUND'
    | 'CUSTOMER_NOT_FOUND'
    | 'NO_TELEGRAM'
    | 'OTP_SEND_FAILED'
    | 'INVALID_OTP'
    | 'OTP_EXPIRED'
    | 'NOT_FOUND'
    | 'EMPTY_CART'
    | 'ORDER_LIMIT_REACHED'
    | 'NO_VALID_ITEMS'
    | 'CANNOT_CANCEL'
    | 'ORDER_NOT_FOUND'
    | 'NO_ITEMS'
    | 'NO_AVAILABLE_PRODUCTS'
    | 'DB_ERROR'
    | 'SERVER_ERROR'
    // Payment errors
    | 'PAYMENT_LINK_FAILED'
    | 'PAYMENT_PROVIDER_ERROR'
    // Discount errors
    | 'DISCOUNT_NOT_FOUND'
    | 'DISCOUNT_EXPIRED'
    | 'DISCOUNT_INACTIVE'
    | 'DISCOUNT_MIN_NOT_MET'
    | 'DISCOUNT_ALREADY_USED'
    // Stock errors
    | 'PRODUCT_UNAVAILABLE'
    | 'INSUFFICIENT_STOCK'
    | 'INVALID_QUANTITY'
    // Profile errors
    | 'NO_CHANGES'
    | 'PROFILE_UPDATE_FAILED'
    | 'ADDRESS_NOT_FOUND'
    // Validation errors
    | 'INVALID_INPUT'
    | 'PRODUCT_NOT_FOUND';

interface ErrorTranslation {
    uz: string;
    en: string;
    ru?: string;
}

export const ERROR_MESSAGES: Record<ErrorCode, ErrorTranslation> = {
    UNAUTHORIZED: {
        uz: 'Avtorizatsiya talab qilinadi',
        en: 'Authentication required',
        ru: 'Требуется авторизация'
    },
    INVALID_TOKEN: {
        uz: 'Noto\'g\'ri yoki muddati tugagan token',
        en: 'Invalid or expired token',
        ru: 'Недействительный или просроченный токен'
    },
    RATE_LIMITED: {
        uz: 'Juda ko\'p urinish. Keyinroq qayta urinib ko\'ring.',
        en: 'Too many requests. Please try again later.',
        ru: 'Слишком много попыток. Повторите попытку позже.'
    },
    TENANT_NOT_FOUND: {
        uz: 'Kompaniya topilmadi',
        en: 'Company not found',
        ru: 'Компания не найдена'
    },
    CUSTOMER_NOT_FOUND: {
        uz: 'Bu telefon raqami topilmadi',
        en: 'Phone number not found',
        ru: 'Номер телефона не найден'
    },
    NO_TELEGRAM: {
        uz: 'Telegram bog\'lanmagan. Iltimos, bot orqali ro\'yxatdan o\'ting.',
        en: 'Telegram not linked. Please register via bot.',
        ru: 'Telegram не подключен. Зарегистрируйтесь через бота.'
    },
    OTP_SEND_FAILED: {
        uz: 'Kod yuborishda xatolik',
        en: 'Failed to send verification code',
        ru: 'Ошибка отправки кода'
    },
    INVALID_OTP: {
        uz: 'Noto\'g\'ri kod',
        en: 'Invalid code',
        ru: 'Неверный код'
    },
    OTP_EXPIRED: {
        uz: 'Kod muddati tugagan',
        en: 'Code expired',
        ru: 'Срок действия кода истек'
    },
    NOT_FOUND: {
        uz: 'Topilmadi',
        en: 'Not found',
        ru: 'Не найдено'
    },
    EMPTY_CART: {
        uz: 'Savat bo\'sh',
        en: 'Cart is empty',
        ru: 'Корзина пуста'
    },
    ORDER_LIMIT_REACHED: {
        uz: 'Maksimal kutilayotgan buyurtmalar soniga yetdingiz',
        en: 'Maximum pending orders limit reached',
        ru: 'Достигнут лимит ожидающих заказов'
    },
    NO_VALID_ITEMS: {
        uz: 'Hech qanday mahsulot qo\'shilmadi',
        en: 'No valid items could be added',
        ru: 'Не удалось добавить товары'
    },
    CANNOT_CANCEL: {
        uz: 'Bu buyurtmani bekor qilib bo\'lmaydi',
        en: 'This order cannot be cancelled',
        ru: 'Этот заказ нельзя отменить'
    },
    ORDER_NOT_FOUND: {
        uz: 'Buyurtma topilmadi',
        en: 'Order not found',
        ru: 'Заказ не найден'
    },
    NO_ITEMS: {
        uz: 'Buyurtmada mahsulotlar topilmadi',
        en: 'No items found in order',
        ru: 'Товары в заказе не найдены'
    },
    NO_AVAILABLE_PRODUCTS: {
        uz: 'Hech qanday mahsulot mavjud emas',
        en: 'No products available',
        ru: 'Нет доступных товаров'
    },
    DB_ERROR: {
        uz: 'Saqlashda xatolik',
        en: 'Database error',
        ru: 'Ошибка базы данных'
    },
    SERVER_ERROR: {
        uz: 'Server xatosi',
        en: 'Server error',
        ru: 'Ошибка сервера'
    },
    // Payment errors
    PAYMENT_LINK_FAILED: {
        uz: 'To\'lov havolasini yaratishda xatolik',
        en: 'Failed to create payment link',
        ru: 'Ошибка создания платежной ссылки'
    },
    PAYMENT_PROVIDER_ERROR: {
        uz: 'To\'lov tizimi xatosi',
        en: 'Payment provider error',
        ru: 'Ошибка платежного провайдера'
    },
    // Discount errors
    DISCOUNT_NOT_FOUND: {
        uz: 'Chegirma topilmadi',
        en: 'Discount not found',
        ru: 'Скидка не найдена'
    },
    DISCOUNT_EXPIRED: {
        uz: 'Chegirma muddati tugagan',
        en: 'Discount has expired',
        ru: 'Срок действия скидки истек'
    },
    DISCOUNT_INACTIVE: {
        uz: 'Chegirma faol emas',
        en: 'Discount is not active',
        ru: 'Скидка неактивна'
    },
    DISCOUNT_MIN_NOT_MET: {
        uz: 'Minimal buyurtma summasi yetarli emas',
        en: 'Minimum order amount not met',
        ru: 'Минимальная сумма заказа не достигнута'
    },
    DISCOUNT_ALREADY_USED: {
        uz: 'Bu chegirma allaqachon ishlatilgan',
        en: 'This discount has already been used',
        ru: 'Эта скидка уже использована'
    },
    // Stock errors
    PRODUCT_UNAVAILABLE: {
        uz: 'Mahsulot mavjud emas',
        en: 'Product unavailable',
        ru: 'Товар недоступен'
    },
    INSUFFICIENT_STOCK: {
        uz: 'Yetarli zaxira yo\'q',
        en: 'Insufficient stock',
        ru: 'Недостаточно товара на складе'
    },
    INVALID_QUANTITY: {
        uz: 'Noto\'g\'ri miqdor',
        en: 'Invalid quantity',
        ru: 'Неверное количество'
    },
    // Profile errors
    NO_CHANGES: {
        uz: 'O\'zgarishlar yo\'q',
        en: 'No changes to save',
        ru: 'Нет изменений для сохранения'
    },
    PROFILE_UPDATE_FAILED: {
        uz: 'Profilni yangilashda xatolik',
        en: 'Failed to update profile',
        ru: 'Ошибка обновления профиля'
    },
    ADDRESS_NOT_FOUND: {
        uz: 'Manzil topilmadi',
        en: 'Address not found',
        ru: 'Адрес не найден'
    },
    // Validation errors
    INVALID_INPUT: {
        uz: 'Noto\'g\'ri ma\'lumot',
        en: 'Invalid input',
        ru: 'Неверные данные'
    },
    PRODUCT_NOT_FOUND: {
        uz: 'Mahsulot topilmadi',
        en: 'Product not found',
        ru: 'Товар не найден'
    }
};

/**
 * Customer Portal Success Codes
 */
export type SuccessCode =
    | 'OTP_SENT'
    | 'PROFILE_UPDATED'
    | 'ADDRESS_ADDED'
    | 'ADDRESS_UPDATED'
    | 'ADDRESS_DELETED'
    | 'FAVORITE_ADDED'
    | 'FAVORITE_REMOVED'
    | 'CART_UPDATED'
    | 'ORDER_CREATED'
    | 'ORDER_CANCELLED'
    | 'REORDER_CREATED';

const SUCCESS_MESSAGES: Record<SuccessCode, ErrorTranslation> = {
    'OTP_SENT': {
        uz: 'Kod Telegram orqali yuborildi',
        en: 'Code sent via Telegram',
        ru: 'Код отправлен через Telegram'
    },
    'PROFILE_UPDATED': {
        uz: 'Profil muvaffaqiyatli yangilandi',
        en: 'Profile updated successfully',
        ru: 'Профиль успешно обновлен'
    },
    'ADDRESS_ADDED': {
        uz: 'Manzil qo\'shildi',
        en: 'Address added',
        ru: 'Адрес добавлен'
    },
    'ADDRESS_UPDATED': {
        uz: 'Manzil yangilandi',
        en: 'Address updated',
        ru: 'Адрес обновлен'
    },
    'ADDRESS_DELETED': {
        uz: 'Manzil o\'chirildi',
        en: 'Address deleted',
        ru: 'Адрес удален'
    },
    'FAVORITE_ADDED': {
        uz: 'Sevimlilarga qo\'shildi',
        en: 'Added to favorites',
        ru: 'Добавлено в избранное'
    },
    'FAVORITE_REMOVED': {
        uz: 'Sevimlilardan o\'chirildi',
        en: 'Removed from favorites',
        ru: 'Удалено из избранного'
    },
    'CART_UPDATED': {
        uz: 'Savat yangilandi',
        en: 'Cart updated',
        ru: 'Корзина обновлена'
    },
    'ORDER_CREATED': {
        uz: 'Buyurtma muvaffaqiyatli yaratildi',
        en: 'Order created successfully',
        ru: 'Заказ успешно создан'
    },
    'ORDER_CANCELLED': {
        uz: 'Buyurtma bekor qilindi',
        en: 'Order cancelled',
        ru: 'Заказ отменен'
    },
    'REORDER_CREATED': {
        uz: 'Qayta buyurtma yaratildi',
        en: 'Reorder created successfully',
        ru: 'Повторный заказ создан'
    }
};

/**
 * Get error message by code and language
 */
export function getErrorMessage(code: ErrorCode, lang: 'uz' | 'en' | 'ru' = 'uz'): string {
    const messages = ERROR_MESSAGES[code];
    if (!messages) return code;
    return messages[lang] || messages.en;
}

/**
 * Get success message by code and language
 */
export function getSuccessMessage(code: SuccessCode, lang: 'uz' | 'en' | 'ru' = 'uz'): string {
    const messages = SUCCESS_MESSAGES[code];
    if (!messages) return code;
    return messages[lang] || messages.en;
}

/**
 * Create error response object
 */
export function createErrorResponse(code: ErrorCode, lang: 'uz' | 'en' | 'ru' = 'uz', details?: string[]) {
    return {
        success: false,
        error: {
            code,
            message: getErrorMessage(code, lang),
            details
        }
    };
}

/**
 * Create success response object
 */
export function createSuccessResponse(code: SuccessCode, data?: any, lang: 'uz' | 'en' | 'ru' = 'uz') {
    return {
        success: true,
        message: getSuccessMessage(code, lang),
        data
    };
}
