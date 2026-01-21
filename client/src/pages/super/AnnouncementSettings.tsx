import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Megaphone, Info, AlertTriangle, AlertOctagon } from 'lucide-solid';
import { api } from '../../lib/api';

interface AnnouncementSettings {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'critical';
}

const AnnouncementSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [msg, setMsg] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<AnnouncementSettings>('/super/settings/announcement');
    });

    const [form, setForm] = createStore<AnnouncementSettings>({
        enabled: false,
        message: '',
        type: 'info',
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMsg(null);
        try {
            await api('/super/settings/announcement', {
                method: 'PUT',
                body: JSON.stringify(form)
            });
            setMsg('Announcement saved!');
            setTimeout(() => setMsg(null), 3000);
        } catch (err: any) {
            setMsg(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const typeConfig = {
        info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: Info },
        warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle },
        critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: AlertOctagon },
    };

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">System Announcements</h1>
            <p class="text-slate-400 mb-8">Display a banner message to all users (e.g., maintenance notices).</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-2xl space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        {/* Toggle */}
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <Megaphone class="w-5 h-5 text-slate-400" />
                                <span class="text-white font-medium">Enable Announcement</span>
                            </div>
                            <button
                                onClick={() => setForm('enabled', !form.enabled)}
                                class={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                            >
                                <span class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* Type */}
                        <div>
                            <label class="text-sm text-slate-400 mb-2 block">Banner Type</label>
                            <div class="flex gap-3">
                                {(['info', 'warning', 'critical'] as const).map(t => {
                                    const config = typeConfig[t];
                                    const Icon = config.icon;
                                    return (
                                        <button
                                            onClick={() => setForm('type', t)}
                                            class={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all ${form.type === t
                                                    ? `${config.bg} ${config.border} ${config.text}`
                                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'
                                                }`}
                                        >
                                            <Icon class="w-4 h-4" />
                                            <span class="capitalize">{t}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Message */}
                        <div>
                            <label class="text-sm text-slate-400 mb-2 block">Message</label>
                            <textarea
                                value={form.message}
                                onInput={(e) => setForm('message', e.currentTarget.value)}
                                placeholder="Scheduled maintenance on Sunday 2am-4am UTC..."
                                rows={3}
                                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            />
                        </div>

                        {/* Preview */}
                        <Show when={form.message}>
                            <div>
                                <label class="text-sm text-slate-400 mb-2 block">Preview</label>
                                <div class={`p-3 rounded-lg border ${typeConfig[form.type].bg} ${typeConfig[form.type].border}`}>
                                    <div class={`flex items-center gap-2 ${typeConfig[form.type].text}`}>
                                        {(() => { const Icon = typeConfig[form.type].icon; return <Icon class="w-4 h-4" />; })()}
                                        <span class="text-sm">{form.message}</span>
                                    </div>
                                </div>
                            </div>
                        </Show>
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
                        <Show when={msg()}>
                            <span class={`text-sm ${msg()?.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{msg()}</span>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default AnnouncementSettingsPage;
