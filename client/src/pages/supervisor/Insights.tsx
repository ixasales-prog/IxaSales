import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { BarChart3, Target, AlertTriangle, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface InsightItem {
    id: string;
    title: string;
    value: number;
    deltaPercent?: number;
}

const SupervisorInsights: Component = () => {
    const navigate = useNavigate();
    const [insights] = createResource(async () => {
        const result = await api<InsightItem[]>('/supervisor/insights');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <h1 class="text-xl font-bold text-white">Insights</h1>
                <p class="text-slate-500 text-sm">Team performance & trends</p>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={insights.loading}>
                    <div class="flex items-center justify-center py-10">
                        <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                    </div>
                </Show>
                <Show when={!insights.loading && (insights() ?? []).length === 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                        No insights available yet.
                    </div>
                </Show>
                <Show when={!insights.loading && (insights() ?? []).length > 0}>
                    <For each={insights() ?? []}>
                        {(item) => (
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => navigate(`/supervisor/insights/${item.id}`)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        navigate(`/supervisor/insights/${item.id}`);
                                    }
                                }}
                                class={item.id === 'weekly-trend'
                                    ? 'bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80'
                                    : 'bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3 transition hover:border-slate-700/70 hover:bg-slate-900/80'}
                            >
                                <div class={item.id === 'weekly-trend' ? 'flex items-center gap-2 mb-3' : 'flex items-center gap-2 text-slate-400 text-xs'}>
                                    <Show when={item.id === 'weekly-trend'}>
                                        <BarChart3 class="w-5 h-5 text-indigo-400" />
                                        <h2 class="text-white font-semibold">{item.title}</h2>
                                    </Show>
                                    <Show when={item.id === 'target-hit'}>
                                        <Target class="w-4 h-4 text-emerald-400" /> {item.title}
                                    </Show>
                                    <Show when={item.id === 'exceptions'}>
                                        <AlertTriangle class="w-4 h-4 text-amber-400" /> {item.title}
                                    </Show>
                                </div>
                                <Show when={item.id === 'weekly-trend'}>
                                    <div class="text-sm text-slate-400">{item.value.toLocaleString()} · {item.deltaPercent ?? 0}% vs last week</div>
                                </Show>
                                <Show when={item.id !== 'weekly-trend'}>
                                    <div class="text-xl font-semibold text-white mt-2">{item.value}{item.id === 'target-hit' ? '%' : ''}</div>
                                </Show>
                            </div>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default SupervisorInsights;
