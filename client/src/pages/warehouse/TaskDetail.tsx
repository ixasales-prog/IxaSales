import { type Component, Show, For, createResource } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ArrowLeft, Package, User, Calendar, Loader2, CheckCircle2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

interface TaskDetailData {
    id: string;
    orderNumber: string;
    status: string;
    requestedDeliveryDate: string | null;
    customerName: string | null;
    customerAddress: string | null;
    totalAmount: number;
    items: Array<{
        id: string;
        productName: string;
        qtyOrdered: number;
        qtyPicked: number;
    }>;
}

const TaskDetail: Component = () => {
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();

    const [task] = createResource(() => params.id, async (id) => {
        const result = await api<TaskDetailData>(`/warehouse/tasks/${id}`);
        return (result as any)?.data ?? result;
    });

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // const formatCurrency = (amount: number) => {
    //     return new Intl.NumberFormat('en-US', {
    //         style: 'currency',
    //         currency: 'USD'
    //     }).format(amount);
    // };

    const calculateProgress = (picked: number, ordered: number) => {
        if (ordered === 0) return 0;
        return Math.round((picked / ordered) * 100);
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    onClick={() => navigate('/warehouse/tasks')}
                    class="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
                >
                    <ArrowLeft class="w-5 h-5" />
                    {t('warehouseApp.tasks.back')}
                </button>
                <h1 class="text-xl font-bold text-white">{t('warehouseApp.tasks.taskDetail')}</h1>
            </div>

            <Show when={task.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
            </Show>

            <Show when={task() && !task.loading}>
                <div class="px-4 pt-4 space-y-4">
                    {/* Order Info Card */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.tasks.orderNumber')}</div>
                                <div class="text-white font-bold text-lg">{task()?.orderNumber}</div>
                            </div>
                            <div class="px-3 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10">
                                <span class="text-amber-300 text-sm font-semibold">{task()?.status}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/60">
                            <div class="flex items-start gap-2">
                                <User class="w-4 h-4 text-indigo-400 mt-0.5" />
                                <div>
                                    <div class="text-slate-500 text-xs">{t('warehouseApp.tasks.customer')}</div>
                                    <div class="text-white text-sm">{task()?.customerName || t('warehouseApp.tasks.unknownCustomer')}</div>
                                </div>
                            </div>
                            <div class="flex items-start gap-2">
                                <Calendar class="w-4 h-4 text-emerald-400 mt-0.5" />
                                <div>
                                    <div class="text-slate-500 text-xs">Delivery Date</div>
                                    <div class="text-white text-sm">{formatDate(task()?.requestedDeliveryDate || null)}</div>
                                </div>
                            </div>
                        </div>

                        <Show when={task()?.customerAddress}>
                            <div class="pt-2 border-t border-slate-800/60">
                                <div class="text-slate-500 text-xs mb-1">Address</div>
                                <div class="text-white text-sm">{task()?.customerAddress}</div>
                            </div>
                        </Show>
                    </div>

                    {/* Items List */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <Package class="w-5 h-5 text-emerald-400" />
                            <h2 class="text-white font-semibold">{t('warehouseApp.tasks.items')}</h2>
                        </div>

                        <div class="space-y-3">
                            <For each={task()?.items || []}>
                                {(item) => {
                                    const progress = calculateProgress(item.qtyPicked, item.qtyOrdered);
                                    const isComplete = item.qtyPicked >= item.qtyOrdered;

                                    return (
                                        <div class="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
                                            <div class="flex items-start justify-between mb-2">
                                                <div class="flex-1">
                                                    <div class="text-white font-medium text-sm">{item.productName || t('warehouseApp.tasks.unknownItem')}</div>
                                                </div>
                                                <Show when={isComplete}>
                                                    <CheckCircle2 class="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
                                                </Show>
                                            </div>

                                            <div class="flex items-center justify-between text-xs mb-2">
                                                <span class="text-slate-400">
                                                    {item.qtyPicked} / {item.qtyOrdered} {t('warehouseApp.tasks.picked')}
                                                </span>
                                                <span class={`font-semibold ${isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {progress}%
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div class="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    class={`h-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default TaskDetail;
