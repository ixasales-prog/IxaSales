import { type Component, createResource, createSignal, Show, For, Switch, Match, createEffect } from 'solid-js';
import { api } from '../../lib/api';
import { formatDate } from '../../stores/settings';
import {
    ShieldAlert,
    Loader2,
    Calendar,
    User,
    Building,
    Monitor,
    LayoutGrid,
    Table as TableIcon,
    List,
    ChevronLeft,
    ChevronRight
} from 'lucide-solid';

interface AuditLog {
    id: string;
    action: string;
    details: string | null;
    createdAt: string;
    ipAddress: string | null;
    user: {
        name: string;
        email: string;
        role: string;
    } | null;
    tenant: {
        name: string;
    } | null;
}

const AuditLogs: Component = () => {
    const [page, setPage] = createSignal(0);
    const storedView = localStorage.getItem('audit_logs_view_mode') as 'grid' | 'table' | 'list' | null;
    const [viewMode, setViewMode] = createSignal<'grid' | 'table' | 'list'>(storedView || 'table');

    createEffect(() => {
        localStorage.setItem('audit_logs_view_mode', viewMode());
    });
    const limit = 50;

    const [logs] = createResource(page, async (p) => {
        const result = await api<AuditLog[]>(`/super/audit-logs?limit=${limit}&offset=${p * limit}`);
        return result;
    });

    // formatDate is now imported from settings store

    const getActionColor = (action: string) => {
        if (action.includes('delete') || action.includes('suspend') || action.includes('fail')) return 'text-red-400';
        if (action.includes('update') || action.includes('edit')) return 'text-amber-400';
        if (action.includes('create') || action.includes('add')) return 'text-emerald-400';
        return 'text-blue-400';
    };

    return (
        <div class="p-6 lg:p-8">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <ShieldAlert class="w-8 h-8 text-blue-500" />
                        Global Audit Logs
                    </h1>
                    <p class="text-slate-400">Security trail of all critical system actions</p>
                </div>

                <div class="flex items-center gap-4">
                    {/* View Toggle */}
                    <div class="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Grid View"
                        >
                            <LayoutGrid class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Table View"
                        >
                            <TableIcon class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'list' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="List View"
                        >
                            <List class="w-5 h-5" />
                        </button>
                    </div>

                    <div class="flex gap-2">
                        <button
                            disabled={page() === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft class="w-5 h-5" />
                        </button>
                        <button
                            disabled={logs() && logs()!.length < limit}
                            onClick={() => setPage(p => p + 1)}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronRight class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <Switch>
                {/* Grid View */}
                <Match when={viewMode() === 'grid'}>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <For each={logs()}>
                            {(log) => (
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 hover:border-slate-700/50 transition-all group">
                                    <div class="flex items-start justify-between mb-4">
                                        <div class={`px-3 py-1 rounded-full text-xs font-semibold border ${log.action.includes('delete') || log.action.includes('fail') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            log.action.includes('update') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                log.action.includes('create') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                            }`}>
                                            {log.action}
                                        </div>
                                        <div class="text-xs text-slate-500 flex items-center gap-1.5">
                                            <Calendar class="w-3.5 h-3.5" />
                                            {formatDate(log.createdAt)}
                                        </div>
                                    </div>

                                    <div class="text-slate-300 text-sm mb-4 line-clamp-3 min-h-[3rem]">
                                        {log.details || 'No details provided'}
                                    </div>

                                    <div class="flex flex-col gap-2 pt-4 border-t border-slate-800/50">
                                        <div class="flex items-center justify-between text-xs">
                                            <div class="flex items-center gap-2 text-slate-400">
                                                <User class="w-3.5 h-3.5" />
                                                <span class="truncate max-w-[120px]">{log.user?.email || 'System'}</span>
                                            </div>
                                            <div class="flex items-center gap-2 text-slate-500">
                                                <Monitor class="w-3.5 h-3.5" />
                                                <span>{log.ipAddress || 'Internal'}</span>
                                            </div>
                                        </div>
                                        <Show when={log.tenant}>
                                            <div class="flex items-center gap-2 text-xs text-slate-400">
                                                <Building class="w-3.5 h-3.5" />
                                                <span class="truncate">{log.tenant?.name}</span>
                                            </div>
                                        </Show>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </Match>
                {/* Table View */}
                <Match when={viewMode() === 'table'}>
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="border-b border-slate-800 bg-slate-950/50">
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actor</th>
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant</th>
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Details</th>
                                        <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">IP / Method</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800">
                                    <Show when={!logs.loading} fallback={
                                        <tr>
                                            <td colspan="6" class="p-8 text-center">
                                                <Loader2 class="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                                            </td>
                                        </tr>
                                    }>
                                        <For each={logs()}>
                                            {(log) => (
                                                <tr class="hover:bg-slate-800/30 transition-colors group">
                                                    <td class="p-4 text-slate-400 text-sm whitespace-nowrap">
                                                        <div class="flex items-center gap-2">
                                                            <Calendar class="w-3.5 h-3.5" />
                                                            {formatDate(log.createdAt)}
                                                        </div>
                                                    </td>
                                                    <td class="p-4">
                                                        <div class="flex items-center gap-3">
                                                            <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                                                                <User class="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <div class="text-white font-medium text-sm">{log.user?.name || 'System'}</div>
                                                                <div class="text-slate-500 text-xs">{log.user?.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="p-4">
                                                        <span class={`font-mono text-sm font-medium px-2 py-1 rounded bg-slate-950 border border-slate-800 ${getActionColor(log.action)}`}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td class="p-4 text-slate-400 text-sm">
                                                        <Show when={log.tenant} fallback={<span class="text-slate-600 italic">Global</span>}>
                                                            <div class="flex items-center gap-2">
                                                                <Building class="w-3.5 h-3.5" />
                                                                {log.tenant?.name}
                                                            </div>
                                                        </Show>
                                                    </td>
                                                    <td class="p-4">
                                                        <div class="text-slate-300 text-sm font-mono truncate max-w-[200px]" title={log.details || ''}>
                                                            {log.details || '-'}
                                                        </div>
                                                    </td>
                                                    <td class="p-4 text-slate-500 text-xs font-mono">
                                                        <div class="flex items-center gap-2">
                                                            <Monitor class="w-3.5 h-3.5" />
                                                            {log.ipAddress || 'Internal'}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                        <Show when={logs()?.length === 0}>
                                            <tr>
                                                <td colspan="6" class="p-12 text-center text-slate-500">
                                                    No audit logs found.
                                                </td>
                                            </tr>
                                        </Show>
                                    </Show>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Match>

                {/* List View (Compact) */}
                <Match when={viewMode() === 'list'}>
                    <div class="space-y-2">
                        <For each={logs()}>
                            {(log) => (
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-lg p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-4 group">
                                    {/* Action Icon/Color */}
                                    <div class={`w-1.5 h-10 rounded-full ${log.action.includes('delete') || log.action.includes('fail') ? 'bg-red-500' :
                                        log.action.includes('update') ? 'bg-amber-500' :
                                            log.action.includes('create') ? 'bg-emerald-500' :
                                                'bg-blue-500'
                                        }`} />

                                    <div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                        {/* Action & Time */}
                                        <div class="col-span-3">
                                            <div class="font-medium text-white truncate">{log.action}</div>
                                            <div class="text-xs text-slate-500 flex items-center gap-1.5">
                                                <Calendar class="w-3 h-3" />
                                                {formatDate(log.createdAt)}
                                            </div>
                                        </div>

                                        {/* User */}
                                        <div class="col-span-3 flex items-center gap-2">
                                            <div class="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                                                <User class="w-3 h-3" />
                                            </div>
                                            <div class="truncate text-sm text-slate-300">{log.user?.email || 'System'}</div>
                                        </div>

                                        {/* Details */}
                                        <div class="col-span-4 text-sm text-slate-400 truncate">
                                            {log.details || '-'}
                                        </div>

                                        {/* Meta */}
                                        <div class="col-span-2 flex justify-end gap-2">
                                            <Show when={log.tenant}>
                                                <span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 truncate max-w-[80px]">
                                                    {log.tenant?.name}
                                                </span>
                                            </Show>
                                            <span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700 font-mono">
                                                {log.ipAddress || 'Internal'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </Match>
            </Switch>
        </div>
    );
};

export default AuditLogs;
