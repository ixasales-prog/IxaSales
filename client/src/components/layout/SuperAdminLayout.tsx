import { type Component, Show, createSignal, onMount, onCleanup } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import {
    LayoutDashboard,
    Building,
    Settings,
    LogOut,
    Menu,
    X,
    Users,
    ShieldAlert,
    Activity,
    Package,
    CreditCard,
    Database,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-solid';
import { logout } from '../../stores/auth';
import { useBranding } from '../../stores/branding';
import { useI18n } from '../../i18n';
import AnnouncementBanner from '../common/AnnouncementBanner';

const SuperAdminLayout: Component<{ children: any }> = (props) => {
    const { t } = useI18n();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = createSignal(true);
    const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
    const [isDesktop, setIsDesktop] = createSignal(false);
    const desktopSidebarWidth = () => (sidebarOpen() ? '16rem' : '5rem');

    const navItems = [
        { path: '/super', icon: LayoutDashboard, label: t('layoutNav.super.overview') },
        { path: '/super/tenants', icon: Building, label: t('layoutNav.super.tenants') },
        { path: '/super/users', icon: Users, label: t('layoutNav.super.globalUsers') },
        { path: '/super/audit-logs', icon: ShieldAlert, label: t('layoutNav.super.auditLogs') },
        { path: '/super/subscription', icon: CreditCard, label: t('layoutNav.super.subscription') },
        { path: '/super/backup/operations', icon: Database, label: t('layoutNav.super.backupOps') },
        { path: '/super/health', icon: Activity, label: t('layoutNav.super.systemHealth') },
        { path: '/super/master-catalog', icon: Package, label: t('layoutNav.super.masterCatalog') },
    ];

    const isActive = (path: string) =>
        path === '/super'
            ? location.pathname === '/super'
            : location.pathname === path || location.pathname.startsWith(`${path}/`);

    const handleLogout = () => {
        logout();
    };

    onMount(() => {
        const desktopMq = window.matchMedia('(min-width: 1024px)');
        const coarsePointerMq = window.matchMedia('(pointer: coarse)');
        const handleBreakpointChange = () => {
            const uaMobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const viewportWidth = Math.min(
                window.innerWidth || Number.POSITIVE_INFINITY,
                window.screen?.width || Number.POSITIVE_INFINITY,
                window.visualViewport?.width || Number.POSITIVE_INFINITY
            );
            const desktop = desktopMq.matches && !coarsePointerMq.matches && !uaMobile && viewportWidth >= 1024;
            setIsDesktop(desktop);
            if (desktop) setMobileMenuOpen(false);
        };
        handleBreakpointChange();
        desktopMq.addEventListener('change', handleBreakpointChange);
        coarsePointerMq.addEventListener('change', handleBreakpointChange);
        onCleanup(() => {
            desktopMq.removeEventListener('change', handleBreakpointChange);
            coarsePointerMq.removeEventListener('change', handleBreakpointChange);
        });
    });

    return (
        <div class="min-h-screen bg-slate-950 flex">
            {/* Desktop Sidebar */}
            <aside
                class="flex-col fixed left-0 top-0 h-full bg-slate-900/50 border-r border-slate-800/50 backdrop-blur-xl transition-all duration-300 z-40"
                style={{ display: isDesktop() ? 'flex' : 'none', width: desktopSidebarWidth() }}
            >
                {/* Logo */}
                <div class="h-16 flex items-center justify-between px-4 border-b border-slate-800/50">
                    <Show when={sidebarOpen()}>
                        <span class="font-bold text-xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            {useBranding().platformName} Super
                        </span>
                    </Show>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen())}
                        aria-label={sidebarOpen() ? t('layoutNav.super.collapseSidebar') : t('layoutNav.super.expandSidebar')}
                        class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <Show when={sidebarOpen()} fallback={<PanelLeftOpen class="w-5 h-5" />}>
                            <PanelLeftClose class="w-5 h-5" />
                        </Show>
                    </button>
                </div>

                {/* Nav Items */}
                <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <A
                            href={item.path}
                            aria-label={item.label}
                            title={item.label}
                            class={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive(item.path)
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                        >
                            <item.icon class="w-5 h-5 flex-shrink-0" />
                            <Show when={sidebarOpen()}>
                                <span class="font-medium">{item.label}</span>
                            </Show>
                        </A>
                    ))}
                </nav>

                {/* Bottom Actions */}
                <div class="p-3 border-t border-slate-800/50 space-y-1">
                    <A
                        href="/super/settings"
                        aria-label={t('layoutNav.super.settings')}
                        title={t('layoutNav.super.settings')}
                        class={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive('/super/settings')
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }`}
                    >
                        <Settings class="w-5 h-5 flex-shrink-0" />
                        <Show when={sidebarOpen()}>
                            <span class="font-medium">{t('layoutNav.super.settings')}</span>
                        </Show>
                    </A>
                    <button
                        onClick={handleLogout}
                        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                        <LogOut class="w-5 h-5 flex-shrink-0" />
                        <Show when={sidebarOpen()}>
                            <span class="font-medium">{t('layoutNav.super.logout')}</span>
                        </Show>
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <div
                class="sticky top-0 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between px-4 z-40"
                style={{ display: isDesktop() ? 'none' : 'flex' }}
            >
                <button
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label={t('layoutNav.super.openNavigationMenu')}
                    class="p-2 text-slate-400 hover:text-white"
                >
                    <Menu class="w-6 h-6" />
                </button>
                <span class="font-bold text-lg bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    IxaSuper
                </span>
                <div class="w-10" />
            </div>

            {/* Mobile Sidebar Overlay */}
            <Show when={mobileMenuOpen()}>
                <div
                    class="fixed inset-0 bg-black/50 z-50"
                    onClick={() => setMobileMenuOpen(false)}
                />
                <aside
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('layoutNav.super.navigation')}
                    class="fixed left-0 top-0 h-full w-72 bg-slate-900 z-50 p-4"
                >
                    <div class="flex items-center justify-between mb-6">
                        <span class="font-bold text-xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            IxaSuper
                        </span>
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            aria-label={t('layoutNav.super.closeNavigationMenu')}
                            class="p-2 text-slate-400 hover:text-white"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                    <nav class="space-y-1 flex-1 overflow-y-auto">
                        {navItems.map((item) => (
                            <A
                                href={item.path}
                                onClick={() => setMobileMenuOpen(false)}
                                aria-label={item.label}
                                class={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive(item.path)
                                    ? 'bg-purple-600 text-white'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                            >
                                <item.icon class="w-5 h-5" />
                                <span class="font-medium">{item.label}</span>
                            </A>
                        ))}
                    </nav>

                    <div class="mt-4 pt-4 border-t border-slate-800 space-y-1">
                        <A
                            href="/super/settings"
                            onClick={() => setMobileMenuOpen(false)}
                            aria-label={t('layoutNav.super.settings')}
                            class={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive('/super/settings')
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                        >
                            <Settings class="w-5 h-5" />
                            <span class="font-medium">{t('layoutNav.super.settings')}</span>
                        </A>
                        <button
                            onClick={handleLogout}
                            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                        >
                            <LogOut class="w-5 h-5" />
                            <span class="font-medium">{t('layoutNav.super.logout')}</span>
                        </button>
                    </div>
                </aside>
            </Show>

            {/* Main Content */}
            <main
                class="flex-1 min-h-screen transition-all duration-300"
                style={{ 'margin-left': isDesktop() ? desktopSidebarWidth() : '0' }}
            >
                <AnnouncementBanner />
                {props.children}
            </main>
        </div>
    );
};

export default SuperAdminLayout;
