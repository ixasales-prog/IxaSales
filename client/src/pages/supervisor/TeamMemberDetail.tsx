import { type Component, Show, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, Phone, MapPin, TrendingUp, Calendar } from 'lucide-solid';
import { api } from '../../lib/api';

interface TeamMemberDetail {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    orderCount: number;
    orderTotal: number;
    createdAt: string;
}

const SupervisorTeamMemberDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [rep] = createResource(async () => {
        const result = await api<TeamMemberDetail>(`/supervisor/team/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button class="flex items-center gap-2 text-slate-300 text-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Team Member</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!rep.loading && rep()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Team member not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                        <div class="text-white text-lg font-semibold">{rep()!.name}</div>
                        <div class="text-slate-400 text-sm">{rep()!.email}</div>
                        <span class={`inline-flex mt-3 text-xs px-2 py-1 rounded-full ${rep()!.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                            {rep()!.isActive ? 'active' : 'inactive'}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <TrendingUp class="w-4 h-4 text-indigo-400" /> Weekly Sales
                            </div>
                            <div class="text-white text-xl font-semibold mt-2">{rep()!.orderTotal.toLocaleString()}</div>
                        </div>
                        <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                            <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <Calendar class="w-4 h-4 text-amber-400" /> Last Visit
                            </div>
                            <div class="text-white text-sm font-semibold mt-2">{new Date(rep()!.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-3">
                        <div class="text-slate-400 text-xs uppercase">Contact</div>
                        <div class="flex items-center justify-between">
                            <div class="text-white font-semibold">{rep()!.phone ?? 'No phone'}</div>
                            <a href={`tel:${rep()!.phone ?? ''}`} class="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm flex items-center gap-2">
                                <Phone class="w-4 h-4" /> Call
                            </a>
                        </div>
                        <button class="w-full py-2 rounded-xl bg-slate-800 text-slate-200 text-sm flex items-center justify-center gap-2">
                            <MapPin class="w-4 h-4" /> View Route
                        </button>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default SupervisorTeamMemberDetail;
