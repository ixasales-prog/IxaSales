import { type Component } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, Layers, Globe, Shield, Megaphone, Mail, Send, Palette, Database } from 'lucide-solid';

const SuperAdminSettings: Component = () => {
    const settingsLinks = [
        // Essential
        {
            title: 'Plan Limits',
            description: 'Configure resource limits for each subscription tier',
            href: '/super/plan-limits',
            icon: Layers,
            color: 'from-blue-500 to-indigo-600'
        },
        {
            title: 'Default Settings',
            description: 'Set default currency, timezone, tax rate for new tenants',
            href: '/super/settings/defaults',
            icon: Globe,
            color: 'from-emerald-500 to-teal-600'
        },
        {
            title: 'Security',
            description: 'Configure session timeout and password policies',
            href: '/super/settings/security',
            icon: Shield,
            color: 'from-purple-500 to-pink-600'
        },
        {
            title: 'Announcements',
            description: 'Display system-wide banner messages to all users',
            href: '/super/settings/announcement',
            icon: Megaphone,
            color: 'from-amber-500 to-orange-600'
        },
        // Nice to Have
        {
            title: 'Email (SMTP)',
            description: 'Configure outgoing email settings',
            href: '/super/settings/email',
            icon: Mail,
            color: 'from-rose-500 to-red-600'
        },
        {
            title: 'Telegram Bot',
            description: 'Configure Telegram notifications',
            href: '/super/settings/telegram',
            icon: Send,
            color: 'from-sky-500 to-blue-600'
        },
        {
            title: 'Branding',
            description: 'Customize platform name, colors, and logo',
            href: '/super/settings/branding',
            icon: Palette,
            color: 'from-fuchsia-500 to-purple-600'
        },
        {
            title: 'Backup Schedule',
            description: 'Configure automated backup settings',
            href: '/super/settings/backup',
            icon: Database,
            color: 'from-cyan-500 to-teal-600'
        },
    ];

    return (
        <div class="p-6 lg:p-8">
            <div class="mb-8">
                <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Platform Settings</h1>
                <p class="text-slate-400">Configure global system defaults and policies.</p>
            </div>

            <div class="max-w-2xl grid gap-4">
                {settingsLinks.map((item) => (
                    <A
                        href={item.href}
                        class="block bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 transition-all hover:border-slate-700 hover:bg-slate-900/80 group"
                    >
                        <div class="flex items-center gap-4">
                            <div class={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg`}>
                                <item.icon class="w-6 h-6 text-white" />
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-white">{item.title}</h3>
                                <p class="text-sm text-slate-400">{item.description}</p>
                            </div>
                            <ChevronRight class="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                    </A>
                ))}
            </div>
        </div>
    );
};

export default SuperAdminSettings;
