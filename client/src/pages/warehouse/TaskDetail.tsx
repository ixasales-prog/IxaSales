import { type Component, Show, For, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, Timer, CheckCircle2, ClipboardList } from 'lucide-solid';
import { api } from '../../lib/api';

interface TaskDetail {
    id: string;
    orderNumber: string;
    status: string;
    requestedDeliveryDate: string | null;
    customerName: string | null;
    customerAddress: string | null;
    items: Array<{ id: string; productName: string | null; qtyOrdered: number; qtyPicked: number | null }>;
}

const WarehouseTaskDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [task] = createResource(async () => {
        const result = await api<TaskDetail>(`/warehouse/tasks/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Task Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!task.loading && task()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Task not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-2">
                        <div class="text-white font-semibold text-lg">{task()!.orderNumber}</div>
                        <div class="text-slate-400 text-sm">{task()!.customerName ?? 'Unknown customer'}</div>
                        <div class="flex items-center gap-2 text-slate-500 text-xs">
                            <Timer class="w-4 h-4 text-amber-400" /> {task()!.status}
                        </div>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                        <div class="flex items-center gap-2 text-slate-400 text-xs uppercase">
                            <ClipboardList class="w-4 h-4 text-indigo-400" /> Items
                        </div>
                        <ul class="mt-3 space-y-2 text-sm text-slate-200">
                            <For each={task()!.items}>
                                {(item) => (
                                    <li class="flex items-center justify-between">
                                        <span>{item.productName ?? 'Unknown item'}</span>
                                        <span class="text-xs text-slate-500">{item.qtyPicked ?? 0}/{item.qtyOrdered}</span>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </div>

                    <button class="w-full py-3 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 class="w-4 h-4" /> Mark Complete
                    </button>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseTaskDetail;
