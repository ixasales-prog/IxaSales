import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { DownloadCloud, Smartphone, X } from 'lucide-solid';
import { canInstall, isInstalledPWA, promptInstall, syncInstallState } from '../../lib/pwa';
import { currentUser } from '../../stores/auth';

const REQUIRED_ROLES = new Set(['sales_rep', 'supervisor', 'driver', 'warehouse']);
const OPTIONAL_ROLES = new Set(['super_admin', 'tenant_admin']);

const InstallGating: Component = () => {
    const [installAvailable, setInstallAvailable] = createSignal(false);
    const [dismissed, setDismissed] = createSignal(false);
    const [installing, setInstalling] = createSignal(false);

    const isRequiredRole = () => REQUIRED_ROLES.has(currentUser()?.role || '');
    const isOptionalRole = () => OPTIONAL_ROLES.has(currentUser()?.role || '') || location.pathname.startsWith('/customer');
    const shouldShow = () => installAvailable() && !isInstalledPWA();

    const handleInstall = async () => {
        if (!canInstall()) return;
        setInstalling(true);
        await promptInstall();
        setInstalling(false);
    };

    createEffect(() => {
        const handler = () => setInstallAvailable(true);
        window.addEventListener('pwa-install-available', handler as EventListener);
        syncInstallState();
        setInstallAvailable(canInstall());

        onCleanup(() => window.removeEventListener('pwa-install-available', handler as EventListener));
    });

    return (
        <Show when={shouldShow()}>
            <Show when={isRequiredRole()}>
                <div class="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/80 backdrop-blur">
                    <div class="w-[92%] max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-11 h-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
                                    <Smartphone class="w-6 h-6 text-indigo-300" />
                                </div>
                                <div>
                                    <h2 class="text-white font-semibold text-lg">Install required</h2>
                                    <p class="text-slate-400 text-sm">Add the app to your home screen to continue.</p>
                                </div>
                            </div>
                        </div>

                        <div class="mt-5 rounded-2xl bg-slate-800/60 border border-slate-700/60 p-4 text-sm text-slate-300">
                            Faster access, offline-ready shell, and smoother GPS tracking.
                        </div>

                        <button
                            type="button"
                            onClick={handleInstall}
                            disabled={!canInstall() || installing()}
                            class="mt-5 w-full rounded-2xl bg-indigo-500 text-white font-semibold py-3 transition-all hover:bg-indigo-400 disabled:opacity-60"
                        >
                            {installing() ? 'Installing…' : 'Install now'}
                        </button>
                    </div>
                </div>
            </Show>

            <Show when={isOptionalRole() && !dismissed()}>
                <div class="fixed bottom-4 left-4 right-4 z-[9997]">
                    <div class="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                        <div class="flex items-start gap-3">
                            <div class="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                <DownloadCloud class="w-5 h-5 text-blue-300" />
                            </div>
                            <div class="flex-1">
                                <h3 class="text-white font-semibold">Install the app</h3>
                                <p class="text-slate-400 text-sm">Get quick access from your home screen.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDismissed(true)}
                                class="text-slate-400 hover:text-white"
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </div>
                        <div class="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={handleInstall}
                                disabled={!canInstall() || installing()}
                                class="flex-1 rounded-xl bg-blue-500 text-white font-semibold py-2.5 text-sm hover:bg-blue-400 disabled:opacity-60"
                            >
                                {installing() ? 'Installing…' : 'Install'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDismissed(true)}
                                class="flex-1 rounded-xl border border-slate-700 text-slate-300 font-semibold py-2.5 text-sm hover:border-slate-500"
                            >
                                Maybe later
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </Show>
    );
};

export default InstallGating;
