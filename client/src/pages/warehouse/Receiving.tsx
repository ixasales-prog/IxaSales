import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Truck, CheckCircle2, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface ReceivingItem {
    id: string;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
}

const WarehouseReceiving: Component = () => {
    const navigate = useNavigate();
    const [inbound] = createResource(async () => {
        const result = await api<ReceivingItem[]>('/warehouse/receiving');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Receiving</h1>
            <p class="text-slate-500 text-sm">Inbound shipments and dock status</p>
        </div>

        <div class="px-4 pt-4 space-y-3">
            <Show when={inbound.loading}>
                <div class="flex items-center justify-center py-10">
                    <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
            </Show>
            <Show when={!inbound.loading && (inbound() ?? []).length === 0}>
                <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                    No inbound shipments scheduled.
                </div>
            </Show>
            <Show when={!inbound.loading && (inbound() ?? []).length > 0}>
                <For each={inbound() ?? []}>
                    {(shipment) => (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/warehouse/receiving/${shipment.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/warehouse/receiving/${shipment.id}`);
                            }
                        }}
                        class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold">{shipment.supplierName ?? 'Unknown supplier'}</div>
                                <div class="text-slate-400 text-sm">{shipment.poNumber}</div>
                            </div>
                            <div class="text-xs text-slate-400 flex items-center gap-1">
                                <Truck class="w-4 h-4 text-emerald-400" />
                                <span class="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                                    {shipment.status}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={(event) => event.stopPropagation()}
                            class="mt-3 w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 class="w-4 h-4" /> Mark Received
                        </button>
                    </div>
                    )}
                </For>
            </Show>
        </div>
    </div>
    );
};

export default WarehouseReceiving;
