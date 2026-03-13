/**
 * Status constants for type-safe status handling
 */

// Order statuses (must match DB enum in schema/orders.ts)
export const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    APPROVED: 'approved',
    PICKING: 'picking',
    PICKED: 'picked',
    LOADED: 'loaded',
    DELIVERING: 'delivering',
    DELIVERED: 'delivered',
    PARTIAL: 'partial',
    RETURNED: 'returned',
    CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// Valid order status transitions — single source of truth
export const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
    pending: ['confirmed', 'approved', 'cancelled'],
    confirmed: ['approved', 'picking', 'cancelled'],
    approved: ['picking', 'cancelled'],
    picking: ['picked'],
    picked: ['loaded'],
    loaded: ['delivering'],
    delivering: ['delivered', 'partial', 'returned'],
    delivered: [],
    partial: ['delivered', 'returned'],
    returned: [],
    cancelled: [],
};

// Statuses from which an order can be cancelled
export const CANCELLABLE_ORDER_STATUSES = ['pending', 'confirmed'] as const;

// Statuses in which an order can be edited
export const EDITABLE_ORDER_STATUSES = ['pending', 'confirmed', 'approved'] as const;

// Statuses that allow driver assignment
export const DRIVER_ASSIGNABLE_STATUSES = ['pending', 'confirmed', 'approved', 'picked', 'loaded'] as const;

// Valid warehouse task transitions (subset of order transitions for warehouse role)
export const VALID_WAREHOUSE_TRANSITIONS: Record<string, string[]> = {
    approved: ['picking'],
    picking: ['picked'],
    picked: ['loaded'],
    loaded: ['delivering'],
};

// Per-role allowed TARGET statuses for PATCH /orders/:id/status
// Admins (tenant_admin, super_admin) can set any valid target — not listed here.
export const ROLE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
    supervisor: ['confirmed', 'approved', 'cancelled'],
    warehouse: ['picking', 'picked', 'loaded'],
    driver: ['delivering', 'delivered', 'partial', 'returned'],
};

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
