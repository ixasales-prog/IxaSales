import { type Component, For, Show, createResource, createMemo } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
    MapPin,
    Clock,
    CheckCircle2,
    Navigation,
    DollarSign,
    Loader2,
    Truck
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';

interface Trip {
    id: string;
    tripNumber: string;
    status: string;
    plannedDate: string;
    vehicleName: string | null;
    orderCount: number;
}

interface TripOrder {
    id: string;
    orderNumber: string;
    customerName: string | null;
    address: string | null;
    totalAmount: string;
    status: string;
    sequence: number;
}

interface TripWithOrders extends Trip {
    orders: TripOrder[];
}

const Deliveries: Component = () => {
    const navigate = useNavigate();
    // Fetch active trip
    const [activeTrip] = createResource(async () => {
        // Get trips in progress
        const result = await api<Trip[]>('/delivery/trips', {
            params: { status: 'in_progress', limit: '1' }
        });
        const trips = (result as any)?.data || result || [];
        if (trips.length === 0) return null;

        // Get full trip details
        const tripDetail = await api<TripWithOrders>(`/delivery/trips/${trips[0].id}`);
        return tripDetail;
    });

    const pendingOrders = createMemo(() =>
        activeTrip()?.orders.filter(o => !['delivered', 'cancelled'].includes(o.status)) || []
    );

    const completedOrders = createMemo(() =>
        activeTrip()?.orders.filter(o => o.status === 'delivered') || []
    );

    // formatCurrency is now imported from settings store

    const openMaps = (address: string) => {
        const encoded = encodeURIComponent(address);
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
    };

    return (
        <div class="min-h-screen pb-20">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-4">
                    <h1 class="text-xl font-bold text-white mb-1">Deliveries</h1>
                    <p class="text-slate-500 text-sm">Your active delivery queue</p>
                </div>
            </div>

            {/* Content */}
            <div class="pt-24 px-4">
                {/* Loading */}
                <Show when={activeTrip.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                {/* No Active Trip */}
                <Show when={!activeTrip.loading && !activeTrip()}>
                    <div class="text-center py-12">
                        <Truck class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">No active trip</h3>
                        <p class="text-slate-400 text-sm mb-6">Start a trip to see your deliveries here</p>
                        <A
                            href="/driver"
                            class="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl active:scale-95 transition-transform"
                        >
                            <Truck class="w-5 h-5" />
                            View Trips
                        </A>
                    </div>
                </Show>

                {/* Active Trip */}
                <Show when={!activeTrip.loading && activeTrip()}>
                    {/* Trip Info Banner */}
                    <A
                        href={`/driver/trips/${activeTrip()!.id}`}
                        class="block bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-4 mb-4"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white/70 text-xs font-medium">ACTIVE TRIP</div>
                                <div class="text-white font-bold text-lg">{activeTrip()!.tripNumber}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-white font-bold text-2xl">{pendingOrders().length}</div>
                                <div class="text-white/70 text-xs">remaining</div>
                            </div>
                        </div>
                    </A>

                    {/* Pending Deliveries */}
                    <Show when={pendingOrders().length > 0}>
                        <h2 class="text-white font-semibold mb-3 flex items-center gap-2">
                            <Clock class="w-4 h-4 text-orange-400" />
                            Pending ({pendingOrders().length})
                        </h2>
                        <div class="space-y-3 mb-6">
                            <For each={pendingOrders()}>
                                {(order) => (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => navigate(`/driver/deliveries/${order.id}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                navigate(`/driver/deliveries/${order.id}`);
                                            }
                                        }}
                                        class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4"
                                    >
                                        <div class="flex items-center gap-2 overflow-hidden">
                                            <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                {order.sequence}
                                            </span>
                                            <span class="text-white font-medium truncate flex-1 min-w-0">{order.customerName || 'Unknown'}</span>
                                        </div>
                                        <Show when={order.address}>
                                            <div class="flex items-start gap-2 text-slate-400 text-sm mb-2 overflow-hidden">
                                                <MapPin class="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                <span class="truncate flex-1 min-w-0">{order.address}</span>
                                            </div>
                                        </Show>
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-1 text-emerald-400 font-semibold">
                                                <DollarSign class="w-4 h-4" />
                                                {formatCurrency(order.totalAmount)}
                                            </div>
                                            <Show when={order.address}>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openMaps(order.address!);
                                                    }}
                                                    class="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg flex items-center gap-1 active:scale-95 transition-transform"
                                                >
                                                    <Navigation class="w-4 h-4" />
                                                    Navigate
                                                </button>
                                            </Show>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>

                    {/* Completed Deliveries */}
                    <Show when={completedOrders().length > 0}>
                        <h2 class="text-white font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 class="w-4 h-4 text-green-400" />
                            Completed ({completedOrders().length})
                        </h2>
                        <div class="space-y-2">
                            <For each={completedOrders()}>
                                {(order) => (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => navigate(`/driver/deliveries/${order.id}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                navigate(`/driver/deliveries/${order.id}`);
                                            }
                                        }}
                                        class="bg-slate-900/40 border border-slate-800/30 rounded-xl p-3 opacity-60"
                                    >
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <CheckCircle2 class="w-4 h-4 text-green-400" />
                                                <span class="text-white text-sm">{order.customerName}</span>
                                            </div>
                                            <span class="text-slate-500 text-sm">{formatCurrency(order.totalAmount)}</span>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>
        </div>
    );
};

export default Deliveries;
