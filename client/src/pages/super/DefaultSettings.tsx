import { type Component } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft, Info } from 'lucide-solid';

const DefaultSettingsPage: Component = () => {
    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>

            <h1 class="text-2xl font-bold text-white mb-2">Default Tenant Settings</h1>
            <p class="text-slate-400 mb-8">Currency and timezone defaults were removed from superadmin controls.</p>

            <div class="max-w-2xl bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Info class="w-5 h-5 text-blue-400" />
                    </div>
                    <div class="space-y-2">
                        <p class="text-white font-medium">Current behavior</p>
                        <p class="text-slate-300 text-sm">New tenants use fixed defaults: <span class="font-semibold">UZS</span> and <span class="font-semibold">Asia/Tashkent</span>.</p>
                        <p class="text-slate-300 text-sm">Tenant admins can change currency and timezone in tenant admin settings.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DefaultSettingsPage;
