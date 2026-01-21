import { type Component, For, Show, createSignal, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import {
    Truck,
    Package,
    Clock,
    CheckCircle2,
    Play,
    Calendar,
    Loader2,
    ChevronRight
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDate } from '../../stores/settings';

interface Trip {
    id: string;
    tripNumber: string;
    status: string;
    plannedDate: string;
    driverName: string | null;
    vehicleName: string | null;
    orderCount: number;
}

const Trips: Component = () => {
    const [statusFilter, setStatusFilter] = createSignal<string>('');

    // Fetch trips for driver
    const [trips] = createResource(
        () => ({ status: statusFilter() }),
        async (params) => {
            const queryParams: Record<string, string> = { limit: '50' };
            if (params.status) queryParams.status = params.status;
            const result = await api<Trip[]>('/delivery/trips', { params: queryParams });
            return result;
        }
    );

    const tripList = () => (trips() as any)?.data || trips() || [];

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'planned':
                return { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Calendar, label: 'Planned' };
            case 'loading':
                return { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: Package, label: 'Loading' };
            case 'in_progress':
                return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Play, label: 'In Progress' };
            case 'completed':
                return { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: CheckCircle2, label: 'Completed' };
            default:
                return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: Clock, label: status };
        }
    };

    // Using shared formatDate from settings store

    const statusOptions = [
        { value: '', label: 'All Trips' },
        { value: 'planned', label: 'Planned' },
        { value: 'loading', label: 'Loading' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' },
    ];

    return (
        <div class="min-h-screen pb-20">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-4">
                    <h1 class="text-xl font-bold text-white mb-1">My Trips</h1>
                    <p class="text-slate-500 text-sm">Manage your delivery routes</p>
                </div>

                {/* Status Filter Pills */}
                <div class="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
                    <For each={statusOptions}>
                        {(option) => (
                            <button
                                onClick={() => setStatusFilter(option.value)}
                                class={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${statusFilter() === option.value
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                            >
                                {option.label}
                            </button>
                        )}
                    </For>
                </div>
            </div>

            {/* Content */}
            <div class="pt-32 px-4">
                {/* Loading */}
                <Show when={trips.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                {/* Empty State */}
                <Show when={!trips.loading && tripList().length === 0}>
                    <div class="text-center py-12">
                        <Truck class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">No trips found</h3>
                        <p class="text-slate-400 text-sm">
                            {statusFilter() ? 'Try selecting a different status' : 'Your assigned trips will appear here'}
                        </p>
                    </div>
                </Show>

                {/* Trip List */}
                <Show when={!trips.loading && tripList().length > 0}>
                    <div class="space-y-3">
                        <For each={tripList()}>
                            {(trip) => {
                                const config = getStatusConfig(trip.status);
                                const StatusIcon = config.icon;

                                return (
                                    <A
                                        href={`/driver/trips/${trip.id}`}
                                        class="block bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm active:scale-[0.99] transition-transform"
                                    >
                                        <div class="flex items-start justify-between mb-3">
                                            <div>
                                                <div class="text-white font-semibold">{trip.tripNumber}</div>
                                                <div class="flex items-center gap-1.5 mt-1 text-slate-500 text-xs">
                                                    <Calendar class="w-3 h-3" />
                                                    {formatDate(trip.plannedDate)}
                                                </div>
                                            </div>
                                            <span class={`flex items-center gap-1 px-2 py-1 rounded-full ${config.bg} ${config.color} text-[10px] font-bold border ${config.border}`}>
                                                <StatusIcon class="w-3 h-3" />
                                                {config.label}
                                            </span>
                                        </div>

                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-4">
                                                <Show when={trip.vehicleName}>
                                                    <div class="flex items-center gap-1.5 text-slate-400 text-xs">
                                                        <Truck class="w-3.5 h-3.5" />
                                                        {trip.vehicleName}
                                                    </div>
                                                </Show>
                                                <div class="flex items-center gap-1.5 text-slate-400 text-xs">
                                                    <Package class="w-3.5 h-3.5" />
                                                    {trip.orderCount} {trip.orderCount === 1 ? 'delivery' : 'deliveries'}
                                                </div>
                                            </div>
                                            <ChevronRight class="w-5 h-5 text-slate-600" />
                                        </div>
                                    </A>
                                );
                            }}
                        </For>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default Trips;
