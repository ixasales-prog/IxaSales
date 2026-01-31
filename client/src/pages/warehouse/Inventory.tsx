import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { AlertTriangle, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number | null;
    reorderPoint: number | null;
}

const WarehouseInventory: Component = () => {
    const navigate = useNavigate();
    const [inventory] = createResource(async () => {
        const result = await api<InventoryItem[]>('/warehouse/inventory');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Inventory</h1>
            <p class="text-slate-500 text-sm">Stock levels and alerts</p>
        </div>

        <div class="px-4 pt-4 space-y-3">
            <Show when={inventory.loading}>
                <div class="flex items-center justify-center py-10">
                    <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
            </Show>
            <Show when={!inventory.loading && (inventory() ?? []).length === 0}>
                <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                    Inventory is empty.
                </div>
            </Show>
            <Show when={!inventory.loading && (inventory() ?? []).length > 0}>
                <For each={inventory() ?? []}>
                    {(item) => (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/warehouse/inventory/${item.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/warehouse/inventory/${item.id}`);
                            }
                        }}
                        class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold">{item.name}</div>
                                <div class="text-slate-500 text-xs">{item.sku}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-white font-semibold">{item.stockQuantity ?? 0}</div>
                                <div class={`text-xs ${(item.stockQuantity ?? 0) <= (item.reorderPoint ?? 0) ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    <span class={`px-2 py-0.5 rounded-full border ${(item.stockQuantity ?? 0) <= (item.reorderPoint ?? 0) ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                                        {(item.stockQuantity ?? 0) <= (item.reorderPoint ?? 0) ? 'low' : 'ok'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {(item.stockQuantity ?? 0) <= (item.reorderPoint ?? 0) && (
                            <div class="mt-3 flex items-center gap-2 text-xs text-amber-300">
                                <AlertTriangle class="w-4 h-4" /> Reorder needed
                            </div>
                        )}
                    </div>
                    )}
                </For>
            </Show>
        </div>
    </div>
    );
};

export default WarehouseInventory;
