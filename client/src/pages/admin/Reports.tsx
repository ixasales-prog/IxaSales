import { type Component, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Clock4,
  MapPin,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-solid';
import { api } from '../../lib/api';
import { StandardReportLayout } from '../../components/reports/StandardReportLayout';

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
  const [dateRange, setDateRange] = createSignal(30);
  const [threshold, setThreshold] = createSignal(60);

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = createMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dateRange());
    return d.toISOString().split('T')[0];
  });

  const [visitDurationByRep] = createResource(
    () => ({ startDate: startDate() }),
    async ({ startDate: from }) => {
      const result = await api<VisitDurationByRep[]>(`/reports/visit-duration-by-rep?startDate=${from}&endDate=${endDate}`);
      return result || [];
    },
  );

  const [visitDurationTrends] = createResource(
    () => ({ days: dateRange() }),
    async ({ days }) => {
      const result = await api<VisitDurationTrend[]>(`/reports/visit-duration-trends?days=${days}`);
      return result || [];
    },
  );

  const [longVisits] = createResource(
    () => ({ threshold: threshold(), startDate: startDate() }),
    async ({ threshold: minutes, startDate: from }) => {
      const result = await api<LongVisit[]>(`/reports/long-visits?threshold=${minutes}&startDate=${from}&endDate=${endDate}`);
      return result || [];
    },
  );

  const [visitOutcomes] = createResource(
    () => ({ startDate: startDate() }),
    async ({ startDate: from }) => {
      const result = await api<VisitOutcome[]>(`/reports/visit-outcomes?startDate=${from}&endDate=${endDate}`);
      return result || [];
    },
  );

  const formatDuration = (minutes: number) => {
    if (!minutes) return '0m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

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
    <StandardReportLayout
      title="Visit Reports"
      description="Analytics and insights on sales rep visits."
      loading={loading()}
      showFilters
      filterContent={
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <Calendar class="w-5 h-5 text-slate-400" />
            <span class="text-slate-300">Date Range:</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange(7)}
              class={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${dateRange() === 7 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setDateRange(30)}
              class={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${dateRange() === 30 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setDateRange(90)}
              class={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${dateRange() === 90 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Last 90 Days
            </button>
          </div>
        </div>
      }
    >
      <div class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-5">
          <div class="mb-3 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
              <MapPin class="w-5 h-5 text-blue-400" />
            </div>
            <span class="text-sm text-slate-400">Total Visits</span>
          </div>
          <div class="text-2xl font-bold text-white">
            {(visitDurationByRep() || []).reduce((sum, record) => sum + record.totalVisits, 0)}
          </div>
        </div>

        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-5">
          <div class="mb-3 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20">
              <Clock class="w-5 h-5 text-cyan-400" />
            </div>
            <span class="text-sm text-slate-400">Avg Duration</span>
          </div>
          <div class="text-2xl font-bold text-white">
            {formatDuration(
              Math.round(
                (visitDurationByRep() || []).reduce((sum, record) => sum + record.avgDurationMinutes, 0) /
                  Math.max((visitDurationByRep() || []).length, 1),
              ),
            )}
          </div>
        </div>

        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-5">
          <div class="mb-3 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
              <Users class="w-5 h-5 text-violet-400" />
            </div>
            <span class="text-sm text-slate-400">Active Reps</span>
          </div>
          <div class="text-2xl font-bold text-white">{(visitDurationByRep() || []).length}</div>
        </div>

        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-5">
          <div class="mb-3 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
              <AlertCircle class="w-5 h-5 text-orange-400" />
            </div>
            <span class="text-sm text-slate-400">Long Visits</span>
          </div>
          <div class="text-2xl font-bold text-white">{(longVisits() || []).length}</div>
        </div>
      </div>

      <div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-6">
          <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <Clock class="w-5 h-5 text-cyan-400" />
            Visit Duration by Rep
          </h3>
          <div class="space-y-4">
            <For each={visitDurationByRep()}>
              {(rep, index) => {
                const maxDuration = Math.max(...(visitDurationByRep() || []).map((record) => record.avgDurationMinutes), 1);
                const percent = ((rep.avgDurationMinutes || 0) / maxDuration) * 100;
                return (
                  <div>
                    <div class="mb-1.5 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-400">
                          {index() + 1}
                        </span>
                        <span class="text-sm font-medium text-white">{rep.salesRepName || 'Unknown'}</span>
                      </div>
                      <div class="text-right">
                        <span class="text-sm text-slate-400">{formatDuration(rep.avgDurationMinutes || 0)} avg</span>
                        <span class="ml-2 text-xs text-slate-500">({rep.totalVisits} visits)</span>
                      </div>
                    </div>
                    <div class="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div class="mt-1 flex justify-between text-xs text-slate-500">
                      <span>Min: {formatDuration(rep.minDurationMinutes)}</span>
                      <span>Max: {formatDuration(rep.maxDurationMinutes)}</span>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={(visitDurationByRep() || []).length === 0}>
              <div class="py-8 text-center text-slate-500">No visit data available</div>
            </Show>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-6">
          <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <TrendingUp class="w-5 h-5 text-violet-400" />
            Visit Trends
          </h3>
          <div class="max-h-80 space-y-3 overflow-y-auto">
            <For each={visitDurationTrends()}>
              {(trend) => {
                const maxVisits = Math.max(...(visitDurationTrends() || []).map((record) => record.totalVisits), 1);
                const percent = (trend.totalVisits / maxVisits) * 100;
                return (
                  <div class="flex items-center gap-3">
                    <div class="w-16 text-right text-xs text-slate-400">
                      {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div class="flex-1">
                      <div class="mb-1 flex items-center gap-2">
                        <div
                          class="h-5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                        <div class="min-w-[60px] text-sm font-semibold text-white">{trend.totalVisits} visits</div>
                      </div>
                      <div class="ml-2 text-xs text-slate-500">Avg: {formatDuration(trend.avgDurationMinutes || 0)}</div>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={(visitDurationTrends() || []).length === 0}>
              <div class="py-8 text-center text-slate-500">No trend data available</div>
            </Show>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-6">
          <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <BarChart3 class="w-5 h-5 text-emerald-400" />
            Visit Outcomes
          </h3>
          <div class="space-y-3">
            <For each={visitOutcomes()}>
              {(outcome) => {
                const style = getOutcomeStyle(outcome.outcome);
                const totalCount = (visitOutcomes() || []).reduce((sum, record) => sum + record.count, 0);
                const percent = totalCount > 0 ? (outcome.count / totalCount) * 100 : 0;
                return (
                  <div class="flex items-center gap-3">
                    <div class={`flex h-10 w-10 items-center justify-center rounded-xl ${style.color}`}>
                      <style.icon class="w-5 h-5" />
                    </div>
                    <div class="flex-1">
                      <div class="mb-1 flex items-center justify-between">
                        <span class="text-sm font-medium text-white">{style.label}</span>
                        <span class="text-sm text-slate-400">{outcome.count} visits</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          class={`h-full rounded-full transition-all duration-500 ${style.color.split(' ')[0].replace('text-', 'bg-')}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div class="mt-1 text-xs text-slate-500">Avg duration: {formatDuration(outcome.avgDurationMinutes || 0)}</div>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={(visitOutcomes() || []).length === 0}>
              <div class="py-8 text-center text-slate-500">No outcome data available</div>
            </Show>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-800/50 bg-slate-900/60 p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-lg font-semibold text-white">
              <AlertCircle class="w-5 h-5 text-orange-400" />
              Long Visits (&gt;{threshold()}m)
            </h3>
            <select
              value={threshold()}
              onChange={(e) => setThreshold(parseInt(e.currentTarget.value, 10))}
              class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-white"
            >
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
            </select>
          </div>
          <div class="max-h-80 space-y-3 overflow-y-auto">
            <For each={longVisits()}>
              {(visit) => (
                <div class="rounded-xl bg-slate-800/50 p-3">
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-sm font-medium text-white">{visit.customerName}</span>
                    <span class="text-sm font-bold text-orange-400">{formatDuration(visit.durationMinutes)}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>{visit.salesRepName}</span>
                    <span>{new Date(visit.plannedDate).toLocaleDateString()}</span>
                  </div>
                  <div class="mt-2">
                    {(() => {
                      const style = getOutcomeStyle(visit.outcome);
                      return (
                        <span class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${style.color}`}>
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
              <div class="py-8 text-center text-slate-500">No long visits found</div>
            </Show>
          </div>
        </div>
      </div>
    </StandardReportLayout>
  );
};

export default Reports;
