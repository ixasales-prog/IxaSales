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
    telegramBotToken?: string;
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

export type AlertType = 'info' | 'warning' | 'critical';

export interface RoleOption {
    id: string;
    label: string;
}
