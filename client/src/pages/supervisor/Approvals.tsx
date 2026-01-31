import { type Component, For, Show, createResource } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { CheckCircle2, XCircle, Tag, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';

interface ApprovalItem {
    id: string;
    type: string;
    label: string;
    customerName: string | null;
    amount: string | null;
    status: string;
}

const SupervisorApprovals: Component = () => {
    const navigate = useNavigate();
    const [approvals] = createResource(async () => {
        const result = await api<ApprovalItem[]>('/supervisor/approvals');
        return (result as any)?.data ?? result ?? [];
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Approvals</h1>
            <p class="text-slate-500 text-sm">Review discounts, returns, and overrides</p>
        </div>

        <div class="px-4 pt-4 space-y-3">
            <Show when={approvals.loading}>
                <div class="flex items-center justify-center py-10">
                    <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                </div>
            </Show>
            <Show when={!approvals.loading && (approvals() ?? []).length === 0}>
                <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                    All caught up. No approvals waiting.
                </div>
            </Show>
            <Show when={!approvals.loading && (approvals() ?? []).length > 0}>
                <For each={approvals() ?? []}>
                    {(item) => (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/supervisor/approvals/${item.id}`)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/supervisor/approvals/${item.id}`);
                            }
                        }}
                        class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold">{item.type}</div>
                                <div class="text-slate-400 text-sm">{item.customerName ?? 'Unknown customer'}</div>
                            </div>
                            <div class="flex items-center gap-2 text-xs text-slate-400">
                                <Tag class="w-4 h-4" />
                                {item.amount ?? '--'}
                                <span class="px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
                                    {item.status}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-4">
                            <button
                                onClick={(event) => event.stopPropagation()}
                                class="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 class="w-4 h-4" /> Approve
                            </button>
                            <button
                                onClick={(event) => event.stopPropagation()}
                                class="flex-1 py-2 rounded-xl bg-red-600/10 text-red-300 border border-red-500/30 text-sm font-semibold flex items-center justify-center gap-2"
                            >
                                <XCircle class="w-4 h-4" /> Reject
                            </button>
                        </div>
                    </div>
                    )}
                </For>
            </Show>
        </div>
    </div>
    );
};

export default SupervisorApprovals;
