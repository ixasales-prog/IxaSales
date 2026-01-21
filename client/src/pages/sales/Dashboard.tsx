import { type Component, For, Show, createResource } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import {
    TrendingUp,
    MapPin,
    Clock,
    Plus,
    Package,
    Users,
    ShoppingCart,
    Loader2
} from 'lucide-solid';
import { api } from '../../lib/api';
import { currentUser } from '../../stores/auth';
import { formatCurrency, formatDate } from '../../stores/settings';
import { useI18n } from '../../i18n';

interface DashboardStats {
    todaysSales: number;
    pendingOrders: number;
    customerCount: number;
    visits: { total: number; completed: number; planned: number };
}

interface RecentOrder {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
}

interface Customer {
    id: string;
    name: string;
    address: string | null;
    currentDebt: string | null;
}

const Dashboard: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const user = currentUser();

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

    // Fetch dashboard stats
    const [stats] = createResource<DashboardStats>(async () => {
        try {
            // Get today's date range
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];

            // Fetch orders created today
            const ordersRes = await api.get('/orders', {
                params: {
                    startDate: todayStr,
                    limit: '100'
                }
            }) as any;

            const orders = ordersRes?.data || ordersRes || [];

            // Calculate today's sales
            const todaysSales = orders.reduce((sum: number, o: any) => {
                return sum + parseFloat(o.totalAmount || '0');
            }, 0);

            // Count pending orders
            const pendingOrders = orders.filter((o: any) => o.status === 'pending').length;

            // Get customer count
            const customersRes = await api.get('/customers', { params: { limit: '1' } }) as any;
            const customerCount = customersRes?.meta?.total || customersRes?.length || 0;

            // Get visits stats
            const visitsRes = await api.get('/visits/stats') as any;
            const visits = visitsRes?.data?.today || { total: 0, completed: 0, planned: 0 };

            return {
                todaysSales,
                pendingOrders,
                customerCount,
                visits
            };
        } catch (e) {
            return { todaysSales: 0, pendingOrders: 0, customerCount: 0, visits: { total: 0, completed: 0, planned: 0 } };
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
            const res = await api.get('/orders', { params: { limit: '5' } }) as any;
            return res?.data || res || [];
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
                <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                    {getInitials()}
                </div>
            </div>

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
