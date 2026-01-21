// ============================================================================
// IxaSales - Complete Database Schema Export
// ============================================================================
// 30 Tables across 11 schema files

// Core (tenants, users, sessions)
export * from './core';

// Territories
export * from './territories';

// Products (categories, subcategories, brands, suppliers, products, userBrands)
export * from './products';

// Customers (customerTiers, customers, customerUsers, tierDowngradeRules)
export * from './customers';

// Discounts (discounts, discountScopes, volumeTiers)
export * from './discounts';

// Orders (orders, orderItems, orderStatusHistory)
export * from './orders';

// Trips (vehicles, trips, tripOrders)
export * from './trips';

// Returns
export * from './returns';

// Procurement (purchaseOrders, purchaseOrderItems)
export * from './procurement';

// Payments (paymentMethods, payments, supplierPayments)
export * from './payments';

// Stock (stockMovements, stockAdjustments)
export * from './stock';

// Audit (notificationSettings, notificationLogs, auditLogs)
export * from './audit';

// System Settings (platform-wide persistent settings)
export * from './settings';

// Images (productImages - gallery support)
export * from './images';

// Customer Portal (favorites, addresses, carts)
export * from './customer-portal';

// Sales Visits (visit tracking for sales reps)
export * from './visits';
