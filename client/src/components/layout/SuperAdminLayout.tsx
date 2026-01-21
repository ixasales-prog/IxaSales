import { type Component, Show, createSignal } from 'solid-js';
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
    Package
} from 'lucide-solid';
import { logout } from '../../stores/auth';
import { useBranding } from '../../stores/branding';
import AnnouncementBanner from '../common/AnnouncementBanner';

const SuperAdminLayout: Component<{ children: any }> = (props) => {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = createSignal(true);
    const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);

    const navItems = [
        { path: '/super', icon: LayoutDashboard, label: 'Overview' },
        { path: '/super/tenants', icon: Building, label: 'Tenants' },
        { path: '/super/users', icon: Users, label: 'Global Users' },
        { path: '/super/audit-logs', icon: ShieldAlert, label: 'Audit Logs' },
        { path: '/super/health', icon: Activity, label: 'System Health' },
        { path: '/super/master-catalog', icon: Package, label: 'Master Catalog' },
    ];

    const isActive = (path: string) => location.pathname === path;

    const handleLogout = () => {
        logout();
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
                        <span class="font-bold text-xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            {useBranding().platformName} Super
                        </span>
                    </Show>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen())}
                        class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <Menu class="w-5 h-5" />
                    </button>
                </div>

                {/* Nav Items */}
                <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <A
                            href={item.path}
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
                        class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                    >
                        <Settings class="w-5 h-5 flex-shrink-0" />
                        <Show when={sidebarOpen()}>
                            <span class="font-medium">Settings</span>
                        </Show>
                    </A>
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
                <span class="font-bold text-lg bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    IxaSuper
                </span>
                <div class="w-10" />
            </div>

            {/* Mobile Sidebar Overlay */}
            <Show when={mobileMenuOpen()}>
                <div
                    class="lg:hidden fixed inset-0 bg-black/50 z-50"
                    onClick={() => setMobileMenuOpen(false)}
                />
                <aside class="lg:hidden fixed left-0 top-0 h-full w-72 bg-slate-900 z-50 p-4">
                    <div class="flex items-center justify-between mb-6">
                        <span class="font-bold text-xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            IxaSuper
                        </span>
                        <button
                            onClick={() => setMobileMenuOpen(false)}
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
                            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        >
                            <Settings class="w-5 h-5" />
                            <span class="font-medium">Settings</span>
                        </A>
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

export default SuperAdminLayout;
