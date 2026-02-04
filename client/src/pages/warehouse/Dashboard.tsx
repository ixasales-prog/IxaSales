import { type Component, createResource, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ClipboardList, Boxes, AlertTriangle, Truck, Loader2, LogOut } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { logout, currentUser } from '../../stores/auth';

interface DashboardMetrics {
    openTasks: number;
    lowStock: number;
    inboundToday: number;
}

const WarehouseDashboard: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const user = currentUser();

    const handleLogout = () => {
        if (confirm(t('modals.logout') as string)) {
            logout();
            navigate('/login', { replace: true });
        }
    };

    // Fetch dashboard metrics
    const [metrics] = createResource(async (): Promise<DashboardMetrics> => {
        try {
            // Fetch tasks count (orders in warehouse statuses)
            const tasksResult = await api<{ data: any[]; meta: { total: number } }>('/warehouse/tasks?limit=1');
            const tasksData = (tasksResult as any);
            const openTasks = tasksData?.meta?.total || tasksData?.data?.length || 0;

            // Fetch low stock items count
            const inventoryResult = await api<{ data: any[] }>('/warehouse/inventory?limit=100');
            const inventoryData = ((inventoryResult as any)?.data || inventoryResult || []) as any[];
            const lowStock = inventoryData.filter((item: any) =>
                (item.stockQuantity || 0) <= (item.reorderPoint || 0)
            ).length;

            // Fetch receiving count (inbound shipments)
            const receivingResult = await api<{ data: any[]; meta: { total: number } }>('/warehouse/receiving?limit=1');
            const receivingData = (receivingResult as any);
            const inboundToday = receivingData?.meta?.total || receivingData?.data?.length || 0;

            return {
                openTasks,
                lowStock,
                inboundToday
            };
        } catch (error) {
            console.error('Failed to fetch dashboard metrics:', error);
            return {
                openTasks: 0,
                lowStock: 0,
                inboundToday: 0
            };
        }
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-xl font-bold text-white">{t('warehouseApp.dashboard.title')}</h1>
                        <p class="text-slate-500 text-sm">{t('warehouseApp.dashboard.subtitle')}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        class="p-2 rounded-xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 transition"
                        title={t('dashboard.logout') as string}
                    >
                        <LogOut class="w-5 h-5 text-red-400" />
                    </button>
                </div>
                <Show when={user}>
                    <div class="mt-2 text-sm text-slate-400">
                        {user?.name || user?.phone}
                    </div>
                </Show>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show
                    when={!metrics.loading}
                    fallback={
                        <div class="flex items-center justify-center py-10">
                            <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                        </div>
                    }
                >
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <ClipboardList class="w-4 h-4 text-amber-400" /> {t('warehouseApp.dashboard.openTasks')}
                            </div>
                            <div class="text-2xl font-semibold text-white mt-2">{metrics()?.openTasks || 0}</div>
                        </div>
                        <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <Boxes class="w-4 h-4 text-indigo-400" /> {t('warehouseApp.dashboard.lowStock')}
                            </div>
                            <div class="text-2xl font-semibold text-white mt-2">{metrics()?.lowStock || 0}</div>
                        </div>
                    </div>

                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-3">
                            <Truck class="w-5 h-5 text-emerald-400" />
                            <h2 class="text-white font-semibold">{t('warehouseApp.dashboard.inboundToday')}</h2>
                        </div>
                        <div class="text-sm text-slate-400">
                            {metrics()?.inboundToday || 0} {t('warehouseApp.dashboard.shipmentsScheduled')}
                        </div>
                    </div>

                    <Show when={(metrics()?.lowStock || 0) > 0}>
                        <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                            <div class="flex items-center gap-2 mb-3">
                                <AlertTriangle class="w-5 h-5 text-amber-400" />
                                <h2 class="text-white font-semibold">{t('warehouseApp.dashboard.alerts')}</h2>
                            </div>
                            <div class="space-y-2 text-sm text-slate-400">
                                <div class="flex justify-between">
                                    <span>{t('warehouseApp.inventory.reorderNeeded')}</span>
                                    <span class="text-amber-400 font-semibold">{metrics()?.lowStock || 0}</span>
                                </div>
                            </div>
                        </div>
                    </Show>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseDashboard;
