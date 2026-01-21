import { type Component, For, Show, createSignal, createResource, createMemo } from 'solid-js';
import {
    Search,
    Filter,
    Eye,
    Truck,
    CheckCircle2,
    Clock,
    XCircle,
    Package,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Navigation
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDateTime } from '../../stores/settings';

interface Trip {
    id: string;
    tripNumber: string;
    driver: { name: string } | null;
    vehicle: { name: string; plateNumber: string } | null;
    status: string;
    ordersCount: number;
    scheduledDate: string;
    startedAt: string | null;
    completedAt: string | null;
}

const Deliveries: Component = () => {
    const [search, setSearch] = createSignal('');
    const [statusFilter, setStatusFilter] = createSignal('');
    const [page, setPage] = createSignal(1);
    const limit = 20;

    const [trips] = createResource(
        () => ({ search: search(), status: statusFilter(), page: page() }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: limit.toString(),
            };
            if (params.status) queryParams.status = params.status;

            const result = await api<{ data: Trip[]; total: number }>('/delivery/trips', { params: queryParams });
            return result;
        }
    );

    const tripList = createMemo(() => {
        const res = trips();
        if (Array.isArray(res)) return res;
        return (res as any)?.data || [];
    });
    const total = createMemo(() => (trips() as any)?.total || tripList().length);
    const totalPages = createMemo(() => Math.ceil(total() / limit) || 1);

    const statusOptions = [
        { value: '', label: 'All Status' },
        { value: 'pending', label: 'Pending' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' },
    ];

    const getStatusConfig = (status: string) => {
        const configs: Record<string, { bg: string; text: string; icon: any }> = {
            pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: Clock },
            in_progress: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: Truck },
            completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
            cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
        };
        return configs[status] || configs.pending;
    };

    // Using shared formatDateTime from settings store

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white">Deliveries</h1>
                    <p class="text-slate-400">Manage delivery trips and routes</p>
                </div>
            </div>

            {/* Filters */}
            <div class="flex flex-col sm:flex-row gap-4 mb-6">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search trips..."
                        value={search()}
                        onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
                        class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>
                <div class="relative">
                    <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                        value={statusFilter()}
                        onChange={(e) => { setStatusFilter(e.currentTarget.value); setPage(1); }}
                        class="pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                        <For each={statusOptions}>
                            {(option) => <option value={option.value}>{option.label}</option>}
                        </For>
                    </select>
                </div>
            </div>

            {/* Loading */}
            <Show when={trips.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            {/* Table */}
            <Show when={!trips.loading && tripList().length > 0}>
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                    {/* Desktop Table */}
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-slate-800/50">
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Trip</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Driver</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Vehicle</th>
                                    <th class="text-center text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Orders</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Status</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Scheduled</th>
                                    <th class="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50">
                                <For each={tripList()}>
                                    {(trip) => {
                                        const statusConfig = getStatusConfig(trip.status);
                                        const StatusIcon = statusConfig.icon;
                                        return (
                                            <tr class="hover:bg-slate-800/30 transition-colors">
                                                <td class="px-6 py-4">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                                            <Truck class="w-5 h-5 text-white" />
                                                        </div>
                                                        <span class="text-white font-medium">{trip.tripNumber}</span>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4 text-slate-300">
                                                    {trip.driver?.name || 'Unassigned'}
                                                </td>
                                                <td class="px-6 py-4">
                                                    <Show when={trip.vehicle} fallback={<span class="text-slate-500">No vehicle</span>}>
                                                        <div>
                                                            <div class="text-white">{trip.vehicle?.name}</div>
                                                            <div class="text-slate-500 text-xs">{trip.vehicle?.plateNumber}</div>
                                                        </div>
                                                    </Show>
                                                </td>
                                                <td class="px-6 py-4 text-center">
                                                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-full text-white text-sm font-medium">
                                                        <Package class="w-3.5 h-3.5" />
                                                        {trip.ordersCount || 0}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                        <StatusIcon class="w-3.5 h-3.5" />
                                                        {trip.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-slate-400 text-sm">
                                                    {formatDateTime(trip.scheduledDate)}
                                                </td>
                                                <td class="px-6 py-4 text-right">
                                                    <div class="flex items-center justify-end gap-2">
                                                        <button class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                                            <Eye class="w-4 h-4" />
                                                        </button>
                                                        <button class="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors">
                                                            <Navigation class="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card List */}
                    <div class="lg:hidden divide-y divide-slate-800/50">
                        <For each={tripList()}>
                            {(trip) => {
                                const statusConfig = getStatusConfig(trip.status);
                                const StatusIcon = statusConfig.icon;
                                return (
                                    <div class="p-4 hover:bg-slate-800/30 transition-colors">
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                                    <Truck class="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <div class="text-white font-medium">{trip.tripNumber}</div>
                                                    <div class="text-slate-400 text-xs">{formatDateTime(trip.scheduledDate)}</div>
                                                </div>
                                            </div>
                                            <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                <StatusIcon class="w-3.5 h-3.5" />
                                                {trip.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div class="grid grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <div class="text-xs text-slate-500">Driver</div>
                                                <div class="text-slate-200 text-sm">{trip.driver?.name || 'Unassigned'}</div>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-xs text-slate-500">Vehicle</div>
                                                <div class="text-slate-200 text-sm">{trip.vehicle?.name || '-'}</div>
                                            </div>
                                        </div>

                                        <div class="flex items-center justify-between pt-3 border-t border-slate-800/50">
                                            <div class="flex items-center gap-2">
                                                <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-full text-white text-xs font-medium">
                                                    <Package class="w-3 h-3" />
                                                    {trip.ordersCount || 0} Orders
                                                </span>
                                            </div>
                                            <div class="flex gap-2">
                                                <button class="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                                                    <Eye class="w-4 h-4" />
                                                </button>
                                                <button class="p-2 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg transition-colors">
                                                    <Navigation class="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

                    {/* Pagination */}
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800/50">
                        <span class="text-slate-400 text-sm">
                            Showing {(page() - 1) * limit + 1} to {Math.min(page() * limit, total())} of {total()} trips
                        </span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white text-sm px-3">
                                Page {page()} of {totalPages()}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages(), p + 1))}
                                disabled={page() >= totalPages()}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={!trips.loading && tripList().length === 0}>
                <div class="text-center py-20">
                    <Truck class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-white mb-2">No delivery trips found</h3>
                    <p class="text-slate-400">Delivery trips will appear here once created</p>
                </div>
            </Show>
        </div>
    );
};

export default Deliveries;
