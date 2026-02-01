/**
 * System Settings Management
 * 
 * Centralized configuration for platform-wide settings.
 * Settings are persisted to database with in-memory caching.
 */

import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface DefaultTenantSettings {
    defaultCurrency: string;
    defaultTimezone: string;
    defaultTaxRate: number;
}

export interface SecuritySettings {
    sessionTimeoutMinutes: number;
    passwordMinLength: number;
    maxLoginAttempts: number;
}

export interface AnnouncementSettings {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'critical';
    targetRoles: string[];
}

export interface EmailSettings {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    fromEmail: string;
    fromName: string;
    tlsEnabled: boolean;
}

export interface TelegramSettings {
    enabled: boolean;
    botToken: string;
    defaultChatId: string;
    webhookSecret: string; // For webhook validation
}

export interface BrandingSettings {
    platformName: string;
    primaryColor: string;
    logoUrl: string;
}

export interface BackupSettings {
    frequency: 'never' | 'daily' | 'weekly' | 'monthly';
    retentionDays: number;
    lastBackupAt: string | null;
}

export interface AllSystemSettings {
    defaults: DefaultTenantSettings;
    security: SecuritySettings;
    announcement: AnnouncementSettings;
    email: EmailSettings;
    telegram: TelegramSettings;
    branding: BrandingSettings;
    backup: BackupSettings;
}

// ============================================================================
// DEFAULT VALUES (fallbacks when not in DB)
// ============================================================================

const DEFAULT_SETTINGS: AllSystemSettings = {
    defaults: {
        defaultCurrency: 'UZS',
        defaultTimezone: 'Asia/Tashkent',
        defaultTaxRate: 0,
    },
    security: {
        sessionTimeoutMinutes: 60,
        passwordMinLength: 8,
        maxLoginAttempts: 5,
    },
    announcement: {
        enabled: false,
        message: '',
        type: 'info',
        targetRoles: [],
    },
    email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'IxaSales',
        tlsEnabled: true,
    },
    telegram: {
        enabled: process.env.TELEGRAM_ENABLED === 'true',
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
        webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    },
    branding: {
        platformName: 'IxaSales',
        primaryColor: '#3B82F6',
        logoUrl: '',
    },
    backup: {
        frequency: 'daily',
        retentionDays: 30,
        lastBackupAt: null,
    },
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

let cachedSettings: AllSystemSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let cacheLoaded = false;

// ============================================================================
// DATABASE PERSISTENCE
// ============================================================================

/**
 * Load all settings from database into cache
 */
export async function loadSettingsFromDB(): Promise<void> {
    try {
        const rows = await db.select().from(schema.systemSettings);

        for (const row of rows) {
            const [category, key] = row.key.split('.');
            if (category && key && (cachedSettings as any)[category]) {
                try {
                    // Try parsing as JSON for complex values
                    (cachedSettings as any)[category][key] = JSON.parse(row.value || '');
                } catch {
                    // Fall back to raw string
                    (cachedSettings as any)[category][key] = row.value;
                }
            }
        }

        cacheLoaded = true;
        console.log('[Settings] Loaded settings from database');
    } catch (error) {
        console.error('[Settings] Error loading from database, using defaults:', error);
    }
}

/**
 * Save a setting to database
 */
async function saveSetting(key: string, value: any): Promise<void> {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    try {
        // Upsert
        await db
            .insert(schema.systemSettings)
            .values({ key, value: stringValue })
            .onConflictDoUpdate({
                target: schema.systemSettings.key,
                set: { value: stringValue, updatedAt: new Date() },
            });
    } catch (error) {
        console.error(`[Settings] Error saving ${key}:`, error);
    }
}

/**
 * Save entire category to database
 */
async function saveCategory(category: string, settings: object): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
        await saveSetting(`${category}.${key}`, value);
    }
}

// ============================================================================
// GETTERS
// ============================================================================

export function getAllSettings(): AllSystemSettings {
    return cachedSettings;
}

export function getDefaultTenantSettings(): DefaultTenantSettings {
    return cachedSettings.defaults;
}

export function getSecuritySettings(): SecuritySettings {
    return cachedSettings.security;
}

export function getAnnouncementSettings(): AnnouncementSettings {
    return cachedSettings.announcement;
}

export function getEmailSettings(): EmailSettings {
    return cachedSettings.email;
}

export function getTelegramSettings(): TelegramSettings {
    return cachedSettings.telegram;
}

export function getBrandingSettings(): BrandingSettings {
    return cachedSettings.branding;
}

export function getBackupSettings(): BackupSettings {
    return cachedSettings.backup;
}

// ============================================================================
// SETTERS (with DB persistence)
// ============================================================================

export async function updateDefaultTenantSettings(settings: Partial<DefaultTenantSettings>): Promise<DefaultTenantSettings> {
    cachedSettings.defaults = { ...cachedSettings.defaults, ...settings };
    await saveCategory('defaults', cachedSettings.defaults);
    return cachedSettings.defaults;
}

export async function updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<SecuritySettings> {
    cachedSettings.security = { ...cachedSettings.security, ...settings };
    await saveCategory('security', cachedSettings.security);
    return cachedSettings.security;
}

export async function updateAnnouncementSettings(settings: Partial<AnnouncementSettings>): Promise<AnnouncementSettings> {
    cachedSettings.announcement = { ...cachedSettings.announcement, ...settings };
    await saveCategory('announcement', cachedSettings.announcement);
    return cachedSettings.announcement;
}

export async function updateEmailSettings(settings: Partial<EmailSettings>): Promise<EmailSettings> {
    cachedSettings.email = { ...cachedSettings.email, ...settings };
    await saveCategory('email', cachedSettings.email);
    return cachedSettings.email;
}

export async function updateTelegramSettings(settings: Partial<TelegramSettings>): Promise<TelegramSettings> {
    cachedSettings.telegram = { ...cachedSettings.telegram, ...settings };
    await saveCategory('telegram', cachedSettings.telegram);
    return cachedSettings.telegram;
}

export async function updateBrandingSettings(settings: Partial<BrandingSettings>): Promise<BrandingSettings> {
    cachedSettings.branding = { ...cachedSettings.branding, ...settings };
    await saveCategory('branding', cachedSettings.branding);
    return cachedSettings.branding;
}

export async function updateBackupSettings(settings: Partial<BackupSettings>): Promise<BackupSettings> {
    cachedSettings.backup = { ...cachedSettings.backup, ...settings };
    await saveCategory('backup', cachedSettings.backup);
    return cachedSettings.backup;
}

// ============================================================================
// SYNC GETTERS (for backwards compatibility in sync contexts)
// These return current cache without waiting for DB
// ============================================================================

export function updateDefaultTenantSettingsSync(settings: Partial<DefaultTenantSettings>): DefaultTenantSettings {
    cachedSettings.defaults = { ...cachedSettings.defaults, ...settings };
    // Fire and forget DB save
    saveCategory('defaults', cachedSettings.defaults).catch(console.error);
    return cachedSettings.defaults;
}

export function updateSecuritySettingsSync(settings: Partial<SecuritySettings>): SecuritySettings {
    cachedSettings.security = { ...cachedSettings.security, ...settings };
    saveCategory('security', cachedSettings.security).catch(console.error);
    return cachedSettings.security;
}

export function updateAnnouncementSettingsSync(settings: Partial<AnnouncementSettings>): AnnouncementSettings {
    cachedSettings.announcement = { ...cachedSettings.announcement, ...settings };
    saveCategory('announcement', cachedSettings.announcement).catch(console.error);
    return cachedSettings.announcement;
}

export function updateEmailSettingsSync(settings: Partial<EmailSettings>): EmailSettings {
    cachedSettings.email = { ...cachedSettings.email, ...settings };
    saveCategory('email', cachedSettings.email).catch(console.error);
    return cachedSettings.email;
}

export function updateTelegramSettingsSync(settings: Partial<TelegramSettings>): TelegramSettings {
    cachedSettings.telegram = { ...cachedSettings.telegram, ...settings };
    saveCategory('telegram', cachedSettings.telegram).catch(console.error);
    return cachedSettings.telegram;
}

export function updateBrandingSettingsSync(settings: Partial<BrandingSettings>): BrandingSettings {
    cachedSettings.branding = { ...cachedSettings.branding, ...settings };
    saveCategory('branding', cachedSettings.branding).catch(console.error);
    return cachedSettings.branding;
}

export function updateBackupSettingsSync(settings: Partial<BackupSettings>): BackupSettings {
    cachedSettings.backup = { ...cachedSettings.backup, ...settings };
    saveCategory('backup', cachedSettings.backup).catch(console.error);
    return cachedSettings.backup;
}
