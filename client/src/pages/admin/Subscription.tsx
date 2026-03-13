import { type Component, createResource, Show, For, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import {
    ArrowLeft, CreditCard, Users, Package, ShoppingCart,
    Calendar, AlertTriangle, CheckCircle, TrendingUp, Zap
} from 'lucide-solid';
import { toast } from '../../components/Toast';
import { getTenantSubscription, submitUpgradeRequest } from '../../services/subscription-api';

const planFeatures: Record<string, string[]> = {
    free: ['5 Users', '100 Products', '500 Orders/month', 'Basic Reports'],
    starter: ['10 Users', '500 Products', '2,000 Orders/month', 'Advanced Reports', 'Email Support'],
    pro: ['50 Users', '5,000 Products', '5,000 Orders/month', 'Full Reports', 'Priority Support', 'API Access'],
    enterprise: ['Unlimited Users', 'Unlimited Products', 'Unlimited Orders', 'Custom Reports', 'Dedicated Support', 'White Label'],
};

const planRank: Record<string, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    enterprise: 3,
};

const Subscription: Component = () => {
    const [data, { refetch }] = createResource(async () => {
        const result = await getTenantSubscription();
        return result;
    });
    const [showUpgradeModal, setShowUpgradeModal] = createSignal(false);
    const [desiredPlan, setDesiredPlan] = createSignal<'starter' | 'pro' | 'enterprise'>('starter');
    const [reason, setReason] = createSignal('');
    const [isSubmittingUpgrade, setIsSubmittingUpgrade] = createSignal(false);

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
        pro: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
        enterprise: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
    };

    const suggestedPlanFor = (plan: string) => {
        if (plan === 'free') return 'starter';
        if (plan === 'starter') return 'pro';
        return 'enterprise';
    };

    const openUpgradeModal = () => {
        const currentPlan = data()?.plan || 'free';
        if (currentPlan === 'enterprise') {
            toast.info('You are already on the highest plan.');
            return;
        }
        setDesiredPlan(suggestedPlanFor(currentPlan) as 'starter' | 'pro' | 'enterprise');
        setReason('');
        setShowUpgradeModal(true);
    };

    const handleSubmitUpgradeRequest = async () => {
        const info = data();
        if (!info) return;

        const current = info.plan || 'free';
        const target = desiredPlan();
        if ((planRank[target] ?? 0) <= (planRank[current] ?? 0)) {
            toast.error('Please choose a higher plan than your current plan.');
            return;
        }

        setIsSubmittingUpgrade(true);
        try {
            await submitUpgradeRequest({
                desiredPlan: target,
                reason: reason().trim() || undefined,
            });
            toast.success('Upgrade request submitted successfully.');
            setShowUpgradeModal(false);
            await refetch();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to submit upgrade request.');
        } finally {
            setIsSubmittingUpgrade(false);
        }
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 max-w-4xl mx-auto">
            <A
                href="/admin"
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
                                    <button
                                        onClick={openUpgradeModal}
                                        class="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                                        disabled={plan === 'enterprise'}
                                    >
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

                            <Show when={info().access?.mode === 'read_only'}>
                                <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                                    <AlertTriangle class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p class="text-amber-300 font-medium">Read-only Access Enabled</p>
                                        <p class="text-slate-300 text-sm mt-1">
                                            {info().access?.message || 'Your subscription currently allows read-only access.'}
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
                                                class={`h-full ${getUsageColor(info().usage.users.percent ?? usagePercent(info().usage.users.current, info().usage.users.max))} transition-all`}
                                                style={{ width: `${info().usage.users.percent ?? usagePercent(info().usage.users.current, info().usage.users.max)}%` }}
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
                                                class={`h-full ${getUsageColor(info().usage.products.percent ?? usagePercent(info().usage.products.current, info().usage.products.max))} transition-all`}
                                                style={{ width: `${info().usage.products.percent ?? usagePercent(info().usage.products.current, info().usage.products.max)}%` }}
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
                                                class={`h-full ${getUsageColor(info().usage.ordersThisMonth.percent ?? usagePercent(info().usage.ordersThisMonth.current, info().usage.ordersThisMonth.max))} transition-all`}
                                                style={{ width: `${info().usage.ordersThisMonth.percent ?? usagePercent(info().usage.ordersThisMonth.current, info().usage.ordersThisMonth.max)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Show when={info().latestUpgradeRequest}>
                                {(req) => (
                                    <div class="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                                        {(() => {
                                            const submittedAtText = req().submittedAt
                                                ? new Date(req().submittedAt as string).toLocaleString()
                                                : null;
                                            return (
                                                <>
                                        <p class="text-indigo-300 font-medium">Latest Upgrade Request</p>
                                        <p class="text-slate-300 text-sm mt-1">
                                            Requested plan: <span class="font-medium capitalize">{req().desiredPlan || 'N/A'}</span>
                                            {submittedAtText ? ` • Submitted: ${submittedAtText}` : ''}
                                        </p>
                                        <Show when={req().reason}>
                                            <p class="text-slate-400 text-sm mt-1">{req().reason}</p>
                                        </Show>
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </Show>

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

            <Show when={data.loading}>
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 text-slate-300">
                    Loading subscription data...
                </div>
            </Show>

            <Show when={data.error}>
                <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
                    <p class="text-red-300 font-medium">Subscription data unavailable</p>
                    <p class="text-slate-300 text-sm mt-2">
                        {data.error?.message || 'Unable to load subscription details from server.'}
                    </p>
                    <p class="text-slate-400 text-xs mt-3">
                        Please retry in a moment or contact support if this persists.
                    </p>
                </div>
            </Show>

            <Show when={showUpgradeModal()}>
                <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div class="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
                        <h3 class="text-xl font-semibold text-white">Request Plan Upgrade</h3>
                        <p class="text-slate-400 text-sm mt-1">
                            Submit a request to super admin. They will review and activate your new plan.
                        </p>

                        <div class="mt-5 space-y-4">
                            <div>
                                <label class="block text-sm text-slate-300 mb-1">Desired Plan</label>
                                <select
                                    value={desiredPlan()}
                                    onChange={(e) => setDesiredPlan(e.currentTarget.value as 'starter' | 'pro' | 'enterprise')}
                                    class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
                                >
                                    <option value="starter">Starter</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm text-slate-300 mb-1">Reason (Optional)</label>
                                <textarea
                                    value={reason()}
                                    onInput={(e) => setReason(e.currentTarget.value)}
                                    class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
                                    rows="4"
                                    placeholder="Tell us what limits you are hitting or why you need an upgrade."
                                />
                            </div>
                        </div>

                        <div class="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setShowUpgradeModal(false)}
                                class="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                                disabled={isSubmittingUpgrade()}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitUpgradeRequest}
                                class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                disabled={isSubmittingUpgrade()}
                            >
                                {isSubmittingUpgrade() ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Subscription;

