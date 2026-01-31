import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { CheckCircle2, Timer, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface TaskItem {
    id: string;
    orderNumber: string;
    status: string;
    requestedDeliveryDate: string | null;
    customerName: string | null;
}

const WarehouseTasks: Component = () => {
    const navigate = useNavigate();
    const [tasks] = createResource(async () => {
        const result = await api<TaskItem[]>('/warehouse/tasks');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Task Queue</h1>
            <p class="text-slate-500 text-sm">Prioritized picks, packs, and receiving</p>
        </div>

        <div class="px-4 pt-4 space-y-3">
            <Show when={tasks.loading}>
                <div class="flex items-center justify-center py-10">
                    <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
            </Show>
            <Show when={!tasks.loading && (tasks() ?? []).length === 0}>
                <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                    No tasks in queue.
                </div>
            </Show>
            <Show when={!tasks.loading && (tasks() ?? []).length > 0}>
                <For each={tasks() ?? []}>
                    {(task) => (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/warehouse/tasks/${task.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/warehouse/tasks/${task.id}`);
                            }
                        }}
                        class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold">{task.orderNumber}</div>
                                <div class="text-slate-400 text-sm">{task.customerName ?? 'Unknown customer'}</div>
                            </div>
                            <div class="text-xs text-slate-400 flex items-center gap-1">
                                <Timer class="w-4 h-4 text-amber-400" />
                                <span class="px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
                                    {task.status}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={(event) => event.stopPropagation()}
                            class="mt-3 w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 class="w-4 h-4" /> Mark Complete
                        </button>
                    </div>
                    )}
                </For>
            </Show>
        </div>
    </div>
    );
};

export default WarehouseTasks;
