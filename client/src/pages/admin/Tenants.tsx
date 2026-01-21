import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from '../../lib/api';
import {
    Building,
    Plus,
    Search,
    Loader2,
    XCircle
} from 'lucide-solid';

interface Tenant {
    id: string;
    name: string;
    subdomain: string;
    plan: string;
    isActive: boolean;
    createdAt: string;
    maxUsers?: number;
    stats?: {
        userCount: number;
        productCount: number;
    };
}

const Tenants: Component = () => {
    const [search, setSearch] = createSignal('');
    const [showCreateModal, setShowCreateModal] = createSignal(false);

    // Form state
    const [formData, setFormData] = createStore({
        name: '',
        subdomain: '',
        plan: 'standard', // standard, enterprise
        maxUsers: 5,
        maxProducts: 1000,
        currency: 'USD',
        timezone: 'UTC',
        defaultTaxRate: 0
    });

    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    // Fetch tenants
    const [tenants, { refetch }] = createResource(async () => {
        const result = await api<Tenant[]>('/super/tenants?limit=100');
        return result;
    });

    const filteredTenants = () => {
        const query = search().toLowerCase();
        return (tenants() || []).filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.subdomain.toLowerCase().includes(query)
        );
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api('/super/tenants', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            setShowCreateModal(false);
            setFormData({
                name: '',
                subdomain: '',
                plan: 'standard',
                maxUsers: 5,
                maxProducts: 1000,
                currency: 'USD',
                timezone: 'UTC',
                defaultTaxRate: 0
            });
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to create tenant. Subdomain might be taken.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="p-6 lg:p-8">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Tenants</h1>
                    <p class="text-slate-400">Manage all organizations in the system</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                >
                    <Plus class="w-5 h-5" />
                    New Tenant
                </button>
            </div>

            {/* Search */}
            <div class="relative mb-6">
                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                    type="text"
                    value={search()}
                    onInput={(e) => setSearch(e.currentTarget.value)}
                    placeholder="Search tenants..."
                    class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                />
            </div>

            {/* List */}
            <Show when={!tenants.loading} fallback={
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            }>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <For each={filteredTenants()}>
                        {(tenant) => (
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 hover:border-slate-700/50 transition-all group">
                                <div class="flex items-start justify-between mb-4">
                                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                                        <Building class="w-6 h-6 text-white" />
                                    </div>
                                    <div class={`px-2.5 py-1 rounded-full text-xs font-semibold ${tenant.isActive
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}>
                                        {tenant.isActive ? 'Active' : 'Inactive'}
                                    </div>
                                </div>

                                <h3 class="text-xl font-bold text-white mb-1">{tenant.name}</h3>
                                <div class="text-slate-400 text-sm mb-4">
                                    {tenant.subdomain}.ixasales.com
                                </div>

                                <div class="flex items-center gap-4 text-sm text-slate-500 border-t border-slate-800 pt-4">
                                    <div>Plan: <span class="text-slate-300 capitalize">{tenant.plan}</span></div>
                                    <div class="flex-1" />
                                    {/* Stats placeholders - waiting for API to return stats in list */}
                                    <div class="flex items-center gap-1">
                                        <div class="w-2 h-2 rounded-full bg-blue-500" />
                                        User limit: {tenant.maxUsers || 'Unlimited'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            {/* Crreate Modal */}
            <Show when={showCreateModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 class="text-xl font-bold text-white">Create New Tenant</h2>
                            <button onClick={() => setShowCreateModal(false)} class="text-slate-400 hover:text-white transition-colors">
                                <XCircle class="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} class="p-6 space-y-4">
                            <Show when={error()}>
                                <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error()}
                                </div>
                            </Show>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onInput={(e) => setFormData('name', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Company Name"
                                    />
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Subdomain</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.subdomain}
                                        onInput={(e) => setFormData('subdomain', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="company"
                                    />
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Plan</label>
                                    <select
                                        value={formData.plan}
                                        onInput={(e) => setFormData('plan', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="standard">Standard</option>
                                        <option value="professional">Professional</option>
                                        <option value="enterprise">Enterprise</option>
                                    </select>
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Currency</label>
                                    <select
                                        value={formData.currency}
                                        onInput={(e) => setFormData('currency', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                        <option value="GBP">GBP (£)</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Max Users</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.maxUsers}
                                        onInput={(e) => setFormData('maxUsers', parseInt(e.currentTarget.value) || 0)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Max Products</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.maxProducts}
                                        onInput={(e) => setFormData('maxProducts', parseInt(e.currentTarget.value) || 0)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Timezone</label>
                                    <select
                                        value={formData.timezone}
                                        onInput={(e) => setFormData('timezone', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="UTC">UTC</option>
                                        <option value="America/New_York">America/New_York</option>
                                        <option value="Europe/London">Europe/London</option>
                                        <option value="Asia/Dubai">Asia/Dubai</option>
                                    </select>
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Tax Rate (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={formData.defaultTaxRate}
                                        onInput={(e) => setFormData('defaultTaxRate', parseFloat(e.currentTarget.value) || 0)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div class="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    class="px-5 py-2.5 text-slate-300 font-medium hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting()}
                                    class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Show when={submitting()} fallback="Create Tenant">
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        Creating...
                                    </Show>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Tenants;
