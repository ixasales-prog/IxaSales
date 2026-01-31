import { type Component, Show, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, MapPin, DollarSign, PackageCheck, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';

interface DeliveryDetail {
    id: string;
    orderNumber: string;
    customerName: string | null;
    address: string | null;
    totalAmount: string;
    status: string;
    deliveryNotes?: string | null;
}

const DeliveryDetailPage: Component = () => {
    const params = useParams();
    const navigate = useNavigate();

    const [delivery] = createResource(async () => {
        try {
            const result = await api<DeliveryDetail>(`/delivery/orders/${params.id}`);
            return (result as any)?.data ?? result ?? null;
        } catch (error) {
            return null;
        }
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Delivery Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={delivery.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!delivery.loading && delivery()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Delivery not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-2">
                        <div class="text-white font-semibold text-lg">{delivery()!.orderNumber}</div>
                        <div class="text-slate-400 text-sm">{delivery()!.customerName ?? 'Unknown customer'}</div>
                        <div class="text-xs px-2 py-1 rounded-full bg-slate-800/70 text-slate-300 inline-flex">
                            {delivery()!.status}
                        </div>
                    </div>

                    <Show when={delivery()!.address}>
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 flex items-start gap-2">
                            <MapPin class="w-4 h-4 text-slate-400 mt-1" />
                            <div>
                                <div class="text-slate-400 text-xs uppercase">Address</div>
                                <div class="text-white text-sm">{delivery()!.address}</div>
                            </div>
                        </div>
                    </Show>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <DollarSign class="w-4 h-4 text-emerald-400" /> Total
                            </div>
                            <div class="text-white text-lg font-semibold mt-2">{formatCurrency(delivery()!.totalAmount)}</div>
                        </div>
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <PackageCheck class="w-4 h-4 text-indigo-400" /> Items
                            </div>
                            <div class="text-white text-lg font-semibold mt-2">#{delivery()!.id}</div>
                        </div>
                    </div>

                    <Show when={delivery()!.deliveryNotes}>
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="text-slate-400 text-xs uppercase">Notes</div>
                            <div class="text-white text-sm mt-2">{delivery()!.deliveryNotes}</div>
                        </div>
                    </Show>
                </Show>
            </div>
        </div>
    );
};

export default DeliveryDetailPage;
