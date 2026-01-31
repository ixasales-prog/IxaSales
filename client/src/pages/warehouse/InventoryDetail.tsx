import { type Component, Show, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, AlertTriangle, PackageCheck, TrendingDown } from 'lucide-solid';
import { api } from '../../lib/api';

interface InventoryDetail {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    stockQuantity: number | null;
    reorderPoint: number | null;
    costPrice: string | null;
    price: string | null;
}

const WarehouseInventoryDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [item] = createResource(async () => {
        const result = await api<InventoryDetail>(`/warehouse/inventory/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Inventory Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!item.loading && item()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Item not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-2">
                        <div class="text-white font-semibold text-lg">{item()!.name}</div>
                        <div class="text-slate-500 text-xs">{item()!.sku}</div>
                        <div class="text-slate-400 text-sm">{item()!.description ?? 'No description'}</div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <PackageCheck class="w-4 h-4 text-emerald-400" /> Stock
                            </div>
                            <div class="text-white text-xl font-semibold mt-2">{item()!.stockQuantity ?? 0}</div>
                        </div>
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <TrendingDown class="w-4 h-4 text-amber-400" /> Status
                            </div>
                            <div class={`text-sm font-semibold mt-2 ${(item()!.stockQuantity ?? 0) <= (item()!.reorderPoint ?? 0) ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {(item()!.stockQuantity ?? 0) <= (item()!.reorderPoint ?? 0) ? 'low' : 'ok'}
                            </div>
                        </div>
                    </div>

                    <Show when={(item()!.stockQuantity ?? 0) <= (item()!.reorderPoint ?? 0)}>
                        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 flex items-center gap-2 text-sm">
                            <AlertTriangle class="w-4 h-4" /> Reorder suggested within 24 hours.
                        </div>
                    </Show>

                    <button class="w-full py-3 rounded-xl bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 font-semibold">
                        Create Purchase Request
                    </button>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseInventoryDetail;
