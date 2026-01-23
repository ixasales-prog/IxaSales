import { type Component, Show, createSignal, onMount, onCleanup, createMemo } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { WifiOff, RefreshCw, Download, X } from 'lucide-solid';
import { isOnline, syncQueue, isSyncing, triggerSync } from '../stores/offline';
import { canInstall, promptInstall } from '../lib/pwa';
import { currentUser } from '../stores/auth';
import { getPlatformName } from '../stores/branding';

const OfflineIndicator: Component = () => {
    const [showInstallBanner, setShowInstallBanner] = createSignal(false);
    const [showUpdateBanner, setShowUpdateBanner] = createSignal(false);
    const [isMobile, setIsMobile] = createSignal(false);
    const location = useLocation();

    const installAudience = createMemo(() => {
        const role = currentUser()?.role;
        if (location.pathname.startsWith('/pay')) return 'none';
        if (role) {
            if (['sales_rep', 'supervisor', 'warehouse', 'driver'].includes(role)) return 'required';
            if (['tenant_admin', 'super_admin'].includes(role)) return 'none';
            return 'optional';
        }
        if (location.pathname.startsWith('/customer')) return 'optional';
        return 'none';
    });

    const shouldOfferInstall = createMemo(() => installAudience() !== 'none' && isMobile());
    const platformName = createMemo(() => getPlatformName() || 'IxaSales');
    const installTitle = createMemo(() => `Install ${platformName()}`);
    const installDescription = createMemo(() =>
        installAudience() === 'optional'
            ? 'Optional: add to home screen for faster access'
            : 'Add to home screen for faster access and offline use'
    );
    const installButtonLabel = createMemo(() =>
        installAudience() === 'optional' ? 'Install (Optional)' : 'Install App'
    );

    onMount(() => {
        const handleInstallAvailable = () => setShowInstallBanner(true);
        window.addEventListener('pwa-install-available', handleInstallAvailable);

        const handleUpdateAvailable = () => setShowUpdateBanner(true);
        window.addEventListener('pwa-update-available', handleUpdateAvailable);

        const updateIsMobile = () => {
            setIsMobile(
                window.matchMedia('(pointer: coarse)').matches ||
                window.matchMedia('(max-width: 1024px)').matches
            );
        };

        updateIsMobile();
        window.addEventListener('resize', updateIsMobile);

        onCleanup(() => {
            window.removeEventListener('pwa-install-available', handleInstallAvailable);
            window.removeEventListener('pwa-update-available', handleUpdateAvailable);
            window.removeEventListener('resize', updateIsMobile);
        });
    });

    const handleInstall = async () => {
        const installed = await promptInstall();
        if (installed) {
            setShowInstallBanner(false);
        }
    };

    const handleUpdate = () => {
        window.location.reload();
    };

    return (
        <>
            {/* Offline Banner */}
            <Show when={!isOnline()}>
                <div class="fixed top-0 left-0 right-0 bg-orange-500 text-white text-center py-2 px-4 z-[100] flex items-center justify-center gap-2 text-sm font-medium">
                    <WifiOff class="w-4 h-4" />
                    You're offline. Changes will sync when connected.
                    <Show when={syncQueue().length > 0}>
                        <span class="px-2 py-0.5 bg-white/20 rounded-full text-xs ml-2">
                            {syncQueue().length} pending
                        </span>
                    </Show>
                </div>
            </Show>

            {/* Syncing Indicator */}
            <Show when={isOnline() && isSyncing()}>
                <div class="fixed top-0 left-0 right-0 bg-blue-500 text-white text-center py-2 px-4 z-[100] flex items-center justify-center gap-2 text-sm font-medium">
                    <RefreshCw class="w-4 h-4 animate-spin" />
                    Syncing changes...
                </div>
            </Show>

            {/* Back Online with Pending */}
            <Show when={isOnline() && !isSyncing() && syncQueue().length > 0}>
                <div class="fixed top-0 left-0 right-0 bg-emerald-500 text-white text-center py-2 px-4 z-[100] flex items-center justify-center gap-2 text-sm font-medium">
                    <span>{syncQueue().length} changes ready to sync</span>
                    <button
                        onClick={() => triggerSync()}
                        class="px-3 py-1 bg-white/20 rounded-lg text-xs font-bold hover:bg-white/30 transition-colors"
                    >
                        Sync Now
                    </button>
                </div>
            </Show>

            <Show when={showInstallBanner() && canInstall() && shouldOfferInstall()}>
                <div class="fixed bottom-20 left-4 right-4 bg-slate-900 border border-slate-700 rounded-2xl p-4 z-[100] shadow-xl">
                    <button
                        onClick={() => setShowInstallBanner(false)}
                        class="absolute top-2 right-2 p-1 text-slate-400 hover:text-white"
                    >
                        <X class="w-4 h-4" />
                    </button>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <Download class="w-6 h-6 text-white" />
                        </div>
                        <div class="flex-1">
                            <h3 class="text-white font-semibold">{installTitle()}</h3>
                            <p class="text-slate-400 text-sm">{installDescription()}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleInstall}
                        class="w-full mt-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all"
                    >
                        {installButtonLabel()}
                    </button>
                </div>
            </Show>

            {/* Update Banner */}
            <Show when={showUpdateBanner()}>
                <div class="fixed bottom-20 left-4 right-4 bg-slate-900 border border-slate-700 rounded-2xl p-4 z-[100] shadow-xl">
                    <button
                        onClick={() => setShowUpdateBanner(false)}
                        class="absolute top-2 right-2 p-1 text-slate-400 hover:text-white"
                    >
                        <X class="w-4 h-4" />
                    </button>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <RefreshCw class="w-6 h-6 text-white" />
                        </div>
                        <div class="flex-1">
                            <h3 class="text-white font-semibold">Update Available</h3>
                            <p class="text-slate-400 text-sm">A new version is ready to install</p>
                        </div>
                    </div>
                    <button
                        onClick={handleUpdate}
                        class="w-full mt-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all"
                    >
                        Update Now
                    </button>
                </div>
            </Show>
        </>
    );
};

export default OfflineIndicator;
