import { type Component, createResource, createSignal, Show, For, Switch, Match, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from '../../lib/api';
import type { Tenant } from '../../types';
import {
    Building,
    Plus,
    Search,
    Loader2,
    XCircle,
    Edit,
    Calendar,
    CreditCard,
    LayoutGrid,
    Table as TableIcon,
    List,
    Send
} from 'lucide-solid';

const Tenants: Component = () => {
    const [search, setSearch] = createSignal('');
    const [showCreateModal, setShowCreateModal] = createSignal(false);
    const storedView = localStorage.getItem('tenants_view_mode') as 'grid' | 'table' | 'list' | null;
    const [viewMode, setViewMode] = createSignal<'grid' | 'table' | 'list'>(storedView || 'table');

    createEffect(() => {
        localStorage.setItem('tenants_view_mode', viewMode());
    });

    // ... existing state ...
    const [modalMode, setModalMode] = createSignal<'create' | 'edit'>('create');
    const [editingId, setEditingId] = createSignal<string | null>(null);

    const [formData, setFormData] = createStore({
        name: '',
        subdomain: '',
        plan: 'starter',
        currency: 'USD',
        timezone: 'UTC',
        isActive: true,
        telegramEnabled: false,
        telegramBotToken: '',

        subscriptionEndAt: '',
        planStatus: 'active'
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

    const handleOpenCreate = () => {
        setModalMode('create');
        setEditingId(null);
        setFormData({
            name: '',
            subdomain: '',
            plan: 'starter',
            currency: 'USD',
            timezone: 'UTC',
            isActive: true,
            telegramEnabled: false,
            telegramBotToken: '',

            subscriptionEndAt: '',
            planStatus: 'active'
        });
        setShowCreateModal(true);
    };

    const handleOpenEdit = (tenant: Tenant) => {
        setModalMode('edit');
        setEditingId(tenant.id);
        setFormData({
            name: tenant.name,
            subdomain: tenant.subdomain,
            plan: tenant.plan,
            currency: tenant.currency || 'USD',
            timezone: tenant.timezone || 'UTC',
            isActive: tenant.isActive,
            telegramEnabled: tenant.telegramEnabled ?? false,
            telegramBotToken: tenant.telegramBotToken || '',
            subscriptionEndAt: tenant.subscriptionEndAt ? new Date(tenant.subscriptionEndAt).toISOString().split('T')[0] : '',
            planStatus: tenant.planStatus || 'active'
        });
        setShowCreateModal(true);
    };

    // ... existing handleSubmit ...
    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const url = modalMode() === 'create' ? '/super/tenants' : `/super/tenants/${editingId()}`;
            const method = modalMode() === 'create' ? 'POST' : 'PATCH';

            const payload = { ...formData };
            if (payload.subscriptionEndAt === '') {
                // @ts-ignore
                payload.subscriptionEndAt = null;
            }

            await api(url, {
                method,
                body: JSON.stringify(payload)
            });

            setShowCreateModal(false);
            refetch();
        } catch (err: any) {
            setError(err.message || `Failed to ${modalMode()} tenant.`);
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
                    onClick={handleOpenCreate}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                >
                    <Plus class="w-5 h-5" />
                    New Tenant
                </button>
            </div>

            {/* Controls */}
            <div class="flex flex-col sm:flex-row gap-4 mb-6">
                {/* Search */}
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search tenants..."
                        class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                    />
                </div>

                {/* View Toggle */}
                <div class="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 shrink-0">
                    <button
                        onClick={() => setViewMode('grid')}
                        class={`p-2 rounded-lg transition-colors ${viewMode() === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                        title="Grid View"
                    >
                        <LayoutGrid class="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        class={`p-2 rounded-lg transition-colors ${viewMode() === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                        title="Table View"
                    >
                        <TableIcon class="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        class={`p-2 rounded-lg transition-colors ${viewMode() === 'list' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                        title="List View"
                    >
                        <List class="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Views */}
            <Show when={!tenants.loading} fallback={
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            }>
                <Switch>
                    {/* GRID VIEW */}
                    <Match when={viewMode() === 'grid'}>
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
                                            <div class="flex items-center gap-1">
                                                <div class="w-2 h-2 rounded-full bg-blue-500" />
                                                User limit: {tenant.maxUsers || 'Unlimited'}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleOpenEdit(tenant)}
                                            class="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors text-sm font-medium"
                                        >
                                            <Edit class="w-4 h-4" /> Edit Configuration
                                        </button>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Match>

                    {/* TABLE VIEW */}
                    <Match when={viewMode() === 'table'}>
                        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr class="border-b border-slate-800 bg-slate-950/50 text-xs uppercase text-slate-500 font-medium">
                                            <th class="p-4 pl-6">Company</th>
                                            <th class="p-4">Subdomain</th>
                                            <th class="p-4">Plan</th>
                                            <th class="p-4">Status</th>
                                            <th class="p-4">Telegram</th>
                                            <th class="p-4">Created</th>
                                            <th class="p-4 text-right pr-6">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-800">
                                        <For each={filteredTenants()}>
                                            {(tenant) => (
                                                <tr class="hover:bg-slate-800/30 transition-colors">
                                                    <td class="p-4 pl-6 font-medium text-white">{tenant.name}</td>
                                                    <td class="p-4 text-slate-400">{tenant.subdomain}.ixasales.com</td>
                                                    <td class="p-4 capitalize text-slate-300">{tenant.plan}</td>
                                                    <td class="p-4">
                                                        <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tenant.isActive
                                                            ? 'bg-emerald-500/10 text-emerald-400'
                                                            : 'bg-red-500/10 text-red-400'
                                                            }`}>
                                                            {tenant.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td class="p-4">
                                                        <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${tenant.telegramEnabled
                                                            ? 'bg-blue-500/10 text-blue-400'
                                                            : 'bg-slate-700/50 text-slate-500'
                                                            }`}>
                                                            <Send class="w-3 h-3" />
                                                            {tenant.telegramEnabled ? 'On' : 'Off'}
                                                        </span>
                                                    </td>
                                                    <td class="p-4 text-slate-500 text-sm">
                                                        {new Date(tenant.createdAt).toLocaleDateString()}
                                                    </td>
                                                    <td class="p-4 text-right pr-6">
                                                        <button
                                                            onClick={() => handleOpenEdit(tenant)}
                                                            class="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Match>

                    {/* LIST (ONE-LINE) VIEW */}
                    <Match when={viewMode() === 'list'}>
                        <div class="space-y-1">
                            <For each={filteredTenants()}>
                                {(tenant) => (
                                    <div class="group flex items-center justify-between p-2 pl-4 bg-slate-900/40 border border-slate-800/40 rounded-lg hover:border-slate-700 hover:bg-slate-800/60 transition-all">
                                        <div class="flex items-center gap-4 flex-1 min-w-0">
                                            <div class="w-2 h-2 rounded-full shrink-0" classList={{ 'bg-emerald-500': tenant.isActive, 'bg-red-500': !tenant.isActive }} title={tenant.isActive ? 'Active' : 'Inactive'} />
                                            <div class="font-medium text-white truncate w-48">{tenant.name}</div>
                                            <div class="text-sm text-slate-500 truncate w-48">{tenant.subdomain}.ixasales.com</div>
                                            <div class="hidden sm:block text-xs text-slate-600 uppercase tracking-wider">{tenant.plan}</div>
                                        </div>

                                        <div class="flex items-center gap-3 pl-4 border-l border-slate-800/50">
                                            <button
                                                onClick={() => handleOpenEdit(tenant)}
                                                class="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit class="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Match>
                </Switch>
            </Show>

            {/* Crreate Modal */}
            <Show when={showCreateModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 class="text-xl font-bold text-white">
                                {modalMode() === 'create' ? 'Create New Tenant' : 'Edit Tenant & Subscription'}
                            </h2>
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
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Plan</label>
                                        <select
                                            value={formData.plan}
                                            onInput={(e) => setFormData('plan', e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="free">Free (5 users, 100 products)</option>
                                            <option value="starter">Starter (10 users, 500 products)</option>
                                            <option value="pro">Pro (50 users, 5000 products)</option>
                                            <option value="enterprise">Enterprise (Unlimited)</option>
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
                                        <option value="Asia/Karachi">Asia/Karachi</option>
                                    </select>
                                </div>
                            </div>

                            <div class="border-t border-slate-800 pt-4 mt-4">
                                <h3 class="text-white font-semibold mb-3 flex items-center gap-2">
                                    <CreditCard class="w-4 h-4 text-emerald-400" />
                                    Subscription & Billing
                                </h3>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Plan Status</label>
                                        <select
                                            value={formData.planStatus}
                                            onInput={(e) => setFormData('planStatus', e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="active">Active</option>
                                            <option value="trial">Trialing</option>
                                            <option value="past_due">Past Due (Unpaid)</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Subscription Ends</label>
                                        <div class="relative">
                                            <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input
                                                type="date"
                                                value={formData.subscriptionEndAt}
                                                onInput={(e) => setFormData('subscriptionEndAt', e.currentTarget.value)}
                                                class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-4 flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData('isActive', e.currentTarget.checked)}
                                        class="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label for="isActive" class="text-sm font-medium text-slate-300">
                                        Tenant is Active (Uncheck to suspend access immediately)
                                    </label>
                                </div>
                                <div class="mt-4 flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="telegramEnabled"
                                        checked={formData.telegramEnabled}
                                        onChange={(e) => setFormData('telegramEnabled', e.currentTarget.checked)}
                                        class="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label for="telegramEnabled" class="text-sm font-medium text-slate-300 flex items-center gap-2">
                                        <Send class="w-4 h-4 text-blue-400" />
                                        Enable Telegram Notifications
                                    </label>
                                </div>
                                <Show when={formData.telegramEnabled}>
                                    <div class="mt-4 space-y-1.5">
                                        <label class="text-sm font-medium text-slate-300">Tenant's Bot Token</label>
                                        <input
                                            type="text"
                                            value={formData.telegramBotToken || ''}
                                            onInput={(e) => setFormData('telegramBotToken', e.currentTarget.value)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                                        />
                                        <p class="text-xs text-slate-500">Tenant's own Telegram bot token from @BotFather</p>
                                    </div>
                                </Show>
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
                                    <Show when={submitting()} fallback={modalMode() === 'create' ? 'Create Tenant' : 'Save Changes'}>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        {modalMode() === 'create' ? 'Creating...' : 'Saving...'}
                                    </Show>
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            </Show >
        </div >
    );
};

export default Tenants;
