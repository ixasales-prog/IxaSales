import { type Component, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import {
    Settings, Bell, MessageCircle, Users, Building2,
    ChevronRight, Shield, Globe, CreditCard, DollarSign, Lock, MapPin
} from 'lucide-solid';
import { api } from '../../lib/api';

interface TenantInfo {
    name: string;
    plan: string;
    planStatus: string;
    telegramEnabled: boolean;
    currency: string;
    usage?: {
        users: { current: number; max: number };
        products: { current: number; max: number };
    };
}

const AdminSettings: Component = () => {
    const [tenantData] = createResource(async () => {
        try {
            // api() helper already unwraps { success, data } and returns the data directly
            const result = await api<TenantInfo>('/tenant/profile');
            return result;
        } catch {
            return null;
        }
    });

    const settingSections = [
        {
            title: 'Company',
            items: [
                {
                    icon: Building2,
                    title: 'Company Profile',
                    description: 'Name, logo, address, and contact info',
                    href: '/admin/company-profile',
                    color: 'blue',
                },
                {
                    icon: DollarSign,
                    title: 'Business Settings',
                    description: 'Currency, tax rates, and document numbering',
                    href: '/admin/business-settings',
                    color: 'emerald',
                },
            ]
        },
        {
            title: 'Notifications',
            items: [
                {
                    icon: Bell,
                    title: 'Notification Preferences',
                    description: 'Configure which alerts you receive',
                    href: '/admin/notification-settings',
                    color: 'amber',
                },
                {
                    icon: MessageCircle,
                    title: 'Telegram Bot',
                    description: 'Set up customer notification bot',
                    href: '/admin/telegram',
                    color: 'purple',
                },
            ]
        },
        {
            title: 'Team & Security',
            items: [
                {
                    icon: Users,
                    title: 'User Management',
                    description: 'Manage team members and roles',
                    href: '/admin/users',
                    color: 'indigo',
                },
                {
                    icon: MapPin,
                    title: 'GPS Tracking',
                    description: 'Configure location tracking for sales reps and drivers',
                    href: '/admin/gps-tracking',
                    color: 'green',
                },
                {
                    icon: Lock,
                    title: 'Security',
                    description: 'Password and access settings',
                    href: '/admin/security',
                    color: 'red',
                    comingSoon: true,
                },
            ]
        },
        {
            title: 'Billing',
            items: [
                {
                    icon: CreditCard,
                    title: 'Subscription & Usage',
                    description: 'View your plan and usage statistics',
                    href: '/admin/subscription',
                    color: 'pink',
                },
            ]
        },
    ];

    const colorClasses: Record<string, { bg: string; text: string }> = {
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
        indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
        red: { bg: 'bg-red-500/10', text: 'text-red-400' },
        pink: { bg: 'bg-pink-500/10', text: 'text-pink-400' },
        green: { bg: 'bg-green-500/10', text: 'text-green-400' },
    };

    return (
        <div class="p-6 lg:p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div class="mb-8">
                <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Settings class="w-5 h-5 text-white" />
                    </div>
                    Settings
                </h1>
                <p class="text-slate-400 mt-2">Manage your tenant configuration and preferences</p>
            </div>

            {/* Tenant Info Card */}
            <Show when={tenantData()}>
                {(data) => (
                    <div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-8">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                                    <Building2 class="w-7 h-7 text-blue-400" />
                                </div>
                                <div>
                                    <h2 class="text-lg font-semibold text-white">
                                        {data()?.name || 'Your Company'}
                                    </h2>
                                    <div class="flex items-center gap-4 mt-1">
                                        <span class="text-sm text-slate-400 flex items-center gap-1.5">
                                            <Globe class="w-4 h-4" />
                                            {data()?.currency || 'USD'}
                                        </span>
                                        <Show when={data()?.telegramEnabled}>
                                            <span class="text-sm text-emerald-400 flex items-center gap-1.5">
                                                <MessageCircle class="w-4 h-4" />
                                                Telegram Active
                                            </span>
                                        </Show>
                                    </div>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class={`px-3 py-1 rounded-full text-xs font-medium capitalize ${data()?.planStatus === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                    {data()?.plan || 'Free'} Plan
                                </span>
                            </div>
                        </div>

                        {/* Quick Usage Stats */}
                        <Show when={data()?.usage}>
                            <div class="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4">
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-slate-400">Users</span>
                                    <span class="text-white">
                                        {data()?.usage?.users.current || 0} / {data()?.usage?.users.max || 5}
                                    </span>
                                </div>
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-slate-400">Products</span>
                                    <span class="text-white">
                                        {data()?.usage?.products.current || 0} / {data()?.usage?.products.max || 100}
                                    </span>
                                </div>
                            </div>
                        </Show>
                    </div>
                )}
            </Show>

            {/* Settings Sections */}
            <div class="space-y-8">
                <For each={settingSections}>
                    {(section) => (
                        <div>
                            <h3 class="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3 px-1">
                                {section.title}
                            </h3>
                            <div class="space-y-2">
                                <For each={section.items}>
                                    {(item) => {
                                        const colors = colorClasses[item.color] || colorClasses.blue;

                                        return (
                                            <Show
                                                when={!item.comingSoon}
                                                fallback={
                                                    <div class="block bg-slate-900/40 border border-slate-800/30 rounded-xl p-5 opacity-60 cursor-not-allowed">
                                                        <div class="flex items-center gap-4">
                                                            <div class={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
                                                                <item.icon class={`w-6 h-6 ${colors.text}`} />
                                                            </div>
                                                            <div class="flex-1">
                                                                <h4 class="text-white font-medium flex items-center gap-2">
                                                                    {item.title}
                                                                    <span class="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">
                                                                        Coming Soon
                                                                    </span>
                                                                </h4>
                                                                <p class="text-sm text-slate-500 mt-0.5">
                                                                    {item.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                }
                                            >
                                                <A
                                                    href={item.href}
                                                    class="block bg-slate-900/60 border border-slate-800/50 rounded-xl p-5 hover:bg-slate-800/60 hover:border-slate-700/50 transition-all group"
                                                >
                                                    <div class="flex items-center gap-4">
                                                        <div class={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                                                            <item.icon class={`w-6 h-6 ${colors.text}`} />
                                                        </div>
                                                        <div class="flex-1">
                                                            <h4 class="text-white font-medium group-hover:text-blue-400 transition-colors">
                                                                {item.title}
                                                            </h4>
                                                            <p class="text-sm text-slate-400 mt-0.5">
                                                                {item.description}
                                                            </p>
                                                        </div>
                                                        <ChevronRight class="w-5 h-5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-1 transition-all" />
                                                    </div>
                                                </A>
                                            </Show>
                                        );
                                    }}
                                </For>
                            </div>
                        </div>
                    )}
                </For>
            </div>

            {/* Help Section */}
            <div class="mt-8 bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
                <div class="flex items-start gap-3">
                    <Shield class="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                        <h4 class="text-white font-medium">Need Help?</h4>
                        <p class="text-sm text-slate-400 mt-1">
                            Contact your system administrator for platform-wide settings like plan limits,
                            security policies, and advanced configuration.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;
