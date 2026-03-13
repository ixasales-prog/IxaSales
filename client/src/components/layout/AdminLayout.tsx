import { type Component, Show, For, createSignal, onMount, onCleanup } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import {
    LayoutDashboard,
    User,
    Users,
    UserPlus,
    Package,
    ShoppingCart,
    Truck,
    Settings,
    LogOut,
    Menu,
    X,
    Bell,
    Tag,
    Percent,
    ShoppingBag,
    Crown,
    RotateCcw,
    Warehouse,
    CarFront,
    CreditCard,
    BarChart3,
    MapPin,
    ChevronDown,
    ArrowRightLeft,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-solid';
import { currentUser, logout } from '../../stores/auth';
import { useBranding } from '../../stores/branding';
import { initSettings } from '../../stores/settings';
import { useI18n } from '../../i18n';
import AnnouncementBanner from '../common/AnnouncementBanner';

interface NavItem {
    path: string;
    icon: any;
    label: string;
}

interface NavSection {
    key: string;
    label: string;
    items: NavItem[];
}

const STORAGE_KEY_PREFIX = 'admin-sidebar-sections';

function loadCollapsedSections(storageKey: string): Record<string, boolean> {
    try {
        const stored = localStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function saveCollapsedSections(storageKey: string, state: Record<string, boolean>) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch { /* ignore */ }
}

const AdminLayout: Component<{ children: any }> = (props) => {
    const { t } = useI18n();
    const location = useLocation();
    const sidebarStorageKey = () => {
        const user = currentUser();
        const tenant = user?.tenantId ?? user?.tenant_id ?? 'default-tenant';
        const userId = user?.id ?? 'default-user';
        return `${STORAGE_KEY_PREFIX}:${tenant}:${userId}`;
    };
    const [sidebarOpen, setSidebarOpen] = createSignal(true);
    const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
    const [collapsedSections, setCollapsedSections] = createSignal<Record<string, boolean>>(loadCollapsedSections(sidebarStorageKey()));
    const [isDesktop, setIsDesktop] = createSignal(false);
    const desktopSidebarWidth = () => (sidebarOpen() ? '16rem' : '5rem');

    // Initialize tenant settings on mount (for already logged-in users)
    onMount(() => {
        initSettings();
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

    const navSections: NavSection[] = [
        {
            key: 'sales',
            label: t('layoutNav.admin.sections.sales'),
            items: [
                { path: '/admin/orders', icon: ShoppingCart, label: t('layoutNav.admin.items.orders') },
                { path: '/admin/money-transfers', icon: ArrowRightLeft, label: t('layoutNav.admin.items.moneyTransfers') },
                { path: '/admin/returns', icon: RotateCcw, label: t('layoutNav.admin.items.returns') },
                { path: '/admin/discounts', icon: Percent, label: t('layoutNav.admin.items.discounts') },
                { path: '/admin/reports', icon: BarChart3, label: t('layoutNav.admin.items.reports') },
            ],
        },
        {
            key: 'payroll',
            label: t('layoutNav.admin.sections.payroll'),
            items: [
                { path: '/admin/payroll/periods', icon: BarChart3, label: t('layoutNav.admin.items.periods') },
                { path: '/admin/payroll/run', icon: CreditCard, label: t('layoutNav.admin.items.runPayroll') },
                { path: '/admin/payroll/salaries', icon: ShoppingCart, label: t('layoutNav.admin.items.salaries') },
                { path: '/admin/payroll/commissions', icon: Percent, label: t('layoutNav.admin.items.commissions') },
            ],
        },
        {
            key: 'catalog',
            label: t('layoutNav.admin.sections.catalog'),
            items: [
                { path: '/admin/products', icon: Package, label: t('layoutNav.admin.items.products') },
                { path: '/admin/categories', icon: Tag, label: t('layoutNav.admin.items.categories') },
                { path: '/admin/brands', icon: Package, label: t('layoutNav.admin.items.brands') },
                { path: '/admin/inventory', icon: Warehouse, label: t('layoutNav.admin.items.inventory') },
            ],
        },
        {
            key: 'supply',
            label: t('layoutNav.admin.sections.supply'),
            items: [
                { path: '/admin/procurement', icon: ShoppingBag, label: t('layoutNav.admin.items.procurement') },
                { path: '/admin/deliveries', icon: Truck, label: t('layoutNav.admin.items.deliveries') },
                { path: '/admin/vehicles', icon: CarFront, label: t('layoutNav.admin.items.vehicles') },
            ],
        },
        {
            key: 'crm',
            label: t('layoutNav.admin.sections.crm'),
            items: [
                { path: '/admin/customers', icon: Users, label: t('layoutNav.admin.items.customers') },
                { path: '/admin/customers/registration-requests', icon: UserPlus, label: t('layoutNav.admin.items.registrationRequests') },
                { path: '/admin/territories', icon: MapPin, label: t('layoutNav.admin.items.territories') },
                { path: '/admin/customer-tiers', icon: Crown, label: t('layoutNav.admin.items.customerTiers') },
            ],
        },
        {
            key: 'company',
            label: t('layoutNav.admin.sections.company'),
            items: [
                { path: '/admin/company-profile', icon: Package, label: t('layoutNav.admin.items.companyProfile') },
                { path: '/admin/business-settings', icon: Settings, label: t('layoutNav.admin.items.businessSettings') },
                { path: '/admin/subscription', icon: Crown, label: t('layoutNav.admin.items.subscription') },
            ],
        },
        {
            key: 'integrations',
            label: t('layoutNav.admin.sections.integrations'),
            items: [
                { path: '/admin/notification-settings', icon: Bell, label: t('layoutNav.admin.items.notifications') },
                { path: '/admin/payment-settings', icon: CreditCard, label: t('layoutNav.admin.items.paymentGateway') },
                { path: '/admin/telegram', icon: Bell, label: t('layoutNav.admin.items.telegramBot') },
                { path: '/admin/salesdoc', icon: Settings, label: 'Salesdoc.io' },
                { path: '/admin/gps-tracking', icon: MapPin, label: t('layoutNav.admin.items.gpsTracking') },
            ],
        },
        {
            key: 'system',
            label: t('layoutNav.admin.sections.system'),
            items: [
                { path: '/admin/profile', icon: User, label: t('layoutNav.admin.items.myProfile') },
                { path: '/admin/users', icon: Users, label: t('layoutNav.admin.items.users') },
                { path: '/admin/data-export', icon: BarChart3, label: t('layoutNav.admin.items.backupRestore') },
            ],
        },
    ];

    const isActive = (path: string) =>
        path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname === path || location.pathname.startsWith(`${path}/`);

    const isSectionActive = (section: NavSection) =>
        section.items.some((item) => isActive(item.path));

    const toggleSection = (key: string) => {
        const updated = { ...collapsedSections(), [key]: !collapsedSections()[key] };
        setCollapsedSections(updated);
        saveCollapsedSections(sidebarStorageKey(), updated);
    };

    const isSectionCollapsed = (key: string) => !!collapsedSections()[key];
    const expandAllSections = () => {
        const updated: Record<string, boolean> = {};
        setCollapsedSections(updated);
        saveCollapsedSections(sidebarStorageKey(), updated);
    };
    const collapseAllSections = () => {
        const updated: Record<string, boolean> = Object.fromEntries(
            navSections.map((section) => [section.key, true])
        );
        setCollapsedSections(updated);
        saveCollapsedSections(sidebarStorageKey(), updated);
    };

    const handleLogout = () => {
        logout();
    };

    // Renders a single nav section (used by both desktop & mobile)
    const renderSection = (section: NavSection, mobile = false) => {
        const active = () => isSectionActive(section);
        const collapsed = () => isSectionCollapsed(section.key) && !active();

        return (
            <div class="mb-1">
                {/* Section header – only show when sidebar is expanded */}
                <Show when={sidebarOpen() || mobile}>
                    <button
                        onClick={() => toggleSection(section.key)}
                        aria-expanded={!collapsed()}
                        aria-controls={`admin-nav-section-${section.key}`}
                        class={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${active()
                            ? 'text-blue-400'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <span>{section.label}</span>
                        <ChevronDown
                            class={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed() ? '-rotate-90' : ''
                                }`}
                        />
                    </button>
                </Show>

                {/* Section items */}
                <div
                    id={`admin-nav-section-${section.key}`}
                    class={`space-y-0.5 overflow-hidden transition-all duration-200 ${collapsed() && (sidebarOpen() || mobile) ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                        }`}
                >
                    <For each={section.items}>
                        {(item) => (
                            <A
                                href={item.path}
                                onClick={() => mobile && setMobileMenuOpen(false)}
                                aria-label={item.label}
                                title={item.label}
                                class={`flex items-center py-2 rounded-xl transition-all ${sidebarOpen() || mobile ? 'gap-3 px-3' : 'justify-center px-2'
                                    } ${isActive(item.path)
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }`}
                            >
                                <item.icon class="w-5 h-5 flex-shrink-0" />
                                <Show when={sidebarOpen() || mobile}>
                                    <span class="font-medium text-sm">{item.label}</span>
                                </Show>
                            </A>
                        )}
                    </For>
                </div>
            </div>
        );
    };

    return (
        <div class="min-h-screen bg-slate-950 flex" style={{ '--admin-sidebar-width': desktopSidebarWidth() }}>
            {/* Desktop Sidebar */}
            <aside
                class="flex-col fixed left-0 top-0 h-full w-[var(--admin-sidebar-width)] overflow-hidden bg-slate-900/50 border-r border-slate-800/50 backdrop-blur-xl transition-all duration-300 z-40"
                style={{ display: isDesktop() ? 'flex' : 'none' }}
            >
                {/* Logo */}
                <div class={`h-16 flex items-center border-b border-slate-800/50 overflow-hidden ${sidebarOpen() ? 'justify-between px-4' : 'justify-center px-2'}`}>
                    <Show when={sidebarOpen()}>
                        <span class="font-bold text-xl bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {useBranding().platformName}
                        </span>
                    </Show>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen())}
                        aria-label={sidebarOpen() ? t('layoutNav.admin.collapseSidebar') : t('layoutNav.admin.expandSidebar')}
                        class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <Show when={sidebarOpen()} fallback={<PanelLeftOpen class="w-5 h-5" />}>
                            <PanelLeftClose class="w-5 h-5" />
                        </Show>
                    </button>
                </div>

                {/* Nav Sections */}
                <nav class={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden sidebar-nav ${sidebarOpen() ? 'p-3' : 'p-2'} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
                    <div class={`flex items-center mb-2 ${sidebarOpen() ? 'gap-2' : 'justify-center'}`}>
                        <A
                            href="/admin"
                            aria-label={t('layoutNav.admin.dashboard')}
                            title={t('layoutNav.admin.dashboard')}
                            class={`flex items-center py-2 rounded-xl transition-all ${sidebarOpen() ? 'flex-1 gap-3 px-3' : 'w-full justify-center px-2'
                                } ${isActive('/admin')
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                        >
                            <LayoutDashboard class="w-5 h-5 flex-shrink-0" />
                            <Show when={sidebarOpen()}>
                                <span class="font-medium text-sm">{t('layoutNav.admin.dashboard')}</span>
                            </Show>
                        </A>
                        <Show when={sidebarOpen()}>
                            <div class="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={expandAllSections}
                                    aria-label={t('layoutNav.admin.expandAllSections')}
                                    title={t('layoutNav.admin.expandAllSections')}
                                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronDown class="w-4 h-4 rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    onClick={collapseAllSections}
                                    aria-label={t('layoutNav.admin.collapseAllSections')}
                                    title={t('layoutNav.admin.collapseAllSections')}
                                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronDown class="w-4 h-4" />
                                </button>
                            </div>
                        </Show>
                    </div>
                    <For each={navSections}>
                        {(section) => renderSection(section)}
                    </For>
                </nav>

                {/* Bottom Actions */}
                <div class="p-3 border-t border-slate-800/50">
                    <button
                        onClick={handleLogout}
                        class={`w-full flex items-center px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all ${sidebarOpen() ? 'gap-3 justify-start' : 'justify-center'
                            }`}
                    >
                        <LogOut class="w-5 h-5 flex-shrink-0" />
                        <Show when={sidebarOpen()}>
                            <span class="font-medium">{t('layoutNav.admin.logout')}</span>
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
                    aria-label={t('layoutNav.admin.openNavigationMenu')}
                    class="p-2 text-slate-400 hover:text-white"
                >
                    <Menu class="w-6 h-6" />
                </button>
                <span class="font-bold text-lg bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    {useBranding().platformName}
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
                    aria-label={t('layoutNav.admin.adminNavigation')}
                    class="fixed left-0 top-0 h-full w-72 bg-slate-900 z-50 flex flex-col"
                >
                    <div class="flex items-center justify-between p-4">
                        <span class="font-bold text-xl bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {useBranding().platformName}
                        </span>
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            aria-label={t('layoutNav.admin.closeNavigationMenu')}
                            class="p-2 text-slate-400 hover:text-white"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                    <nav class="flex-1 p-3 space-y-1 overflow-y-auto sidebar-nav">
                        <div class="flex items-center gap-2 mb-2">
                            <A
                                href="/admin"
                                onClick={() => setMobileMenuOpen(false)}
                                aria-label={t('layoutNav.admin.dashboard')}
                                class={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isActive('/admin')
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }`}
                            >
                                <LayoutDashboard class="w-5 h-5 flex-shrink-0" />
                                <span class="font-medium text-sm">{t('layoutNav.admin.dashboard')}</span>
                            </A>
                            <div class="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={expandAllSections}
                                    aria-label={t('layoutNav.admin.expandAllSections')}
                                    title={t('layoutNav.admin.expandAllSections')}
                                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronDown class="w-4 h-4 rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    onClick={collapseAllSections}
                                    aria-label={t('layoutNav.admin.collapseAllSections')}
                                    title={t('layoutNav.admin.collapseAllSections')}
                                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronDown class="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <For each={navSections}>
                            {(section) => renderSection(section, true)}
                        </For>
                    </nav>

                    <div class="p-3 border-t border-slate-800">
                        <button
                            onClick={handleLogout}
                            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                        >
                            <LogOut class="w-5 h-5" />
                            <span class="font-medium">{t('layoutNav.admin.logout')}</span>
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

export default AdminLayout;

