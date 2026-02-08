import { type Component, createResource, createMemo, For, Show } from 'solid-js';
import {
    Building,
    Activity,
    DollarSign,
    Loader2
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrencyShort } from '../../stores/settings';

// For now, we reuse the reports API which returns aggregated data for super admins
interface SalesByRep {
    salesRepId: string;
    salesRepName: string;
    totalOrders: number;
    totalSales: string | null;
}

const SuperAdminDashboard: Component = () => {
    // We can use the sales-by-rep endpoint to get an idea of total sales across the system
    const [salesData] = createResource(async () => {
        const result = await api<SalesByRep[]>('/reports/sales-by-rep');
        return result;
    });

    const [tenants] = createResource(async () => {
        const result = await api<any[]>('/super/tenants?limit=1000');
        return result;
    });

    // Calculate system totals
    const totalSystemRevenue = createMemo(() => {
        const reps = salesData() || [];
        return reps.reduce((sum, rep) => sum + parseFloat(rep.totalSales || '0'), 0);
    });

    const totalSystemOrders = createMemo(() => {
        const reps = salesData() || [];
        return reps.reduce((sum, rep) => sum + rep.totalOrders, 0);
    });

    const totalTenants = createMemo(() => {
        return (tenants() || []).length;
    });

    const activeTenants = createMemo(() => {
        return (tenants() || []).filter(t => t.isActive).length;
    });

    // formatCurrencyShort is now imported from settings store

    const stats = [
        { label: 'Total System Revenue', value: () => formatCurrencyShort(totalSystemRevenue()), icon: DollarSign, color: 'from-emerald-500 to-teal-600' },
        { label: 'Total System Orders', value: () => totalSystemOrders().toString(), icon: Activity, color: 'from-blue-500 to-indigo-600' },
        { label: 'Registered Tenants', value: () => totalTenants().toString(), icon: Building, color: 'from-purple-500 to-pink-600' },
        { label: 'Active Tenants', value: () => activeTenants().toString(), icon: Building, color: 'from-orange-500 to-red-600' },
    ];

    const loading = () => salesData.loading || tenants.loading;

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 mt-6 lg:mt-8">
            <div class="mb-8">
                <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Platform Overview</h1>
                <p class="text-slate-400">System-wide performance metrics.</p>
            </div>

            <Show when={loading()}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-purple-400 animate-spin" />
                </div>
            </Show>

            <Show when={!loading()}>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                    <For each={stats}>
                        {(stat) => (
                            <div class="relative overflow-hidden bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                                <div class="flex items-start justify-between mb-4">
                                    <div class={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                                        <stat.icon class="w-6 h-6 text-white" />
                                    </div>
                                </div>
                                <div class="text-2xl lg:text-3xl font-bold text-white mb-1">{stat.value()}</div>
                                <div class="text-slate-400 text-sm">{stat.label}</div>
                            </div>
                        )}
                    </For>
                </div>

                {/* Additional sections can be added here, e.g., Recent Tenants, System Health, etc. */}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">Recent Tenants</h3>
                        <div class="space-y-3">
                            <For each={(tenants() || []).slice(0, 5)}>
                                {(tenant) => (
                                    <div class="p-3 bg-slate-800/50 rounded-xl flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                                <Building class="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div class="text-white font-medium text-sm">{tenant.name}</div>
                                                <div class="text-slate-500 text-xs">{tenant.subdomain}</div>
                                            </div>
                                        </div>
                                        <div class={`px-2 py-0.5 rounded text-xs ${tenant.isActive ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-slate-700/50'}`}>
                                            {tenant.plan}
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default SuperAdminDashboard;

