// ============================================================================
// IxaSales - Complete Database Schema Export
// ============================================================================
// 31 Tables across 12 schema files

// Core (tenants, users, sessions)
export * from "./core";
export * from "./users";

// Territories
export * from "./territories";

// Products (categories, subcategories, brands, suppliers, products, userBrands)
export * from "./products";

// Customers (customerTiers, customers, customerUsers, tierDowngradeRules)
export * from "./customers";

// Discounts (discounts, discountScopes, volumeTiers)
export * from "./discounts";

// Orders (orders, orderItems, orderStatusHistory)
export * from "./orders";

// Trips (vehicles, trips, tripOrders)
export * from "./trips";

// Returns
export * from "./returns";

// Procurement (purchaseOrders, purchaseOrderItems)
export * from "./procurement";

// Payments (paymentMethods, payments, supplierPayments)
export * from "./payments";

// Money Transfers (moneyTransfers - internal account transfers)
export * from "./money-transfers";

// Stock (stockMovements, stockAdjustments)
export * from "./stock";

// Audit (notificationSettings, notificationLogs, auditLogs)
export * from "./audit";

// System Settings (platform-wide persistent settings)
export * from "./settings";

// Images (productImages - gallery support)
export * from "./images";

// Customer Portal (favorites, addresses, carts)
export * from "./customer-portal";

// Sales Visits (visit tracking for sales reps)
export * from "./visits";

// GPS Tracking (user location tracking)
export * from "./gps-tracking";

// Warehouse (scanLogs, stockCounts, packingSessions)
export * from "./warehouse";

// Tenant Exports (tenantExports, tenantExportSettings)
export * from "./exports";

// User Telegram Links (userTelegramLinkCodes)
export * from "./user-telegram-links";

// Tenant Integrations (Telegram, Weather, Maps, etc.)
export * from "./integrations";

// Payroll (salaryConfigurations, commissionRules, commissionTiers, commissionRecords, bonuses, deductions, payrollPeriods, payrollEntries, salaryAdvances, salaryHistory)
export * from "./payroll";
