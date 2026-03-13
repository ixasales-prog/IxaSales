/**
 * Tenant Export Service
 * 
 * Handles data export and import for tenant admins.
 * Exports tenant-specific data to JSON/CSV/XLSX format.
 */

import { db, schema } from '../db';
import { eq, and, desc, lt, gte, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { CronJob } from 'cron';
import { createWriteStream } from 'fs';
import * as XLSX from 'xlsx';
import postgres from 'postgres';

// Types
export interface ExportOptions {
    format: 'json' | 'csv' | 'xlsx';
    includeProducts: boolean;
    includeCustomers: boolean;
    includeOrders: boolean;
    includePayments: boolean;
    includeInventory: boolean;
    dateFrom?: Date;
    dateTo?: Date;
}

export interface ExportResult {
    success: boolean;
    exportId?: string;
    filename?: string;
    error?: string;
}

export interface ImportResult {
    success: boolean;
    imported: Record<string, number>;
    errors: string[];
}

const TENANT_SQL_MARKER = '-- IXA_TENANT_BACKUP_V1';
const TENANT_SCHEDULED_BACKUP_FORMAT_KEY = 'backup.schedule_format';
const TENANT_EXPORT_SCHEDULER_LOCK_KEY = 95420168;
type ScheduledBackupFormat = 'json' | 'sql';
type TenantBackupDataScopeOptions = {
    includeProducts: boolean;
    includeCustomers: boolean;
    includeOrders: boolean;
    includePayments: boolean;
    includeInventory: boolean;
};

const PRODUCT_DOMAIN_KEYS = new Set([
    'categories',
    'brands',
    'subcategories',
    'products',
    'suppliers',
    'productImages',
    'userBrands',
    'purchaseOrders',
    'purchaseOrderItems',
    'stockCounts',
    'stockCountItems',
    'packingSessions',
    'packingItems',
    'scanLogs',
    'stockMovements',
    'stockAdjustments',
    'customerFavorites',
    'productReviews',
]);

const CUSTOMER_DOMAIN_KEYS = new Set([
    'customers',
    'territories',
    'customerTiers',
    'tierDowngradeRules',
    'tierUpgradeRules',
    'customerUsers',
    'customerAddresses',
    'shoppingCarts',
    'cartItems',
    'pushSubscriptions',
    'salesVisits',
    'tierChangeLogs',
    'discountUsages',
    'moneyTransfers',
    'returns',
    'customerFavorites',
    'productReviews',
]);

const ORDER_DOMAIN_KEYS = new Set([
    'orders',
    'orderItems',
    'orderStatusHistory',
    'tripOrders',
    'trips',
    'vehicles',
    'salesVisits',
    'discountUsages',
    'returns',
]);

const PAYMENT_DOMAIN_KEYS = new Set([
    'paymentMethods',
    'payments',
    'paymentTokens',
    'supplierPayments',
    'moneyTransfers',
]);

const INVENTORY_DOMAIN_KEYS = new Set([
    'inventory',
    'purchaseOrders',
    'purchaseOrderItems',
    'stockCounts',
    'stockCountItems',
    'packingSessions',
    'packingItems',
    'scanLogs',
    'stockMovements',
    'stockAdjustments',
]);

const PARTIAL_EXPORT_ALWAYS_INCLUDE_KEYS = new Set([
    'tenantProfile',
    'tenantSettings',
    'tenantNotificationSettings',
    'tenantExportSettings',
    'users',
]);

function keyBelongsToEnabledDomain(key: string, scope: TenantBackupDataScopeOptions): boolean {
    if (scope.includeProducts && PRODUCT_DOMAIN_KEYS.has(key)) return true;
    if (scope.includeCustomers && CUSTOMER_DOMAIN_KEYS.has(key)) return true;
    if (scope.includeOrders && ORDER_DOMAIN_KEYS.has(key)) return true;
    if (scope.includePayments && PAYMENT_DOMAIN_KEYS.has(key)) return true;
    if (scope.includeInventory && INVENTORY_DOMAIN_KEYS.has(key)) return true;
    return false;
}

function filterExtendedTenantBackupData(
    extendedData: Record<string, any>,
    scope: TenantBackupDataScopeOptions
): Record<string, any> {
    const includeAll = scope.includeProducts
        && scope.includeCustomers
        && scope.includeOrders
        && scope.includePayments
        && scope.includeInventory;
    if (includeAll) return extendedData;

    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(extendedData)) {
        if (PARTIAL_EXPORT_ALWAYS_INCLUDE_KEYS.has(key) || keyBelongsToEnabledDomain(key, scope)) {
            filtered[key] = value;
        }
    }

    return filtered;
}

export function encodeTenantBackupAsSql(data: Record<string, any>, tenantId: string): string {
    const json = JSON.stringify(data);
    const base64 = Buffer.from(json, 'utf8').toString('base64');
    const chunkSize = 120;
    const chunks: string[] = [];
    for (let i = 0; i < base64.length; i += chunkSize) {
        chunks.push(base64.slice(i, i + chunkSize));
    }

    const lines = [
        TENANT_SQL_MARKER,
        `-- tenant_id: ${tenantId}`,
        `-- exported_at: ${new Date().toISOString()}`,
        '-- payload_base64_begin',
        ...chunks.map((chunk) => `-- ${chunk}`),
        '-- payload_base64_end',
        'DO $$ BEGIN',
        "  RAISE NOTICE 'IxaSales tenant backup payload file. Use tenant restore endpoint.';",
        'END $$;',
        '',
    ];

    return lines.join('\n');
}

function decodeTenantBackupFromSql(fileContent: string): Record<string, any> {
    if (!fileContent.includes(TENANT_SQL_MARKER)) {
        throw new Error('Not a supported tenant SQL backup format');
    }

    const beginMarker = '-- payload_base64_begin';
    const endMarker = '-- payload_base64_end';
    const begin = fileContent.indexOf(beginMarker);
    const end = fileContent.indexOf(endMarker);
    if (begin === -1 || end === -1 || end <= begin) {
        throw new Error('Tenant SQL backup payload markers are missing');
    }

    const payloadSection = fileContent.slice(begin + beginMarker.length, end);
    const base64 = payloadSection
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-- '))
        .map((line) => line.slice(3))
        .join('');

    if (!base64) {
        throw new Error('Tenant SQL backup payload is empty');
    }

    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
}

export async function buildTenantBackupData(
    tenantId: string,
    options: {
        includeProducts?: boolean;
        includeCustomers?: boolean;
        includeOrders?: boolean;
        includePayments?: boolean;
        includeInventory?: boolean;
        dbClient?: any;
    } = {}
): Promise<Record<string, any>> {
    const data: Record<string, any> = {};
    const includeProducts = options.includeProducts ?? true;
    const includeCustomers = options.includeCustomers ?? true;
    const includeOrders = options.includeOrders ?? true;
    const includePayments = options.includePayments ?? true;
    const includeInventory = options.includeInventory ?? true;
    const scopeOptions: TenantBackupDataScopeOptions = {
        includeProducts,
        includeCustomers,
        includeOrders,
        includePayments,
        includeInventory,
    };
    const scope: 'full' = 'full';
    const executor = options.dbClient ?? db;

    if (includeProducts) {
        data.categories = await fetchCategories(tenantId, executor);
        data.brands = await fetchBrands(tenantId, executor);
        data.subcategories = await fetchSubcategories(tenantId, executor);
        data.products = await fetchProducts(tenantId, executor);
    }

    if (includeCustomers) {
        data.customers = await fetchCustomers(tenantId, executor);
    }

    if (includeOrders) {
        data.orders = await fetchOrders(tenantId, undefined, executor);
        data.orderItems = await fetchOrderItems(tenantId, undefined, executor);
    }

    if (includePayments) {
        data.paymentMethods = await fetchPaymentMethods(tenantId, executor);
        data.payments = await fetchPayments(tenantId, undefined, executor);
    }

    if (includeInventory) {
        data.inventory = await fetchInventory(tenantId, executor);
    }

    // Some staging databases can lag behind latest schema additions.
    // Treat extended-domain extraction as best-effort so core backup still succeeds.
    let extendedData: Record<string, any> = {};
    try {
        extendedData = await fetchExtendedTenantBackupData(tenantId, executor);
    } catch (err: any) {
        console.warn('[TenantExport] Extended backup data extraction skipped:', err?.message || err);
    }
    Object.assign(data, filterExtendedTenantBackupData(extendedData, scopeOptions));

    data.metadata = {
        exportedAt: new Date().toISOString(),
        tenantId,
        formatVersion: 1,
        backupType: 'tenant',
        scope,
        options: {
            includeProducts,
            includeCustomers,
            includeOrders,
            includePayments,
            includeInventory,
        },
    };

    return data;
}

export async function buildTenantBackupDataFromDatabaseUrl(
    databaseUrl: string,
    tenantId: string,
    options: {
        includeProducts?: boolean;
        includeCustomers?: boolean;
        includeOrders?: boolean;
        includePayments?: boolean;
        includeInventory?: boolean;
    } = {}
): Promise<Record<string, any>> {
    const client = postgres(databaseUrl);
    const tempDb = drizzle(client, { schema });
    try {
        return await buildTenantBackupData(tenantId, {
            includeProducts: options.includeProducts,
            includeCustomers: options.includeCustomers,
            includeOrders: options.includeOrders,
            includePayments: options.includePayments,
            includeInventory: options.includeInventory,
            dbClient: tempDb,
        });
    } finally {
        await client.end();
    }
}

async function fetchExtendedTenantBackupData(tenantId: string, dbClient: any = db): Promise<Record<string, any>> {
    const db = dbClient;
    const tenantOrderIds = db.select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, tenantId));
    const tenantCustomerIds = db.select({ id: schema.customers.id })
        .from(schema.customers)
        .where(eq(schema.customers.tenantId, tenantId));
    const tenantProductIds = db.select({ id: schema.products.id })
        .from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));
    const tenantBrandIds = db.select({ id: schema.brands.id })
        .from(schema.brands)
        .where(eq(schema.brands.tenantId, tenantId));
    const tenantPurchaseOrderIds = db.select({ id: schema.purchaseOrders.id })
        .from(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.tenantId, tenantId));
    const tenantStockCountIds = db.select({ id: schema.stockCounts.id })
        .from(schema.stockCounts)
        .where(eq(schema.stockCounts.tenantId, tenantId));
    const tenantPackingSessionIds = db.select({ id: schema.packingSessions.id })
        .from(schema.packingSessions)
        .where(eq(schema.packingSessions.tenantId, tenantId));
    const tenantShoppingCartIds = db.select({ id: schema.shoppingCarts.id })
        .from(schema.shoppingCarts)
        .where(sql`${schema.shoppingCarts.customerId} IN (${tenantCustomerIds}) OR ${schema.shoppingCarts.tenantId} = ${tenantId}`);
    const tenantUserIds = db.select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.tenantId, tenantId));
    const tenantTerritoryIds = db.select({ id: schema.territories.id })
        .from(schema.territories)
        .where(eq(schema.territories.tenantId, tenantId));
    const tenantTierIds = db.select({ id: schema.customerTiers.id })
        .from(schema.customerTiers)
        .where(eq(schema.customerTiers.tenantId, tenantId));
    const tenantCommissionRuleIds = db.select({ id: schema.commissionRules.id })
        .from(schema.commissionRules)
        .where(eq(schema.commissionRules.tenantId, tenantId));
    const tenantUserSessionIds = db.select({ id: schema.userSessions.id })
        .from(schema.userSessions)
        .where(eq(schema.userSessions.tenantId, tenantId));

    const data: Record<string, any> = {};
    const [
        tenantProfile,
        tenantSettings,
        tenantNotificationSettings,
        tenantExportSettings,
        tenantExports,
        users,
        territories,
        userTerritories,
        customerTiers,
        tierDowngradeRules,
        tierUpgradeRules,
        suppliers,
        productImages,
        vehicles,
        trips,
        discounts,
        discountScopes,
        volumeTiers,
        purchaseOrders,
        purchaseOrderItems,
        supplierPayments,
        moneyTransfers,
        stockCounts,
        stockCountItems,
        packingSessions,
        packingItems,
        scanLogs,
        stockMovements,
        stockAdjustments,
        customerUsers,
        salesVisits,
        tierChangeLogs,
        discountUsages,
        returns,
        orderStatusHistory,
        tripOrders,
        customerFavorites,
        productReviews,
        pushSubscriptions,
        customerAddresses,
        shoppingCarts,
        cartItems,
        userBrands,
        paymentTokens,
        notificationRoleSettings,
        notificationSettings,
        notificationLogs,
        auditLogs,
        userSessions,
        userActivityEvents,
        userLocations,
        userTelegramLinkCodes,
        sessions,
        salaryConfigurations,
        commissionRules,
        commissionTiers,
        commissionRecords,
        bonuses,
        deductions,
        payrollPeriods,
        payrollEntries,
        salaryAdvances,
        salaryHistory,
    ] = await Promise.all([
        db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1),
        db.select().from(schema.tenantSettings).where(eq(schema.tenantSettings.tenantId, tenantId)).limit(1),
        db.select().from(schema.tenantNotificationSettings).where(eq(schema.tenantNotificationSettings.tenantId, tenantId)).limit(1),
        db.select().from(schema.tenantExportSettings).where(eq(schema.tenantExportSettings.tenantId, tenantId)).limit(1),
        db.select().from(schema.tenantExports).where(eq(schema.tenantExports.tenantId, tenantId)),
        db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId)),
        db.select().from(schema.territories).where(eq(schema.territories.tenantId, tenantId)),
        db.select().from(schema.userTerritories).where(sql`${schema.userTerritories.territoryId} IN (${tenantTerritoryIds}) OR ${schema.userTerritories.userId} IN (${tenantUserIds})`),
        db.select().from(schema.customerTiers).where(eq(schema.customerTiers.tenantId, tenantId)),
        db.select().from(schema.tierDowngradeRules).where(eq(schema.tierDowngradeRules.tenantId, tenantId)),
        db.select().from(schema.tierUpgradeRules).where(eq(schema.tierUpgradeRules.tenantId, tenantId)),
        db.select().from(schema.suppliers).where(eq(schema.suppliers.tenantId, tenantId)),
        db.select().from(schema.productImages).where(sql`${schema.productImages.productId} IN (${tenantProductIds})`),
        db.select().from(schema.vehicles).where(eq(schema.vehicles.tenantId, tenantId)),
        db.select().from(schema.trips).where(eq(schema.trips.tenantId, tenantId)),
        db.select().from(schema.discounts).where(eq(schema.discounts.tenantId, tenantId)),
        db.select().from(schema.discountScopes).where(sql`${schema.discountScopes.discountId} IN (SELECT id FROM discounts WHERE tenant_id = ${tenantId})`),
        db.select().from(schema.volumeTiers).where(sql`${schema.volumeTiers.discountId} IN (SELECT id FROM discounts WHERE tenant_id = ${tenantId})`),
        db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId)),
        db.select().from(schema.purchaseOrderItems).where(sql`${schema.purchaseOrderItems.purchaseOrderId} IN (${tenantPurchaseOrderIds}) OR ${schema.purchaseOrderItems.productId} IN (${tenantProductIds})`),
        db.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.tenantId, tenantId)),
        db.select().from(schema.moneyTransfers).where(sql`${schema.moneyTransfers.tenantId} = ${tenantId} OR ${schema.moneyTransfers.fromCustomerId} IN (${tenantCustomerIds}) OR ${schema.moneyTransfers.toCustomerId} IN (${tenantCustomerIds})`),
        db.select().from(schema.stockCounts).where(eq(schema.stockCounts.tenantId, tenantId)),
        db.select().from(schema.stockCountItems).where(sql`${schema.stockCountItems.countId} IN (${tenantStockCountIds}) OR ${schema.stockCountItems.productId} IN (${tenantProductIds})`),
        db.select().from(schema.packingSessions).where(eq(schema.packingSessions.tenantId, tenantId)),
        db.select().from(schema.packingItems).where(sql`${schema.packingItems.sessionId} IN (${tenantPackingSessionIds}) OR ${schema.packingItems.productId} IN (${tenantProductIds})`),
        db.select().from(schema.scanLogs).where(sql`${schema.scanLogs.productId} IN (${tenantProductIds}) OR ${schema.scanLogs.tenantId} = ${tenantId}`),
        db.select().from(schema.stockMovements).where(sql`${schema.stockMovements.tenantId} = ${tenantId} OR ${schema.stockMovements.productId} IN (${tenantProductIds})`),
        db.select().from(schema.stockAdjustments).where(sql`${schema.stockAdjustments.tenantId} = ${tenantId} OR ${schema.stockAdjustments.productId} IN (${tenantProductIds})`),
        db.select().from(schema.customerUsers).where(sql`${schema.customerUsers.customerId} IN (${tenantCustomerIds}) OR ${schema.customerUsers.tenantId} = ${tenantId}`),
        db.select().from(schema.salesVisits).where(sql`${schema.salesVisits.customerId} IN (${tenantCustomerIds}) OR ${schema.salesVisits.orderId} IN (${tenantOrderIds}) OR ${schema.salesVisits.tenantId} = ${tenantId}`),
        db.select().from(schema.tierChangeLogs).where(sql`${schema.tierChangeLogs.tenantId} = ${tenantId} OR ${schema.tierChangeLogs.customerId} IN (${tenantCustomerIds})`),
        db.select().from(schema.discountUsages).where(sql`${schema.discountUsages.tenantId} = ${tenantId} OR ${schema.discountUsages.customerId} IN (${tenantCustomerIds}) OR ${schema.discountUsages.orderId} IN (${tenantOrderIds})`),
        db.select().from(schema.returns).where(sql`${schema.returns.tenantId} = ${tenantId} OR ${schema.returns.orderId} IN (${tenantOrderIds}) OR ${schema.returns.productId} IN (${tenantProductIds})`),
        db.select().from(schema.orderStatusHistory).where(sql`${schema.orderStatusHistory.orderId} IN (${tenantOrderIds})`),
        db.select().from(schema.tripOrders).where(sql`${schema.tripOrders.orderId} IN (${tenantOrderIds})`),
        db.select().from(schema.customerFavorites).where(sql`${schema.customerFavorites.customerId} IN (${tenantCustomerIds}) OR ${schema.customerFavorites.productId} IN (${tenantProductIds})`),
        db.select().from(schema.productReviews).where(sql`${schema.productReviews.customerId} IN (${tenantCustomerIds}) OR ${schema.productReviews.productId} IN (${tenantProductIds})`),
        db.select().from(schema.pushSubscriptions).where(sql`${schema.pushSubscriptions.customerId} IN (${tenantCustomerIds}) OR ${schema.pushSubscriptions.tenantId} = ${tenantId}`),
        db.select().from(schema.customerAddresses).where(sql`${schema.customerAddresses.customerId} IN (${tenantCustomerIds}) OR ${schema.customerAddresses.tenantId} = ${tenantId}`),
        db.select().from(schema.shoppingCarts).where(sql`${schema.shoppingCarts.customerId} IN (${tenantCustomerIds}) OR ${schema.shoppingCarts.tenantId} = ${tenantId}`),
        db.select().from(schema.cartItems).where(sql`${schema.cartItems.cartId} IN (${tenantShoppingCartIds}) OR ${schema.cartItems.productId} IN (${tenantProductIds})`),
        db.select().from(schema.userBrands).where(sql`${schema.userBrands.brandId} IN (${tenantBrandIds}) OR ${schema.userBrands.userId} IN (${tenantUserIds})`),
        db.select().from(schema.paymentTokens).where(eq(schema.paymentTokens.tenantId, tenantId)),
        db.select().from(schema.notificationRoleSettings).where(eq(schema.notificationRoleSettings.tenantId, tenantId)),
        db.select().from(schema.notificationSettings).where(sql`${schema.notificationSettings.userId} IN (${tenantUserIds})`),
        db.select().from(schema.notificationLogs).where(sql`${schema.notificationLogs.tenantId} = ${tenantId} OR ${schema.notificationLogs.userId} IN (${tenantUserIds})`),
        db.select().from(schema.auditLogs).where(sql`${schema.auditLogs.tenantId} = ${tenantId} OR ${schema.auditLogs.userId} IN (${tenantUserIds})`),
        db.select().from(schema.userSessions).where(sql`${schema.userSessions.tenantId} = ${tenantId} OR ${schema.userSessions.userId} IN (${tenantUserIds})`),
        db.select().from(schema.userActivityEvents).where(sql`${schema.userActivityEvents.tenantId} = ${tenantId} OR ${schema.userActivityEvents.userId} IN (${tenantUserIds}) OR ${schema.userActivityEvents.sessionId} IN (${tenantUserSessionIds})`),
        db.select().from(schema.userLocations).where(sql`${schema.userLocations.tenantId} = ${tenantId} OR ${schema.userLocations.userId} IN (${tenantUserIds})`),
        db.select().from(schema.userTelegramLinkCodes).where(sql`${schema.userTelegramLinkCodes.tenantId} = ${tenantId} OR ${schema.userTelegramLinkCodes.userId} IN (${tenantUserIds})`),
        db.select().from(schema.sessions).where(sql`${schema.sessions.userId} IN (${tenantUserIds})`),
        db.select().from(schema.salaryConfigurations).where(eq(schema.salaryConfigurations.tenantId, tenantId)),
        db.select().from(schema.commissionRules).where(eq(schema.commissionRules.tenantId, tenantId)),
        db.select().from(schema.commissionTiers).where(sql`${schema.commissionTiers.commissionRuleId} IN (${tenantCommissionRuleIds})`),
        db.select().from(schema.commissionRecords).where(eq(schema.commissionRecords.tenantId, tenantId)),
        db.select().from(schema.bonuses).where(eq(schema.bonuses.tenantId, tenantId)),
        db.select().from(schema.deductions).where(eq(schema.deductions.tenantId, tenantId)),
        db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.tenantId, tenantId)),
        db.select().from(schema.payrollEntries).where(eq(schema.payrollEntries.tenantId, tenantId)),
        db.select().from(schema.salaryAdvances).where(eq(schema.salaryAdvances.tenantId, tenantId)),
        db.select().from(schema.salaryHistory).where(eq(schema.salaryHistory.tenantId, tenantId)),
    ]);

    data.tenantProfile = tenantProfile[0] || null;
    data.tenantSettings = tenantSettings;
    data.tenantNotificationSettings = tenantNotificationSettings;
    data.tenantExportSettings = tenantExportSettings;
    data.tenantExports = tenantExports;
    data.users = users;
    data.territories = territories;
    data.userTerritories = userTerritories;
    data.customerTiers = customerTiers;
    data.tierDowngradeRules = tierDowngradeRules;
    data.tierUpgradeRules = tierUpgradeRules;
    data.suppliers = suppliers;
    data.productImages = productImages;
    data.vehicles = vehicles;
    data.trips = trips;
    data.discounts = discounts;
    data.discountScopes = discountScopes;
    data.volumeTiers = volumeTiers;
    data.purchaseOrders = purchaseOrders;
    data.purchaseOrderItems = purchaseOrderItems;
    data.supplierPayments = supplierPayments;
    data.moneyTransfers = moneyTransfers;
    data.stockCounts = stockCounts;
    data.stockCountItems = stockCountItems;
    data.packingSessions = packingSessions;
    data.packingItems = packingItems;
    data.scanLogs = scanLogs;
    data.stockMovements = stockMovements;
    data.stockAdjustments = stockAdjustments;
    data.customerUsers = customerUsers;
    data.salesVisits = salesVisits;
    data.tierChangeLogs = tierChangeLogs;
    data.discountUsages = discountUsages;
    data.returns = returns;
    data.orderStatusHistory = orderStatusHistory;
    data.tripOrders = tripOrders;
    data.customerFavorites = customerFavorites;
    data.productReviews = productReviews;
    data.pushSubscriptions = pushSubscriptions;
    data.customerAddresses = customerAddresses;
    data.shoppingCarts = shoppingCarts;
    data.cartItems = cartItems;
    data.userBrands = userBrands;
    data.paymentTokens = paymentTokens;
    data.notificationRoleSettings = notificationRoleSettings;
    data.notificationSettings = notificationSettings;
    data.notificationLogs = notificationLogs;
    data.auditLogs = auditLogs;
    data.userSessions = userSessions;
    data.userActivityEvents = userActivityEvents;
    data.userLocations = userLocations;
    data.userTelegramLinkCodes = userTelegramLinkCodes;
    data.sessions = sessions;
    data.salaryConfigurations = salaryConfigurations;
    data.commissionRules = commissionRules;
    data.commissionTiers = commissionTiers;
    data.commissionRecords = commissionRecords;
    data.bonuses = bonuses;
    data.deductions = deductions;
    data.payrollPeriods = payrollPeriods;
    data.payrollEntries = payrollEntries;
    data.salaryAdvances = salaryAdvances;
    data.salaryHistory = salaryHistory;

    return data;
}

// Export directory
const EXPORTS_DIR = join(process.cwd(), 'exports');

// Scheduled job reference
let exportScheduleJob: CronJob | null = null;

/**
 * Initialize the export service
 */
export async function initExportService(): Promise<void> {
    try {
        await mkdir(EXPORTS_DIR, { recursive: true });
        startExportScheduler();
        console.log('[TenantExport] Service initialized');
    } catch (err) {
        console.error('[TenantExport] Failed to initialize:', err);
    }
}

/**
 * Create a new export for a tenant
 */
export async function createTenantExport(
    tenantId: string,
    userId: string,
    options: ExportOptions
): Promise<ExportResult> {
    try {
        // Create export record
        const [exportRecord] = await db.insert(schema.tenantExports).values({
            tenantId,
            createdById: userId,
            format: options.format,
            includeProducts: options.includeProducts,
            includeCustomers: options.includeCustomers,
            includeOrders: options.includeOrders,
            includePayments: options.includePayments,
            includeInventory: options.includeInventory,
            dateFrom: options.dateFrom,
            dateTo: options.dateTo,
            status: 'processing',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }).returning();

        // Process export (async but we don't wait)
        processExport(exportRecord.id, tenantId, options).catch(err => {
            console.error(`[TenantExport] Export ${exportRecord.id} failed:`, err);
        });

        return {
            success: true,
            exportId: exportRecord.id,
        };
    } catch (err: any) {
        console.error('[TenantExport] Failed to create export:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Process an export job
 */
async function processExport(exportId: string, tenantId: string, options: ExportOptions): Promise<void> {
    try {
        const data = await buildTenantBackupData(tenantId, {
            includeProducts: options.includeProducts,
            includeCustomers: options.includeCustomers,
            includeOrders: options.includeOrders,
            includePayments: options.includePayments,
            includeInventory: options.includeInventory,
        });

        data.metadata.options = {
            ...data.metadata.options,
            ...options,
            dateFrom: options.dateFrom?.toISOString(),
            dateTo: options.dateTo?.toISOString(),
        };

        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = options.format === 'xlsx' ? 'xlsx' : options.format;
        const filename = `export-${tenantId.slice(0, 8)}-${timestamp}.${ext}`;
        const filepath = join(EXPORTS_DIR, filename);

        // Write file based on format
        if (options.format === 'json') {
            const fileContent = JSON.stringify(data, null, 2);
            await writeFile(filepath, fileContent, 'utf-8');
        } else if (options.format === 'csv') {
            const fileContent = convertToCSV(data);
            await writeFile(filepath, fileContent, 'utf-8');
        } else if (options.format === 'xlsx') {
            await convertToExcel(data, filepath);
        }

        const stats = await stat(filepath);

        // Update export record
        await db.update(schema.tenantExports)
            .set({
                status: 'completed',
                filename,
                fileSize: stats.size,
                completedAt: new Date(),
            })
            .where(eq(schema.tenantExports.id, exportId));

        console.log(`[TenantExport] Export ${exportId} completed: ${filename}`);
    } catch (err: any) {
        console.error(`[TenantExport] Export ${exportId} failed:`, err);

        await db.update(schema.tenantExports)
            .set({
                status: 'failed',
                errorMessage: err.message,
                completedAt: new Date(),
            })
            .where(eq(schema.tenantExports.id, exportId));
    }
}

/**
 * Fetch products for export
 */
async function fetchProducts(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    const products = await db.select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        barcode: schema.products.barcode,
        description: schema.products.description,
        price: schema.products.price,
        costPrice: schema.products.costPrice,
        stockQuantity: schema.products.stockQuantity,
        reorderPoint: schema.products.reorderPoint,
        unit: schema.products.unit,
        isActive: schema.products.isActive,
        subcategoryId: schema.products.subcategoryId,
        brandId: schema.products.brandId,
        createdAt: schema.products.createdAt,
    })
        .from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));

    return products;
}

async function fetchCategories(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    return await db.select({
        id: schema.categories.id,
        name: schema.categories.name,
        sortOrder: schema.categories.sortOrder,
        isActive: schema.categories.isActive,
    })
        .from(schema.categories)
        .where(eq(schema.categories.tenantId, tenantId));
}

async function fetchBrands(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    return await db.select({
        id: schema.brands.id,
        name: schema.brands.name,
        logoUrl: schema.brands.logoUrl,
        isActive: schema.brands.isActive,
    })
        .from(schema.brands)
        .where(eq(schema.brands.tenantId, tenantId));
}

async function fetchSubcategories(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    return await db.select({
        id: schema.subcategories.id,
        categoryId: schema.subcategories.categoryId,
        name: schema.subcategories.name,
        sortOrder: schema.subcategories.sortOrder,
        isActive: schema.subcategories.isActive,
    })
        .from(schema.subcategories)
        .where(eq(schema.subcategories.tenantId, tenantId));
}

/**
 * Fetch customers for export
 */
async function fetchCustomers(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    const customers = await db.select({
        id: schema.customers.id,
        name: schema.customers.name,
        phone: schema.customers.phone,
        email: schema.customers.email,
        address: schema.customers.address,
        waymark: schema.customers.waymark,
        creditBalance: schema.customers.creditBalance,
        debtBalance: schema.customers.debtBalance,
        tierId: schema.customers.tierId,
        territoryId: schema.customers.territoryId,
        isActive: schema.customers.isActive,
        createdAt: schema.customers.createdAt,
    })
        .from(schema.customers)
        .where(eq(schema.customers.tenantId, tenantId));

    return customers;
}

/**
 * Fetch orders for export
 */
async function fetchOrders(tenantId: string, dateFilter?: { from?: Date; to?: Date }, dbClient: any = db) {
    const db = dbClient;
    let query = db.select({
        id: schema.orders.id,
        orderNumber: schema.orders.orderNumber,
        customerId: schema.orders.customerId,
        totalAmount: schema.orders.totalAmount,
        discountAmount: schema.orders.discountAmount,
        paidAmount: schema.orders.paidAmount,
        status: schema.orders.status,
        paymentStatus: schema.orders.paymentStatus,
        notes: schema.orders.notes,
        deliveryNotes: schema.orders.deliveryNotes,
        createdAt: schema.orders.createdAt,
    })
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, tenantId));

    // Note: Date filtering would require additional conditions
    // For now, we return all orders - can be enhanced later

    return await query;
}

async function fetchOrderItems(tenantId: string, dateFilter?: { from?: Date; to?: Date }, dbClient: any = db) {
    const db = dbClient;
    const rows = await db.select({
        id: schema.orderItems.id,
        orderId: schema.orderItems.orderId,
        productId: schema.orderItems.productId,
        unitPrice: schema.orderItems.unitPrice,
        qtyOrdered: schema.orderItems.qtyOrdered,
        qtyPicked: schema.orderItems.qtyPicked,
        qtyDelivered: schema.orderItems.qtyDelivered,
        qtyReturned: schema.orderItems.qtyReturned,
        discountAmount: schema.orderItems.discountAmount,
        taxAmount: schema.orderItems.taxAmount,
        lineTotal: schema.orderItems.lineTotal,
    })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(eq(schema.orders.tenantId, tenantId));

    return rows;
}

/**
 * Fetch payments for export
 */
async function fetchPayments(tenantId: string, dateFilter?: { from?: Date; to?: Date }, dbClient: any = db) {
    const db = dbClient;
    const payments = await db.select({
        id: schema.payments.id,
        paymentNumber: schema.payments.paymentNumber,
        orderId: schema.payments.orderId,
        customerId: schema.payments.customerId,
        amount: schema.payments.amount,
        paymentMethodId: schema.payments.paymentMethodId,
        referenceNumber: schema.payments.referenceNumber,
        notes: schema.payments.notes,
        createdAt: schema.payments.createdAt,
    })
        .from(schema.payments)
        .where(eq(schema.payments.tenantId, tenantId));

    return payments;
}

async function fetchPaymentMethods(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    return await db.select({
        id: schema.paymentMethods.id,
        name: schema.paymentMethods.name,
        isActive: schema.paymentMethods.isActive,
    })
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.tenantId, tenantId));
}

/**
 * Fetch inventory/stock movements for export
 */
async function fetchInventory(tenantId: string, dbClient: any = db) {
    const db = dbClient;
    const inventory = await db.select({
        productId: schema.products.id,
        productName: schema.products.name,
        sku: schema.products.sku,
        stockQuantity: schema.products.stockQuantity,
        reservedQuantity: schema.products.reservedQuantity,
        reorderPoint: schema.products.reorderPoint,
    })
        .from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));

    return inventory;
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: Record<string, any>): string {
    const sections: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        if (key === 'metadata') continue;
        if (!Array.isArray(value) || value.length === 0) continue;

        const headers = Object.keys(value[0]);
        const headerRow = headers.join(',');
        const dataRows = value.map((row: any) =>
            headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
            }).join(',')
        );

        sections.push(`### ${key.toUpperCase()} ###`);
        sections.push(headerRow);
        sections.push(...dataRows);
        sections.push('');
    }

    return sections.join('\n');
}

/**
 * Convert data to Excel format
 */
async function convertToExcel(data: Record<string, any>, filepath: string): Promise<void> {
    const workbook = XLSX.utils.book_new();

    for (const [key, value] of Object.entries(data)) {
        if (key === 'metadata') continue;
        if (!Array.isArray(value) || value.length === 0) continue;

        // Create worksheet from data array
        const worksheet = XLSX.utils.json_to_sheet(value);

        // Add worksheet with sheet name (truncate to 31 chars for Excel limit)
        const sheetName = key.charAt(0).toUpperCase() + key.slice(1);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    }

    // Add metadata sheet
    if (data.metadata) {
        const metaSheet = XLSX.utils.json_to_sheet([data.metadata]);
        XLSX.utils.book_append_sheet(workbook, metaSheet, 'Metadata');
    }

    // Write file
    XLSX.writeFile(workbook, filepath);
}

/**
 * List exports for a tenant
 */
export async function listTenantExports(tenantId: string, limit = 20) {
    return await db.select({
        id: schema.tenantExports.id,
        format: schema.tenantExports.format,
        status: schema.tenantExports.status,
        filename: schema.tenantExports.filename,
        fileSize: schema.tenantExports.fileSize,
        includeProducts: schema.tenantExports.includeProducts,
        includeCustomers: schema.tenantExports.includeCustomers,
        includeOrders: schema.tenantExports.includeOrders,
        includePayments: schema.tenantExports.includePayments,
        includeInventory: schema.tenantExports.includeInventory,
        createdAt: schema.tenantExports.createdAt,
        completedAt: schema.tenantExports.completedAt,
        expiresAt: schema.tenantExports.expiresAt,
        downloadedAt: schema.tenantExports.downloadedAt,
        errorMessage: schema.tenantExports.errorMessage,
    })
        .from(schema.tenantExports)
        .where(eq(schema.tenantExports.tenantId, tenantId))
        .orderBy(desc(schema.tenantExports.createdAt))
        .limit(limit);
}

/**
 * Get export file path
 */
export function getExportPath(filename: string): string {
    const safeFilename = filename.replace(/[\\/]/g, '');
    return join(EXPORTS_DIR, safeFilename);
}

/**
 * Mark export as downloaded
 */
export async function markExportDownloaded(exportId: string, tenantId: string) {
    await db.update(schema.tenantExports)
        .set({ downloadedAt: new Date() })
        .where(and(
            eq(schema.tenantExports.id, exportId),
            eq(schema.tenantExports.tenantId, tenantId)
        ));
}

/**
 * Get export settings for a tenant
 */
export async function getExportSettings(tenantId: string) {
    const [settings] = await db.select()
        .from(schema.tenantExportSettings)
        .where(eq(schema.tenantExportSettings.tenantId, tenantId))
        .limit(1);

    if (settings) return settings;

    // Create default settings
    const [newSettings] = await db.insert(schema.tenantExportSettings)
        .values({ tenantId })
        .returning();

    return newSettings;
}

export async function getTenantScheduledBackupFormat(tenantId: string): Promise<ScheduledBackupFormat> {
    const [row] = await db.select({ value: schema.tenantSettings.value })
        .from(schema.tenantSettings)
        .where(and(
            eq(schema.tenantSettings.tenantId, tenantId),
            eq(schema.tenantSettings.key, TENANT_SCHEDULED_BACKUP_FORMAT_KEY)
        ))
        .limit(1);

    if (!row?.value) return 'json';
    return row.value === 'sql' ? 'sql' : 'json';
}

async function setTenantScheduledBackupFormat(
    tenantId: string,
    format: ScheduledBackupFormat,
    executor: any = db
): Promise<void> {
    const [existing] = await executor.select({ id: schema.tenantSettings.id })
        .from(schema.tenantSettings)
        .where(and(
            eq(schema.tenantSettings.tenantId, tenantId),
            eq(schema.tenantSettings.key, TENANT_SCHEDULED_BACKUP_FORMAT_KEY)
        ))
        .limit(1);

    if (existing?.id) {
        await executor.update(schema.tenantSettings)
            .set({
                value: format,
                updatedAt: new Date(),
            })
            .where(eq(schema.tenantSettings.id, existing.id));
        return;
    }

    await executor.insert(schema.tenantSettings)
        .values({
            tenantId,
            key: TENANT_SCHEDULED_BACKUP_FORMAT_KEY,
            value: format,
        });
}

/**
 * Update export settings for a tenant
 */
export async function updateExportSettings(
    tenantId: string,
    updates: {
        frequency?: 'never' | 'daily' | 'weekly' | 'monthly';
        format?: 'json' | 'csv' | 'xlsx';
        scheduledBackupFormat?: ScheduledBackupFormat;
        scheduleTime?: string; // HH:MM format
        sendToTelegram?: boolean; // Send export file to admin Telegram
        includeProducts?: boolean;
        includeCustomers?: boolean;
        includeOrders?: boolean;
        includePayments?: boolean;
        includeInventory?: boolean;
        retentionDays?: number;
    }
) {
    // Ensure settings exist
    const currentSettings = await getExportSettings(tenantId);

    // Get tenant timezone
    const [tenant] = await db.select({ timezone: schema.tenants.timezone })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
    const timezone = tenant?.timezone || 'Asia/Tashkent';

    // Get schedule time from updates or existing settings
    const scheduleTime = updates.scheduleTime ?? currentSettings.scheduleTime ?? '03:00';

    // Calculate next export time
    let nextExportAt: Date | null = null;
    const freq = updates.frequency ?? currentSettings.frequency;
    if (freq && freq !== 'never') {
        nextExportAt = calculateNextExportTime(freq as 'daily' | 'weekly' | 'monthly', scheduleTime, timezone);
        console.log(`[TenantExport] Scheduled next export at ${nextExportAt.toISOString()} (${scheduleTime} ${timezone})`);
    }

    const dbUpdates: any = {
        ...updates,
        nextExportAt,
        updatedAt: new Date(),
    };
    delete dbUpdates.scheduledBackupFormat;

    const [updated] = await db.update(schema.tenantExportSettings)
        .set({
            ...dbUpdates,
        })
        .where(eq(schema.tenantExportSettings.tenantId, tenantId))
        .returning();

    if (updates.scheduledBackupFormat) {
        await setTenantScheduledBackupFormat(tenantId, updates.scheduledBackupFormat);
    }

    return updated;
}

/**
 * Calculate next export time based on frequency, schedule time, and timezone
 */
function calculateNextExportTime(
    frequency: 'daily' | 'weekly' | 'monthly',
    scheduleTime: string = '03:00',
    timezone: string = 'Asia/Tashkent'
): Date {
    const [targetHoursRaw, targetMinutesRaw] = scheduleTime.split(':').map(Number);
    const targetHours = Number.isFinite(targetHoursRaw) ? targetHoursRaw : 3;
    const targetMinutes = Number.isFinite(targetMinutesRaw) ? targetMinutesRaw : 0;
    const safeTimezone = (() => {
        try {
            Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
            return timezone;
        } catch {
            return 'UTC';
        }
    })();

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: safeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const nowUtc = new Date();
    const nowParts = formatter.formatToParts(nowUtc);
    const toNum = (type: string): number => Number(nowParts.find((p) => p.type === type)?.value || '0');
    const nowLocal = {
        year: toNum('year'),
        month: toNum('month'),
        day: toNum('day'),
        hour: toNum('hour'),
        minute: toNum('minute'),
        second: toNum('second'),
    };

    const zonedDateTimeToUtc = (year: number, month: number, day: number, hour: number, minute: number): Date => {
        // Iterative correction from UTC guess to timezone-local clock time.
        let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        for (let i = 0; i < 4; i++) {
            const parts = formatter.formatToParts(new Date(guess));
            const pick = (type: string): number => Number(parts.find((p) => p.type === type)?.value || '0');
            const localAsUtc = Date.UTC(
                pick('year'),
                pick('month') - 1,
                pick('day'),
                pick('hour'),
                pick('minute'),
                pick('second'),
                0
            );
            const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
            const diff = targetAsUtc - localAsUtc;
            if (diff === 0) break;
            guess += diff;
        }
        return new Date(guess);
    };

    const todayCandidateUtc = zonedDateTimeToUtc(
        nowLocal.year,
        nowLocal.month,
        nowLocal.day,
        targetHours,
        targetMinutes
    );
    const hasPassedToday = todayCandidateUtc.getTime() <= nowUtc.getTime();

    const localBase = new Date(Date.UTC(nowLocal.year, nowLocal.month - 1, nowLocal.day, 0, 0, 0, 0));
    const candidateLocalDate = new Date(localBase);

    switch (frequency) {
        case 'daily': {
            if (hasPassedToday) candidateLocalDate.setUTCDate(candidateLocalDate.getUTCDate() + 1);
            break;
        }
        case 'weekly': {
            const localWeekday = localBase.getUTCDay(); // 0=Sunday
            let daysUntilSunday = (7 - localWeekday) % 7;
            if (daysUntilSunday === 0 && hasPassedToday) {
                daysUntilSunday = 7;
            }
            if (daysUntilSunday === 0 && !hasPassedToday) {
                daysUntilSunday = 0;
            }
            if (daysUntilSunday > 0) candidateLocalDate.setUTCDate(candidateLocalDate.getUTCDate() + daysUntilSunday);
            break;
        }
        case 'monthly': {
            candidateLocalDate.setUTCDate(1);
            if (nowLocal.day > 1 || (nowLocal.day === 1 && hasPassedToday)) {
                candidateLocalDate.setUTCMonth(candidateLocalDate.getUTCMonth() + 1);
            }
            break;
        }
    }

    const nextUtc = zonedDateTimeToUtc(
        candidateLocalDate.getUTCFullYear(),
        candidateLocalDate.getUTCMonth() + 1,
        candidateLocalDate.getUTCDate(),
        targetHours,
        targetMinutes
    );

    console.log(`[TenantExport] Calculated next export: ${nextUtc.toISOString()} (target: ${scheduleTime} ${safeTimezone})`);
    return nextUtc;
}

/**
 * Start the export scheduler
 */
function startExportScheduler() {
    if (exportScheduleJob) {
        exportScheduleJob.stop();
    }

    // Run every 15 minutes to check for scheduled exports (more precise timing)
    exportScheduleJob = new CronJob('*/15 * * * *', async () => {
        console.log('[TenantExport] Checking for scheduled exports...');
        await runScheduledExports();
    });

    exportScheduleJob.start();
    console.log('[TenantExport] Scheduler started (runs every 15 minutes)');
}

/**
 * Run scheduled exports
 */
async function runScheduledExports() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('[TenantExport] Scheduler skipped: DATABASE_URL not set');
        return;
    }

    const lockClient = postgres(dbUrl, { max: 1, prepare: false });
    let schedulerLockAcquired = false;
    try {
        const lockResult = await lockClient<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${TENANT_EXPORT_SCHEDULER_LOCK_KEY}) AS locked`;
        schedulerLockAcquired = !!lockResult?.[0]?.locked;
        if (!schedulerLockAcquired) {
            console.log('[TenantExport] Scheduler tick skipped: another instance is already running');
            return;
        }

        const now = new Date();
        console.log(`[TenantExport] Checking for scheduled backups at ${now.toISOString()}`);

        // Find tenants with due scheduled backups
        const dueSettings = await db.select({
            settings: schema.tenantExportSettings,
            tenantTimezone: schema.tenants.timezone,
            tenantName: schema.tenants.name,
        })
            .from(schema.tenantExportSettings)
            .leftJoin(schema.tenants, eq(schema.tenantExportSettings.tenantId, schema.tenants.id))
            .where(and(
                sql`${schema.tenantExportSettings.frequency} != 'never'`,
                lte(schema.tenantExportSettings.nextExportAt, now)
            ));

        console.log(`[TenantExport] Found ${dueSettings.length} due scheduled backups`);

        for (const { settings, tenantTimezone, tenantName } of dueSettings) {
            console.log(`[TenantExport] Running scheduled backup for tenant ${settings.tenantId}`);

            const scheduledFormat = await getTenantScheduledBackupFormat(settings.tenantId);
            const { createTenantScopedBackup, getBackupPath, cleanOldTenantScopedBackupsForTenant } = await import('./backup');
            const backupResult = await createTenantScopedBackup(settings.tenantId, scheduledFormat, {
                includeProducts: settings.includeProducts ?? true,
                includeCustomers: settings.includeCustomers ?? true,
                includeOrders: settings.includeOrders ?? true,
                includePayments: settings.includePayments ?? true,
                includeInventory: settings.includeInventory ?? true,
            });
            const backupSucceeded = !!backupResult.success && !!backupResult.filename;

            if (!backupSucceeded) {
                console.error(`[TenantExport] Scheduled backup failed for tenant ${settings.tenantId}: ${backupResult.error || 'Unknown error'}`);
            } else {
                const backupFilename = backupResult.filename as string;
                if (settings.sendToTelegram) {
                    const { sendTelegramDocument, getTenantAdminsWithTelegram, escapeHtml } = await import('./telegram');
                    const admins = await getTenantAdminsWithTelegram(settings.tenantId);
                    if (admins.length > 0) {
                        const filePath = getBackupPath(backupFilename);
                        const formatDate = now.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        });

                        const caption = `<b>Scheduled Tenant Backup</b>\n\n` +
                            `Tenant: ${escapeHtml(tenantName || 'Unknown')}\n` +
                            `Date: ${formatDate}\n` +
                            `Format: ${scheduledFormat.toUpperCase()}\n\n` +
                            `<i>This is an automated backup sent by IxaSales.</i>`;

                        for (const admin of admins) {
                            const sent = await sendTelegramDocument(
                                admin.telegramChatId,
                                filePath,
                                backupFilename,
                                caption
                            );
                            if (!sent) {
                                console.warn(`[TenantExport] Failed to send scheduled backup to admin ${admin.id}`);
                            }
                        }
                    }
                }

                const retentionDays = Math.max(1, Number(settings.retentionDays || 30));
                await cleanOldTenantScopedBackupsForTenant(settings.tenantId, retentionDays);
            }

            if (backupSucceeded) {
                // Update next export time using tenant's schedule time and timezone
                const scheduleTime = settings.scheduleTime || '03:00';
                const timezone = tenantTimezone || 'Asia/Tashkent';
                const nextExportAt = calculateNextExportTime(
                    settings.frequency as 'daily' | 'weekly' | 'monthly',
                    scheduleTime,
                    timezone
                );

                console.log(`[TenantExport] Next export for tenant ${settings.tenantId} scheduled at ${nextExportAt.toISOString()}`);

                await db.update(schema.tenantExportSettings)
                    .set({
                        lastExportAt: now,
                        nextExportAt,
                    })
                    .where(eq(schema.tenantExportSettings.id, settings.id));
            } else {
                // Do not advance lastExportAt on failure; retry soon.
                const retryAt = new Date(now.getTime() + 15 * 60 * 1000);
                console.log(`[TenantExport] Retry for tenant ${settings.tenantId} scheduled at ${retryAt.toISOString()}`);
                await db.update(schema.tenantExportSettings)
                    .set({ nextExportAt: retryAt })
                    .where(eq(schema.tenantExportSettings.id, settings.id));
            }
        }

        // Clean up expired exports
        await cleanupExpiredExports();
    } catch (err) {
        console.error('[TenantExport] Scheduler error:', err);
    } finally {
        if (schedulerLockAcquired) {
            try {
                await lockClient`SELECT pg_advisory_unlock(${TENANT_EXPORT_SCHEDULER_LOCK_KEY})`;
            } catch {
                // Best effort unlock.
            }
        }
        try {
            await lockClient.end();
        } catch {
            // ignore
        }
    }
}

/**
 * Clean up expired export files
 */
async function cleanupExpiredExports() {
    try {
        const now = new Date();

        const expiredExports = await db.select()
            .from(schema.tenantExports)
            .where(lt(schema.tenantExports.expiresAt, now));

        for (const exp of expiredExports) {
            if (exp.filename) {
                try {
                    await unlink(getExportPath(exp.filename));
                } catch { /* File may already be deleted */ }
            }

            await db.delete(schema.tenantExports)
                .where(eq(schema.tenantExports.id, exp.id));
        }

        if (expiredExports.length > 0) {
            console.log(`[TenantExport] Cleaned up ${expiredExports.length} expired exports`);
        }
    } catch (err) {
        console.error('[TenantExport] Cleanup error:', err);
    }
}

// ============================================================================
// IMPORT FUNCTIONALITY
// ============================================================================

/**
 * Import data from a JSON export file
 */
export async function importTenantData(
    tenantId: string,
    fileContent: string,
    options: {
        importProducts?: boolean;
        importCustomers?: boolean;
        importOrders?: boolean;
        importPayments?: boolean;
        skipExisting?: boolean;
        overwriteExisting?: boolean;
        dbClient?: any;
    } = {}
): Promise<ImportResult> {
    const errors: string[] = [];
    const imported: ImportResult['imported'] = {};
    const restoreWarnings = new Set<string>();
    const executor = options.dbClient ?? db;
    const importScope: TenantBackupDataScopeOptions = {
        includeProducts: options.importProducts ?? true,
        includeCustomers: options.importCustomers ?? true,
        includeOrders: options.importOrders ?? true,
        includePayments: options.importPayments ?? true,
        includeInventory: options.importProducts ?? true,
    };

    try {
        const data = fileContent.includes(TENANT_SQL_MARKER)
            ? decodeTenantBackupFromSql(fileContent)
            : JSON.parse(fileContent);

        if (!data?.metadata || data?.metadata?.backupType !== 'tenant') {
            return {
                success: false,
                imported,
                errors: ['Invalid backup payload: missing tenant metadata'],
            };
        }
        if (typeof data.metadata.tenantId !== 'string' || data.metadata.tenantId.length === 0) {
            return {
                success: false,
                imported,
                errors: ['Invalid backup payload: missing metadata.tenantId'],
            };
        }
        if (data.metadata.tenantId !== tenantId) {
            return {
                success: false,
                imported,
                errors: [`Backup tenant mismatch: expected ${tenantId}, got ${data.metadata.tenantId}`],
            };
        }

        const territoryIdsInPayload = new Set<string>();
        const tierIdsInPayload = new Set<string>();

        const normalizeRows = (key: string, rows: any[] | undefined): any[] => {
            if (!Array.isArray(rows)) return [];
            const tenantScopedTables = new Set([
                'tenantSettings',
                'tenantNotificationSettings',
                'tenantExportSettings',
                'tenantExports',
                'users',
                'categories',
                'brands',
                'suppliers',
                'territories',
                'customerTiers',
                'subcategories',
                'products',
                'customers',
                'vehicles',
                'trips',
                'discounts',
                'paymentMethods',
                'purchaseOrders',
                'stockCounts',
                'packingSessions',
                'shoppingCarts',
                'customerUsers',
                'orders',
                'payments',
                'supplierPayments',
                'moneyTransfers',
                'returns',
                'salesVisits',
                'discountUsages',
                'tierChangeLogs',
                'tierDowngradeRules',
                'tierUpgradeRules',
                'stockMovements',
                'stockAdjustments',
                'scanLogs',
                'pushSubscriptions',
                'notificationRoleSettings',
                'paymentTokens',
                'salaryConfigurations',
                'commissionRules',
                'commissionRecords',
                'bonuses',
                'deductions',
                'payrollPeriods',
                'payrollEntries',
                'salaryAdvances',
                'salaryHistory',
                'userSessions',
                'userActivityEvents',
                'userLocations',
                'userTelegramLinkCodes',
                'notificationLogs',
                'auditLogs',
            ]);
            const dateLikeFields = new Set([
                'createdAt',
                'updatedAt',
                'startsAt',
                'endsAt',
                'lastExportAt',
                'nextExportAt',
                'completedAt',
                'expiresAt',
                'downloadedAt',
                'deliveredAt',
                'cancelledAt',
                'paidAt',
                'collectedAt',
                'requestedDeliveryDate',
                'calculatedAt',
                'approvedAt',
                'startedAt',
                'endedAt',
                'timestamp',
                'sentAt',
                'executedAt',
                'effectiveFrom',
                'effectiveTo',
                'effectiveDate',
                'requestedDate',
                'disbursedAt',
                'repaymentStartDate',
                'startDate',
                'endDate',
                'paymentDate',
                'plannedDate',
                'plannedTime',
                'receivedAt',
            ]);
            return rows.map((row) => {
                if (!row || typeof row !== 'object') return row;
                const normalized = { ...row };

                if (tenantScopedTables.has(key)) {
                    normalized.tenantId = tenantId;
                }

                if (key === 'orders') {
                    if (normalized.subtotalAmount === undefined || normalized.subtotalAmount === null) {
                        normalized.subtotalAmount = normalized.totalAmount ?? '0';
                    }
                    if (normalized.taxAmount === undefined || normalized.taxAmount === null) {
                        normalized.taxAmount = '0';
                    }
                }
                if (key === 'customers') {
                    if (normalized.territoryId && !territoryIdsInPayload.has(normalized.territoryId)) {
                        normalized.territoryId = null;
                        restoreWarnings.add('Some customers referenced missing territories; territoryId was cleared during restore.');
                    }
                    if (normalized.tierId && !tierIdsInPayload.has(normalized.tierId)) {
                        normalized.tierId = null;
                        restoreWarnings.add('Some customers referenced missing customer tiers; tierId was cleared during restore.');
                    }
                }

                for (const [field, value] of Object.entries(normalized)) {
                    if (!dateLikeFields.has(field)) continue;
                    if (typeof value !== 'string') continue;
                    const parsed = new Date(value);
                    if (!Number.isNaN(parsed.getTime())) {
                        normalized[field] = parsed;
                    }
                }
                return normalized;
            });
        };

        if (data.tenantProfile && typeof data.tenantProfile === 'object') {
            const tenantPatch: Record<string, any> = { ...(data.tenantProfile as Record<string, any>) };
            delete tenantPatch.id;
            delete tenantPatch.createdAt;
            delete tenantPatch.updatedAt;
            if (Object.keys(tenantPatch).length > 0) {
                tenantPatch.updatedAt = new Date();
                await (executor as any).update(schema.tenants)
                    .set(tenantPatch)
                    .where(eq(schema.tenants.id, tenantId));
                imported.tenantProfile = 1;
            }
        }

        const scope: 'business' | 'full' = data?.metadata?.scope === 'full' ? 'full' : 'business';
        for (const row of normalizeRows('territories', (data as any)?.territories)) {
            if (typeof row?.id === 'string' && row.id.length > 0) territoryIdsInPayload.add(row.id);
        }
        for (const row of normalizeRows('customerTiers', (data as any)?.customerTiers)) {
            if (typeof row?.id === 'string' && row.id.length > 0) tierIdsInPayload.add(row.id);
        }

        const fullImportOrder: Array<{ key: string; table: any }> = [
            { key: 'tenantSettings', table: schema.tenantSettings },
            { key: 'tenantNotificationSettings', table: schema.tenantNotificationSettings },
            { key: 'tenantExportSettings', table: schema.tenantExportSettings },
            { key: 'users', table: schema.users },
            { key: 'territories', table: schema.territories },
            { key: 'customerTiers', table: schema.customerTiers },
            { key: 'categories', table: schema.categories },
            { key: 'brands', table: schema.brands },
            { key: 'suppliers', table: schema.suppliers },
            { key: 'userTerritories', table: schema.userTerritories },
            { key: 'userBrands', table: schema.userBrands },
            { key: 'tierDowngradeRules', table: schema.tierDowngradeRules },
            { key: 'tierUpgradeRules', table: schema.tierUpgradeRules },
            { key: 'subcategories', table: schema.subcategories },
            { key: 'products', table: schema.products },
            { key: 'productImages', table: schema.productImages },
            { key: 'customers', table: schema.customers },
            { key: 'notificationRoleSettings', table: schema.notificationRoleSettings },
            { key: 'vehicles', table: schema.vehicles },
            { key: 'trips', table: schema.trips },
            { key: 'discounts', table: schema.discounts },
            { key: 'paymentMethods', table: schema.paymentMethods },
            { key: 'purchaseOrders', table: schema.purchaseOrders },
            { key: 'stockCounts', table: schema.stockCounts },
            { key: 'packingSessions', table: schema.packingSessions },
            { key: 'shoppingCarts', table: schema.shoppingCarts },
            { key: 'customerUsers', table: schema.customerUsers },
            { key: 'orders', table: schema.orders },
            { key: 'orderItems', table: schema.orderItems },
            { key: 'payments', table: schema.payments },
            { key: 'paymentTokens', table: schema.paymentTokens },
            { key: 'supplierPayments', table: schema.supplierPayments },
            { key: 'moneyTransfers', table: schema.moneyTransfers },
            { key: 'returns', table: schema.returns },
            { key: 'orderStatusHistory', table: schema.orderStatusHistory },
            { key: 'tripOrders', table: schema.tripOrders },
            { key: 'salesVisits', table: schema.salesVisits },
            { key: 'discountUsages', table: schema.discountUsages },
            { key: 'tierChangeLogs', table: schema.tierChangeLogs },
            { key: 'stockMovements', table: schema.stockMovements },
            { key: 'stockAdjustments', table: schema.stockAdjustments },
            { key: 'scanLogs', table: schema.scanLogs },
            { key: 'stockCountItems', table: schema.stockCountItems },
            { key: 'packingItems', table: schema.packingItems },
            { key: 'customerFavorites', table: schema.customerFavorites },
            { key: 'productReviews', table: schema.productReviews },
            { key: 'pushSubscriptions', table: schema.pushSubscriptions },
            { key: 'customerAddresses', table: schema.customerAddresses },
            { key: 'cartItems', table: schema.cartItems },
            { key: 'purchaseOrderItems', table: schema.purchaseOrderItems },
            { key: 'discountScopes', table: schema.discountScopes },
            { key: 'volumeTiers', table: schema.volumeTiers },
            { key: 'salaryConfigurations', table: schema.salaryConfigurations },
            { key: 'commissionRules', table: schema.commissionRules },
            { key: 'commissionTiers', table: schema.commissionTiers },
            { key: 'payrollPeriods', table: schema.payrollPeriods },
            { key: 'commissionRecords', table: schema.commissionRecords },
            { key: 'bonuses', table: schema.bonuses },
            { key: 'deductions', table: schema.deductions },
            { key: 'payrollEntries', table: schema.payrollEntries },
            { key: 'salaryAdvances', table: schema.salaryAdvances },
            { key: 'salaryHistory', table: schema.salaryHistory },
            { key: 'notificationSettings', table: schema.notificationSettings },
            { key: 'userSessions', table: schema.userSessions },
            { key: 'userActivityEvents', table: schema.userActivityEvents },
            { key: 'userLocations', table: schema.userLocations },
            { key: 'userTelegramLinkCodes', table: schema.userTelegramLinkCodes },
            { key: 'sessions', table: schema.sessions },
            { key: 'notificationLogs', table: schema.notificationLogs },
            { key: 'auditLogs', table: schema.auditLogs },
            { key: 'tenantExports', table: schema.tenantExports },
        ];

        const businessExcluded = new Set([
            'tenantExportSettings',
            'tenantExports',
            'notificationSettings',
            'userSessions',
            'userActivityEvents',
            'userLocations',
            'userTelegramLinkCodes',
            'sessions',
            'notificationLogs',
            'auditLogs',
        ]);
        const importOrder = scope === 'full'
            ? fullImportOrder
            : fullImportOrder.filter((i) => !businessExcluded.has(i.key));

        const selectiveImportEnabled = !(
            importScope.includeProducts
            && importScope.includeCustomers
            && importScope.includeOrders
            && importScope.includePayments
        );
        const effectiveImportOrder = selectiveImportEnabled
            ? importOrder.filter((i) => PARTIAL_EXPORT_ALWAYS_INCLUDE_KEYS.has(i.key) || keyBelongsToEnabledDomain(i.key, importScope))
            : importOrder;

        for (const item of effectiveImportOrder) {
            const rows = normalizeRows(item.key, (data as any)[item.key]);
            if (rows.length === 0) continue;
            const chunkSize = 500;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                await (executor as any).insert(item.table).values(chunk);
            }
            imported[item.key] = rows.length;
        }
        if (restoreWarnings.size > 0) {
            errors.push(...Array.from(restoreWarnings));
        }

        return {
            success: true,
            imported,
            errors,
        };
    } catch (err: any) {
        return {
            success: false,
            imported,
            errors: [...errors, `Import failed: ${err.message}`],
        };
    }
}

export async function restoreTenantDataReplace(tenantId: string, fileContent: string): Promise<ImportResult> {
    try {
        const parsed = fileContent.includes(TENANT_SQL_MARKER)
            ? decodeTenantBackupFromSql(fileContent)
            : JSON.parse(fileContent);
        if (!parsed?.metadata || parsed?.metadata?.backupType !== 'tenant') {
            return {
                success: false,
                imported: {},
                errors: ['Invalid backup payload: missing tenant metadata'],
            };
        }
        if (typeof parsed.metadata.tenantId !== 'string' || parsed.metadata.tenantId.length === 0) {
            return {
                success: false,
                imported: {},
                errors: ['Invalid backup payload: missing metadata.tenantId'],
            };
        }
        if (parsed.metadata.tenantId !== tenantId) {
            return {
                success: false,
                imported: {},
                errors: [`Backup tenant mismatch: expected ${tenantId}, got ${parsed.metadata.tenantId}`],
            };
        }
        const scope: 'business' | 'full' = parsed?.metadata?.scope === 'full' ? 'full' : 'business';
        const extractedFromFullBackup = parsed?.metadata?.extractedFromFullBackup === true;

        return await db.transaction(async (tx) => {
            if (extractedFromFullBackup) {
                // Extracted full-backup payloads include operational/system tenant tables,
                // so replace restore must clear full tenant scope to avoid PK collisions.
                await purgeTenantBusinessData(tenantId, tx, 'full');
            } else {
                await purgeTenantBusinessData(tenantId, tx, scope);
            }
            const result = await importTenantData(tenantId, fileContent, { dbClient: tx });
            if (!result.success) {
                throw new Error(result.errors.join('; ') || 'Tenant import failed');
            }
            return result;
        });
    } catch (err: any) {
        return {
            success: false,
            imported: {},
            errors: [err?.message || 'Tenant restore failed'],
        };
    }
}

async function purgeTenantCoreData(
    tenantId: string,
    executor: any = db
): Promise<void> {
    const run = async (tx: any) => {
        const tenantOrderIds = tx.select({ id: schema.orders.id })
            .from(schema.orders)
            .where(eq(schema.orders.tenantId, tenantId));
        const tenantCustomerIds = tx.select({ id: schema.customers.id })
            .from(schema.customers)
            .where(eq(schema.customers.tenantId, tenantId));
        const tenantProductIds = tx.select({ id: schema.products.id })
            .from(schema.products)
            .where(eq(schema.products.tenantId, tenantId));

        await tx.delete(schema.returns)
            .where(sql`${schema.returns.tenantId} = ${tenantId}
                OR ${schema.returns.orderId} IN (${tenantOrderIds})
                OR ${schema.returns.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.orderStatusHistory)
            .where(sql`${schema.orderStatusHistory.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.tripOrders)
            .where(sql`${schema.tripOrders.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.salesVisits)
            .where(sql`${schema.salesVisits.tenantId} = ${tenantId}
                OR ${schema.salesVisits.customerId} IN (${tenantCustomerIds})
                OR ${schema.salesVisits.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.discountUsages)
            .where(sql`${schema.discountUsages.tenantId} = ${tenantId}
                OR ${schema.discountUsages.customerId} IN (${tenantCustomerIds})
                OR ${schema.discountUsages.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.tierChangeLogs)
            .where(sql`${schema.tierChangeLogs.tenantId} = ${tenantId}
                OR ${schema.tierChangeLogs.customerId} IN (${tenantCustomerIds})`);

        await tx.delete(schema.payments)
            .where(sql`${schema.payments.tenantId} = ${tenantId}
                OR ${schema.payments.customerId} IN (${tenantCustomerIds})
                OR ${schema.payments.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.paymentTokens)
            .where(sql`${schema.paymentTokens.tenantId} = ${tenantId}
                OR ${schema.paymentTokens.customerId} IN (${tenantCustomerIds})
                OR ${schema.paymentTokens.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.orderItems)
            .where(sql`${schema.orderItems.orderId} IN (${tenantOrderIds})`);

        await tx.delete(schema.scanLogs)
            .where(sql`${schema.scanLogs.productId} IN (${tenantProductIds}) OR ${schema.scanLogs.tenantId} = ${tenantId}`);
        await tx.delete(schema.stockMovements)
            .where(sql`${schema.stockMovements.tenantId} = ${tenantId}
                OR ${schema.stockMovements.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.stockAdjustments)
            .where(sql`${schema.stockAdjustments.tenantId} = ${tenantId}
                OR ${schema.stockAdjustments.productId} IN (${tenantProductIds})`);

        await tx.delete(schema.customerFavorites)
            .where(sql`${schema.customerFavorites.customerId} IN (${tenantCustomerIds}) OR ${schema.customerFavorites.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.productReviews)
            .where(sql`${schema.productReviews.customerId} IN (${tenantCustomerIds}) OR ${schema.productReviews.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.pushSubscriptions)
            .where(sql`${schema.pushSubscriptions.customerId} IN (${tenantCustomerIds}) OR ${schema.pushSubscriptions.tenantId} = ${tenantId}`);
        await tx.delete(schema.customerAddresses)
            .where(sql`${schema.customerAddresses.customerId} IN (${tenantCustomerIds}) OR ${schema.customerAddresses.tenantId} = ${tenantId}`);
        await tx.delete(schema.cartItems)
            .where(sql`${schema.cartItems.cartId} IN (SELECT id FROM shopping_carts WHERE customer_id IN (${tenantCustomerIds}) OR tenant_id = ${tenantId})
                OR ${schema.cartItems.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.shoppingCarts)
            .where(sql`${schema.shoppingCarts.customerId} IN (${tenantCustomerIds}) OR ${schema.shoppingCarts.tenantId} = ${tenantId}`);
        await tx.delete(schema.moneyTransfers)
            .where(sql`${schema.moneyTransfers.tenantId} = ${tenantId}
                OR ${schema.moneyTransfers.fromCustomerId} IN (${tenantCustomerIds})
                OR ${schema.moneyTransfers.toCustomerId} IN (${tenantCustomerIds})`);
        await tx.delete(schema.customerUsers)
            .where(sql`${schema.customerUsers.customerId} IN (${tenantCustomerIds}) OR ${schema.customerUsers.tenantId} = ${tenantId}`);

        await tx.delete(schema.orders).where(eq(schema.orders.tenantId, tenantId));
        await tx.delete(schema.customers).where(eq(schema.customers.tenantId, tenantId));

        await tx.delete(schema.productImages)
            .where(sql`${schema.productImages.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.products).where(eq(schema.products.tenantId, tenantId));
        await tx.delete(schema.subcategories).where(eq(schema.subcategories.tenantId, tenantId));
        await tx.delete(schema.brands).where(eq(schema.brands.tenantId, tenantId));
        await tx.delete(schema.categories).where(eq(schema.categories.tenantId, tenantId));
        await tx.delete(schema.paymentMethods).where(eq(schema.paymentMethods.tenantId, tenantId));
    };

    if (executor === db) {
        await db.transaction(run);
    } else {
        await run(executor);
    }
}

export async function purgeTenantBusinessData(
    tenantId: string,
    executor: any = db,
    scope: 'business' | 'full' = 'business'
): Promise<void> {
    const run = async (tx: any) => {
        const tenantOrderIds = tx.select({ id: schema.orders.id })
            .from(schema.orders)
            .where(eq(schema.orders.tenantId, tenantId));
        const tenantCustomerIds = tx.select({ id: schema.customers.id })
            .from(schema.customers)
            .where(eq(schema.customers.tenantId, tenantId));
        const tenantProductIds = tx.select({ id: schema.products.id })
            .from(schema.products)
            .where(eq(schema.products.tenantId, tenantId));
        const tenantBrandIds = tx.select({ id: schema.brands.id })
            .from(schema.brands)
            .where(eq(schema.brands.tenantId, tenantId));
        const tenantSupplierIds = tx.select({ id: schema.suppliers.id })
            .from(schema.suppliers)
            .where(eq(schema.suppliers.tenantId, tenantId));
        const tenantPurchaseOrderIds = tx.select({ id: schema.purchaseOrders.id })
            .from(schema.purchaseOrders)
            .where(sql`${schema.purchaseOrders.tenantId} = ${tenantId} OR ${schema.purchaseOrders.supplierId} IN (${tenantSupplierIds})`);
        const tenantStockCountIds = tx.select({ id: schema.stockCounts.id })
            .from(schema.stockCounts)
            .where(eq(schema.stockCounts.tenantId, tenantId));
        const tenantPackingSessionIds = tx.select({ id: schema.packingSessions.id })
            .from(schema.packingSessions)
            .where(eq(schema.packingSessions.tenantId, tenantId));
        const tenantUserIds = tx.select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.tenantId, tenantId));
        const tenantTerritoryIds = tx.select({ id: schema.territories.id })
            .from(schema.territories)
            .where(eq(schema.territories.tenantId, tenantId));
        const tenantTierIds = tx.select({ id: schema.customerTiers.id })
            .from(schema.customerTiers)
            .where(eq(schema.customerTiers.tenantId, tenantId));
        const tenantCommissionRuleIds = tx.select({ id: schema.commissionRules.id })
            .from(schema.commissionRules)
            .where(eq(schema.commissionRules.tenantId, tenantId));
        const tenantUserSessionIds = tx.select({ id: schema.userSessions.id })
            .from(schema.userSessions)
            .where(eq(schema.userSessions.tenantId, tenantId));

        if (scope === 'full') {
            await tx.delete(schema.userActivityEvents)
                .where(sql`${schema.userActivityEvents.tenantId} = ${tenantId} OR ${schema.userActivityEvents.userId} IN (${tenantUserIds}) OR ${schema.userActivityEvents.sessionId} IN (${tenantUserSessionIds})`);
            await tx.delete(schema.userSessions)
                .where(sql`${schema.userSessions.tenantId} = ${tenantId} OR ${schema.userSessions.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.sessions)
                .where(sql`${schema.sessions.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.userLocations)
                .where(sql`${schema.userLocations.tenantId} = ${tenantId} OR ${schema.userLocations.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.userTelegramLinkCodes)
                .where(sql`${schema.userTelegramLinkCodes.tenantId} = ${tenantId} OR ${schema.userTelegramLinkCodes.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.notificationSettings)
                .where(sql`${schema.notificationSettings.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.notificationLogs)
                .where(sql`${schema.notificationLogs.tenantId} = ${tenantId} OR ${schema.notificationLogs.userId} IN (${tenantUserIds})`);
            await tx.delete(schema.auditLogs)
                .where(sql`${schema.auditLogs.tenantId} = ${tenantId} OR ${schema.auditLogs.userId} IN (${tenantUserIds})`);
        }

        await tx.delete(schema.payrollEntries).where(eq(schema.payrollEntries.tenantId, tenantId));
        await tx.delete(schema.commissionRecords).where(eq(schema.commissionRecords.tenantId, tenantId));
        await tx.delete(schema.commissionTiers)
            .where(sql`${schema.commissionTiers.commissionRuleId} IN (${tenantCommissionRuleIds})`);
        await tx.delete(schema.salaryHistory).where(eq(schema.salaryHistory.tenantId, tenantId));
        await tx.delete(schema.salaryAdvances).where(eq(schema.salaryAdvances.tenantId, tenantId));
        await tx.delete(schema.deductions).where(eq(schema.deductions.tenantId, tenantId));
        await tx.delete(schema.bonuses).where(eq(schema.bonuses.tenantId, tenantId));
        await tx.delete(schema.salaryConfigurations).where(eq(schema.salaryConfigurations.tenantId, tenantId));
        await tx.delete(schema.payrollPeriods).where(eq(schema.payrollPeriods.tenantId, tenantId));
        await tx.delete(schema.commissionRules).where(eq(schema.commissionRules.tenantId, tenantId));

        await tx.delete(schema.returns)
            .where(sql`${schema.returns.tenantId} = ${tenantId}
                OR ${schema.returns.orderId} IN (${tenantOrderIds})
                OR ${schema.returns.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.orderStatusHistory)
            .where(sql`${schema.orderStatusHistory.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.tripOrders)
            .where(sql`${schema.tripOrders.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.salesVisits)
            .where(sql`${schema.salesVisits.tenantId} = ${tenantId}
                OR ${schema.salesVisits.customerId} IN (${tenantCustomerIds})
                OR ${schema.salesVisits.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.discountUsages)
            .where(sql`${schema.discountUsages.tenantId} = ${tenantId}
                OR ${schema.discountUsages.customerId} IN (${tenantCustomerIds})
                OR ${schema.discountUsages.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.tierChangeLogs)
            .where(sql`${schema.tierChangeLogs.tenantId} = ${tenantId}
                OR ${schema.tierChangeLogs.customerId} IN (${tenantCustomerIds})`);

        await tx.delete(schema.payments)
            .where(sql`${schema.payments.tenantId} = ${tenantId}
                OR ${schema.payments.customerId} IN (${tenantCustomerIds})
                OR ${schema.payments.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.paymentTokens)
            .where(sql`${schema.paymentTokens.tenantId} = ${tenantId}
                OR ${schema.paymentTokens.customerId} IN (${tenantCustomerIds})
                OR ${schema.paymentTokens.orderId} IN (${tenantOrderIds})`);
        await tx.delete(schema.supplierPayments).where(eq(schema.supplierPayments.tenantId, tenantId));
        await tx.delete(schema.orderItems)
            .where(sql`${schema.orderItems.orderId} IN (${tenantOrderIds})`);

        await tx.delete(schema.scanLogs)
            .where(sql`${schema.scanLogs.productId} IN (${tenantProductIds}) OR ${schema.scanLogs.tenantId} = ${tenantId}`);
        await tx.delete(schema.stockMovements)
            .where(sql`${schema.stockMovements.tenantId} = ${tenantId}
                OR ${schema.stockMovements.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.stockAdjustments)
            .where(sql`${schema.stockAdjustments.tenantId} = ${tenantId}
                OR ${schema.stockAdjustments.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.packingItems)
            .where(sql`${schema.packingItems.sessionId} IN (${tenantPackingSessionIds})
                OR ${schema.packingItems.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.packingSessions).where(eq(schema.packingSessions.tenantId, tenantId));
        await tx.delete(schema.stockCountItems)
            .where(sql`${schema.stockCountItems.countId} IN (${tenantStockCountIds})
                OR ${schema.stockCountItems.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.stockCounts).where(eq(schema.stockCounts.tenantId, tenantId));

        await tx.delete(schema.customerFavorites)
            .where(sql`${schema.customerFavorites.customerId} IN (${tenantCustomerIds}) OR ${schema.customerFavorites.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.productReviews)
            .where(sql`${schema.productReviews.customerId} IN (${tenantCustomerIds}) OR ${schema.productReviews.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.pushSubscriptions)
            .where(sql`${schema.pushSubscriptions.customerId} IN (${tenantCustomerIds}) OR ${schema.pushSubscriptions.tenantId} = ${tenantId}`);
        await tx.delete(schema.customerAddresses)
            .where(sql`${schema.customerAddresses.customerId} IN (${tenantCustomerIds}) OR ${schema.customerAddresses.tenantId} = ${tenantId}`);
        await tx.delete(schema.cartItems)
            .where(sql`${schema.cartItems.cartId} IN (SELECT id FROM shopping_carts WHERE customer_id IN (${tenantCustomerIds}) OR tenant_id = ${tenantId})
                OR ${schema.cartItems.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.shoppingCarts)
            .where(sql`${schema.shoppingCarts.customerId} IN (${tenantCustomerIds}) OR ${schema.shoppingCarts.tenantId} = ${tenantId}`);

        await tx.delete(schema.purchaseOrderItems)
            .where(sql`${schema.purchaseOrderItems.purchaseOrderId} IN (${tenantPurchaseOrderIds})
                OR ${schema.purchaseOrderItems.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.purchaseOrders)
            .where(sql`${schema.purchaseOrders.tenantId} = ${tenantId} OR ${schema.purchaseOrders.supplierId} IN (${tenantSupplierIds})`);

        await tx.delete(schema.moneyTransfers)
            .where(sql`${schema.moneyTransfers.tenantId} = ${tenantId}
                OR ${schema.moneyTransfers.fromCustomerId} IN (${tenantCustomerIds})
                OR ${schema.moneyTransfers.toCustomerId} IN (${tenantCustomerIds})`);

        await tx.delete(schema.customerUsers)
            .where(sql`${schema.customerUsers.customerId} IN (${tenantCustomerIds}) OR ${schema.customerUsers.tenantId} = ${tenantId}`);
        await tx.delete(schema.orders).where(eq(schema.orders.tenantId, tenantId));
        await tx.delete(schema.trips).where(eq(schema.trips.tenantId, tenantId));
        await tx.delete(schema.vehicles).where(eq(schema.vehicles.tenantId, tenantId));
        await tx.delete(schema.customers).where(eq(schema.customers.tenantId, tenantId));

        await tx.delete(schema.productImages)
            .where(sql`${schema.productImages.productId} IN (${tenantProductIds})`);
        await tx.delete(schema.products).where(eq(schema.products.tenantId, tenantId));
        await tx.delete(schema.subcategories).where(eq(schema.subcategories.tenantId, tenantId));
        await tx.delete(schema.userBrands)
            .where(sql`${schema.userBrands.brandId} IN (${tenantBrandIds}) OR ${schema.userBrands.userId} IN (${tenantUserIds})`);
        await tx.delete(schema.brands).where(eq(schema.brands.tenantId, tenantId));
        await tx.delete(schema.suppliers).where(eq(schema.suppliers.tenantId, tenantId));
        await tx.delete(schema.categories).where(eq(schema.categories.tenantId, tenantId));

        await tx.delete(schema.tierDowngradeRules)
            .where(sql`${schema.tierDowngradeRules.tenantId} = ${tenantId}
                OR ${schema.tierDowngradeRules.fromTierId} IN (${tenantTierIds})
                OR ${schema.tierDowngradeRules.toTierId} IN (${tenantTierIds})`);
        await tx.delete(schema.tierUpgradeRules)
            .where(sql`${schema.tierUpgradeRules.tenantId} = ${tenantId}
                OR ${schema.tierUpgradeRules.fromTierId} IN (${tenantTierIds})
                OR ${schema.tierUpgradeRules.toTierId} IN (${tenantTierIds})`);
        await tx.delete(schema.customerTiers).where(eq(schema.customerTiers.tenantId, tenantId));

        await tx.delete(schema.userTerritories)
            .where(sql`${schema.userTerritories.territoryId} IN (${tenantTerritoryIds}) OR ${schema.userTerritories.userId} IN (${tenantUserIds})`);
        await tx.delete(schema.territories).where(eq(schema.territories.tenantId, tenantId));

        await tx.delete(schema.paymentMethods).where(eq(schema.paymentMethods.tenantId, tenantId));
        await tx.delete(schema.discountScopes)
            .where(sql`${schema.discountScopes.discountId} IN (SELECT id FROM discounts WHERE tenant_id = ${tenantId})`);
        await tx.delete(schema.volumeTiers)
            .where(sql`${schema.volumeTiers.discountId} IN (SELECT id FROM discounts WHERE tenant_id = ${tenantId})`);
        await tx.delete(schema.discounts).where(eq(schema.discounts.tenantId, tenantId));

        await tx.delete(schema.notificationRoleSettings).where(eq(schema.notificationRoleSettings.tenantId, tenantId));
        if (scope === 'full') {
            await tx.delete(schema.tenantExports).where(eq(schema.tenantExports.tenantId, tenantId));
            await tx.delete(schema.tenantExportSettings).where(eq(schema.tenantExportSettings.tenantId, tenantId));
        }
        await tx.delete(schema.tenantNotificationSettings).where(eq(schema.tenantNotificationSettings.tenantId, tenantId));
        await tx.delete(schema.tenantSettings).where(eq(schema.tenantSettings.tenantId, tenantId));

        await tx.delete(schema.users).where(eq(schema.users.tenantId, tenantId));
    };

    if (executor === db) {
        await db.transaction(run);
    } else {
        await run(executor);
    }
}
