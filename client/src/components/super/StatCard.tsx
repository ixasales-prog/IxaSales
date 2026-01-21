import { type Component } from 'solid-js';

interface StatCardProps {
    label: string;
    value: string;
    icon: Component<{ class?: string }>;
    color: string;
}

export const StatCard: Component<StatCardProps> = (props) => {
    return (
        <div class="relative overflow-hidden bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 hover:border-slate-700/50 transition-colors">
            <div class="flex items-start justify-between mb-4">
                <div class={`w-12 h-12 rounded-xl bg-gradient-to-br ${props.color} flex items-center justify-center shadow-lg`}>
                    <props.icon class="w-6 h-6 text-white" />
                </div>
            </div>
            <div class="text-2xl lg:text-3xl font-bold text-white mb-1">{props.value}</div>
            <div class="text-slate-400 text-sm">{props.label}</div>
        </div>
    );
};

export default StatCard;
