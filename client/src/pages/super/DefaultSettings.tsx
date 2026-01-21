import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, DollarSign, Clock } from 'lucide-solid';
import { api } from '../../lib/api';

interface DefaultSettings {
    defaultCurrency: string;
    defaultTimezone: string;
}

const DefaultSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<DefaultSettings>('/super/settings/defaults');
    });

    const [form, setForm] = createStore<DefaultSettings>({
        defaultCurrency: 'UZS',
        defaultTimezone: 'Asia/Tashkent',
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/defaults', {
                method: 'PUT',
                body: JSON.stringify(form)
            });
            setMessage('Settings saved!');
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const currencies = ['UZS', 'RUR', 'USD', 'EUR', 'RMB'];
    const timezones = ['Asia/Tashkent', 'UTC', 'Europe/Moscow', 'Asia/Shanghai', 'America/New_York'];

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Default Tenant Settings</h1>
            <p class="text-slate-400 mb-8">Configure defaults applied to new tenants.</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-lg space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <DollarSign class="w-5 h-5 text-emerald-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Default Currency</label>
                                <select
                                    value={form.defaultCurrency}
                                    onChange={(e) => setForm('defaultCurrency', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    {currencies.map(c => <option value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Clock class="w-5 h-5 text-blue-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Default Timezone</label>
                                <select
                                    value={form.defaultTimezone}
                                    onChange={(e) => setForm('defaultTimezone', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    {timezones.map(t => <option value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={submitting()}
                            class="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={submitting()} fallback={<Save class="w-5 h-5" />}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            Save Changes
                        </button>
                        <Show when={message()}>
                            <span class={`text-sm ${message()?.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{message()}</span>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default DefaultSettingsPage;
