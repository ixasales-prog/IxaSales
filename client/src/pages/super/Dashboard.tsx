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
    AnnouncementSettings
} from '../../types';

// formatCurrencyShort is now imported from settings store

const SuperAdminDashboard: Component = () => {
    const [broadcastModalOpen, setBroadcastModalOpen] = createSignal(false);
    const [backupLoading, setBackupLoading] = createSignal(false);

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
    const [statsData, { refetch: refetchStats }] = createResource(async () => {
        return api<SuperAdminStats>('/super/stats');
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
                    const res = await api<{ success: boolean; filename?: string; message?: string }>(
                        '/super/backup/now',
                        { method: 'POST' }
                    );
                    if (res.success) {
                        toast.success(`Backup created successfully: ${res.filename}`);
                    } else {
                        toast.error(`Backup failed: ${res.message || 'Unknown error'}`);
                    }
                } catch (e) {
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
        },
        {
            label: 'Total System Orders',
            value: (statsData()?.totalSystemOrders || 0).toString(),
            icon: Activity,
            color: 'from-blue-500 to-indigo-600',
        },
        {
            label: 'Registered Tenants',
            value: (statsData()?.totalTenants || 0).toString(),
            icon: Building,
            color: 'from-purple-500 to-pink-600',
        },
        {
            label: 'Active Tenants',
            value: (statsData()?.activeTenants || 0).toString(),
            icon: Building,
            color: 'from-orange-500 to-red-600',
        },
    ];

    // Combined loading state
    const loading = () => statsData.loading || tenants.loading || health.loading || activity.loading;

    // Error state handling
    const hasError = () => statsData.error || tenants.error || health.error || activity.error;

    const errorMessage = () => {
        if (statsData.error) return `Stats: ${statsData.error.message}`;
        if (tenants.error) return `Tenants: ${tenants.error.message}`;
        if (health.error) return `Health: ${health.error.message}`;
        if (activity.error) return `Activity: ${activity.error.message}`;
        return 'An error occurred';
    };

    // Retry all failed requests
    const retryAll = () => {
        if (statsData.error) refetchStats();
        if (tenants.error) refetchTenants();
        if (health.error) refetchHealth();
        if (activity.error) refetchActivity();
    };

    return (
        <div class="p-6 lg:p-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Platform Overview</h1>
                    <p class="text-slate-400">System-wide performance metrics and health.</p>
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
                {/* Stats Grid */}
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                    <For each={stats()}>
                        {(stat) => (
                            <StatCard
                                label={stat.label}
                                value={stat.value}
                                icon={stat.icon}
                                color={stat.color}
                            />
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
