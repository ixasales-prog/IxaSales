import { type Component, createSignal } from 'solid-js';
import { api } from '../../lib/api';
import { login } from '../../stores/auth';
import { initSettings } from '../../stores/settings';
import { useNavigate } from '@solidjs/router';
import { Loader2 } from 'lucide-solid';

const Login: Component = () => {
    const [email, setEmail] = createSignal('');
    const [password, setPassword] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');
    const navigate = useNavigate();

    const handleLogin = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await api('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: email(), password: password() }),
            });

            login(res.token, res.user);

            // Initialize tenant settings (currency, timezone, etc.)
            await initSettings();

            // Redirect based on role
            if (res.user.role === 'sales_rep') {
                navigate('/sales');
            } else if (res.user.role === 'supervisor') {
                navigate('/supervisor');
            } else if (res.user.role === 'driver') {
                navigate('/driver');
            } else if (res.user.role === 'warehouse') {
                navigate('/warehouse');
            } else if (res.user.role === 'super_admin') {
                navigate('/super');
            } else {
                navigate('/admin');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="min-h-screen flex items-center justify-center p-6 bg-slate-950">
            <div class="w-full max-w-sm">
                <div class="text-center mb-10">
                    <h1 class="text-3xl font-bold bg-gradient-to-br from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        IxaSales
                    </h1>
                    <p class="text-slate-400 mt-2">Sign in to your account</p>
                </div>

                <form onSubmit={handleLogin} class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">Email</label>
                        <input
                            type="email"
                            value={email()}
                            onInput={(e) => setEmail(e.currentTarget.value)}
                            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder="you@company.com"
                            required
                        />
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">Password</label>
                        <input
                            type="password"
                            value={password()}
                            onInput={(e) => setPassword(e.currentTarget.value)}
                            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder="••••••••"
                            required
                        />
                        <div class="text-right mt-2">
                            <a href="/forgot-password" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                                Forgot password?
                            </a>
                        </div>
                    </div>

                    {error() && (
                        <div class="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20 text-center">
                            {error()}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading()}
                        class="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading() ? <Loader2 class="animate-spin w-5 h-5" /> : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
