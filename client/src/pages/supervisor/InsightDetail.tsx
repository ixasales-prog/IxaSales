import { type Component, Show, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, BarChart3, AlertTriangle, Target, TrendingUp } from 'lucide-solid';
import { api } from '../../lib/api';

interface InsightDetail {
    id: string;
    title: string;
    value: number;
}

const SupervisorInsightDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [insight] = createResource(async () => {
        const result = await api<InsightDetail>(`/supervisor/insights/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Insight Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!insight.loading && insight()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Insight not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-3">
                        <div class="flex items-center gap-2">
                            <Show when={insight()!.id === 'weekly-trend'}>
                                <BarChart3 class="w-5 h-5 text-indigo-400" />
                            </Show>
                            <Show when={insight()!.id === 'target-hit'}>
                                <Target class="w-5 h-5 text-emerald-400" />
                            </Show>
                            <Show when={insight()!.id === 'exceptions'}>
                                <AlertTriangle class="w-5 h-5 text-amber-400" />
                            </Show>
                            <div class="text-white font-semibold text-lg">{insight()!.title}</div>
                        </div>
                        <div class="text-slate-400 text-sm">Value: {insight()!.value.toLocaleString()}</div>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                        <div class="text-slate-400 text-xs uppercase">Recommended Action</div>
                        <div class="text-white font-semibold mt-2">Coach top 3 reps to replicate wins</div>
                        <div class="text-slate-500 text-sm mt-1">Focus on accounts with declining weekly order counts.</div>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                        <div class="flex items-center gap-2 text-slate-400 text-xs">
                            <TrendingUp class="w-4 h-4 text-indigo-400" /> Momentum
                        </div>
                        <div class="text-white text-xl font-semibold mt-2">+8.6%</div>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default SupervisorInsightDetail;
