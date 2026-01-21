import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Type, Image } from 'lucide-solid';
import { api } from '../../lib/api';

interface BrandingSettings {
    platformName: string;
    primaryColor: string;
    logoUrl: string;
}

const BrandingSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<BrandingSettings>('/super/settings/branding');
    });

    const [form, setForm] = createStore<BrandingSettings>({
        platformName: 'IxaSales',
        primaryColor: '#3B82F6',
        logoUrl: '',
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/branding', {
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

    const presetColors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Branding</h1>
            <p class="text-slate-400 mb-8">Customize the platform's appearance.</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-lg space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Type class="w-5 h-5 text-blue-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Platform Name</label>
                                <input
                                    type="text"
                                    value={form.platformName}
                                    onInput={(e) => setForm('platformName', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label class="text-sm text-slate-400 mb-2 block">Primary Color</label>
                            <div class="flex items-center gap-3">
                                <div class="flex gap-2">
                                    {presetColors.map(color => (
                                        <button
                                            onClick={() => setForm('primaryColor', color)}
                                            class={`w-8 h-8 rounded-lg transition-all ${form.primaryColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
                                            style={{ background: color }}
                                        />
                                    ))}
                                </div>
                                <input
                                    type="color"
                                    value={form.primaryColor}
                                    onInput={(e) => setForm('primaryColor', e.currentTarget.value)}
                                    class="w-10 h-8 rounded cursor-pointer border-0"
                                />
                                <input
                                    type="text"
                                    value={form.primaryColor}
                                    onInput={(e) => setForm('primaryColor', e.currentTarget.value)}
                                    class="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-sm"
                                />
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <Image class="w-5 h-5 text-purple-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Logo URL</label>
                                <input
                                    type="url"
                                    value={form.logoUrl}
                                    onInput={(e) => setForm('logoUrl', e.currentTarget.value)}
                                    placeholder="https://example.com/logo.png"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Preview */}
                        <div class="pt-4 border-t border-slate-800">
                            <label class="text-sm text-slate-400 mb-2 block">Preview</label>
                            <div class="flex items-center gap-3 p-3 bg-slate-950 rounded-lg">
                                <Show when={form.logoUrl} fallback={
                                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: form.primaryColor }}>
                                        {form.platformName.charAt(0)}
                                    </div>
                                }>
                                    <img src={form.logoUrl} alt="Logo" class="w-10 h-10 rounded-lg object-cover" />
                                </Show>
                                <span class="font-bold text-lg" style={{ color: form.primaryColor }}>{form.platformName}</span>
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

export default BrandingSettingsPage;
