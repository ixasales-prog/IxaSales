import { type Component, Show, createResource } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { ArrowLeft, MapPin, Clock, CheckCircle2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDateTime } from '../../stores/settings';
import { useI18n } from '../../i18n';

interface VisitDetail {
    id: string;
    customerName: string;
    customerAddress: string | null;
    status: string;
    plannedDate: string | null;
    plannedTime: string | null;
    startedAt: string | null;
    completedAt: string | null;
    outcome: string | null;
    notes: string | null;
}

const statusBadge = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/20';
        case 'in_progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        case 'planned': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
};

const VisitDetailPage: Component = () => {
    const { t } = useI18n();
    const params = useParams<{ id: string }>();

    // Helper to shorten UUID for display
    const shortenId = (id: string) => {
        if (!id || id.length < 8) return id;
        return `${id.slice(0, 8)}...`;
    };

    // Helper to get translated outcome
    const getOutcomeLabel = (outcome: string | null) => {
        if (!outcome) return '—';
        switch (outcome) {
            case 'order_placed': return t('salesApp.visits.outcomeOrderPlaced');
            case 'no_order': return t('salesApp.visits.outcomeNoOrder');
            case 'follow_up': return t('salesApp.visits.outcomeFollowUp');
            default: return outcome;
        }
    };

    // Helper to get translated status
    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return t('salesApp.visits.completed');
            case 'in_progress': return t('salesApp.visits.inProgress');
            case 'planned': return t('salesApp.visits.planned');
            case 'cancelled': return t('salesApp.visits.cancelled');
            default: return status;
        }
    };

    // Helper to format planned date and time
    const formatPlannedDateTime = (visit: VisitDetail) => {
        if (!visit.plannedDate) return '—';
        if (!visit.plannedTime) return visit.plannedDate;
        // Combine date and time into a single datetime string
        const dateTimeStr = `${visit.plannedDate}T${visit.plannedTime}`;
        return formatDateTime(dateTimeStr);
    };

    const [visit] = createResource(
        () => params.id,
        async (id) => {
            if (!id) return null;
            try {
                const res = await api.get(`/visits/${id}`);
                return (res as any)?.data || res || null;
            } catch (_e) {
                return null;
            }
        }
    );

    return (
        <div class="min-h-screen pb-safe">
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center gap-3 px-4 py-3">
                    <A href="/sales/visits" class="p-2 -ml-2 text-slate-400 hover:text-white">
                        <ArrowLeft class="w-5 h-5" />
                    </A>
                    <div>
                        <h1 class="text-lg font-bold text-white">{t('salesApp.visits.title')}</h1>
                        <p class="text-slate-500 text-xs" title={params.id}>{shortenId(params.id)}</p>
                    </div>
                </div>
            </div>

            <div class="px-4 pt-4">
                <Show when={!visit.loading && visit()} fallback={
                    <div class="text-center py-12 text-slate-400">{t('salesApp.visits.noVisits')}</div>
                }>
                    {(detail: () => VisitDetail) => (
                        <div class="space-y-4">
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <div class="text-white font-semibold">{detail().customerName}</div>
                                        <Show when={detail().customerAddress}>
                                            <div class="text-slate-500 text-sm flex items-center gap-2 mt-1">
                                                <MapPin class="w-4 h-4" /> {detail().customerAddress}
                                            </div>
                                        </Show>
                                    </div>
                                    <span class={`px-2 py-1 rounded-full text-xs font-medium border ${statusBadge(detail().status)}`}>
                                        {getStatusLabel(detail().status)}
                                    </span>
                                </div>
                            </div>

                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 space-y-3 text-sm text-slate-300">
                                <div class="flex items-center gap-2">
                                    <Clock class="w-4 h-4 text-blue-400" /> {t('salesApp.visits.planned')}: {formatPlannedDateTime(detail())}
                                </div>
                                <div class="flex items-center gap-2">
                                    <CheckCircle2 class="w-4 h-4 text-emerald-400" /> {t('salesApp.visits.started')}: {detail().startedAt ? formatDateTime(detail().startedAt) : '—'}
                                </div>
                                <div class="flex items-center gap-2">
                                    <CheckCircle2 class="w-4 h-4 text-emerald-400" /> {t('salesApp.visits.completed')}: {detail().completedAt ? formatDateTime(detail().completedAt) : '—'}
                                </div>
                            </div>

                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                <div class="text-slate-400 text-sm">{t('salesApp.visits.outcome')}</div>
                                <div class="text-white font-medium mt-1">{getOutcomeLabel(detail().outcome)}</div>
                            </div>

                            <Show when={detail().notes}>
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                    <div class="text-slate-400 text-sm">{t('salesApp.visits.notes')}</div>
                                    <div class="text-slate-300 text-sm mt-1">{detail().notes}</div>
                                </div>
                            </Show>
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
};

export default VisitDetailPage;
