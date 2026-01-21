import { type Component, createSignal, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-solid';
import { useBranding } from '../../stores/branding';

const ForgotPassword: Component = () => {
    const [email, setEmail] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [sent, setSent] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email() }),
            });

            const data = await response.json();

            if (data.success) {
                setSent(true);
            } else {
                setError(data.error?.message || 'Something went wrong');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div class="w-full max-w-md">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        {useBranding().platformName}
                    </h1>
                </div>

                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl">
                    <Show when={!sent()} fallback={
                        <div class="text-center py-6">
                            <CheckCircle class="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                            <h2 class="text-xl font-semibold text-white mb-2">Check Your Email</h2>
                            <p class="text-slate-400 mb-6">
                                If an account exists for <strong class="text-white">{email()}</strong>,
                                we've sent a password reset link.
                            </p>
                            <A href="/login" class="text-blue-400 hover:text-blue-300 font-medium">
                                ← Back to Login
                            </A>
                        </div>
                    }>
                        <div class="flex items-center gap-3 mb-6">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Mail class="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 class="text-xl font-semibold text-white">Forgot Password?</h2>
                                <p class="text-sm text-slate-400">We'll send you a reset link</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} class="space-y-5">
                            <div>
                                <label class="block text-sm text-slate-400 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={email()}
                                    onInput={(e) => setEmail(e.currentTarget.value)}
                                    placeholder="you@example.com"
                                    required
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <Show when={error()}>
                                <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                                    {error()}
                                </div>
                            </Show>

                            <button
                                type="submit"
                                disabled={loading() || !email()}
                                class="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Show when={loading()} fallback="Send Reset Link">
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                    Sending...
                                </Show>
                            </button>

                            <A href="/login" class="block text-center text-slate-400 hover:text-white text-sm transition-colors">
                                <ArrowLeft class="w-4 h-4 inline mr-1" />
                                Back to Login
                            </A>
                        </form>
                    </Show>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
