import { type Component, createSignal, createResource, Show, onCleanup } from 'solid-js';
import { A } from '@solidjs/router';
import {
    ArrowLeft, Bot, MessageCircle, Check, Loader2,
    ExternalLink, Copy, RefreshCw, Unlink, Link2
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface TelegramLinkStatus {
    isLinked: boolean;
    pendingCode: string | null;
    pendingCodeExpiresAt: string | null;
    botUsername: string | null;
}

interface LinkCodeResponse {
    code: string;
    expiresAt: string;
    expiresInMinutes: number;
    botUsername: string | null;
    instructions: string;
}

const TelegramLink: Component = () => {
    const [generating, setGenerating] = createSignal(false);
    const [unlinking, setUnlinking] = createSignal(false);
    const [countdown, setCountdown] = createSignal(0);

    const [status, { refetch }] = createResource(async () => {
        try {
            const result = await api<TelegramLinkStatus>('/users/telegram/status');

            // Start countdown if there's a pending code
            if (result?.pendingCode && result?.pendingCodeExpiresAt) {
                const expiresAt = new Date(result.pendingCodeExpiresAt).getTime();
                const now = Date.now();
                const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
                setCountdown(remaining);
            }

            return result;
        } catch {
            return {
                isLinked: false,
                pendingCode: null,
                pendingCodeExpiresAt: null,
                botUsername: null,
            } as TelegramLinkStatus;
        }
    });

    // Countdown timer
    const countdownInterval = setInterval(() => {
        if (countdown() > 0) {
            setCountdown(c => c - 1);
        }
    }, 1000);

    onCleanup(() => clearInterval(countdownInterval));

    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleGenerateCode = async () => {
        setGenerating(true);
        try {
            const result = await api<LinkCodeResponse>('/users/telegram/link', { method: 'POST' });
            toast.success(`Link code generated: ${result.code}`);
            setCountdown(result.expiresInMinutes * 60);
            refetch();
        } catch (err: any) {
            toast.error(err.message || 'Failed to generate code');
        } finally {
            setGenerating(false);
        }
    };

    const handleUnlink = async () => {
        if (!confirm('Are you sure you want to unlink your Telegram account?')) return;

        setUnlinking(true);
        try {
            await api('/users/telegram/unlink', { method: 'DELETE' });
            toast.success('Telegram account unlinked');
            refetch();
        } catch (err: any) {
            toast.error(err.message || 'Failed to unlink');
        } finally {
            setUnlinking(false);
        }
    };

    const copyCode = () => {
        const code = status()?.pendingCode;
        if (code) {
            navigator.clipboard.writeText(code);
            toast.success('Code copied to clipboard!');
        }
    };

    const openBot = () => {
        const botUsername = status()?.botUsername;
        if (botUsername) {
            window.open(`https://t.me/${botUsername}`, '_blank');
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
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Bot class="w-5 h-5 text-white" />
                    </div>
                    Link Your Telegram
                </h1>
                <p class="text-slate-400 mt-2">
                    Connect your Telegram account to receive notifications
                </p>
            </div>

            {/* Loading state */}
            <Show when={status.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                </div>
            </Show>

            {/* Linked State */}
            <Show when={!status.loading && status()?.isLinked}>
                <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 mb-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <Check class="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 class="text-white font-semibold">Telegram Connected</h3>
                            <p class="text-slate-400 text-sm">You're receiving notifications on Telegram</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/50 rounded-xl p-4 mb-4">
                        <h4 class="text-white font-medium mb-2">You will receive:</h4>
                        <ul class="text-sm text-slate-400 space-y-1">
                            <li>• New order notifications</li>
                            <li>• Order status updates</li>
                            <li>• Payment notifications</li>
                            <li>• Important system alerts</li>
                        </ul>
                    </div>

                    <button
                        onClick={handleUnlink}
                        disabled={unlinking()}
                        class="w-full px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <Show when={unlinking()} fallback={<><Unlink class="w-4 h-4" /> Unlink Telegram</>}>
                            <Loader2 class="w-4 h-4 animate-spin" />
                            Unlinking...
                        </Show>
                    </button>
                </div>
            </Show>

            {/* Not Linked State */}
            <Show when={!status.loading && !status()?.isLinked}>
                {/* Check if bot is configured */}
                <Show when={!status()?.botUsername}>
                    <div class="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-6">
                        <h3 class="text-amber-400 font-medium mb-2">Telegram Bot Not Configured</h3>
                        <p class="text-slate-400 text-sm">
                            Your organization hasn't set up a Telegram bot yet.
                            Please contact your administrator to enable Telegram notifications.
                        </p>
                    </div>
                </Show>

                <Show when={status()?.botUsername}>
                    {/* Instructions */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <MessageCircle class="w-5 h-5 text-blue-400" />
                            How to Link Your Account
                        </h3>

                        <ol class="space-y-4 text-sm">
                            <li class="flex gap-3">
                                <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                                    1
                                </span>
                                <div>
                                    <p class="text-white">Generate a link code below</p>
                                    <p class="text-slate-500 mt-1">The code expires in 15 minutes</p>
                                </div>
                            </li>
                            <li class="flex gap-3">
                                <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                                    2
                                </span>
                                <div>
                                    <p class="text-white">Open your company's Telegram bot</p>
                                    <Show when={status()?.botUsername}>
                                        <button
                                            onClick={openBot}
                                            class="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 mt-1"
                                        >
                                            @{status()?.botUsername} <ExternalLink class="w-3 h-3" />
                                        </button>
                                    </Show>
                                </div>
                            </li>
                            <li class="flex gap-3">
                                <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                                    3
                                </span>
                                <p class="text-white">Send the link code to the bot</p>
                            </li>
                        </ol>
                    </div>

                    {/* Pending Code Display */}
                    <Show when={status()?.pendingCode && countdown() > 0}>
                        <div class="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 mb-6">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-white font-medium">Your Link Code</h3>
                                <span class="text-blue-400 text-sm font-mono">
                                    Expires in {formatCountdown(countdown())}
                                </span>
                            </div>

                            <div class="flex items-center gap-3 mb-4">
                                <div class="flex-1 bg-slate-900 rounded-xl px-6 py-4 text-center">
                                    <span class="text-3xl font-mono font-bold text-white tracking-widest">
                                        {status()?.pendingCode}
                                    </span>
                                </div>
                                <button
                                    onClick={copyCode}
                                    class="p-3 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors"
                                    title="Copy code"
                                >
                                    <Copy class="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            <div class="flex gap-3">
                                <button
                                    onClick={openBot}
                                    class="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ExternalLink class="w-4 h-4" />
                                    Open Telegram Bot
                                </button>
                                <button
                                    onClick={handleGenerateCode}
                                    disabled={generating()}
                                    class="px-4 py-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                                    title="Generate new code"
                                >
                                    <RefreshCw class={`w-5 h-5 ${generating() ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </Show>

                    {/* Generate Code Button */}
                    <Show when={!status()?.pendingCode || countdown() <= 0}>
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <button
                                onClick={handleGenerateCode}
                                disabled={generating()}
                                class="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                            >
                                <Show when={generating()} fallback={<><Link2 class="w-5 h-5" /> Generate Link Code</>}>
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                    Generating...
                                </Show>
                            </button>
                        </div>
                    </Show>
                </Show>
            </Show>

            {/* Refresh Button */}
            <div class="mt-6 text-center">
                <button
                    onClick={() => refetch()}
                    class="text-slate-500 hover:text-slate-300 text-sm inline-flex items-center gap-2 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    Refresh Status
                </button>
            </div>
        </div>
    );
};

export default TelegramLink;

