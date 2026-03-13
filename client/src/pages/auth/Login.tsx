import { type Component, createSignal } from 'solid-js';
import { api } from '../../lib/api';
import { login } from '../../stores/auth';
import { initSettings } from '../../stores/settings';
import { useNavigate } from '@solidjs/router';
import { Loader2 } from 'lucide-solid';
import { useI18n } from '../../i18n';

const Login: Component = () => {
    const { t } = useI18n();
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
            const res = await api<any>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: email(), password: password() }),
            });

            // Support both wrapped and unwrapped backend payloads.
            const token = res?.token ?? res?.data?.token;
            const user = res?.user ?? res?.data?.user;
            if (!token || !user) {
                throw new Error(t('auth.invalidLoginResponse'));
            }

            login(token, user);

            // Initialize tenant settings (currency, timezone, etc.)
            // Super admin does not require tenant display settings during login.
            if (user.role !== 'super_admin') {
                await initSettings();
            }

            // Redirect based on role
            if (user.role === 'sales_rep') {
                navigate('/sales');
            } else if (user.role === 'supervisor') {
                navigate('/supervisor');
            } else if (user.role === 'driver') {
                navigate('/driver');
            } else if (user.role === 'warehouse') {
                navigate('/warehouse');
            } else if (user.role === 'super_admin') {
                navigate('/super');
            } else {
                navigate('/admin');
            }
        } catch (err: any) {
            setError(err.message || t('auth.loginFailed'));
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
                    <p class="text-slate-400 mt-2">{t('auth.signInSubtitle')}</p>
                </div>

                <form onSubmit={handleLogin} class="space-y-6">
                    <div>
                        <label for="login-email" class="block text-sm font-medium text-slate-300 mb-2">{t('auth.email')}</label>
                        <input
                            id="login-email"
                            type="email"
                            value={email()}
                            onInput={(e) => setEmail(e.currentTarget.value)}
                            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder={t('auth.emailPlaceholder') as string}
                            required
                        />
                    </div>

                    <div>
                        <label for="login-password" class="block text-sm font-medium text-slate-300 mb-2">{t('auth.password')}</label>
                        <input
                            id="login-password"
                            type="password"
                            value={password()}
                            onInput={(e) => setPassword(e.currentTarget.value)}
                            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder={t('auth.passwordPlaceholder') as string}
                            required
                        />
                        <div class="text-right mt-2">
                            <a href="/forgot-password" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                                {t('auth.forgotPassword')}
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
                        {loading() ? <Loader2 class="animate-spin w-5 h-5" /> : t('auth.signIn')}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
