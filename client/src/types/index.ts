export interface SalesByRep {
    salesRepId: string;
    salesRepName: string;
    totalOrders: number;
    totalSales: string | null;
}

export interface Tenant {
    id: string;
    name: string;
    subdomain: string;
    plan: string;
    isActive: boolean;
    telegramEnabled?: boolean;
    hasTelegramBotToken?: boolean;
    subscriptionEndAt?: string | null;
    planStatus?: 'active' | 'trial' | 'past_due' | 'cancelled';
    createdAt: string;
    maxUsers?: number;
    maxProducts?: number;
    currency?: string;
    timezone?: string;
    defaultTaxRate?: string;
    stats?: {
        userCount: number;
        productCount: number;
    };
}

// Super Admin Dashboard Types
export interface SuperAdminStats {
    totalSystemRevenue: string;
    totalSystemOrders: number;
    totalTenants: number;
    activeTenants: number;
    window?: '24h' | '7d' | '30d';
}

export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    database: {
        connected: boolean;
        latencyMs: number;
    };
    memory?: {
        used: number;
        total: number;
    };
    uptime?: number;
}

export interface AuditLogUser {
    id: string;
    name: string;
    email?: string;
}

export interface AuditLog {
    id: string;
    action: string;
    details: string | Record<string, unknown>;
    user?: AuditLogUser;
    tenantId?: string;
    createdAt: string;
}

export interface AnnouncementSettings {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'critical';
    targetRoles: string[];
}

export interface SuperAttentionAlert {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    href: string;
}

export interface SuperAttentionData {
    window: '24h' | '7d' | '30d';
    generatedAt: string;
    counts: {
        expiringTenants: number;
        pendingUpgradeRequests: number;
        backupFailures: number;
        staleBackup: boolean;
        latestBackupAt?: string | null;
    };
    alerts: SuperAttentionAlert[];
}

export type AlertType = 'info' | 'warning' | 'critical';

export interface RoleOption {
    id: string;
    label: string;
}
