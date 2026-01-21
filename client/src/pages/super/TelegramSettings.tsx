import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Send, Bot, MessageCircle, Zap } from 'lucide-solid';
import { api } from '../../lib/api';

interface TelegramSettings {
    enabled: boolean;
    botToken: string;
    defaultChatId: string;
}

const TelegramSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [testing, setTesting] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    const [data] = createResource(async () => {
        return await api<TelegramSettings>('/super/settings/telegram');
    });

    const [form, setForm] = createStore<TelegramSettings>({
        enabled: false,
        botToken: '',
        defaultChatId: '',
    });

    createEffect(() => {
        const d = data();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/telegram', {
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

    const handleTest = async () => {
        setTesting(true);
        setMessage(null);
        try {
            const result = await api<{ success: boolean; message: string }>('/super/test-telegram', {
                method: 'POST',
                body: JSON.stringify({})
            });
            setMessage(result.success ? '✅ Test message sent!' : '❌ ' + result.message);
            setTimeout(() => setMessage(null), 5000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Telegram Bot</h1>
            <p class="text-slate-400 mb-8">Configure Telegram notifications for system alerts.</p>

            <Show when={data.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!data.loading}>
                <div class="max-w-lg space-y-6">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                        {/* Enable Toggle */}
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <Send class="w-5 h-5 text-blue-400" />
                                <span class="text-white font-medium">Enable Telegram Notifications</span>
                            </div>
                            <button
                                onClick={() => setForm('enabled', !form.enabled)}
                                class={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                            >
                                <span class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Bot class="w-5 h-5 text-blue-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Bot Token</label>
                                <input
                                    type="password"
                                    value={form.botToken}
                                    onInput={(e) => setForm('botToken', e.currentTarget.value)}
                                    placeholder="123456:ABC-DEF1234..."
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <MessageCircle class="w-5 h-5 text-purple-400" />
                            </div>
                            <div class="flex-1">
                                <label class="text-sm text-slate-400">Default Chat ID</label>
                                <input
                                    type="text"
                                    value={form.defaultChatId}
                                    onInput={(e) => setForm('defaultChatId', e.currentTarget.value)}
                                    placeholder="-1001234567890"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <p class="text-xs text-slate-500">
                            To get your chat ID: Start a chat with the bot, send a message, then visit:<br />
                            <code class="text-blue-400">https://api.telegram.org/bot[TOKEN]/getUpdates</code>
                        </p>
                    </div>

                    <div class="flex items-center gap-4 flex-wrap">
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
                        <button
                            onClick={handleTest}
                            disabled={testing() || !form.defaultChatId}
                            class="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={testing()} fallback={<Zap class="w-5 h-5" />}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            Send Test Message
                        </button>
                    </div>
                    <Show when={message()}>
                        <span class={`text-sm ${message()?.startsWith('Error') || message()?.startsWith('❌') ? 'text-red-400' : 'text-emerald-400'}`}>{message()}</span>
                    </Show>
                </div>
            </Show>
        </div>
    );
};

export default TelegramSettingsPage;
