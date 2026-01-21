import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Key, Timer, Ban } from 'lucide-solid';
import { api } from '../../lib/api';

interface SecuritySettings {
    sessionTimeoutMinutes: number;
    passwordMinLength: number;
    maxLoginAttempts: number;
}

const SecuritySettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<SecuritySettings>('/super/settings/security');
    });

    const [form, setForm] = createStore<SecuritySettings>({
        sessionTimeoutMinutes: 60,
        passwordMinLength: 8,
        maxLoginAttempts: 5,
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/security', {
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

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Security Settings</h1>
            <p class="text-slate-400 mb-8">Configure session and password policies.</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-lg space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Timer class="w-5 h-5 text-blue-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Session Timeout (minutes)</label>
                                <input
                                    type="number"
                                    min="5"
                                    max="1440"
                                    value={form.sessionTimeoutMinutes}
                                    onInput={(e) => setForm('sessionTimeoutMinutes', parseInt(e.currentTarget.value) || 60)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <Key class="w-5 h-5 text-purple-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Minimum Password Length</label>
                                <input
                                    type="number"
                                    min="6"
                                    max="32"
                                    value={form.passwordMinLength}
                                    onInput={(e) => setForm('passwordMinLength', parseInt(e.currentTarget.value) || 8)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                                <Ban class="w-5 h-5 text-red-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Max Login Attempts (before lockout)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={form.maxLoginAttempts}
                                    onInput={(e) => setForm('maxLoginAttempts', parseInt(e.currentTarget.value) || 5)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
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

export default SecuritySettingsPage;
