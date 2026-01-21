import { type Component, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import {
    ArrowLeft, CreditCard, Users, Package, ShoppingCart,
    Calendar, AlertTriangle, CheckCircle, TrendingUp, Zap
} from 'lucide-solid';
import { api } from '../../lib/api';

interface SubscriptionInfo {
    plan: string;
    planStatus: string;
    subscriptionEndAt: string | null;
    usage: {
        users: { current: number; max: number };
        products: { current: number; max: number };
        ordersThisMonth: { current: number; max: number };
    };
}

const planFeatures: Record<string, string[]> = {
    free: ['5 Users', '100 Products', '500 Orders/month', 'Basic Reports'],
    starter: ['10 Users', '500 Products', '2,000 Orders/month', 'Advanced Reports', 'Email Support'],
    professional: ['25 Users', '2,000 Products', '10,000 Orders/month', 'Full Reports', 'Priority Support', 'API Access'],
    enterprise: ['Unlimited Users', 'Unlimited Products', 'Unlimited Orders', 'Custom Reports', 'Dedicated Support', 'White Label'],
};

const Subscription: Component = () => {
    const [data] = createResource(async () => {
        try {
            // api() helper already unwraps { success, data } and returns the data directly
            const result = await api<SubscriptionInfo>('/tenant/subscription');
            return result;
        } catch {
            // Return mock data if endpoint doesn't exist yet
            return {
                plan: 'starter',
                planStatus: 'active',
                subscriptionEndAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                usage: {
                    users: { current: 3, max: 10 },
                    products: { current: 45, max: 500 },
                    ordersThisMonth: { current: 156, max: 2000 },
                }
            } as SubscriptionInfo;
        }
    });

    const daysUntilExpiry = () => {
        const d = data();
        if (!d?.subscriptionEndAt) return null;
        const diff = new Date(d.subscriptionEndAt).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const usagePercent = (current: number, max: number) => {
        return Math.round((current / max) * 100);
    };

    const getUsageColor = (percent: number) => {
        if (percent >= 90) return 'bg-red-500';
        if (percent >= 70) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const planColors: Record<string, { bg: string; text: string; border: string }> = {
        free: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' },
        starter: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
        professional: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
        enterprise: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
    };

    return (
        <div class="p-6 lg:p-8 max-w-4xl mx-auto">
            <A
                href="/admin/settings"
                class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft class="w-4 h-4" />
                Back to Settings
            </A>

            <div class="mb-8">
                <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <CreditCard class="w-5 h-5 text-white" />
                    </div>
                    Subscription & Usage
                </h1>
                <p class="text-slate-400 mt-2">
                    View your current plan and usage statistics
                </p>
            </div>

            <Show when={data()}>
                {(info) => {
                    const plan = info().plan || 'free';
                    const colors = planColors[plan] || planColors.free;
                    const features = planFeatures[plan] || planFeatures.free;
                    const days = daysUntilExpiry();

                    return (
                        <div class="space-y-6">
                            {/* Current Plan Card */}
                            <div class={`${colors.bg} ${colors.border} border rounded-2xl p-6`}>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-4">
                                        <div class={`w-14 h-14 rounded-xl ${colors.bg} flex items-center justify-center`}>
                                            <Zap class={`w-7 h-7 ${colors.text}`} />
                                        </div>
                                        <div>
                                            <div class="flex items-center gap-2">
                                                <h2 class="text-xl font-bold text-white capitalize">
                                                    {plan} Plan
                                                </h2>
                                                <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${info().planStatus === 'active'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-amber-500/20 text-amber-400'
                                                    }`}>
                                                    {info().planStatus}
                                                </span>
                                            </div>
                                            <Show when={days !== null}>
                                                <p class={`text-sm mt-1 flex items-center gap-1.5 ${days! <= 7 ? 'text-red-400' : 'text-slate-400'
                                                    }`}>
                                                    <Calendar class="w-4 h-4" />
                                                    {days! > 0
                                                        ? `${days} days until renewal`
                                                        : 'Subscription expired'
                                                    }
                                                </p>
                                            </Show>
                                        </div>
                                    </div>
                                    <button class="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors">
                                        Upgrade Plan
                                    </button>
                                </div>

                                {/* Plan Features */}
                                <div class="mt-6 pt-6 border-t border-slate-700/50">
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <For each={features}>
                                            {(feature) => (
                                                <div class="flex items-center gap-2 text-sm">
                                                    <CheckCircle class="w-4 h-4 text-emerald-400" />
                                                    <span class="text-slate-300">{feature}</span>
                                                </div>
                                            )}
                                        </For>
                                    </div>
                                </div>
                            </div>

                            {/* Warning Banner */}
                            <Show when={days !== null && days! <= 7}>
                                <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                    <AlertTriangle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p class="text-red-400 font-medium">Subscription Expiring Soon</p>
                                        <p class="text-slate-400 text-sm mt-1">
                                            Your subscription will expire in {days} days.
                                            Please renew to avoid service interruption.
                                        </p>
                                    </div>
                                </div>
                            </Show>

                            {/* Usage Stats */}
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                                <h3 class="text-white font-medium mb-6 flex items-center gap-2">
                                    <TrendingUp class="w-5 h-5 text-blue-400" />
                                    Usage This Month
                                </h3>

                                <div class="space-y-6">
                                    {/* Users */}
                                    <div>
                                        <div class="flex items-center justify-between mb-2">
                                            <div class="flex items-center gap-2">
                                                <Users class="w-4 h-4 text-slate-400" />
                                                <span class="text-slate-300">Active Users</span>
                                            </div>
                                            <span class="text-white font-medium">
                                                {info().usage.users.current} / {info().usage.users.max}
                                            </span>
                                        </div>
                                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                class={`h-full ${getUsageColor(usagePercent(info().usage.users.current, info().usage.users.max))} transition-all`}
                                                style={{ width: `${usagePercent(info().usage.users.current, info().usage.users.max)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Products */}
                                    <div>
                                        <div class="flex items-center justify-between mb-2">
                                            <div class="flex items-center gap-2">
                                                <Package class="w-4 h-4 text-slate-400" />
                                                <span class="text-slate-300">Products</span>
                                            </div>
                                            <span class="text-white font-medium">
                                                {info().usage.products.current} / {info().usage.products.max}
                                            </span>
                                        </div>
                                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                class={`h-full ${getUsageColor(usagePercent(info().usage.products.current, info().usage.products.max))} transition-all`}
                                                style={{ width: `${usagePercent(info().usage.products.current, info().usage.products.max)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Orders */}
                                    <div>
                                        <div class="flex items-center justify-between mb-2">
                                            <div class="flex items-center gap-2">
                                                <ShoppingCart class="w-4 h-4 text-slate-400" />
                                                <span class="text-slate-300">Orders This Month</span>
                                            </div>
                                            <span class="text-white font-medium">
                                                {info().usage.ordersThisMonth.current.toLocaleString()} / {info().usage.ordersThisMonth.max.toLocaleString()}
                                            </span>
                                        </div>
                                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                class={`h-full ${getUsageColor(usagePercent(info().usage.ordersThisMonth.current, info().usage.ordersThisMonth.max))} transition-all`}
                                                style={{ width: `${usagePercent(info().usage.ordersThisMonth.current, info().usage.ordersThisMonth.max)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Contact Support */}
                            <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 text-center">
                                <p class="text-slate-300">
                                    Need more capacity or have questions about billing?
                                </p>
                                <p class="text-slate-400 text-sm mt-1">
                                    Contact <a href="mailto:support@ixasales.com" class="text-blue-400 hover:underline">support@ixasales.com</a> or talk to your account manager.
                                </p>
                            </div>
                        </div>
                    );
                }}
            </Show>
        </div>
    );
};

export default Subscription;
