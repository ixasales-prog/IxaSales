import { type Component, Show, For, createSignal, onMount } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import {
    LayoutDashboard,
    Users,
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
    ChevronDown
} from 'lucide-solid';
import { logout } from '../../stores/auth';
import { useBranding } from '../../stores/branding';
import { initSettings } from '../../stores/settings';
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

const STORAGE_KEY = 'admin-sidebar-sections';

function loadCollapsedSections(): Record<string, boolean> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function saveCollapsedSections(state: Record<string, boolean>) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
}

const AdminLayout: Component<{ children: any }> = (props) => {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = createSignal(true);
    const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
    const [collapsedSections, setCollapsedSections] = createSignal<Record<string, boolean>>(loadCollapsedSections());

    // Initialize tenant settings on mount (for already logged-in users)
    onMount(() => {
        initSettings();
    });

    const topItems: NavItem[] = [
        { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    ];

    const navSections: NavSection[] = [
        {
            key: 'sales',
            label: 'Sales',
            items: [
                { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
                { path: '/admin/returns', icon: RotateCcw, label: 'Returns' },
                { path: '/admin/discounts', icon: Percent, label: 'Discounts' },
                { path: '/admin/reports', icon: BarChart3, label: 'Reports' },
            ],
        },
        {
            key: 'catalog',
            label: 'Catalog',
            items: [
                { path: '/admin/products', icon: Package, label: 'Products' },
                { path: '/admin/categories', icon: Tag, label: 'Categories' },
                { path: '/admin/brands', icon: Package, label: 'Brands' },
                { path: '/admin/inventory', icon: Warehouse, label: 'Inventory' },
            ],
        },
        {
            key: 'supply',
            label: 'Supply Chain',
            items: [
                { path: '/admin/procurement', icon: ShoppingBag, label: 'Procurement' },
                { path: '/admin/deliveries', icon: Truck, label: 'Deliveries' },
                { path: '/admin/vehicles', icon: CarFront, label: 'Vehicles' },
            ],
        },
        {
            key: 'crm',
            label: 'CRM',
            items: [
                { path: '/admin/customers', icon: Users, label: 'Customers' },
                { path: '/admin/territories', icon: MapPin, label: 'Territories' },
                { path: '/admin/customer-tiers', icon: Crown, label: 'Customer Tiers' },
            ],
        },
        {
            key: 'system',
            label: 'System',
            items: [
                { path: '/admin/users', icon: Users, label: 'Users' },
                { path: '/admin/notification-settings', icon: Bell, label: 'Notifications' },
                { path: '/admin/payment-settings', icon: CreditCard, label: 'Payment Gateway' },
                { path: '/admin/settings', icon: Settings, label: 'Settings' },
            ],
        },
    ];

    const isActive = (path: string) => location.pathname === path;

    const isSectionActive = (section: NavSection) =>
        section.items.some((item) => isActive(item.path));

    const toggleSection = (key: string) => {
        const updated = { ...collapsedSections(), [key]: !collapsedSections()[key] };
        setCollapsedSections(updated);
        saveCollapsedSections(updated);
    };

    const isSectionCollapsed = (key: string) => !!collapsedSections()[key];

    const handleLogout = () => {
        logout();
    };

    // Renders a single nav section (used by both desktop & mobile)
    const renderSection = (section: NavSection, mobile = false) => {
        const collapsed = () => isSectionCollapsed(section.key);
        const active = () => isSectionActive(section);

        return (
            <div class="mb-1">
                {/* Section header – only show when sidebar is expanded */}
                <Show when={sidebarOpen() || mobile}>
                    <button
                        onClick={() => toggleSection(section.key)}
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
                    class={`space-y-0.5 overflow-hidden transition-all duration-200 ${collapsed() && (sidebarOpen() || mobile) ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                        }`}
                >
                    <For each={section.items}>
                        {(item) => (
                            <A
                                href={item.path}
                                onClick={() => mobile && setMobileMenuOpen(false)}
                                class={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isActive(item.path)
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
        <div class="min-h-screen bg-slate-950 flex">
            {/* Desktop Sidebar */}
            <aside
                class={`hidden lg:flex flex-col fixed left-0 top-0 h-full bg-slate-900/50 border-r border-slate-800/50 backdrop-blur-xl transition-all duration-300 z-40 ${sidebarOpen() ? 'w-64' : 'w-20'
                    }`}
            >
                {/* Logo */}
                <div class="h-16 flex items-center justify-between px-4 border-b border-slate-800/50">
                    <Show when={sidebarOpen()}>
                        <span class="font-bold text-xl bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {useBranding().platformName}
                        </span>
                    </Show>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen())}
                        class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <Menu class="w-5 h-5" />
                    </button>
                </div>

                {/* Nav Sections */}
                <nav class="flex-1 p-3 space-y-1 overflow-y-auto sidebar-nav">
                    {/* Top-level items (Dashboard) */}
                    <For each={topItems}>
                        {(item) => (
                            <A
                                href={item.path}
                                class={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all mb-2 ${isActive(item.path)
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }`}
                            >
                                <item.icon class="w-5 h-5 flex-shrink-0" />
                                <Show when={sidebarOpen()}>
                                    <span class="font-medium text-sm">{item.label}</span>
                                </Show>
                            </A>
                        )}
                    </For>
                    <For each={navSections}>
                        {(section) => renderSection(section)}
                    </For>
                </nav>

                {/* Bottom Actions */}
                <div class="p-3 border-t border-slate-800/50">
                    <button
                        onClick={handleLogout}
                        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                    >
                        <LogOut class="w-5 h-5 flex-shrink-0" />
                        <Show when={sidebarOpen()}>
                            <span class="font-medium">Logout</span>
                        </Show>
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <div class="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between px-4 z-40">
                <button
                    onClick={() => setMobileMenuOpen(true)}
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
                    class="lg:hidden fixed inset-0 bg-black/50 z-50"
                    onClick={() => setMobileMenuOpen(false)}
                />
                <aside class="lg:hidden fixed left-0 top-0 h-full w-72 bg-slate-900 z-50 flex flex-col">
                    <div class="flex items-center justify-between p-4">
                        <span class="font-bold text-xl bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            {useBranding().platformName}
                        </span>
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            class="p-2 text-slate-400 hover:text-white"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                    <nav class="flex-1 p-3 space-y-1 overflow-y-auto sidebar-nav">
                        {/* Top-level items (Dashboard) */}
                        <For each={topItems}>
                            {(item) => (
                                <A
                                    href={item.path}
                                    onClick={() => setMobileMenuOpen(false)}
                                    class={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all mb-2 ${isActive(item.path)
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                        }`}
                                >
                                    <item.icon class="w-5 h-5 flex-shrink-0" />
                                    <span class="font-medium text-sm">{item.label}</span>
                                </A>
                            )}
                        </For>
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
                            <span class="font-medium">Logout</span>
                        </button>
                    </div>
                </aside>
            </Show>

            {/* Main Content */}
            <main
                class={`flex-1 min-h-screen transition-all duration-300 ${sidebarOpen() ? 'lg:ml-64' : 'lg:ml-20'
                    } pt-16 lg:pt-0`}
            >
                <AnnouncementBanner />
                {props.children}
            </main>
        </div>
    );
};

export default AdminLayout;

