import { type Component, Show, For, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, Truck, CheckCircle2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface ReceivingDetail {
    id: string;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
    notes: string | null;
    items: Array<{ id: string; productName: string | null; qtyOrdered: number; qtyReceived: number | null }>;
}

const WarehouseReceivingDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [shipment] = createResource(async () => {
        const result = await api<ReceivingDetail>(`/warehouse/receiving/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Receiving Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!shipment.loading && shipment()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Shipment not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-2">
                        <div class="text-white font-semibold text-lg">{shipment()!.supplierName ?? 'Unknown supplier'}</div>
                        <div class="text-slate-400 text-sm">{shipment()!.poNumber}</div>
                        <div class="flex items-center gap-2 text-slate-500 text-xs">
                            <Truck class="w-4 h-4 text-emerald-400" /> {shipment()!.status}
                        </div>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                        <div class="text-slate-400 text-xs uppercase">Items</div>
                        <ul class="mt-3 space-y-2 text-sm text-slate-200">
                            <For each={shipment()!.items}>
                                {(item) => (
                                    <li class="flex items-center justify-between">
                                        <span>{item.productName ?? 'Unknown item'}</span>
                                        <span class="text-xs text-slate-500">{item.qtyReceived ?? 0}/{item.qtyOrdered}</span>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </div>

                    <button class="w-full py-3 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 class="w-4 h-4" /> Mark Received
                    </button>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseReceivingDetail;
