import { type Component, For, Show, createResource, createSignal, createMemo } from 'solid-js';
import {
    Clock,
    MapPin,
    TrendingUp,
    Users,
    Calendar,
    Loader2,
    BarChart3,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Clock4
} from 'lucide-solid';
import { api } from '../../lib/api';

interface VisitDurationByRep {
    salesRepId: string;
    salesRepName: string;
    totalVisits: number;
    avgDurationMinutes: number;
    minDurationMinutes: number;
    maxDurationMinutes: number;
    totalDurationMinutes: number;
}

interface VisitDurationTrend {
    date: string;
    totalVisits: number;
    avgDurationMinutes: number;
}

interface LongVisit {
    visitId: string;
    customerName: string;
    salesRepName: string;
    plannedDate: string;
    startedAt: string;
    completedAt: string;
    durationMinutes: number;
    outcome: string;
}

interface VisitOutcome {
    outcome: string;
    count: number;
    avgDurationMinutes: number;
}

const Reports: Component = () => {
    const [dateRange, setDateRange] = createSignal(30); // days
    const [threshold, setThreshold] = createSignal(60); // minutes for long visits

    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = createMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - dateRange());
        return d.toISOString().split('T')[0];
    });

    // Fetch visit duration by rep
    const [visitDurationByRep] = createResource(
        () => ({ startDate: startDate() }),
        async ({ startDate }) => {
            const result = await api<VisitDurationByRep[]>(`/reports/visit-duration-by-rep?startDate=${startDate}&endDate=${endDate}`);
            return result || [];
        }
    );

    // Fetch visit duration trends
    const [visitDurationTrends] = createResource(
        () => ({ days: dateRange() }),
        async ({ days }) => {
            const result = await api<VisitDurationTrend[]>(`/reports/visit-duration-trends?days=${days}`);
            return result || [];
        }
    );

    // Fetch long visits
    const [longVisits] = createResource(
        () => ({ threshold: threshold(), startDate: startDate() }),
        async ({ threshold, startDate }) => {
            const result = await api<LongVisit[]>(`/reports/long-visits?threshold=${threshold}&startDate=${startDate}&endDate=${endDate}`);
            return result || [];
        }
    );

    // Fetch visit outcomes
    const [visitOutcomes] = createResource(
        () => ({ startDate: startDate() }),
        async ({ startDate }) => {
            const result = await api<VisitOutcome[]>(`/reports/visit-outcomes?startDate=${startDate}&endDate=${endDate}`);
            return result || [];
        }
    );

    // Format minutes to readable duration
    const formatDuration = (minutes: number) => {
        if (!minutes || minutes === 0) return '0m';
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    // Get outcome icon and color
    const getOutcomeStyle = (outcome: string) => {
        switch (outcome) {
            case 'order_placed':
                return { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10', label: 'Order Placed' };
            case 'no_order':
                return { icon: XCircle, color: 'text-orange-400 bg-orange-500/10', label: 'No Order' };
            case 'follow_up':
                return { icon: Clock4, color: 'text-blue-400 bg-blue-500/10', label: 'Follow Up' };
            default:
                return { icon: Clock, color: 'text-slate-400 bg-slate-500/10', label: outcome || 'Unknown' };
        }
    };

    const loading = () => visitDurationByRep.loading || visitDurationTrends.loading || longVisits.loading || visitOutcomes.loading;

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="mb-8">
                <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Visit Reports</h1>
                <p class="text-slate-400">Analytics and insights on sales rep visits.</p>
            </div>

            {/* Date Range Selector */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 mb-8">
                <div class="flex flex-wrap items-center gap-4">
                    <div class="flex items-center gap-2">
                        <Calendar class="w-5 h-5 text-slate-400" />
                        <span class="text-slate-300">Date Range:</span>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onClick={() => setDateRange(7)}
                            class={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${dateRange() === 7 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            Last 7 Days
                        </button>
                        <button
                            onClick={() => setDateRange(30)}
                            class={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${dateRange() === 30 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            Last 30 Days
                        </button>
                        <button
                            onClick={() => setDateRange(90)}
                            class={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${dateRange() === 90 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            Last 90 Days
                        </button>
                    </div>
                </div>
            </div>

            {/* Loading */}
            <Show when={loading()}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            <Show when={!loading()}>
                {/* Summary Stats */}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                <MapPin class="w-5 h-5 text-blue-400" />
                            </div>
                            <span class="text-slate-400 text-sm">Total Visits</span>
                        </div>
                        <div class="text-2xl font-bold text-white">
                            {(visitDurationByRep() || []).reduce((sum, r) => sum + r.totalVisits, 0)}
                        </div>
                    </div>

                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                <Clock class="w-5 h-5 text-cyan-400" />
                            </div>
                            <span class="text-slate-400 text-sm">Avg Duration</span>
                        </div>
                        <div class="text-2xl font-bold text-white">
                            {formatDuration(
                                Math.round(
                                    (visitDurationByRep() || []).reduce((sum, r) => sum + r.avgDurationMinutes, 0) /
                                    Math.max((visitDurationByRep() || []).length, 1)
                                )
                            )}
                        </div>
                    </div>

                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                <Users class="w-5 h-5 text-violet-400" />
                            </div>
                            <span class="text-slate-400 text-sm">Active Reps</span>
                        </div>
                        <div class="text-2xl font-bold text-white">
                            {(visitDurationByRep() || []).length}
                        </div>
                    </div>

                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                <AlertCircle class="w-5 h-5 text-orange-400" />
                            </div>
                            <span class="text-slate-400 text-sm">Long Visits</span>
                        </div>
                        <div class="text-2xl font-bold text-white">
                            {(longVisits() || []).length}
                        </div>
                    </div>
                </div>

                {/* Charts Row */}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Visit Duration by Rep */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Clock class="w-5 h-5 text-cyan-400" />
                            Visit Duration by Rep
                        </h3>
                        <div class="space-y-4">
                            <For each={visitDurationByRep()}>
                                {(rep, index) => {
                                    const maxDuration = Math.max(...(visitDurationByRep() || []).map(r => r.avgDurationMinutes), 1);
                                    const percent = ((rep.avgDurationMinutes || 0) / maxDuration) * 100;
                                    return (
                                        <div>
                                            <div class="flex items-center justify-between mb-1.5">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">
                                                        {index() + 1}
                                                    </span>
                                                    <span class="text-white font-medium text-sm">{rep.salesRepName || 'Unknown'}</span>
                                                </div>
                                                <div class="text-right">
                                                    <span class="text-slate-400 text-sm">{formatDuration(rep.avgDurationMinutes || 0)} avg</span>
                                                    <span class="text-slate-500 text-xs ml-2">({rep.totalVisits} visits)</span>
                                                </div>
                                            </div>
                                            <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <div class="flex justify-between mt-1 text-xs text-slate-500">
                                                <span>Min: {formatDuration(rep.minDurationMinutes)}</span>
                                                <span>Max: {formatDuration(rep.maxDurationMinutes)}</span>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                            <Show when={(visitDurationByRep() || []).length === 0}>
                                <div class="text-center py-8 text-slate-500">No visit data available</div>
                            </Show>
                        </div>
                    </div>

                    {/* Visit Trends */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <TrendingUp class="w-5 h-5 text-violet-400" />
                            Visit Trends
                        </h3>
                        <div class="space-y-3 max-h-80 overflow-y-auto">
                            <For each={visitDurationTrends()}>
                                {(trend) => {
                                    const maxVisits = Math.max(...(visitDurationTrends() || []).map(t => t.totalVisits), 1);
                                    const percent = (trend.totalVisits / maxVisits) * 100;
                                    return (
                                        <div class="flex items-center gap-3">
                                            <div class="w-16 text-xs text-slate-400 text-right">
                                                {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2 mb-1">
                                                    <div
                                                        class="bg-gradient-to-r from-violet-500 to-purple-500 rounded-full h-5 transition-all duration-500"
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                    <div class="text-sm font-semibold text-white min-w-[60px]">
                                                        {trend.totalVisits} visits
                                                    </div>
                                                </div>
                                                <div class="text-xs text-slate-500 ml-2">
                                                    Avg: {formatDuration(trend.avgDurationMinutes || 0)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                            <Show when={(visitDurationTrends() || []).length === 0}>
                                <div class="text-center py-8 text-slate-500">No trend data available</div>
                            </Show>
                        </div>
                    </div>
                </div>

                {/* Outcomes & Long Visits */}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Visit Outcomes */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <BarChart3 class="w-5 h-5 text-emerald-400" />
                            Visit Outcomes
                        </h3>
                        <div class="space-y-3">
                            <For each={visitOutcomes()}>
                                {(outcome) => {
                                    const style = getOutcomeStyle(outcome.outcome);
                                    const totalCount = (visitOutcomes() || []).reduce((sum, o) => sum + o.count, 0);
                                    const percent = totalCount > 0 ? (outcome.count / totalCount) * 100 : 0;
                                    return (
                                        <div class="flex items-center gap-3">
                                            <div class={`w-10 h-10 rounded-xl ${style.color} flex items-center justify-center`}>
                                                <style.icon class="w-5 h-5" />
                                            </div>
                                            <div class="flex-1">
                                                <div class="flex items-center justify-between mb-1">
                                                    <span class="text-white font-medium text-sm">{style.label}</span>
                                                    <span class="text-slate-400 text-sm">{outcome.count} visits</span>
                                                </div>
                                                <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        class={`h-full rounded-full transition-all duration-500 ${style.color.split(' ')[0].replace('text-', 'bg-')}`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <div class="text-xs text-slate-500 mt-1">
                                                    Avg duration: {formatDuration(outcome.avgDurationMinutes || 0)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                            <Show when={(visitOutcomes() || []).length === 0}>
                                <div class="text-center py-8 text-slate-500">No outcome data available</div>
                            </Show>
                        </div>
                    </div>

                    {/* Long Visits */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                                <AlertCircle class="w-5 h-5 text-orange-400" />
                                Long Visits (&gt;{threshold()}m)
                            </h3>
                            <select
                                value={threshold()}
                                onChange={(e) => setThreshold(parseInt(e.currentTarget.value))}
                                class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white"
                            >
                                <option value={30}>30 min</option>
                                <option value={60}>60 min</option>
                                <option value={90}>90 min</option>
                                <option value={120}>120 min</option>
                            </select>
                        </div>
                        <div class="space-y-3 max-h-80 overflow-y-auto">
                            <For each={longVisits()}>
                                {(visit) => (
                                    <div class="bg-slate-800/50 rounded-xl p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-white font-medium text-sm">{visit.customerName}</span>
                                            <span class="text-orange-400 font-bold text-sm">{formatDuration(visit.durationMinutes)}</span>
                                        </div>
                                        <div class="flex items-center justify-between text-xs text-slate-400">
                                            <span>{visit.salesRepName}</span>
                                            <span>{new Date(visit.plannedDate).toLocaleDateString()}</span>
                                        </div>
                                        <div class="mt-2">
                                            {(() => {
                                                const style = getOutcomeStyle(visit.outcome);
                                                return (
                                                    <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${style.color}`}>
                                                        <style.icon class="w-3 h-3" />
                                                        {style.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </For>
                            <Show when={(longVisits() || []).length === 0}>
                                <div class="text-center py-8 text-slate-500">No long visits found</div>
                            </Show>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Reports;
