/**
 * Tenant Export Service
 * 
 * Handles data export and import for tenant admins.
 * Exports tenant-specific data to JSON/CSV/XLSX format.
 */

import { db, schema } from '../db';
import { eq, and, desc, lt, gte, lte, sql } from 'drizzle-orm';
import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { CronJob } from 'cron';
import { createWriteStream } from 'fs';
import * as XLSX from 'xlsx';

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
    imported: {
        products?: number;
        customers?: number;
        orders?: number;
    };
    errors: string[];
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
        const data: Record<string, any> = {};
        const dateFilter = options.dateFrom || options.dateTo
            ? { from: options.dateFrom, to: options.dateTo }
            : undefined;

        // Fetch data based on options
        if (options.includeProducts) {
            data.products = await fetchProducts(tenantId);
        }

        if (options.includeCustomers) {
            data.customers = await fetchCustomers(tenantId);
        }

        if (options.includeOrders) {
            data.orders = await fetchOrders(tenantId, dateFilter);
        }

        if (options.includePayments) {
            data.payments = await fetchPayments(tenantId, dateFilter);
        }

        if (options.includeInventory) {
            data.inventory = await fetchInventory(tenantId);
        }

        // Add metadata
        data.metadata = {
            exportedAt: new Date().toISOString(),
            tenantId,
            options: {
                ...options,
                dateFrom: options.dateFrom?.toISOString(),
                dateTo: options.dateTo?.toISOString(),
            },
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
async function fetchProducts(tenantId: string) {
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

/**
 * Fetch customers for export
 */
async function fetchCustomers(tenantId: string) {
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
async function fetchOrders(tenantId: string, dateFilter?: { from?: Date; to?: Date }) {
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

/**
 * Fetch payments for export
 */
async function fetchPayments(tenantId: string, dateFilter?: { from?: Date; to?: Date }) {
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

/**
 * Fetch inventory/stock movements for export
 */
async function fetchInventory(tenantId: string) {
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

/**
 * Update export settings for a tenant
 */
export async function updateExportSettings(
    tenantId: string,
    updates: {
        frequency?: 'never' | 'daily' | 'weekly' | 'monthly';
        format?: 'json' | 'csv' | 'xlsx';
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

    const [updated] = await db.update(schema.tenantExportSettings)
        .set({
            ...updates,
            nextExportAt,
            updatedAt: new Date(),
        })
        .where(eq(schema.tenantExportSettings.tenantId, tenantId))
        .returning();

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
    // Parse schedule time (HH:MM format)
    const [targetHours, targetMinutes] = scheduleTime.split(':').map(Number);

    // Common timezone offsets in hours (UTC+X)
    const tzOffsets: Record<string, number> = {
        'Asia/Tashkent': 5,
        'Asia/Almaty': 6,
        'Asia/Samarkand': 5,
        'Europe/Moscow': 3,
        'UTC': 0,
    };

    const offsetHours = tzOffsets[timezone] ?? 5; // Default to +5 for Uzbekistan

    // Get current time in UTC
    const nowUtc = new Date();

    // Calculate current time in target timezone
    const nowTzHours = (nowUtc.getUTCHours() + offsetHours) % 24;
    const nowTzMinutes = nowUtc.getUTCMinutes();

    // Start with today's date
    const nextUtc = new Date(nowUtc);
    nextUtc.setUTCHours(targetHours - offsetHours, targetMinutes, 0, 0);

    // Check if we've already passed this time today (in the target timezone)
    const isPast = nowTzHours > targetHours ||
        (nowTzHours === targetHours && nowTzMinutes >= targetMinutes);

    switch (frequency) {
        case 'daily':
            // If we're past the scheduled time today, schedule for tomorrow
            if (isPast) {
                nextUtc.setUTCDate(nextUtc.getUTCDate() + 1);
            }
            break;
        case 'weekly':
            // Calculate days until next Sunday
            const currentDay = ((nowUtc.getUTCDay() + (isPast ? 1 : 0)) % 7);
            const daysUntilSunday = (7 - currentDay) % 7 || 7;
            nextUtc.setUTCDate(nextUtc.getUTCDate() + daysUntilSunday);
            break;
        case 'monthly':
            nextUtc.setUTCMonth(nextUtc.getUTCMonth() + 1);
            nextUtc.setUTCDate(1);
            break;
    }

    console.log(`[TenantExport] Calculated next export: ${nextUtc.toISOString()} (target: ${scheduleTime} ${timezone})`);
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
    try {
        const now = new Date();
        console.log(`[TenantExport] Checking for scheduled exports at ${now.toISOString()}`);

        // Find tenants with due exports
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

        console.log(`[TenantExport] Found ${dueSettings.length} due exports`);

        for (const { settings, tenantTimezone, tenantName } of dueSettings) {
            console.log(`[TenantExport] Running scheduled export for tenant ${settings.tenantId}`);

            const exportResult = await createTenantExport(settings.tenantId, settings.tenantId, {
                format: (settings.format as 'json' | 'csv' | 'xlsx') || 'json',
                includeProducts: settings.includeProducts ?? true,
                includeCustomers: settings.includeCustomers ?? true,
                includeOrders: settings.includeOrders ?? true,
                includePayments: settings.includePayments ?? true,
                includeInventory: settings.includeInventory ?? true,
            });

            // Send to Telegram if enabled and export was successful
            if (settings.sendToTelegram && exportResult.success && exportResult.filename) {
                console.log(`[TenantExport] Sending export to Telegram for tenant ${settings.tenantId}`);

                // Import Telegram functions
                const { sendTelegramDocument, getTenantAdminsWithTelegram, escapeHtml } = await import('./telegram');

                // Get tenant admins with Telegram
                const admins = await getTenantAdminsWithTelegram(settings.tenantId);

                if (admins.length > 0) {
                    const filePath = getExportPath(exportResult.filename);
                    const formatDate = now.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    });

                    const caption = `📦 <b>Scheduled Data Export</b>\n\n` +
                        `🏢 Tenant: ${escapeHtml(tenantName || 'Unknown')}\n` +
                        `📅 Date: ${formatDate}\n` +
                        `📄 Format: ${(settings.format || 'json').toUpperCase()}\n\n` +
                        `<i>This is an automated backup sent by IxaSales.</i>`;

                    for (const admin of admins) {
                        const sent = await sendTelegramDocument(
                            admin.telegramChatId,
                            filePath,
                            exportResult.filename,
                            caption
                        );
                        if (sent) {
                            console.log(`[TenantExport] Export sent to admin ${admin.id} via Telegram`);
                        } else {
                            console.warn(`[TenantExport] Failed to send export to admin ${admin.id}`);
                        }
                    }
                } else {
                    console.log(`[TenantExport] No admins with Telegram found for tenant ${settings.tenantId}`);
                }
            }

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
        }

        // Clean up expired exports
        await cleanupExpiredExports();
    } catch (err) {
        console.error('[TenantExport] Scheduler error:', err);
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
        skipExisting?: boolean;
    } = {}
): Promise<ImportResult> {
    const errors: string[] = [];
    const imported: ImportResult['imported'] = {};

    try {
        const data = JSON.parse(fileContent);

        // Validate it's a valid export
        if (!data.metadata || data.metadata.tenantId !== tenantId) {
            // Allow import from same tenant or if tenant ID doesn't match for data migration
            console.log('[TenantImport] Importing data (tenant ID may differ for migration)');
        }

        // Import products
        // NOTE: Products require subcategoryId and brandId which may not match.
        // For now, we skip product import as it's complex to map foreign keys.
        // This could be enhanced in the future with a mapping step.
        if (options.importProducts && data.products && Array.isArray(data.products)) {
            // Product import is not supported yet due to required subcategoryId/brandId
            errors.push('Product import is not yet supported. Please use the product management page to add products.');
            imported.products = 0;
        }

        // Import customers
        if (options.importCustomers && data.customers && Array.isArray(data.customers)) {
            let customerCount = 0;
            for (const customer of data.customers) {
                try {
                    if (options.skipExisting && customer.phone) {
                        const [existing] = await db.select()
                            .from(schema.customers)
                            .where(and(
                                eq(schema.customers.tenantId, tenantId),
                                eq(schema.customers.phone, customer.phone)
                            ))
                            .limit(1);

                        if (existing) continue;
                    }

                    await db.insert(schema.customers).values({
                        tenantId,
                        name: customer.name,
                        phone: customer.phone,
                        email: customer.email,
                        address: customer.address,
                        waymark: customer.waymark,
                        isActive: customer.isActive ?? true,
                    }).onConflictDoNothing();

                    customerCount++;
                } catch (err: any) {
                    errors.push(`Customer ${customer.name || customer.phone}: ${err.message}`);
                }
            }
            imported.customers = customerCount;
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
            errors: [...errors, `Parse error: ${err.message}`],
        };
    }
}
