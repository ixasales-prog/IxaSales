import { type Component, Show, createResource } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowLeft, Tag, CheckCircle2, XCircle, Clock } from 'lucide-solid';
import { api } from '../../lib/api';

interface ApprovalDetail {
    type: string;
    orderNumber?: string | null;
    customerName?: string | null;
    amount?: string | null;
    status?: string | null;
    reason?: string | null;
    reasonNotes?: string | null;
    createdAt?: string | null;
}

const SupervisorApprovalDetail: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [approval] = createResource(async () => {
        const result = await api<ApprovalDetail>(`/supervisor/approvals/${params.id}`);
        return (result as any)?.data ?? result ?? null;
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    class="flex items-center gap-2 text-slate-300 text-sm"
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft class="w-4 h-4" /> Back
                </button>
                <h1 class="text-xl font-bold text-white mt-2">Approval Detail</h1>
            </div>

            <div class="px-4 pt-4 space-y-4">
                <Show when={!approval.loading && approval()} fallback={
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-slate-400">
                        Approval not found.
                    </div>
                }>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-3">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-white font-semibold text-lg">{approval()!.type}</div>
                                <div class="text-slate-400 text-sm">{approval()!.customerName ?? approval()!.orderNumber ?? 'Unknown customer'}</div>
                            </div>
                            <span class="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                {approval()!.status ?? 'pending'}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-slate-400 text-sm">
                            <Tag class="w-4 h-4" /> {approval()!.amount ?? '--'}
                        </div>
                        <Show when={approval()!.createdAt}>
                            <div class="flex items-center gap-2 text-slate-500 text-xs">
                                <Clock class="w-4 h-4" /> {new Date(approval()!.createdAt!).toLocaleString()}
                            </div>
                        </Show>
                    </div>

                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 space-y-2">
                        <div class="text-slate-400 text-xs uppercase">Requestor</div>
                        <div class="text-white font-semibold">System</div>
                        <div class="text-slate-400 text-sm">{approval()!.reason ?? approval()!.reasonNotes ?? 'Pending review.'}</div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <button class="py-3 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center justify-center gap-2">
                            <CheckCircle2 class="w-4 h-4" /> Approve
                        </button>
                        <button class="py-3 rounded-xl bg-red-600/10 text-red-300 border border-red-500/30 font-semibold flex items-center justify-center gap-2">
                            <XCircle class="w-4 h-4" /> Reject
                        </button>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default SupervisorApprovalDetail;
