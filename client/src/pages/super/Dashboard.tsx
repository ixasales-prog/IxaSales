import { type Component, createResource, For, Show, createSignal, createEffect } from 'solid-js';
import { A } from '@solidjs/router';
import {
    Building,
    Activity,
    DollarSign,
    Loader2,
    Plus,
    Megaphone,
    Database,
    AlertTriangle,
    CircleAlert,
    Info,
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import { ConfirmModal, createConfirmModal } from '../../components/common/ConfirmModal';
import { BroadcastModal } from '../../components/super/BroadcastModal';
import { ActivityTimeline } from '../../components/super/ActivityTimeline';
import { RecentTenants } from '../../components/super/RecentTenants';
import { HealthIndicator } from '../../components/super/HealthIndicator';
import { StatCard } from '../../components/super/StatCard';
import { formatCurrencyShort } from '../../stores/settings';
import type {
    Tenant,
    SuperAdminStats,
    SystemHealth,
    AuditLog,
    AnnouncementSettings,
    SuperAttentionData,
} from '../../types';

// formatCurrencyShort is now imported from settings store

const SuperAdminDashboard: Component = () => {
    const [broadcastModalOpen, setBroadcastModalOpen] = createSignal(false);
    const [backupLoading, setBackupLoading] = createSignal(false);
    const [windowKey, setWindowKey] = createSignal<'24h' | '7d' | '30d'>('30d');

    // Announcement form state (synced via createEffect)
    const [announcementState, setAnnouncementState] = createSignal<AnnouncementSettings>({
        enabled: false,
        message: '',
        type: 'info',
        targetRoles: [],
    });

    // Confirm modal for backup
    const backupConfirm = createConfirmModal();

    // 1. Stats - properly typed
    const [statsData, { refetch: refetchStats }] = createResource(windowKey, async (window) => {
        return api<SuperAdminStats>('/super/stats', { params: { window } });
    });

    const [attentionData, { refetch: refetchAttention }] = createResource(windowKey, async (window) => {
        return api<SuperAttentionData>('/super/attention', { params: { window } });
    });

    // 2. Tenants - properly typed
    const [tenants, { refetch: refetchTenants }] = createResource(async () => {
        return api<Tenant[]>('/super/tenants?limit=5');
    });

    // 3. Health - properly typed
    const [health, { refetch: refetchHealth }] = createResource(async () => {
        return api<SystemHealth>('/super/health');
    });

    // 4. Activity (Audit Logs) - properly typed
    const [activity, { refetch: refetchActivity }] = createResource(async () => {
        return api<AuditLog[]>('/super/audit-logs?limit=5');
    });

    // 5. Announcement Settings - properly typed
    const [announcementSettings, { refetch: refetchAnnouncement }] = createResource(async () => {
        return api<AnnouncementSettings>('/super/settings/announcement');
    });

    // Sync announcement state when resource loads (no side effects in fetcher)
    createEffect(() => {
        const settings = announcementSettings();
        if (settings) {
            setAnnouncementState({
                enabled: settings.enabled,
                message: settings.message,
                type: settings.type,
                targetRoles: settings.targetRoles || [],
            });
        }
    });

    // Handle backup with confirm modal instead of native confirm()
    const handleCreateBackup = () => {
        backupConfirm.show({
            title: 'Create System Backup',
            message: 'This will create a new system backup. This might affect system performance slightly during the backup process.',
            variant: 'warning',
            confirmText: 'Create Backup',
            onConfirm: async () => {
                setBackupLoading(true);
                try {
                    const res = await api<{ filename?: string; message?: string }>(
                        '/super/backup/now',
                        { method: 'POST', body: JSON.stringify({}) }
                    );
                    toast.success(`Backup created successfully${res.filename ? `: ${res.filename}` : ''}`);
                } catch (_e) {
                    toast.error('Backup request failed. Please try again.');
                } finally {
                    setBackupLoading(false);
                }
            },
        });
    };

    // Handle saving broadcast settings
    const handleSaveBroadcast = async (settings: AnnouncementSettings) => {
        try {
            await api('/super/settings/announcement', {
                method: 'PUT',
                body: JSON.stringify(settings),
            });
            await refetchAnnouncement();
            toast.success('Announcement settings updated successfully');
        } catch (e) {
            toast.error('Failed to update announcement settings');
            throw e; // Re-throw to keep modal open
        }
    };

    // Stats configuration with proper typing
    const stats = () => [
        {
            label: 'Total System Revenue',
            value: formatCurrencyShort(parseFloat(statsData()?.totalSystemRevenue || '0')),
            icon: DollarSign,
            color: 'from-emerald-500 to-teal-600',
            href: '/super/audit-logs',
        },
        {
            label: 'Total System Orders',
            value: (statsData()?.totalSystemOrders || 0).toString(),
            icon: Activity,
            color: 'from-blue-500 to-indigo-600',
            href: '/super/audit-logs',
        },
        {
            label: 'Registered Tenants',
            value: (statsData()?.totalTenants || 0).toString(),
            icon: Building,
            color: 'from-purple-500 to-pink-600',
            href: '/super/tenants',
        },
        {
            label: 'Active Tenants',
            value: (statsData()?.activeTenants || 0).toString(),
            icon: Building,
            color: 'from-orange-500 to-red-600',
            href: '/super/tenants',
        },
    ];

    // Combined loading state
    const loading = () => statsData.loading || attentionData.loading || tenants.loading || health.loading || activity.loading;

    // Error state handling
    const hasError = () => statsData.error || attentionData.error || tenants.error || health.error || activity.error;

    const errorMessage = () => {
        if (statsData.error) return `Stats: ${statsData.error.message}`;
        if (attentionData.error) return `Attention: ${attentionData.error.message}`;
        if (tenants.error) return `Tenants: ${tenants.error.message}`;
        if (health.error) return `Health: ${health.error.message}`;
        if (activity.error) return `Activity: ${activity.error.message}`;
        return 'An error occurred';
    };

    // Retry all failed requests
    const retryAll = () => {
        if (statsData.error) refetchStats();
        if (attentionData.error) refetchAttention();
        if (tenants.error) refetchTenants();
        if (health.error) refetchHealth();
        if (activity.error) refetchActivity();
    };

    const windowLabel = () => {
        if (windowKey() === '24h') return 'Last 24 hours';
        if (windowKey() === '7d') return 'Last 7 days';
        return 'Last 30 days';
    };

    const alertIcon = (severity: 'critical' | 'warning' | 'info') => {
        if (severity === 'critical') return AlertTriangle;
        if (severity === 'warning') return CircleAlert;
        return Info;
    };

    const alertBorderClass = (severity: 'critical' | 'warning' | 'info') => {
        if (severity === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-300';
        if (severity === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
        return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
    };

    return (
        <div class="p-6 lg:p-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Platform Overview</h1>
                    <p class="text-slate-400">System-wide performance metrics and health. {windowLabel()}.</p>
                </div>

                <div class="flex items-center gap-2">
                    <For each={['24h', '7d', '30d'] as const}>
                        {(windowOption) => (
                            <button
                                onClick={() => setWindowKey(windowOption)}
                                class={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                                    windowKey() === windowOption
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                                }`}
                            >
                                {windowOption}
                            </button>
                        )}
                    </For>
                </div>

                {/* System Health Widget */}
                <HealthIndicator health={health()} loading={health.loading} />
            </div>

            {/* Loading State */}
            <Show when={loading()}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-purple-400 animate-spin" />
                </div>
            </Show>

            {/* Error State */}
            <Show when={!loading() && hasError()}>
                <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
                    <p class="text-red-400 mb-4">{errorMessage()}</p>
                    <button
                        onClick={retryAll}
                        class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </Show>

            {/* Main Content */}
            <Show when={!loading() && !hasError()}>
                {/* Attention Panel */}
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-8">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                            <AlertTriangle class="w-5 h-5 text-amber-400" />
                            Attention
                        </h3>
                        <span class="text-xs text-slate-500">Updated {new Date(attentionData()?.generatedAt || Date.now()).toLocaleString()}</span>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <For each={attentionData()?.alerts || []}>
                            {(alert) => {
                                const Icon = alertIcon(alert.severity);
                                return (
                                    <A
                                        href={alert.href}
                                        class={`block border rounded-xl p-4 transition-colors hover:border-slate-400/60 ${alertBorderClass(alert.severity)}`}
                                    >
                                        <div class="flex items-start gap-3">
                                            <Icon class="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <div class="font-semibold">{alert.title}</div>
                                                <div class="text-sm opacity-90 mt-1">{alert.description}</div>
                                            </div>
                                        </div>
                                    </A>
                                );
                            }}
                        </For>
                    </div>
                </div>

                {/* Stats Grid */}
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                    <For each={stats()}>
                        {(stat) => (
                            <A href={stat.href} class="block">
                                <StatCard
                                    label={stat.label}
                                    value={stat.value}
                                    icon={stat.icon}
                                    color={stat.color}
                                    subtitle={`${windowLabel()} - click for details`}
                                />
                            </A>
                        )}
                    </For>
                </div>

                {/* Quick Actions & Main Content */}
                <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
                    {/* Left Column: Quick Actions + Recent Tenants */}
                    <div class="xl:col-span-2 space-y-6">
                        {/* Quick Actions */}
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Activity class="w-5 h-5 text-blue-400" />
                                Quick Actions
                            </h3>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <A
                                    href="/super/tenants"
                                    class="group flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-blue-500/50 transition-all"
                                >
                                    <div class="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors mb-3">
                                        <Plus class="w-5 h-5" />
                                    </div>
                                    <span class="text-sm font-medium text-slate-300 group-hover:text-white">New Tenant</span>
                                </A>

                                <button
                                    onClick={() => setBroadcastModalOpen(true)}
                                    class="group flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-amber-500/50 transition-all cursor-pointer"
                                >
                                    <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors mb-3">
                                        <Megaphone class="w-5 h-5" />
                                    </div>
                                    <span class="text-sm font-medium text-slate-300 group-hover:text-white">Broadcast</span>
                                </button>

                                <button
                                    onClick={handleCreateBackup}
                                    disabled={backupLoading()}
                                    class="group flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-pink-500/50 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    <div class="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400 group-hover:bg-pink-500 group-hover:text-white transition-colors mb-3">
                                        <Show when={!backupLoading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                            <Database class="w-5 h-5" />
                                        </Show>
                                    </div>
                                    <span class="text-sm font-medium text-slate-300 group-hover:text-white">
                                        {backupLoading() ? 'Backing up...' : 'Backup Now'}
                                    </span>
                                </button>

                                <A
                                    href="/super/health"
                                    class="group flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-emerald-500/50 transition-all"
                                >
                                    <div class="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors mb-3">
                                        <Activity class="w-5 h-5" />
                                    </div>
                                    <span class="text-sm font-medium text-slate-300 group-hover:text-white">System Check</span>
                                </A>
                            </div>
                        </div>

                        {/* Recent Tenants */}
                        <RecentTenants tenants={tenants() || []} />
                    </div>

                    {/* Right Column: Recent Activity */}
                    <ActivityTimeline logs={activity() || []} />
                </div>
            </Show>

            {/* Broadcast Modal */}
            <BroadcastModal
                open={broadcastModalOpen()}
                onClose={() => setBroadcastModalOpen(false)}
                onSave={handleSaveBroadcast}
                initialSettings={announcementState()}
            />

            {/* Backup Confirm Modal */}
            <ConfirmModal
                open={backupConfirm.open()}
                title={backupConfirm.config().title}
                message={backupConfirm.config().message}
                variant={backupConfirm.config().variant}
                confirmText={backupConfirm.config().confirmText}
                loading={backupConfirm.loading()}
                onConfirm={backupConfirm.handleConfirm}
                onCancel={backupConfirm.handleCancel}
            />
        </div>
    );
};

export default SuperAdminDashboard;
