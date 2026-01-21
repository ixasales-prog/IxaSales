import { type Component, createSignal, createResource, Show, For, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Users, Package, ShoppingCart } from 'lucide-solid';
import { api } from '../../lib/api';

interface PlanLimit {
    maxUsers: number;
    maxProducts: number;
    maxOrdersPerMonth: number;
}

type PlanLimits = Record<string, PlanLimit>;

const PlanLimitsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [saveMessage, setSaveMessage] = createSignal<string | null>(null);

    // Fetch current plan limits
    const [planLimitsData] = createResource(async () => {
        const result = await api<PlanLimits>('/super/plan-limits');
        return result;
    });

    // Local state for editing
    const [limits, setLimits] = createStore<PlanLimits>({
        free: { maxUsers: 5, maxProducts: 100, maxOrdersPerMonth: 100 },
        starter: { maxUsers: 10, maxProducts: 500, maxOrdersPerMonth: 500 },
        pro: { maxUsers: 50, maxProducts: 5000, maxOrdersPerMonth: 5000 },
        enterprise: { maxUsers: 9999, maxProducts: 99999, maxOrdersPerMonth: 99999 },
    });

    // Sync fetched data to local state when loaded
    createEffect(() => {
        const data = planLimitsData();
        if (data) {
            Object.keys(data).forEach(plan => {
                setLimits(plan, data[plan]);
            });
        }
    });

    // Save plan limits
    const handleSave = async () => {
        setSubmitting(true);
        setSaveMessage(null);
        try {
            await api('/super/plan-limits', {
                method: 'PUT',
                body: JSON.stringify({ limits })
            });
            setSaveMessage('Plan limits saved successfully!');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err: any) {
            setSaveMessage(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const plans = [
        { key: 'free', name: 'Free', description: 'For small businesses getting started', color: 'from-slate-500 to-slate-600' },
        { key: 'starter', name: 'Starter', description: 'For growing teams', color: 'from-blue-500 to-blue-600' },
        { key: 'pro', name: 'Professional', description: 'For established businesses', color: 'from-purple-500 to-purple-600' },
        { key: 'enterprise', name: 'Enterprise', description: 'For large organizations', color: 'from-amber-500 to-orange-600' },
    ];

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="mb-8">
                <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                    <ArrowLeft class="w-4 h-4" />
                    Back to Settings
                </A>
                <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Plan Limits</h1>
                <p class="text-slate-400">Configure resource limits for each subscription tier. Changes apply to new tenants only.</p>
            </div>

            <Show when={planLimitsData.loading}>
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            </Show>

            <Show when={!planLimitsData.loading}>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                    <For each={plans}>
                        {(plan) => (
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                                {/* Plan Header */}
                                <div class={`bg-gradient-to-r ${plan.color} p-4`}>
                                    <h3 class="text-xl font-bold text-white">{plan.name}</h3>
                                    <p class="text-white/80 text-sm">{plan.description}</p>
                                </div>

                                {/* Limits */}
                                <div class="p-5 space-y-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                            <Users class="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div class="flex-1">
                                            <label class="text-sm text-slate-400">Max Users</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={limits[plan.key]?.maxUsers || 0}
                                                onInput={(e) => setLimits(plan.key, 'maxUsers', parseInt(e.currentTarget.value) || 1)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                            <Package class="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div class="flex-1">
                                            <label class="text-sm text-slate-400">Max Products</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={limits[plan.key]?.maxProducts || 0}
                                                onInput={(e) => setLimits(plan.key, 'maxProducts', parseInt(e.currentTarget.value) || 1)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                            <ShoppingCart class="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div class="flex-1">
                                            <label class="text-sm text-slate-400">Max Orders / Month</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={limits[plan.key]?.maxOrdersPerMonth || 0}
                                                onInput={(e) => setLimits(plan.key, 'maxOrdersPerMonth', parseInt(e.currentTarget.value) || 1)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </For>
                </div>

                {/* Save Button */}
                <div class="mt-8 flex items-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={submitting()}
                        class="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
                    >
                        <Show when={submitting()} fallback={<Save class="w-5 h-5" />}>
                            <Loader2 class="w-5 h-5 animate-spin" />
                        </Show>
                        Save All Changes
                    </button>

                    <Show when={saveMessage()}>
                        <span class={`text-sm ${saveMessage()?.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                            {saveMessage()}
                        </span>
                    </Show>
                </div>

                <p class="mt-4 text-sm text-slate-500">
                    Changes take effect immediately for all tenants on the respective plan.
                </p>
            </Show>
        </div>
    );
};

export default PlanLimitsPage;
