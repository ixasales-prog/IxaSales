import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Phone, MapPin, TrendingUp, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface TeamMember {
    id: string;
    name: string;
    phone: string | null;
    isActive: boolean;
}

const SupervisorTeam: Component = () => {
    const navigate = useNavigate();
    const [team] = createResource(async () => {
        const result = await api<TeamMember[]>('/supervisor/team');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Team</h1>
            <p class="text-slate-500 text-sm">Live activity and quick actions</p>
        </div>

        <div class="px-4 pt-4 space-y-3">
            <Show when={team.loading}>
                <div class="flex items-center justify-center py-10">
                    <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
            </Show>
            <Show when={!team.loading && (team() ?? []).length === 0}>
                <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                    No reps assigned yet.
                </div>
            </Show>
            <Show when={!team.loading && (team() ?? []).length > 0}>
                <For each={team() ?? []}>
                    {(rep) => (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/supervisor/team/${rep.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/supervisor/team/${rep.id}`);
                            }
                        }}
                        class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold">{rep.name}</div>
                                <div class="text-slate-400 text-sm">{rep.phone ?? 'No phone on file'}</div>
                            </div>
                            <span class={`text-xs px-2 py-1 rounded-full border ${rep.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                                {rep.isActive ? 'active' : 'inactive'}
                            </span>
                        </div>
                        <div class="flex items-center justify-between mt-3 text-sm">
                            <div class="flex items-center gap-2 text-slate-400">
                                <TrendingUp class="w-4 h-4 text-indigo-400" /> Live performance
                            </div>
                            <div class="flex items-center gap-3">
                                <button
                                    onClick={(event) => event.stopPropagation()}
                                    class="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center"
                                >
                                    <Phone class="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(event) => event.stopPropagation()}
                                    class="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center"
                                >
                                    <MapPin class="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                    )}
                </For>
            </Show>
        </div>
    </div>
    );
};

export default SupervisorTeam;
