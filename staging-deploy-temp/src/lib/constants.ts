/**
 * Status constants for type-safe status handling
 */

// Order statuses
export const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    APPROVED: 'approved',
    PICKING: 'picking',
    PICKED: 'picked',
    LOADED: 'loaded',
    IN_TRANSIT: 'in_transit',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// Order payment statuses
export const PAYMENT_STATUS = {
    UNPAID: 'unpaid',
    PARTIAL: 'partial',
    PAID: 'paid',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

// Trip statuses
export const TRIP_STATUS = {
    PLANNED: 'planned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
} as const;

export type TripStatus = typeof TRIP_STATUS[keyof typeof TRIP_STATUS];

// Purchase order statuses
export const PO_STATUS = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    RECEIVED: 'received',
    CANCELLED: 'cancelled',
} as const;

export type POStatus = typeof PO_STATUS[keyof typeof PO_STATUS];

// Stock movement types
export const MOVEMENT_TYPE = {
    IN: 'in',
    OUT: 'out',
    ADJUSTMENT: 'adjustment',
    RETURN: 'return',
    RESERVED: 'reserved',
    RELEASED: 'released',
} as const;

export type MovementType = typeof MOVEMENT_TYPE[keyof typeof MOVEMENT_TYPE];

// User roles
export const USER_ROLE = {
    SUPER_ADMIN: 'super_admin',
    TENANT_ADMIN: 'tenant_admin',
    SUPERVISOR: 'supervisor',
    SALES_REP: 'sales_rep',
    WAREHOUSE: 'warehouse',
    DRIVER: 'driver',
    CUSTOMER_USER: 'customer_user',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

// Return conditions
export const RETURN_CONDITION = {
    GOOD: 'good',
    DAMAGED: 'damaged',
    EXPIRED: 'expired',
} as const;

export type ReturnCondition = typeof RETURN_CONDITION[keyof typeof RETURN_CONDITION];

// Discount types
export const DISCOUNT_TYPE = {
    PERCENTAGE: 'percentage',
    FIXED: 'fixed',
    BUY_X_GET_Y: 'buy_x_get_y',
    VOLUME: 'volume',
} as const;

export type DiscountType = typeof DISCOUNT_TYPE[keyof typeof DISCOUNT_TYPE];
