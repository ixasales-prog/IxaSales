import { type Component, For, Show } from 'solid-js';
import { ArrowRight } from 'lucide-solid';
import { A } from '@solidjs/router';
import type { Tenant } from '../../types';
import { formatDate } from '../../stores/settings';

interface RecentTenantsProps {
    tenants: Tenant[];
}

export const RecentTenants: Component<RecentTenantsProps> = (props) => {
    const getInitials = (name: string): string => {
        return (name || '??').substring(0, 2).toUpperCase();
    };

    // Using shared formatDate from settings store

    return (
        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-white">Recent Tenants</h3>
                <A href="/super/tenants" class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    View All <ArrowRight class="w-3 h-3" />
                </A>
            </div>
            <div class="space-y-3">
                <For each={props.tenants}>
                    {(tenant) => (
                        <div class="p-3 bg-slate-800/50 rounded-xl flex items-center justify-between hover:bg-slate-800 transition-colors">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                                    {getInitials(tenant.name)}
                                </div>
                                <div>
                                    <div class="text-white font-medium text-sm">{tenant.name}</div>
                                    <div class="text-slate-500 text-xs">{tenant.subdomain}.ixasales.com</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class={`px-2 py-0.5 rounded text-xs inline-block mb-1 ${tenant.isActive
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : 'text-slate-400 bg-slate-700/50'
                                    }`}>
                                    {tenant.plan}
                                </div>
                                <div class="text-slate-500 text-xs">{formatDate(tenant.createdAt)}</div>
                            </div>
                        </div>
                    )}
                </For>
                <Show when={props.tenants.length === 0}>
                    <div class="text-center py-8 text-slate-500">No tenants found</div>
                </Show>
            </div>
        </div>
    );
};

export default RecentTenants;
