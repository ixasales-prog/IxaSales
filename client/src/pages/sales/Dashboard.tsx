import { type Component, For, Show, createResource, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
    TrendingUp,
    MapPin,
    Clock,
    Plus,
    Package,
    Users,
    ShoppingCart,
    Loader2,
    LogOut,
    Mail,
    Phone,
    Building2,
    Globe
} from 'lucide-solid';
import { api } from '../../lib/api';
import { currentUser, logout } from '../../stores/auth';
import { formatCurrency, formatDate } from '../../stores/settings';
import { useBranding } from '../../stores/branding';
import { useI18n } from '../../i18n';

interface DashboardStats {
    todaysSales: number;
    pendingOrders: number;
    customerCount: number;
    visits: { total: number; completed: number; inProgress: number };
}

interface RecentOrder {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
}

interface OrdersResponse {
    data?: Array<{
        id: string;
        orderNumber: string;
        customer?: { name: string } | null;
        customerName?: string;
        totalAmount: string;
        status: string;
        createdAt: string;
    }>;
    meta?: { total?: number };
}

interface CustomersResponse {
    data?: Customer[];
    meta?: { total?: number };
}

interface Customer {
    id: string;
    name: string;
    address: string | null;
    currentDebt: string | null;
}

const Dashboard: Component = () => {
    const { t, language, setLanguage, availableLanguages } = useI18n();
    const navigate = useNavigate();
    const user = currentUser();
    const branding = useBranding();
    const baseUrl = import.meta.env.VITE_API_URL || '/api';

    // Profile dropdown state
    const [showProfile, setShowProfile] = createSignal(false);

    const handleLogout = () => {
        logout();
    };

    const getRoleDisplay = () => {
        const role = user?.role || 'sales_rep';
        switch (role) {
            case 'sales_rep': return t('salesApp.menu.forSales');
            case 'supervisor': return 'Supervisor';
            case 'tenant_admin': return 'Administrator';
            default: return role;
        }
    };

    // Get time of day for greeting
    const getTimeOfDay = () => {
        const hour = new Date().getHours();
        if (hour < 12) return t('salesApp.dashboard.morning');
        if (hour < 18) return t('salesApp.dashboard.afternoon');
        return t('salesApp.dashboard.evening');
    };

    // Format current date
    const getCurrentDate = () => {
        return formatDate(new Date().toISOString(), {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    };

    const fetchRaw = async <T,>(path: string, params: Record<string, string> = {}): Promise<T> => {
        const token = localStorage.getItem('token');
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const url = new URL(`${baseUrl}${path}`, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        });

        const response = await fetch(url.toString(), { headers });
        if (response.status === 401 && token && !path.startsWith('/auth/')) {
            logout();
            throw new Error('Unauthorized');
        }
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error?.message || result.message || 'API Error');
        }
        return result as T;
    };

    // Fetch dashboard stats
    const [stats] = createResource<DashboardStats>(async () => {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const ordersRes = await fetchRaw<OrdersResponse>('/orders', {
                startDate: todayStart.toISOString(),
                endDate: todayEnd.toISOString(),
                status: 'delivered',
                limit: '500'
            });

            const orders = ordersRes.data || [];

            // Calculate today's sales
            const todaysSales = orders.reduce((sum: number, o: any) => {
                return sum + parseFloat(o.totalAmount || '0');
            }, 0);

            const pendingRes = await fetchRaw<OrdersResponse>('/orders', {
                status: 'pending',
                limit: '1'
            });
            const pendingOrders = pendingRes.meta?.total ?? pendingRes.data?.length ?? 0;

            const customersRes = await fetchRaw<CustomersResponse>('/customers', { limit: '1' });
            const customerCount = customersRes.meta?.total ?? customersRes.data?.length ?? 0;

            // Get visits stats
            const visitsRes = await api.get('/visits/stats') as any;
            const visits = visitsRes?.today || { total: 0, completed: 0, inProgress: 0 };

            return {
                todaysSales,
                pendingOrders,
                customerCount,
                visits
            };
        } catch (e) {
            return { todaysSales: 0, pendingOrders: 0, customerCount: 0, visits: { total: 0, completed: 0, inProgress: 0 } };
        }
    });

    // Fetch recent customers
    const [customers] = createResource<Customer[]>(async () => {
        try {
            const data = await api<Customer[]>('/customers', { params: { limit: '5' } });
            return data || [];
        } catch (e) {
            return [];
        }
    });

    // Fetch recent orders
    const [recentOrders] = createResource<RecentOrder[]>(async () => {
        try {
            const res = await api.get('/orders', { params: { limit: '5' } }) as OrdersResponse | any;
            const orders = res?.data || res || [];
            return orders.map((order: any) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                customerName: order.customer?.name || order.customerName || 'Unknown',
                totalAmount: order.totalAmount,
                status: order.status,
                createdAt: order.createdAt
            }));
        } catch (e) {
            return [];
        }
    });

    const statCards = () => [
        {
            label: t('salesApp.dashboard.todaysSales'),
            value: formatCurrency(stats()?.todaysSales || 0),
            icon: TrendingUp,
            color: 'from-blue-600 to-indigo-600'
        },
        {
            label: t('salesApp.visits.today'),
            value: `${stats()?.visits?.completed || 0} / ${stats()?.visits?.total || 0}`,
            icon: MapPin,
            color: 'from-emerald-500 to-teal-600'
        },
        {
            label: t('salesApp.dashboard.pendingOrders'),
            value: stats()?.pendingOrders || 0,
            icon: Clock,
            color: 'from-amber-500 to-orange-600'
        },
        {
            label: t('salesApp.dashboard.myCustomers'),
            value: stats()?.customerCount || 0,
            icon: Users,
            color: 'from-purple-500 to-pink-600'
        }
    ];

    // Generate user initials for avatar
    const getInitials = () => {
        const name = user?.name || 'User';
        return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div class="px-4 pt-14 pb-4">
            {/* Header */}
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-white">
                        {t('salesApp.dashboard.greeting')
                            .replace('{timeOfDay}', getTimeOfDay())
                            .replace('{name}', user?.name?.split(' ')[0] || 'User')}
                    </h1>
                    <p class="text-slate-400 text-sm">{getCurrentDate()}</p>
                </div>
                <button
                    onClick={() => setShowProfile(!showProfile())}
                    class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm active:scale-95 transition-transform"
                >
                    {getInitials()}
                </button>
            </div>

            {/* Profile Dropdown */}
            <Show when={showProfile()}>
                <div class="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 mb-6 animate-fade-in">
                    {/* User Info */}
                    <div class="flex items-center gap-3 pb-4 border-b border-slate-800">
                        <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                            {getInitials()}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-white font-semibold truncate">{user?.name || 'User'}</h3>
                            <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 uppercase">
                                {getRoleDisplay()}
                            </span>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div class="py-3 space-y-2 border-b border-slate-800">
                        <Show when={user?.email}>
                            <div class="flex items-center gap-2 text-sm">
                                <Mail class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400 truncate">{user?.email}</span>
                            </div>
                        </Show>
                        <Show when={user?.phone}>
                            <div class="flex items-center gap-2 text-sm">
                                <Phone class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400">{user?.phone}</span>
                            </div>
                        </Show>
                        <Show when={branding.platformName}>
                            <div class="flex items-center gap-2 text-sm">
                                <Building2 class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400">{branding.platformName}</span>
                            </div>
                        </Show>
                    </div>

                    {/* Language Selector */}
                    <div class="py-3 border-b border-slate-800">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <Globe class="w-4 h-4 text-slate-500" />
                                <span class="text-slate-400 text-sm">{t('salesApp.menu.language')}</span>
                            </div>
                            <div class="flex gap-1">
                                {availableLanguages.map((lang) => (
                                    <button
                                        onClick={() => setLanguage(lang)}
                                        class={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${language() === lang
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                    >
                                        {lang.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        class="w-full mt-3 flex items-center justify-center gap-2 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium active:scale-[0.98] transition-all"
                    >
                        <LogOut class="w-4 h-4" />
                        {t('salesApp.menu.signOut')}
                    </button>

                    {/* Version */}
                    <p class="text-center text-slate-600 text-[10px] mt-3">
                        {branding.platformName} v1.0.0
                    </p>
                </div>
            </Show>

            {/* Stats Row */}
            <Show when={!stats.loading} fallback={
                <div class="flex justify-center py-8">
                    <Loader2 class="w-6 h-6 text-blue-400 animate-spin" />
                </div>
            }>
                <div class="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x no-scrollbar">
                    <For each={statCards()}>
                        {(stat) => (
                            <div class={`min-w-[140px] p-4 rounded-2xl bg-gradient-to-br ${stat.color} text-white shadow-lg snap-start`}>
                                <div class="flex justify-between items-start mb-2">
                                    <stat.icon class="w-5 h-5 opacity-80" />
                                </div>
                                <div class="text-2xl font-bold">{stat.value}</div>
                                <div class="text-xs opacity-80 font-medium mt-1">{stat.label}</div>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            {/* Recent Orders Section */}
            <div class="mt-4">
                <div class="flex justify-between items-end mb-4">
                    <h2 class="text-lg font-semibold text-white">{t('salesApp.dashboard.recentOrders')}</h2>
                    <A href="/sales/orders" class="text-blue-400 text-sm font-medium">{t('salesApp.dashboard.viewAll')}</A>
                </div>

                <Show when={!recentOrders.loading} fallback={
                    <div class="flex justify-center py-8">
                        <Loader2 class="w-6 h-6 text-blue-400 animate-spin" />
                    </div>
                }>
                    <Show when={(recentOrders() || []).length > 0} fallback={
                        <div class="text-center py-8 text-slate-500">
                            <Package class="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>{t('salesApp.dashboard.noOrders')}</p>
                        </div>
                    }>
                        <div class="space-y-2">
                            <For each={recentOrders()}>
                                {(order) => (
                                    <A
                                        href="/sales/orders"
                                        class="block bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 active:scale-[0.99] transition-transform"
                                    >
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <h3 class="text-white font-medium text-sm">{order.customerName}</h3>
                                                <div class="flex items-center gap-2 mt-1 text-slate-500 text-xs">
                                                    <span>{order.orderNumber}</span>
                                                    <span>•</span>
                                                    <span>{formatDate(order.createdAt, { month: 'short', day: 'numeric' })}</span>
                                                </div>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-white font-semibold text-sm">{formatCurrency(order.totalAmount)}</div>
                                                <span class={`text-[10px] font-medium ${order.status === 'delivered' ? 'text-green-400' :
                                                    order.status === 'pending' ? 'text-amber-400' :
                                                        'text-slate-400'
                                                    }`}>
                                                    {order.status}
                                                </span>
                                            </div>
                                        </div>
                                    </A>
                                )}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>

            {/* Customers Section */}
            <div class="mt-6">
                <div class="flex justify-between items-end mb-4">
                    <h2 class="text-lg font-semibold text-white">{t('salesApp.dashboard.myCustomers')}</h2>
                    <A href="/sales/customers" class="text-blue-400 text-sm font-medium">{t('salesApp.dashboard.viewAll')}</A>
                </div>

                <Show when={!customers.loading} fallback={
                    <div class="flex justify-center py-8">
                        <Loader2 class="w-6 h-6 text-blue-400 animate-spin" />
                    </div>
                }>
                    <Show when={(customers() || []).length > 0} fallback={
                        <div class="text-center py-8 text-slate-500">
                            <Users class="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>{t('salesApp.dashboard.noCustomers')}</p>
                        </div>
                    }>
                        <div class="space-y-2">
                            <For each={customers()}>
                                {(customer) => (
                                    <A
                                        href={`/sales/catalog?customer=${customer.id}`}
                                        class="block bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 active:scale-[0.99] transition-transform"
                                    >
                                        <div class="flex justify-between items-center">
                                            <div class="flex items-center gap-3">
                                                <div class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                                                    {customer.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 class="text-white font-medium text-sm">{customer.name}</h3>
                                                    <Show when={customer.address}>
                                                        <div class="flex items-center gap-1 mt-0.5 text-slate-500 text-xs">
                                                            <MapPin class="w-3 h-3" />
                                                            <span class="truncate max-w-[180px]">{customer.address}</span>
                                                        </div>
                                                    </Show>
                                                </div>
                                            </div>
                                            <ShoppingCart class="w-4 h-4 text-slate-500" />
                                        </div>
                                    </A>
                                )}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>

            {/* Floating Action Button - Navigate to Catalog */}
            <button
                onClick={() => navigate('/sales/catalog')}
                class="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-600/30 active:scale-95 transition-all z-40"
            >
                <Plus size={28} />
            </button>
        </div>
    );
};

export default Dashboard;
