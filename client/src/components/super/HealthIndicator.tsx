import { type Component, Show } from 'solid-js';
import type { SystemHealth } from '../../types';

interface HealthIndicatorProps {
    health: SystemHealth | undefined;
    loading: boolean;
}

export const HealthIndicator: Component<HealthIndicatorProps> = (props) => {
    const isHealthy = () => props.health?.status === 'healthy';

    const statusStyles = () => {
        if (isHealthy()) {
            return {
                container: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
                dot: 'bg-emerald-500',
                separator: 'bg-emerald-500/20'
            };
        }
        return {
            container: 'bg-red-500/10 border-red-500/20 text-red-400',
            dot: 'bg-red-500',
            separator: 'bg-red-500/20'
        };
    };

    const statusText = () => {
        switch (props.health?.status) {
            case 'healthy':
                return 'All Systems Operational';
            case 'degraded':
                return 'Performance Degraded';
            case 'unhealthy':
                return 'System Issues Detected';
            default:
                return 'Status Unknown';
        }
    };

    return (
        <Show when={!props.loading && props.health}>
            <div class={`flex items-center gap-3 px-4 py-2 rounded-xl border ${statusStyles().container}`}>
                <div class="relative">
                    <div class={`w-2.5 h-2.5 rounded-full ${statusStyles().dot}`}></div>
                    <div class={`absolute inset-0 rounded-full animate-ping opacity-75 ${statusStyles().dot}`}></div>
                </div>
                <span class="font-medium text-sm">{statusText()}</span>
                <div class={`h-4 w-[1px] ${statusStyles().separator} mx-1`}></div>
                <span class="text-xs font-mono opacity-80">{props.health?.database?.latencyMs}ms</span>
            </div>
        </Show>
    );
};

export default HealthIndicator;
