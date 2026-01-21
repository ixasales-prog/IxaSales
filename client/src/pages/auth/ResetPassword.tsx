import { type Component, createSignal, Show } from 'solid-js';
import { A, useSearchParams, useNavigate } from '@solidjs/router';
import { Lock, CheckCircle, XCircle, Loader2 } from 'lucide-solid';
import { useBranding } from '../../stores/branding';

const ResetPassword: Component = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [password, setPassword] = createSignal('');
    const [confirmPassword, setConfirmPassword] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [success, setSuccess] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const token = () => searchParams.token as string;

    const handleSubmit = async (e: Event) => {
        e.preventDefault();

        if (password() !== confirmPassword()) {
            setError('Passwords do not match');
            return;
        }

        if (password().length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token(),
                    password: password()
                }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(true);
                // Redirect to login after 3 seconds
                setTimeout(() => navigate('/login'), 3000);
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
                    <Show when={!token()}>
                        <div class="text-center py-6">
                            <XCircle class="w-16 h-16 text-red-400 mx-auto mb-4" />
                            <h2 class="text-xl font-semibold text-white mb-2">Invalid Link</h2>
                            <p class="text-slate-400 mb-6">
                                This password reset link is invalid or has expired.
                            </p>
                            <A href="/forgot-password" class="text-blue-400 hover:text-blue-300 font-medium">
                                Request a new link
                            </A>
                        </div>
                    </Show>

                    <Show when={token() && success()}>
                        <div class="text-center py-6">
                            <CheckCircle class="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                            <h2 class="text-xl font-semibold text-white mb-2">Password Reset!</h2>
                            <p class="text-slate-400 mb-6">
                                Your password has been reset successfully. Redirecting to login...
                            </p>
                            <A href="/login" class="text-blue-400 hover:text-blue-300 font-medium">
                                Go to Login
                            </A>
                        </div>
                    </Show>

                    <Show when={token() && !success()}>
                        <div class="flex items-center gap-3 mb-6">
                            <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Lock class="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 class="text-xl font-semibold text-white">Reset Password</h2>
                                <p class="text-sm text-slate-400">Enter your new password</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} class="space-y-5">
                            <div>
                                <label class="block text-sm text-slate-400 mb-2">New Password</label>
                                <input
                                    type="password"
                                    value={password()}
                                    onInput={(e) => setPassword(e.currentTarget.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label class="block text-sm text-slate-400 mb-2">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword()}
                                    onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                                    placeholder="••••••••"
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
                                disabled={loading() || !password() || !confirmPassword()}
                                class="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Show when={loading()} fallback="Reset Password">
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                    Resetting...
                                </Show>
                            </button>
                        </form>
                    </Show>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
