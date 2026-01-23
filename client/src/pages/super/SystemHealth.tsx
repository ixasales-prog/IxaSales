import { type Component, createResource, Show, onCleanup, createSignal, For } from 'solid-js';
import { api } from '../../lib/api';
import {
    Activity,
    Server,
    Database,
    RotateCw
} from 'lucide-solid';

interface HealthData {
    status: string;
    uptime: number;
    timestamp: string;
    database: {
        status: string;
        latencyMs: number;
    };
    memory: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
    };
    system: {
        platform: string;
        arch: string;
        cpus: number;
        freeMem: number;
        totalMem: number;
    };
}

interface MetricsData {
    windowMs: number;
    totalRequests: number;
    error4xx: number;
    error5xx: number;
    slowRequests: number;
    avgResponseMs: number;
    p95ResponseMs: number;
    p99ResponseMs: number;
    topSlowRoutes: {
        path: string;
        count: number;
        avgResponseMs: number;
        p95ResponseMs: number;
    }[];
}

const SystemHealth: Component = () => {
    const [refreshTrigger, setRefreshTrigger] = createSignal(0);

    // Auto-refresh every 30 seconds
    const timer = setInterval(() => setRefreshTrigger(t => t + 1), 30000);
    onCleanup(() => clearInterval(timer));

    const [health] = createResource(refreshTrigger, async () => {
        return await api<HealthData>('/super/health');
    });

    const [metrics] = createResource(refreshTrigger, async () => {
        return await api<MetricsData>('/super/metrics');
    });

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);

        return parts.join(' ') || '< 1m';
    };

    const getStatusColor = (status: string) => {
        return status === 'connected' || status === 'healthy'
            ? 'text-emerald-400'
            : 'text-red-400';
    };

    return (
        <div class="p-6 lg:p-8">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <Activity class="w-8 h-8 text-blue-500" />
                        System Health
                    </h1>
                    <p class="text-slate-400">Real-time infrastructure monitoring</p>
                </div>
                <button
                    onClick={() => setRefreshTrigger(t => t + 1)}
                    class="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Refresh now"
                >
                    <RotateCw class={`w-5 h-5 ${health.loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <Show when={!health.loading || health()} fallback={
                <div class="p-12 flex justify-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            }>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {/* Overall Status */}
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-slate-400 font-medium flex items-center gap-2">
                                <Activity class="w-4 h-4" />
                                API Status
                            </h3>
                            <span class={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${health()?.status === 'healthy'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                                }`}>
                                {health()?.status?.toUpperCase()}
                            </span>
                        </div>
                        <div class="space-y-4">
                            <div class="flex justify-between items-center">
                                <span class="text-slate-500 text-sm">Uptime</span>
                                <span class="text-white font-mono">{formatUptime(health()?.uptime || 0)}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-slate-500 text-sm">Platform</span>
                                <span class="text-slate-300 text-sm">{health()?.system.platform} ({health()?.system.arch})</span>
                            </div>
                        </div>
                    </div>

                    {/* Database */}
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-slate-400 font-medium flex items-center gap-2">
                                <Database class="w-4 h-4" />
                                Database
                            </h3>
                            <span class={`flex items-center gap-1.5 text-sm font-medium ${getStatusColor(health()?.database.status || 'error')}`}>
                                <div class={`w-2 h-2 rounded-full ${health()?.database.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                {health()?.database.status === 'connected' ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                        <div class="space-y-4">
                            <div class="flex justify-between items-center">
                                <span class="text-slate-500 text-sm">Latency</span>
                                <span class="text-white font-mono">{health()?.database.latencyMs}ms</span>
                            </div>
                            <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                    class={`h-full transition-all duration-500 ${health()?.database.latencyMs! > 100 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(100, (health()?.database.latencyMs || 0) / 2)}%` }} // Scale: 200ms = 100%
                                />
                            </div>
                        </div>
                    </div>

                    {/* Server Resources */}
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-slate-400 font-medium flex items-center gap-2">
                                <Server class="w-4 h-4" />
                                Resources
                            </h3>
                            <div class="text-xs text-slate-500 font-mono">
                                {health()?.system.cpus} vCPU
                            </div>
                        </div>
                        <div class="space-y-4">
                            <div>
                                <div class="flex justify-between items-center mb-1.5">
                                    <span class="text-slate-500 text-xs">Memory (RSS)</span>
                                    <span class="text-white text-xs font-mono">{health()?.memory.rss} MB</span>
                                </div>
                                <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        class="bg-blue-500 h-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (health()?.memory.rss! / (health()?.system.totalMem! || 1024)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between items-center mb-1.5">
                                    <span class="text-slate-500 text-xs">System Free</span>
                                    <span class="text-white text-xs font-mono">{health()?.system.freeMem} MB</span>
                                </div>
                                <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        class="bg-purple-500 h-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (health()?.system.freeMem! / (health()?.system.totalMem! || 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <Show when={metrics()}>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-2">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-slate-400 font-medium flex items-center gap-2">
                                    <Activity class="w-4 h-4" />
                                    API Performance (last {Math.round((metrics()?.windowMs || 0) / 60000)}m)
                                </h3>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <div class="text-xs text-slate-500">Requests</div>
                                    <div class="text-white font-semibold">{metrics()?.totalRequests}</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">Slow &gt;1s</div>
                                    <div class="text-white font-semibold">{metrics()?.slowRequests}</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">4xx</div>
                                    <div class="text-white font-semibold">{metrics()?.error4xx}</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">5xx</div>
                                    <div class="text-white font-semibold">{metrics()?.error5xx}</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">Avg</div>
                                    <div class="text-white font-semibold">{metrics()?.avgResponseMs} ms</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">P95</div>
                                    <div class="text-white font-semibold">{metrics()?.p95ResponseMs} ms</div>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500">P99</div>
                                    <div class="text-white font-semibold">{metrics()?.p99ResponseMs} ms</div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <div class="text-slate-400 font-medium mb-4">Slowest Routes</div>
                            <Show when={metrics()?.topSlowRoutes?.length} fallback={
                                <div class="text-slate-500 text-sm">No data</div>
                            }>
                                <div class="space-y-3">
                                    <For each={metrics()?.topSlowRoutes || []}>
                                        {(route) => (
                                            <div class="flex items-center justify-between">
                                                <div class="text-slate-300 text-sm truncate max-w-[70%]">{route.path}</div>
                                                <div class="text-slate-400 text-xs font-mono">{route.avgResponseMs} ms</div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    </div>
                </Show>
            </Show>
        </div>
    );
};

export default SystemHealth;
