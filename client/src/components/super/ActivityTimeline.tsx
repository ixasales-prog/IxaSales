import { type Component, For, Show } from 'solid-js';
import { Clock, ArrowRight } from 'lucide-solid';
import { A } from '@solidjs/router';
import type { AuditLog } from '../../types';

interface ActivityTimelineProps {
    logs: AuditLog[];
}

type ActivityColorScheme = 'red' | 'emerald' | 'blue';

const getActivityColor = (action: string): ActivityColorScheme => {
    if (action.includes('delete') || action.includes('fail')) return 'red';
    if (action.includes('create') || action.includes('add')) return 'emerald';
    return 'blue';
};

const colorStyles: Record<ActivityColorScheme, { bg: string; text: string; dot: string }> = {
    red: {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        dot: 'bg-red-400'
    },
    emerald: {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        dot: 'bg-emerald-400'
    },
    blue: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        dot: 'bg-blue-400'
    }
};

const formatDetails = (details: string | Record<string, unknown>): string => {
    if (typeof details === 'string') return details;

    // Format object details in a user-friendly way
    const entries = Object.entries(details);
    if (entries.length === 0) return '';

    return entries
        .slice(0, 3) // Limit to first 3 entries
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ');
};

const formatActionName = (action: string): string => {
    return action.replace(/[._]/g, ' ').toUpperCase();
};

export const ActivityTimeline: Component<ActivityTimelineProps> = (props) => {
    return (
        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 h-fit">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                    <Clock class="w-5 h-5 text-slate-400" />
                    Recent Activity
                </h3>
                <A href="/super/audit-logs" class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    View All <ArrowRight class="w-3 h-3" />
                </A>
            </div>

            <div class="space-y-4 relative">
                {/* Vertical line for timeline effect */}
                <div class="absolute left-[19px] top-2 bottom-2 w-[1px] bg-slate-800 z-0"></div>

                <For each={props.logs}>
                    {(log) => {
                        const color = getActivityColor(log.action);
                        const styles = colorStyles[color];

                        return (
                            <div class="relative z-10 flex gap-4 group">
                                <div class={`w-10 h-10 rounded-full flex items-center justify-center border-4 border-slate-900 shrink-0 ${styles.bg} ${styles.text}`}>
                                    <div class={`w-2 h-2 rounded-full ${styles.dot}`}></div>
                                </div>
                                <div class="pb-2">
                                    <div class="text-white text-sm font-medium">
                                        {formatActionName(log.action)}
                                    </div>
                                    <div class="text-slate-400 text-xs mt-0.5 line-clamp-2">
                                        {formatDetails(log.details)}
                                    </div>
                                    <div class="flex items-center gap-2 mt-1.5">
                                        <span class="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                            {log.user?.name || 'System'}
                                        </span>
                                        <span class="text-[10px] text-slate-600">
                                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                </For>

                <Show when={props.logs.length === 0}>
                    <div class="text-center py-8 text-slate-500">No recent activity</div>
                </Show>
            </div>
        </div>
    );
};

export default ActivityTimeline;
