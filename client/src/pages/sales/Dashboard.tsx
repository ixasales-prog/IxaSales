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
    Globe,
    Target,
    TrendingDown,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Zap,
    DollarSign,
    Calendar,
    PhoneCall,
    BarChart3,
    Timer,
    Activity,
    Route,
    Trophy,
    Cloud,
    CloudRain,
    Sun,
    Cloudy,
    Wind,
    Droplets,
    Award
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
    weekOverWeek?: {
        thisWeek: number;
        lastWeek: number;
        change: number;
        changeAmount: number;
    };
    topCustomersWithDebt?: Array<{
        id: string;
        name: string;
        debtBalance: number;
        phone?: string;
        address?: string;
    }>;
    debtSummary?: {
        totalDebt: number;
        customerCount: number;
    };
}

interface SalesGoals {
    daily: number;
    weekly: number;
    monthly: number;
}

interface SalesTrend {
    date: string;
    sales: number;
    orders: number;
}


interface TimeInsights {
    bestHours: Array<{ hour: number; sales: number; orders: number }>;
    bestDays: Array<{ dayOfWeek: number; dayName: string; sales: number; orders: number }>;
}

interface PerformanceMetrics {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    conversionRate: number;
    visitCompletionRate: number;
    newCustomers: number;
    totalVisits: number;
    completedVisits: number;
    visitsWithOrders: number;
}

interface RouteOptimization {
    visits: Array<{
        visitId: string;
        customerId: string;
        customerName: string;
        customerAddress?: string;
        latitude: number;
        longitude: number;
        plannedTime?: string;
        visitType: string;
        sequence: number;
    }>;
    totalVisits: number;
    estimatedDistance: number;
    estimatedTime: number;
}

interface Gamification {
    currentStreak: number;
    totalSales: number;
    totalOrders: number;
    achievements: Array<{
        id: string;
        name: string;
        description: string;
        icon: string;
    }>;
    bestDay: {
        date: string;
        sales: number;
    } | null;
}

interface Weather {
    city: string;
    temperature: number;
    condition: string;
    description: string;
    icon: string;
    humidity: number;
    windSpeed: number;
    feelsLike: number;
    note?: string;
}

interface FollowUpSummary {
    dueToday: number;
    overdue: number;
    upcoming: number;
    topDue: Array<{
        id: string;
        customerId: string;
        customerName: string;
        followUpDate: string | null;
    }>;
}

interface DashboardPayload {
    stats: DashboardStats;
    goals: SalesGoals;
    salesTrends: SalesTrend[];
    timeInsights: TimeInsights;
    performanceMetrics: PerformanceMetrics;
    routeOptimization: RouteOptimization;
    gamification: Gamification;
    weather: Weather;
    followUps: FollowUpSummary;
}


const Dashboard: Component = () => {
    const { t, language, setLanguage, availableLanguages } = useI18n();
    const navigate = useNavigate();
    const user = currentUser();
    const branding = useBranding();

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

    // Fetch consolidated dashboard payload
    const [dashboardData] = createResource<DashboardPayload>(async () => {
        const data = await api.get<{ data: DashboardPayload } | DashboardPayload>('/orders/dashboard/sales');
        const payload = (data as any)?.data ?? data;
        return payload || {
            stats: { todaysSales: 0, pendingOrders: 0, customerCount: 0, visits: { total: 0, completed: 0, inProgress: 0 } },
            goals: { daily: 0, weekly: 0, monthly: 0 },
            salesTrends: [],
            timeInsights: { bestHours: [], bestDays: [] },
            performanceMetrics: {
                totalRevenue: 0,
                totalOrders: 0,
                avgOrderValue: 0,
                conversionRate: 0,
                visitCompletionRate: 0,
                newCustomers: 0,
                totalVisits: 0,
                completedVisits: 0,
                visitsWithOrders: 0,
            },
            routeOptimization: { visits: [], totalVisits: 0, estimatedDistance: 0, estimatedTime: 0 },
            gamification: { currentStreak: 0, totalSales: 0, totalOrders: 0, achievements: [], bestDay: null },
            weather: {
                city: 'Tashkent',
                temperature: 22,
                condition: 'Clear',
                description: 'clear sky',
                icon: '01d',
                humidity: 65,
                windSpeed: 5,
                feelsLike: 24,
            },
            followUps: { dueToday: 0, overdue: 0, upcoming: 0, topDue: [] },
        };
    });

    const stats = () => dashboardData()?.stats;
    const goals = () => dashboardData()?.goals;
    const salesTrends = () => dashboardData()?.salesTrends || [];
    const timeInsights = () => dashboardData()?.timeInsights;
    const performanceMetrics = () => dashboardData()?.performanceMetrics;
    const routeOptimization = () => dashboardData()?.routeOptimization;
    const gamification = () => dashboardData()?.gamification;
    const weather = () => dashboardData()?.weather;
    const followUps = () => dashboardData()?.followUps;


    const statCards = () => [
        {
            label: t('salesApp.dashboard.todaysSales'),
            value: formatCurrency(stats()?.todaysSales || 0),
            icon: TrendingUp,
            color: 'from-blue-600 to-indigo-600',
            onClick: () => navigate('/sales/orders')
        },
        {
            label: t('salesApp.visits.today'),
            value: `${stats()?.visits?.completed || 0} / ${stats()?.visits?.total || 0}`,
            icon: MapPin,
            color: 'from-emerald-500 to-teal-600',
            onClick: () => navigate('/sales/visits')
        },
        {
            label: t('salesApp.dashboard.pendingOrders'),
            value: stats()?.pendingOrders || 0,
            icon: Clock,
            color: 'from-amber-500 to-orange-600',
            onClick: () => navigate('/sales/orders?status=pending')
        },
        {
            label: t('salesApp.dashboard.myCustomers'),
            value: stats()?.customerCount || 0,
            icon: Users,
            color: 'from-purple-500 to-pink-600',
            onClick: () => navigate('/sales/customers')
        }
    ];

    // Generate user initials for avatar
    const getInitials = () => {
        const name = user?.name || 'User';
        return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div class="px-4 pt-14 pb-24">
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

            {/* My Day Summary */}
            <Show when={!dashboardData.loading && !dashboardData.error}>
                <div class="mt-2 mb-2 bg-slate-900/70 border border-slate-800/70 rounded-2xl p-3 flex items-center justify-between text-sm">
                    <div>
                        <div class="text-slate-300 font-semibold">Today</div>
                        <div class="text-slate-500 text-xs mt-0.5">
                            {stats()?.visits?.total || 0} visits · {stats()?.visits?.completed || 0} done · {stats()?.pendingOrders || 0} pending orders
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/sales/visits')}
                        class="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-medium active:scale-95 transition-transform"
                    >
                        View today's route
                    </button>
                </div>
            </Show>

            {/* Stats Row */}
            <Show when={!dashboardData.loading} fallback={
                <div class="flex justify-center py-8">
                    <Loader2 class="w-6 h-6 text-blue-400 animate-spin" />
                </div>
            }>
                <Show when={!dashboardData.error} fallback={
                    <div class="flex justify-center py-4 text-xs text-red-400">
                        Failed to load dashboard stats. Please check your connection.
                    </div>
                }>
                    <div class="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x no-scrollbar">
                        <For each={statCards()}>
                            {(stat) => (
                                <button
                                    type="button"
                                    onClick={() => (stat as any).onClick?.()}
                                    class={`min-w-[140px] p-4 rounded-2xl bg-gradient-to-br ${stat.color} text-white shadow-lg snap-start text-left active:scale-[0.98] transition-transform`}
                                >
                                    <div class="flex justify-between items-start mb-2">
                                        <stat.icon class="w-5 h-5 opacity-80" />
                                    </div>
                                    <div class="text-2xl font-bold">{stat.value}</div>
                                    <div class="text-xs opacity-80 font-medium mt-1">{stat.label}</div>
                                </button>
                            )}
                        </For>
                    </div>
                </Show>
            </Show>

            {/* Quick Actions Widget */}
            <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-3">
                    <Zap class="w-5 h-5 text-amber-400" />
                    <h2 class="text-lg font-semibold text-white">Quick Actions</h2>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => navigate('/sales/visits')}
                        class="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-left transition-colors"
                    >
                        <MapPin class="w-4 h-4 text-blue-400" />
                        <span class="text-sm text-white">Start Visit</span>
                    </button>
                    <button
                        onClick={() => navigate('/sales/catalog')}
                        class="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-left transition-colors"
                    >
                        <ShoppingCart class="w-4 h-4 text-emerald-400" />
                        <span class="text-sm text-white">New Order</span>
                    </button>
                    <button
                        onClick={() => navigate('/sales/customers')}
                        class="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-left transition-colors"
                    >
                        <Users class="w-4 h-4 text-purple-400" />
                        <span class="text-sm text-white">Add Customer</span>
                    </button>
                    <button
                        onClick={() => navigate('/sales/orders')}
                        class="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-left transition-colors"
                    >
                        <Package class="w-4 h-4 text-orange-400" />
                        <span class="text-sm text-white">View Orders</span>
                    </button>
                </div>
            </div>

            {/* Follow-Ups Summary */}
            <Show when={!dashboardData.loading} fallback={
                <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex justify-center py-4">
                    <Loader2 class="w-5 h-5 text-blue-400 animate-spin" />
                </div>
            }>
                <Show when={!dashboardData.error} fallback={
                    <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 text-xs text-red-400">
                        Failed to load follow-ups. You can still view them in the Visits tab.
                    </div>
                }>
                    <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2">
                                <PhoneCall class="w-5 h-5 text-emerald-400" />
                                <h2 class="text-lg font-semibold text-white">Customer Follow-Ups</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/sales/visits')}
                                class="text-xs text-blue-400 font-medium"
                            >
                                View all
                            </button>
                        </div>
                        <div class="grid grid-cols-3 gap-3 mb-3">
                            <div class="p-3 bg-slate-800/60 rounded-xl">
                                <div class="text-[11px] text-slate-400 uppercase mb-1">Due Today</div>
                                <div class="text-xl font-semibold text-emerald-400">{followUps()?.dueToday || 0}</div>
                            </div>
                            <div class="p-3 bg-slate-800/60 rounded-xl">
                                <div class="text-[11px] text-slate-400 uppercase mb-1">Overdue</div>
                                <div class="text-xl font-semibold text-red-400">{followUps()?.overdue || 0}</div>
                            </div>
                            <div class="p-3 bg-slate-800/60 rounded-xl">
                                <div class="text-[11px] text-slate-400 uppercase mb-1">Upcoming</div>
                                <div class="text-xl font-semibold text-blue-400">{followUps()?.upcoming || 0}</div>
                            </div>
                        </div>
                        <Show when={(followUps()?.topDue || []).length > 0} fallback={
                            <div class="text-xs text-slate-500">
                                You're all caught up on follow-ups.
                            </div>
                        }>
                            <div class="mt-2 space-y-1.5">
                                <div class="text-[11px] font-semibold text-slate-400 uppercase">Most urgent</div>
                                <For each={followUps()?.topDue}>
                                    {(item) => (
                                        <button
                                            type="button"
                                            onClick={() => navigate('/sales/visits')}
                                            class="w-full flex items-center justify-between p-2 bg-slate-800/60 rounded-lg hover:bg-slate-800 transition-colors"
                                        >
                                            <div class="flex-1 min-w-0">
                                                <div class="text-xs font-medium text-white truncate">{item.customerName}</div>
                                                <div class="text-[11px] text-slate-500">
                                                    {item.followUpDate
                                                        ? formatDate(item.followUpDate, { month: 'short', day: 'numeric' })
                                                        : 'No date'}
                                                </div>
                                            </div>
                                        </button>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </Show>
            </Show>

            {/* Goals/Targets Widget */}
            <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <Target class="w-5 h-5 text-blue-400" />
                        <h2 class="text-lg font-semibold text-white">Sales Goals</h2>
                    </div>
                    <Show when={!dashboardData.loading && (goals()?.daily || goals()?.weekly || goals()?.monthly)}>
                        <div class="text-xs text-slate-500">
                            {goals()?.daily ? 'Daily' : goals()?.weekly ? 'Weekly' : 'Monthly'} Target
                        </div>
                    </Show>
                </div>
                <Show when={!dashboardData.loading && !dashboardData.error && goals() && (goals()?.daily || goals()?.weekly || goals()?.monthly)}>
                    <div class="space-y-3">
                        <Show when={goals()?.daily}>
                            <div>
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-sm text-slate-400">Daily Target</span>
                                    <span class="text-sm font-semibold text-white">
                                        {formatCurrency(stats()?.todaysSales || 0)} / {formatCurrency(goals()?.daily || 0)}
                                    </span>
                                </div>
                                <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        class={`h-2.5 rounded-full transition-all duration-500 ${
                                            ((stats()?.todaysSales || 0) / (goals()?.daily || 1)) >= 1
                                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                                                : ((stats()?.todaysSales || 0) / (goals()?.daily || 1)) >= 0.75
                                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600'
                                                : 'bg-gradient-to-r from-amber-500 to-orange-600'
                                        }`}
                                        style={{
                                            width: `${Math.min(100, ((stats()?.todaysSales || 0) / (goals()?.daily || 1)) * 100)}%`
                                        }}
                                    />
                                </div>
                                <div class="flex justify-between items-center mt-1">
                                    <div class="text-xs text-slate-500">
                                        {goals()?.daily ? Math.round(((stats()?.todaysSales || 0) / (goals()?.daily || 1)) * 100) : 0}% complete
                                    </div>
                                    <Show when={goals()?.daily && (stats()?.todaysSales || 0) < (goals()?.daily || 0)}>
                                        <div class="text-xs text-amber-400">
                                            {formatCurrency((goals()?.daily || 0) - (stats()?.todaysSales || 0))} remaining
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </Show>
                        <Show when={goals()?.weekly}>
                            <div class="pt-2 border-t border-slate-800">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-sm text-slate-400">Weekly Target</span>
                                    <span class="text-sm font-semibold text-white">
                                        {formatCurrency(goals()?.weekly || 0)}
                                    </span>
                                </div>
                            </div>
                        </Show>
                        <Show when={goals()?.monthly}>
                            <div class="pt-2 border-t border-slate-800">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-sm text-slate-400">Monthly Target</span>
                                    <span class="text-sm font-semibold text-white">
                                        {formatCurrency(goals()?.monthly || 0)}
                                    </span>
                                </div>
                            </div>
                        </Show>
                    </div>
                </Show>
                <Show when={!dashboardData.loading && dashboardData.error}>
                    <div class="text-center py-3 text-xs text-red-400">
                        Failed to load sales goals. They will appear here when available.
                    </div>
                </Show>
                <Show when={!dashboardData.loading && !dashboardData.error && goals() && !goals()?.daily && !goals()?.weekly && !goals()?.monthly}>
                    <div class="text-center py-4 text-slate-500 text-sm">
                        <Target class="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No sales goals set</p>
                        <Show when={user?.role === 'sales_rep'}>
                            <p class="text-xs mt-1">Ask your administrator to set daily/weekly targets for you.</p>
                        </Show>
                        <Show when={['tenant_admin', 'super_admin', 'supervisor'].includes(user?.role || '')}>
                            <p class="text-xs mt-1">Configure goals in Business Settings so your team can track progress here.</p>
                        </Show>
                    </div>
                </Show>
            </div>

            {/* Performance Overview Section */}
            <div class="mt-6">
                <h2 class="text-lg font-semibold text-white mb-4">Performance Overview</h2>
                
                {/* Week-over-Week Comparison */}
                <Show when={stats()?.weekOverWeek !== undefined}>
                    <div class="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-3">
                            <Show when={(stats()?.weekOverWeek?.change || 0) >= 0} fallback={<TrendingDown class="w-5 h-5 text-red-400" />}>
                                <TrendingUp class="w-5 h-5 text-emerald-400" />
                            </Show>
                            <h3 class="text-base font-semibold text-white">Today vs Last Week</h3>
                        </div>
                        <div class="flex items-end justify-between">
                            <div>
                                <div class="text-2xl font-bold text-white">{formatCurrency(stats()?.weekOverWeek?.thisWeek || 0)}</div>
                                <div class="text-sm text-slate-400">Today (delivered)</div>
                            </div>
                            <div class="text-right">
                                <Show when={(stats()?.weekOverWeek?.change || 0) !== 0}>
                                    <div class={`flex items-center gap-1 text-lg font-semibold ${(stats()?.weekOverWeek?.change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {(stats()?.weekOverWeek?.change || 0) >= 0 ? (
                                            <ArrowUpRight class="w-4 h-4" />
                                        ) : (
                                            <ArrowDownRight class="w-4 h-4" />
                                        )}
                                        {Math.abs(stats()?.weekOverWeek?.change || 0).toFixed(1)}%
                                    </div>
                                    <div class="text-xs text-slate-500">
                                        {formatCurrency(Math.abs(stats()?.weekOverWeek?.changeAmount || 0))} {(stats()?.weekOverWeek?.changeAmount ?? 0) >= 0 ? 'more' : 'less'} than same day last week
                                    </div>
                                </Show>
                                <Show when={(stats()?.weekOverWeek?.change || 0) === 0}>
                                    <div class="text-sm text-slate-400">No change vs same day last week</div>
                                </Show>
                            </div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-800">
                            <div class="text-sm text-slate-400">Same day last week: {formatCurrency(stats()?.weekOverWeek?.lastWeek || 0)}</div>
                        </div>
                    </div>
                </Show>

                {/* Performance Metrics */}
                <Show when={!dashboardData.loading}>
                    <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <Activity class="w-5 h-5 text-emerald-400" />
                            <h3 class="text-base font-semibold text-white">Key Metrics (Last 30 Days)</h3>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="p-3 bg-slate-800/50 rounded-lg">
                                <div class="text-xs text-slate-400 mb-1">Conversion Rate</div>
                                <div class="text-xl font-bold text-emerald-400">
                                    {performanceMetrics()?.conversionRate || 0}%
                                </div>
                                <div class="text-xs text-slate-500 mt-1">
                                    {performanceMetrics()?.visitsWithOrders || 0} / {performanceMetrics()?.totalVisits || 0} visits
                                </div>
                            </div>
                            <div class="p-3 bg-slate-800/50 rounded-lg">
                                <div class="text-xs text-slate-400 mb-1">Avg Order Value</div>
                                <div class="text-xl font-bold text-blue-400">
                                    {formatCurrency(performanceMetrics()?.avgOrderValue || 0)}
                                </div>
                                <div class="text-xs text-slate-500 mt-1">
                                    {performanceMetrics()?.totalOrders || 0} orders
                                </div>
                            </div>
                            <div class="p-3 bg-slate-800/50 rounded-lg">
                                <div class="text-xs text-slate-400 mb-1">Visit Completion</div>
                                <div class="text-xl font-bold text-purple-400">
                                    {performanceMetrics()?.visitCompletionRate || 0}%
                                </div>
                                <div class="text-xs text-slate-500 mt-1">
                                    {performanceMetrics()?.completedVisits || 0} / {performanceMetrics()?.totalVisits || 0} visits
                                </div>
                            </div>
                            <div class="p-3 bg-slate-800/50 rounded-lg">
                                <div class="text-xs text-slate-400 mb-1">New Customers</div>
                                <div class="text-xl font-bold text-amber-400">
                                    {performanceMetrics()?.newCustomers || 0}
                                </div>
                                <div class="text-xs text-slate-500 mt-1">
                                    Last 30 days
                                </div>
                            </div>
                        </div>
                    </div>
                </Show>
            </div>

            {/* Outstanding Debt Alerts */}
            <Show when={stats()?.debtSummary}>
                <Show when={stats()?.debtSummary && (stats()?.debtSummary?.totalDebt ?? 0) > 0} fallback={
                    <div class="mt-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                        <div class="flex items-center gap-2">
                            <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <DollarSign class="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <div class="text-sm font-semibold text-white">All Clear!</div>
                                <div class="text-xs text-slate-400">No outstanding debt</div>
                            </div>
                        </div>
                    </div>
                }>
                    <div class="mt-6 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-3">
                            <AlertCircle class="w-5 h-5 text-red-400" />
                            <h2 class="text-lg font-semibold text-white">Outstanding Debt</h2>
                        </div>
                        <div class="mb-3">
                            <div class="text-2xl font-bold text-red-400">{formatCurrency(stats()?.debtSummary?.totalDebt || 0)}</div>
                            <div class="text-sm text-slate-400">
                                Across {stats()?.debtSummary?.customerCount || 0} {stats()?.debtSummary?.customerCount === 1 ? 'customer' : 'customers'}
                            </div>
                        </div>
                        <Show when={(stats()?.topCustomersWithDebt || []).length > 0}>
                            <div class="space-y-2">
                                <div class="text-xs font-semibold text-slate-400 uppercase mb-2">Top Debtors</div>
                                <For each={stats()?.topCustomersWithDebt?.slice(0, 3)}>
                                    {(customer) => (
                                        <A
                                            href={`/sales/customers?highlight=${customer.id}`}
                                            class="block flex justify-between items-center p-2 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-colors"
                                        >
                                            <div class="flex-1 min-w-0">
                                                <div class="text-sm font-medium text-white truncate">{customer.name}</div>
                                                <Show when={customer.phone}>
                                                    <div class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <PhoneCall class="w-3 h-3" />
                                                        {customer.phone}
                                                    </div>
                                                </Show>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-sm font-semibold text-red-400">{formatCurrency(customer.debtBalance)}</div>
                                            </div>
                                        </A>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </Show>
            </Show>

            {/* Analytics & Insights Section */}
            <div class="mt-6">
                <h2 class="text-lg font-semibold text-white mb-4">Analytics & Insights</h2>

                {/* Sales Trends Chart */}
                <Show when={!dashboardData.loading && (salesTrends() || []).length > 0}>
                    <div class="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <BarChart3 class="w-5 h-5 text-blue-400" />
                            <h3 class="text-base font-semibold text-white">Sales Trends (Last 7 Days)</h3>
                        </div>
                        <div class="space-y-3">
                            <For each={salesTrends()}>
                                {(trend) => {
                                    const maxSales = Math.max(...(salesTrends() || []).map(t => t.sales), 1);
                                    const percentage = (trend.sales / maxSales) * 100;
                                    const date = new Date(trend.date);
                                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                                    const dayNum = date.getDate();
                                    
                                    return (
                                        <div class="flex items-center gap-3">
                                            <div class="w-12 text-xs text-slate-400 text-right">
                                                <div>{dayName}</div>
                                                <div class="text-slate-500">{dayNum}</div>
                                            </div>
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2 mb-1">
                                                    <div
                                                        class="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full h-6 transition-all duration-500"
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                    <div class="text-sm font-semibold text-white min-w-[80px] text-right">
                                                        {formatCurrency(trend.sales)}
                                                    </div>
                                                </div>
                                                <div class="text-xs text-slate-500 ml-2">
                                                    {trend.orders} {trend.orders === 1 ? 'order' : 'orders'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </div>
                </Show>

                {/* Time-Based Insights */}
                <Show when={!dashboardData.loading && (timeInsights()?.bestHours?.length || 0) > 0}>
                    <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <Timer class="w-5 h-5 text-purple-400" />
                            <h3 class="text-base font-semibold text-white">Best Performing Times</h3>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-xs font-semibold text-slate-400 uppercase mb-2">Best Hours</div>
                                <div class="space-y-2">
                                    <For each={timeInsights()?.bestHours?.slice(0, 3)}>
                                        {(hour) => (
                                            <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                                                <div class="flex items-center gap-2">
                                                    <Clock class="w-3 h-3 text-purple-400" />
                                                    <span class="text-sm text-white">
                                                        {hour.hour}:00 - {hour.hour + 1}:00
                                                    </span>
                                                </div>
                                                <div class="text-xs font-semibold text-purple-400">
                                                    {formatCurrency(hour.sales)}
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-slate-400 uppercase mb-2">Best Days</div>
                                <div class="space-y-2">
                                    <For each={timeInsights()?.bestDays?.slice(0, 3)}>
                                        {(day) => (
                                            <div class="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                                                <div class="flex items-center gap-2">
                                                    <Calendar class="w-3 h-3 text-purple-400" />
                                                    <span class="text-sm text-white capitalize">{day.dayName}</span>
                                                </div>
                                                <div class="text-xs font-semibold text-purple-400">
                                                    {formatCurrency(day.sales)}
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </div>
                    </div>
                </Show>

                {/* Route Optimization */}
                <Show when={!dashboardData.loading && routeOptimization() && (routeOptimization()?.totalVisits ?? 0) > 0}>
                    <div class="mt-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <Route class="w-5 h-5 text-blue-400" />
                                <h3 class="text-base font-semibold text-white">Today's Route</h3>
                            </div>
                            <A href="/sales/visits" class="text-blue-400 text-sm font-medium">View All</A>
                        </div>
                        <div class="mb-3 p-3 bg-slate-800/50 rounded-lg">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-sm text-slate-400">Total Distance</div>
                                    <div class="text-lg font-bold text-white">{routeOptimization()?.estimatedDistance || 0} km</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm text-slate-400">Est. Time</div>
                                    <div class="text-lg font-bold text-white">{routeOptimization()?.estimatedTime || 0} min</div>
                                </div>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <For each={routeOptimization()?.visits?.slice(0, 5)}>
                                {(visit) => (
                                    <A
                                        href="/sales/visits"
                                        class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
                                    >
                                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                            {visit.sequence}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-medium text-white truncate">{visit.customerName}</div>
                                            <Show when={visit.customerAddress}>
                                                <div class="text-xs text-slate-500 truncate mt-0.5">{visit.customerAddress}</div>
                                            </Show>
                                        </div>
                                        <MapPin class="w-4 h-4 text-blue-400 shrink-0" />
                                    </A>
                                )}
                            </For>
                        </div>
                    </div>
                </Show>
            </div>

            {/* Engagement & Tools Section */}
            <div class="mt-6">
                <h2 class="text-lg font-semibold text-white mb-4">Engagement & Tools</h2>

                    <Show when={!dashboardData.loading}>
                    <div class="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <Trophy class="w-5 h-5 text-yellow-400" />
                            <h3 class="text-base font-semibold text-white">Achievements</h3>
                        </div>
                        <div class="mb-4">
                            <div class="flex items-center justify-between mb-2">
                                <div class="text-sm text-slate-300">Current Streak</div>
                                <div class="text-2xl font-bold text-yellow-400">
                                    {gamification()?.currentStreak || 0} 🔥
                                </div>
                            </div>
                            <div class="text-xs text-slate-400">
                                Consecutive days with sales
                            </div>
                        </div>
                        <Show when={(gamification()?.achievements || []).length > 0}>
                            <div class="space-y-2">
                                <div class="text-xs font-semibold text-slate-300 uppercase mb-2">Badges Earned</div>
                                <div class="flex flex-wrap gap-2">
                                    <For each={gamification()?.achievements}>
                                        {(achievement) => (
                                            <div class="flex items-center gap-2 px-3 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg">
                                                <span class="text-lg">{achievement.icon}</span>
                                                <div>
                                                    <div class="text-xs font-semibold text-white">{achievement.name}</div>
                                                    <div class="text-[10px] text-slate-400">{achievement.description}</div>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>
                        <Show when={(gamification()?.achievements || []).length === 0}>
                            <div class="text-center py-4 text-slate-400 text-sm">
                                <Award class="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>Keep selling to unlock achievements!</p>
                            </div>
                        </Show>
                        <Show when={gamification()?.bestDay}>
                            <div class="mt-4 pt-4 border-t border-purple-500/20">
                                <div class="text-xs text-slate-400 mb-1">Best Day (Last 30 Days)</div>
                                <div class="text-sm font-semibold text-white">
                                    {formatDate(gamification()?.bestDay?.date || '', { month: 'short', day: 'numeric' })}: {formatCurrency(gamification()?.bestDay?.sales || 0)}
                                </div>
                            </div>
                        </Show>
                    </div>
                </Show>

                {/* Weather Widget */}
                <Show when={!dashboardData.loading}>
                    <div class="mt-4 bg-gradient-to-br from-blue-900/30 to-cyan-900/30 border border-blue-500/30 rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2">
                                <Show when={weather()?.condition === 'Rain' || weather()?.condition === 'Drizzle'}>
                                    <CloudRain class="w-5 h-5 text-blue-300" />
                                </Show>
                                <Show when={weather()?.condition === 'Clear' || weather()?.condition === 'Sunny'}>
                                    <Sun class="w-5 h-5 text-yellow-400" />
                                </Show>
                                <Show when={weather()?.condition === 'Clouds' || weather()?.condition === 'Cloudy'}>
                                    <Cloudy class="w-5 h-5 text-slate-300" />
                                </Show>
                                <Show when={!['Rain', 'Drizzle', 'Clear', 'Sunny', 'Clouds', 'Cloudy'].includes(weather()?.condition || '')}>
                                    <Cloud class="w-5 h-5 text-slate-300" />
                                </Show>
                                <h3 class="text-base font-semibold text-white">Weather</h3>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold text-white">{weather()?.temperature || 0}°</div>
                                <div class="text-xs text-slate-300 capitalize">{weather()?.description || ''}</div>
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-500/20">
                            <div class="text-center">
                                <Wind class="w-4 h-4 text-blue-300 mx-auto mb-1" />
                                <div class="text-xs text-slate-300">{weather()?.windSpeed || 0} m/s</div>
                            </div>
                            <div class="text-center">
                                <Droplets class="w-4 h-4 text-blue-300 mx-auto mb-1" />
                                <div class="text-xs text-slate-300">{weather()?.humidity || 0}%</div>
                            </div>
                            <div class="text-center">
                                <div class="text-xs text-slate-400 mb-1">Feels like</div>
                                <div class="text-xs text-slate-300">{weather()?.feelsLike || 0}°</div>
                            </div>
                        </div>
                        <Show when={weather()?.note}>
                            <div class="mt-2 text-[10px] text-slate-500 text-center">{weather()?.note}</div>
                        </Show>
                    </div>
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
