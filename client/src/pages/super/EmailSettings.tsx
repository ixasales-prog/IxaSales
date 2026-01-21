import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Mail } from 'lucide-solid';
import { api } from '../../lib/api';

interface EmailSettings {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    fromEmail: string;
    fromName: string;
    tlsEnabled: boolean;
}

const EmailSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<EmailSettings>('/super/settings/email');
    });

    const [form, setForm] = createStore<EmailSettings>({
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'IxaSales',
        tlsEnabled: true,
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/email', {
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
            <h1 class="text-2xl font-bold text-white mb-2">Email Configuration</h1>
            <p class="text-slate-400 mb-8">Configure SMTP settings for transactional emails.</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-lg space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        {/* Enable Toggle */}
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <Mail class="w-5 h-5 text-slate-400" />
                                <span class="text-white font-medium">Enable Email Sending</span>
                            </div>
                            <button
                                onClick={() => setForm('enabled', !form.enabled)}
                                class={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                            >
                                <span class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div class="grid grid-cols-3 gap-4">
                            <div class="col-span-2">
                                <label class="text-sm text-slate-400 mb-1 block">SMTP Host</label>
                                <input
                                    type="text"
                                    value={form.smtpHost}
                                    onInput={(e) => setForm('smtpHost', e.currentTarget.value)}
                                    placeholder="smtp.gmail.com"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-sm text-slate-400 mb-1 block">Port</label>
                                <input
                                    type="number"
                                    value={form.smtpPort}
                                    onInput={(e) => setForm('smtpPort', parseInt(e.currentTarget.value) || 587)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-sm text-slate-400 mb-1 block">Username</label>
                                <input
                                    type="text"
                                    value={form.smtpUsername}
                                    onInput={(e) => setForm('smtpUsername', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-sm text-slate-400 mb-1 block">Password</label>
                                <input
                                    type="password"
                                    value={form.smtpPassword}
                                    onInput={(e) => setForm('smtpPassword', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-sm text-slate-400 mb-1 block">From Email</label>
                                <input
                                    type="email"
                                    value={form.fromEmail}
                                    onInput={(e) => setForm('fromEmail', e.currentTarget.value)}
                                    placeholder="noreply@ixasales.com"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-sm text-slate-400 mb-1 block">From Name</label>
                                <input
                                    type="text"
                                    value={form.fromName}
                                    onInput={(e) => setForm('fromName', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* TLS Toggle */}
                        <div class="flex items-center justify-between pt-2 border-t border-slate-800">
                            <span class="text-slate-400 text-sm">Use TLS/SSL</span>
                            <button
                                onClick={() => setForm('tlsEnabled', !form.tlsEnabled)}
                                class={`relative w-12 h-6 rounded-full transition-colors ${form.tlsEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}
                            >
                                <span class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.tlsEnabled ? 'left-7' : 'left-1'}`} />
                            </button>
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

export default EmailSettingsPage;
