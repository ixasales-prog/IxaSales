import { type Component, For, Show, createSignal, createResource } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import {
    ArrowLeft,
    Package,
    MapPin,
    Navigation,
    CheckCircle2,
    Play,
    Clock,
    AlertCircle,
    DollarSign,
    Loader2,
    XCircle
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';

interface TripOrder {
    id: string;
    orderNumber: string;
    customerName: string | null;
    address: string | null;
    totalAmount: string;
    status: string;
    sequence: number;
    deliveryNotes: string | null;
}

interface TripDetail {
    id: string;
    tripNumber: string;
    status: string;
    plannedDate: string;
    driverId: string;
    vehicleId: string | null;
    notes: string | null;
    driverName: string | null;
    vehicleName: string | null;
    orders: TripOrder[];
}

const TripDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [actionLoading, setActionLoading] = createSignal<string | null>(null);
    const [showConfirmModal, setShowConfirmModal] = createSignal<TripOrder | null>(null);

    // Fetch trip details
    const [trip, { refetch }] = createResource(
        () => params.id,
        async (id) => {
            const result = await api<TripDetail>(`/delivery/trips/${id}`);
            return result;
        }
    );

    const getOrderStatusConfig = (status: string) => {
        switch (status) {
            case 'delivered':
                return { color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2, label: 'Delivered' };
            case 'partial':
                return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: AlertCircle, label: 'Partial' };
            case 'cancelled':
                return { color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle, label: 'Cancelled' };
            default:
                return { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Package, label: 'Pending' };
        }
    };

    const handleStartTrip = async () => {
        setActionLoading('start');
        try {
            await api(`/delivery/trips/${params.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'in_progress' })
            });
            refetch();
        } finally {
            setActionLoading(null);
        }
    };

    const handleCompleteTrip = async () => {
        setActionLoading('complete');
        try {
            await api(`/delivery/trips/${params.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'completed' })
            });
            refetch();
        } finally {
            setActionLoading(null);
        }
    };

    const openMaps = (address: string) => {
        const encoded = encodeURIComponent(address);
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
    };

    // formatCurrency is now imported from settings store

    const pendingDeliveries = () => trip()?.orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length || 0;
    const completedDeliveries = () => trip()?.orders.filter(o => o.status === 'delivered').length || 0;

    return (
        <div class="min-h-screen pb-32">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => navigate('/driver')} class="p-2 -ml-2 text-slate-400 hover:text-white">
                        <ArrowLeft class="w-5 h-5" />
                    </button>
                    <div class="flex-1">
                        <h1 class="text-lg font-bold text-white">{trip()?.tripNumber || 'Loading...'}</h1>
                        <Show when={trip()}>
                            <p class="text-slate-500 text-xs">{trip()?.vehicleName || 'No vehicle'}</p>
                        </Show>
                    </div>
                    <Show when={trip()?.status}>
                        <span class={`px-2 py-1 rounded-full text-[10px] font-bold ${trip()?.status === 'in_progress' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            trip()?.status === 'completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                            {trip()?.status.replace('_', ' ').toUpperCase()}
                        </span>
                    </Show>
                </div>
            </div>

            {/* Content */}
            <div class="pt-20 px-4">
                {/* Loading */}
                <Show when={trip.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!trip.loading && trip()}>
                    {/* Stats */}
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs mb-1">
                                <Clock class="w-4 h-4" />
                                Pending
                            </div>
                            <div class="text-2xl font-bold text-orange-400">{pendingDeliveries()}</div>
                        </div>
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs mb-1">
                                <CheckCircle2 class="w-4 h-4" />
                                Completed
                            </div>
                            <div class="text-2xl font-bold text-green-400">{completedDeliveries()}</div>
                        </div>
                    </div>

                    {/* Notes */}
                    <Show when={trip()?.notes}>
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 mb-4">
                            <div class="text-slate-400 text-xs mb-1">Notes</div>
                            <div class="text-white text-sm">{trip()?.notes}</div>
                        </div>
                    </Show>

                    {/* Delivery List */}
                    <h2 class="text-white font-semibold mb-3">Deliveries</h2>
                    <div class="space-y-3">
                        <For each={trip()?.orders}>
                            {(order) => {
                                const config = getOrderStatusConfig(order.status);
                                const StatusIcon = config.icon;

                                return (
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                        <div class="flex items-start justify-between mb-3">
                                            <div class="flex items-center gap-2">
                                                <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                                                    {order.sequence}
                                                </span>
                                                <span class="text-white font-medium">{order.orderNumber}</span>
                                            </div>
                                            <span class={`flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bg} ${config.color} text-[10px] font-bold`}>
                                                <StatusIcon class="w-3 h-3" />
                                                {config.label}
                                            </span>
                                        </div>

                                        <div class="space-y-2 mb-3">
                                            <div class="flex items-center gap-2 text-white text-sm">
                                                <Package class="w-4 h-4 text-slate-500" />
                                                {order.customerName || 'Unknown Customer'}
                                            </div>
                                            <Show when={order.address}>
                                                <div class="flex items-start gap-2 text-slate-400 text-sm">
                                                    <MapPin class="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                    <span>{order.address}</span>
                                                </div>
                                            </Show>
                                            <div class="flex items-center gap-2 text-emerald-400 font-semibold">
                                                <DollarSign class="w-4 h-4" />
                                                {formatCurrency(order.totalAmount)}
                                            </div>
                                        </div>

                                        <Show when={order.deliveryNotes}>
                                            <div class="bg-slate-800/50 rounded-lg p-2 mb-3 text-slate-400 text-xs">
                                                {order.deliveryNotes}
                                            </div>
                                        </Show>

                                        <Show when={!['delivered', 'cancelled'].includes(order.status)}>
                                            <div class="flex gap-2">
                                                <Show when={order.address}>
                                                    <button
                                                        onClick={() => openMaps(order.address!)}
                                                        class="flex-1 py-2.5 bg-slate-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                                    >
                                                        <Navigation class="w-4 h-4" />
                                                        Navigate
                                                    </button>
                                                </Show>
                                                <button
                                                    onClick={() => setShowConfirmModal(order)}
                                                    class="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                                >
                                                    <CheckCircle2 class="w-4 h-4" />
                                                    Confirm
                                                </button>
                                            </div>
                                        </Show>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Bottom Action Bar */}
            <Show when={trip() && !trip.loading}>
                <div class="fixed bottom-16 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/50 p-4 z-30">
                    <Show when={trip()?.status === 'planned' || trip()?.status === 'loading'}>
                        <button
                            onClick={handleStartTrip}
                            disabled={actionLoading() === 'start'}
                            class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={actionLoading() === 'start'} fallback={<><Play class="w-5 h-5" /> Start Trip</>}>
                                <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Starting...
                            </Show>
                        </button>
                    </Show>

                    <Show when={trip()?.status === 'in_progress'}>
                        <button
                            onClick={handleCompleteTrip}
                            disabled={actionLoading() === 'complete' || pendingDeliveries() > 0}
                            class="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={actionLoading() === 'complete'} fallback={<><CheckCircle2 class="w-5 h-5" /> Complete Trip</>}>
                                <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Completing...
                            </Show>
                        </button>
                        <Show when={pendingDeliveries() > 0}>
                            <p class="text-center text-slate-500 text-xs mt-2">{pendingDeliveries()} deliveries remaining</p>
                        </Show>
                    </Show>

                    <Show when={trip()?.status === 'completed'}>
                        <div class="text-center text-green-400 font-medium flex items-center justify-center gap-2">
                            <CheckCircle2 class="w-5 h-5" />
                            Trip Completed
                        </div>
                    </Show>
                </div>
            </Show>

            {/* Delivery Confirmation Modal */}
            <Show when={showConfirmModal()}>
                <DeliveryConfirmModal
                    order={showConfirmModal()!}
                    tripId={params.id || ''}
                    onClose={() => setShowConfirmModal(null)}
                    onConfirm={() => { setShowConfirmModal(null); refetch(); }}
                />
            </Show>
        </div>
    );
};

// Delivery Confirmation Modal
const DeliveryConfirmModal: Component<{
    order: TripOrder;
    tripId: string;
    onClose: () => void;
    onConfirm: () => void;
}> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [deliveryType, setDeliveryType] = createSignal<'full' | 'partial' | 'refused'>('full');
    const [notes, setNotes] = createSignal('');

    const handleConfirm = async () => {
        setLoading(true);
        try {
            // This would call a delivery confirmation endpoint
            // For now, we'll update the order status
            await api(`/orders/${props.order.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: deliveryType() === 'refused' ? 'cancelled' : deliveryType() === 'partial' ? 'partial' : 'delivered',
                    deliveryNotes: notes() || undefined
                })
            });
            props.onConfirm();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 overflow-y-auto">
            <div class="min-h-full p-4">
                {/* Header */}
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-lg font-bold text-white">Confirm Delivery</h2>
                    <button onClick={props.onClose} class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
                        ✕
                    </button>
                </div>

                {/* Order Info */}
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 mb-6">
                    <div class="text-white font-semibold mb-1">{props.order.orderNumber}</div>
                    <div class="text-slate-400 text-sm">{props.order.customerName}</div>
                    <div class="text-emerald-400 font-bold mt-2">${parseFloat(props.order.totalAmount).toFixed(2)}</div>
                </div>

                {/* Delivery Type */}
                <div class="mb-6">
                    <label class="block text-white font-medium mb-3">Delivery Status</label>
                    <div class="grid grid-cols-3 gap-2">
                        {[
                            { value: 'full', label: 'Full', color: 'emerald' },
                            { value: 'partial', label: 'Partial', color: 'yellow' },
                            { value: 'refused', label: 'Refused', color: 'red' },
                        ].map(option => (
                            <button
                                onClick={() => setDeliveryType(option.value as any)}
                                class={`py-3 rounded-xl text-sm font-medium transition-all ${deliveryType() === option.value
                                    ? option.color === 'emerald' ? 'bg-emerald-600 text-white' :
                                        option.color === 'yellow' ? 'bg-yellow-600 text-white' :
                                            'bg-red-600 text-white'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notes */}
                <div class="mb-6">
                    <label class="block text-white font-medium mb-2">Notes (Optional)</label>
                    <textarea
                        value={notes()}
                        onInput={(e) => setNotes(e.currentTarget.value)}
                        placeholder="Add delivery notes..."
                        class="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none h-24"
                    />
                </div>

                {/* Actions */}
                <div class="space-y-3">
                    <button
                        onClick={handleConfirm}
                        disabled={loading()}
                        class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <Show when={loading()} fallback={<>Confirm Delivery</>}>
                            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Processing...
                        </Show>
                    </button>
                    <button
                        onClick={props.onClose}
                        class="w-full py-3.5 bg-slate-800 text-white font-medium rounded-xl active:scale-[0.98] transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TripDetail;
