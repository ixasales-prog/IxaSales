import { type Component, For, Show, createResource, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { CheckCircle2, Timer, Loader2, Boxes, Square, CheckSquare } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';

interface TaskItem {
    id: string;
    orderNumber: string;
    status: string;
    requestedDeliveryDate: string | null;
    customerName: string | null;
}

const WarehouseTasks: Component = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [updatingTask, setUpdatingTask] = createSignal<string | null>(null);
    const [selectedTasks, setSelectedTasks] = createSignal<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = createSignal(false);

    const [tasks, { refetch }] = createResource(async () => {
        const result = await api<TaskItem[]>('/warehouse/tasks');
        return (result as any)?.data ?? result ?? [];
    });

    const handleMarkComplete = async (taskId: string, event: MouseEvent) => {
        event.stopPropagation();

        setUpdatingTask(taskId);

        try {
            await api(`/warehouse/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'picked' })
            });

            showToast(t('warehouseApp.tasks.statusUpdated'), 'success');
            refetch();
        } catch (error) {
            console.error('Failed to update task:', error);
            showToast(t('warehouseApp.tasks.updateFailed'), 'error');
        } finally {
            setUpdatingTask(null);
        }
    };

    const toggleTaskSelection = (taskId: string, event: MouseEvent) => {
        event.stopPropagation();
        const current = new Set(selectedTasks());
        if (current.has(taskId)) {
            current.delete(taskId);
        } else {
            current.add(taskId);
        }
        setSelectedTasks(current);
    };

    const handleBatchPick = () => {
        const selected = Array.from(selectedTasks());
        if (selected.length === 0) return;
        navigate(`/warehouse/tasks/batch?orderIds=${selected.join(',')}`);
    };

    const toggleSelectionMode = () => {
        if (selectionMode()) {
            setSelectedTasks(new Set<string>());
        }
        setSelectionMode(!selectionMode());
    };

    const selectAll = () => {
        const taskList = tasks() ?? [];
        setSelectedTasks(new Set<string>(taskList.map((task: TaskItem) => task.id)));
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-xl font-bold text-white">{t('warehouseApp.tasks.title')}</h1>
                        <p class="text-slate-500 text-sm">{t('warehouseApp.tasks.subtitle')}</p>
                    </div>
                    <button
                        onClick={toggleSelectionMode}
                        class={`p-2 rounded-xl border transition ${selectionMode()
                            ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400'
                            : 'bg-slate-900/60 border-slate-800/60 text-slate-400 hover:text-white'
                            }`}
                        title={t('warehouseApp.batchPicking.selectMode')}
                    >
                        <Boxes class="w-5 h-5" />
                    </button>
                </div>

                {/* Batch Selection Controls */}
                <Show when={selectionMode()}>
                    <div class="mt-3 flex items-center gap-2">
                        <button
                            onClick={selectAll}
                            class="px-3 py-1.5 text-xs rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:bg-slate-700/60 transition"
                        >
                            {t('warehouseApp.batchPicking.selectAll')}
                        </button>
                        <span class="text-slate-500 text-xs flex-1">
                            {selectedTasks().size} {t('warehouseApp.batchPicking.selected')}
                        </span>
                        <button
                            onClick={handleBatchPick}
                            disabled={selectedTasks().size === 0}
                            class="px-4 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-500 transition"
                        >
                            {t('warehouseApp.batchPicking.startBatch')}
                        </button>
                    </div>
                </Show>
            </div>

            <div class="px-4 pt-4 space-y-3">
                <Show when={tasks.loading}>
                    <div class="flex items-center justify-center py-10">
                        <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                    </div>
                </Show>
                <Show when={!tasks.loading && (tasks() ?? []).length === 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                        {t('warehouseApp.tasks.noTasks')}
                    </div>
                </Show>
                <Show when={!tasks.loading && (tasks() ?? []).length > 0}>
                    <For each={tasks() ?? []}>
                        {(task) => {
                            const isSelected = () => selectedTasks().has(task.id);

                            return (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (selectionMode()) {
                                            const event = { stopPropagation: () => { } } as MouseEvent;
                                            toggleTaskSelection(task.id, event);
                                        } else {
                                            navigate(`/warehouse/tasks/${task.id}`);
                                        }
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            if (!selectionMode()) {
                                                navigate(`/warehouse/tasks/${task.id}`);
                                            }
                                        }
                                    }}
                                    class={`bg-slate-900/60 border rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80 ${isSelected() ? 'border-emerald-500/50' : 'border-slate-800/60'
                                        }`}
                                >
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            {/* Selection Checkbox */}
                                            <Show when={selectionMode()}>
                                                <button
                                                    onClick={(e) => toggleTaskSelection(task.id, e)}
                                                    class="text-slate-400 hover:text-emerald-400 transition"
                                                >
                                                    {isSelected() ? (
                                                        <CheckSquare class="w-5 h-5 text-emerald-400" />
                                                    ) : (
                                                        <Square class="w-5 h-5" />
                                                    )}
                                                </button>
                                            </Show>
                                            <div>
                                                <div class="text-white font-semibold">{task.orderNumber}</div>
                                                <div class="text-slate-400 text-sm">{task.customerName ?? t('warehouseApp.tasks.unknownCustomer')}</div>
                                            </div>
                                        </div>
                                        <div class="text-xs text-slate-400 flex items-center gap-1">
                                            <Timer class="w-4 h-4 text-amber-400" />
                                            <span class="px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
                                                {task.status}
                                            </span>
                                        </div>
                                    </div>
                                    <Show when={!selectionMode()}>
                                        <button
                                            onClick={(event) => handleMarkComplete(task.id, event)}
                                            disabled={updatingTask() === task.id}
                                            class="mt-3 w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600/30 transition"
                                        >
                                            {updatingTask() === task.id ? (
                                                <Loader2 class="w-4 h-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 class="w-4 h-4" />
                                            )}
                                            {t('warehouseApp.tasks.markComplete')}
                                        </button>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseTasks;
