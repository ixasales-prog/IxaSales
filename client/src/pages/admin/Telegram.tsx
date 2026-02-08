import { type Component, createSignal, createResource, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
    ArrowLeft, Bot, MessageCircle, Settings, Check,
    Loader2, ExternalLink, Users, Send, Shield, Copy
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface TenantTelegramInfo {
    telegramEnabled: boolean;
    hasBotToken: boolean;
    hasWebhookSecret: boolean;
    linkedCustomersCount?: number;
}

const AdminTelegram: Component = () => {
    const [saving, setSaving] = createSignal(false);
    const [configuring, setConfiguring] = createSignal(false);
    const [botToken, setBotToken] = createSignal('');
    const [webhookSecret, setWebhookSecret] = createSignal('');

    const [data, { refetch }] = createResource(async () => {
        try {
            const result = await api<TenantTelegramInfo>('/tenant/telegram');
            return result;
        } catch {
            return {
                telegramEnabled: false,
                hasBotToken: false,
                hasWebhookSecret: false,
                linkedCustomersCount: 0,
            } as TenantTelegramInfo;
        }
    });

    const handleSave = async () => {
        setSaving(true);

        try {
            const updates: any = {};
            if (botToken()) updates.botToken = botToken();
            if (webhookSecret()) updates.webhookSecret = webhookSecret();

            await api('/tenant/telegram', {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            toast.success('Telegram settings saved!');
            setBotToken('');
            setWebhookSecret('');
            refetch();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleConfigureWebhook = async () => {
        setConfiguring(true);

        try {
            const result = await api<{ success: boolean; message: string; webhookUrl?: string }>(
                '/telegram/configure/current',
                { method: 'POST' }
            );

            if (result.success) {
                toast.success('Webhook configured! Customers can now link their accounts.');
            } else {
                toast.error(`Error: ${result.message}`);
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setConfiguring(false);
        }
    };

    const generateSecret = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let secret = '';
        for (let i = 0; i < 32; i++) {
            secret += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setWebhookSecret(secret);
    };

    const copySecret = () => {
        if (webhookSecret()) {
            navigator.clipboard.writeText(webhookSecret());
            toast.success('Secret copied to clipboard!');
        }
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 max-w-2xl mx-auto">
            <A
                href="/admin/settings"
                class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft class="w-4 h-4" />
                Back to Settings
            </A>

            <div class="mb-8">
                <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                        <Bot class="w-5 h-5 text-white" />
                    </div>
                    Telegram Bot Setup
                </h1>
                <p class="text-slate-400 mt-2">
                    Connect your own Telegram bot to send notifications to customers
                </p>
            </div>

            {/* Status Card */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <MessageCircle class="w-5 h-5 text-purple-400" />
                        <span class="text-white font-medium">Bot Status</span>
                    </div>
                    <Show
                        when={data()?.hasBotToken}
                        fallback={
                            <span class="px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                                Not Configured
                            </span>
                        }
                    >
                        <span class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                            <Check class="w-3 h-3" />
                            Active
                        </span>
                    </Show>
                </div>

                <Show when={data()?.hasBotToken}>
                    <div class="flex items-center gap-6 text-sm">
                        <div class="flex items-center gap-2 text-slate-400">
                            <Users class="w-4 h-4" />
                            <span>{data()?.linkedCustomersCount || 0} linked customers</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <Shield class="w-4 h-4" />
                            <Show
                                when={data()?.hasWebhookSecret}
                                fallback={<span class="text-amber-400">No webhook secret</span>}
                            >
                                <span class="text-emerald-400">Webhook secured</span>
                            </Show>
                        </div>
                    </div>
                </Show>
            </div>

            {/* Setup Instructions */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                    <Settings class="w-5 h-5 text-blue-400" />
                    Setup Instructions
                </h3>

                <ol class="space-y-4 text-sm">
                    <li class="flex gap-3">
                        <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                            1
                        </span>
                        <div>
                            <p class="text-white">Create a bot using @BotFather</p>
                            <a
                                href="https://t.me/BotFather"
                                target="_blank"
                                class="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 mt-1"
                            >
                                Open BotFather <ExternalLink class="w-3 h-3" />
                            </a>
                        </div>
                    </li>
                    <li class="flex gap-3">
                        <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                            2
                        </span>
                        <div>
                            <p class="text-white">Send <code class="bg-slate-800 px-1.5 py-0.5 rounded text-blue-400">/newbot</code> and follow the instructions</p>
                            <p class="text-slate-500 mt-1">Choose a name like "Your Company Orders"</p>
                        </div>
                    </li>
                    <li class="flex gap-3">
                        <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                            3
                        </span>
                        <div>
                            <p class="text-white">Copy the bot token and paste it below</p>
                            <p class="text-slate-500 mt-1">It looks like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</p>
                        </div>
                    </li>
                </ol>
            </div>

            {/* Bot Token Input */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                <label class="block text-sm text-slate-400 mb-2">Bot Token</label>
                <input
                    type="password"
                    value={botToken()}
                    onInput={(e) => setBotToken(e.currentTarget.value)}
                    placeholder={data()?.hasBotToken ? "••••••••••••••••••••••" : "123456:ABC-DEF1234..."}
                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <p class="text-xs text-slate-500 mt-2">
                    {data()?.hasBotToken ? "Leave empty to keep current token, or enter a new one to replace it." : "Required to enable Telegram notifications."}
                </p>
            </div>

            {/* Webhook Secret Input */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-sm text-slate-400">Webhook Secret (Recommended)</label>
                    <button
                        onClick={generateSecret}
                        class="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        Generate Random
                    </button>
                </div>
                <div class="flex gap-2">
                    <input
                        type="text"
                        value={webhookSecret()}
                        onInput={(e) => setWebhookSecret(e.currentTarget.value)}
                        placeholder={data()?.hasWebhookSecret ? "••••••••••••••••" : "Enter a secret string..."}
                        class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                    />
                    <Show when={webhookSecret()}>
                        <button
                            onClick={copySecret}
                            class="px-3 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors"
                            title="Copy to clipboard"
                        >
                            <Copy class="w-4 h-4 text-slate-400" />
                        </button>
                    </Show>
                </div>
                <p class="text-xs text-slate-500 mt-2">
                    Adds security by validating incoming webhook requests. Telegram will send this secret in the header.
                </p>
            </div>

            {/* Save Button */}
            <div class="mb-6">
                <button
                    onClick={handleSave}
                    disabled={saving() || (!botToken() && !webhookSecret())}
                    class="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                    <Show when={saving()} fallback={<>Save Settings</>}>
                        <Loader2 class="w-4 h-4 animate-spin" />
                        Saving...
                    </Show>
                </button>
            </div>

            {/* Configure Webhook Button */}
            <Show when={data()?.hasBotToken}>
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                    <p class="text-slate-400 text-sm mb-4">
                        After saving your bot token, configure the webhook to start receiving customer messages.
                    </p>
                    <button
                        onClick={handleConfigureWebhook}
                        disabled={configuring()}
                        class="w-full px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Show when={configuring()} fallback={
                            <>
                                <Send class="w-4 h-4" />
                                Configure Webhook
                            </>
                        }>
                            <Loader2 class="w-4 h-4 animate-spin" />
                            Configuring...
                        </Show>
                    </button>
                </div>
            </Show>

            {/* Customer Instructions */}
            <div class="mt-8 bg-purple-500/10 border border-purple-500/20 rounded-xl p-5">
                <h4 class="text-white font-medium mb-2">How Customers Link Their Account</h4>
                <p class="text-sm text-slate-400">
                    Once configured, customers can message your bot with their phone number
                    (the same one in their customer profile). They'll automatically receive
                    order updates, delivery notifications, and payment reminders.
                </p>
                <div class="mt-3 pt-3 border-t border-purple-500/20">
                    <p class="text-xs text-slate-500">
                        <strong>Bot commands:</strong> /start, /status, /unlink, /help
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminTelegram;

