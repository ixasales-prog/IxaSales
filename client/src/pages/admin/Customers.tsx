import { type Component, For, Show, createSignal, createResource, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
    Search,
    Plus,
    Filter,
    ChevronLeft,
    ChevronRight,
    Users,
    Loader2,
    Edit2,
    Eye,
    X,
    Phone,
    MapPin,
    Star
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';

interface Customer {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    address: string | null;
    creditLimit: string | null;
    currentDebt: string | null;
    tierName?: string;
    isActive: boolean;
    // Added fields
    email: string | null;
    contactPerson: string | null;
    tierId: string | null;
    territoryId: string | null;
    assignedSalesRepId: string | null;
    notes: string | null;
}

const Customers: Component = () => {
    const [searchQuery, setSearchQuery] = createSignal('');
    const [page, setPage] = createSignal(1);
    const [debouncedSearch, setDebouncedSearch] = createSignal('');

    // Add Customer Modal State
    const [showCreateModal, setShowCreateModal] = createSignal(false);
    const [submitting, setSubmitting] = createSignal(false);
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [error, setError] = createSignal<string | null>(null);

    const [formData, setFormData] = createStore({
        name: '',
        code: '',
        email: '',
        phone: '',
        address: '',
        contactPerson: '',
        tierId: '',
        territoryId: '',
        assignedSalesRepId: '',
        notes: ''
    });

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    createEffect(() => {
        const query = searchQuery();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            setDebouncedSearch(query);
            setPage(1);
        }, 300);
    });

    // Fetch customers
    const [customersResponse, { refetch }] = createResource(
        () => ({ page: page(), search: debouncedSearch() }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: '15'
            };
            if (params.search) queryParams.search = params.search;
            const result = await api<{ data: Customer[]; meta: any }>('/customers', { params: queryParams });
            return result;
        }
    );

    // Fetch Tiers
    const [tiers] = createResource(async () => {
        const result = await api<any[]>('/customers/tiers');
        return result || [];
    });

    // Fetch Territories
    const [territories] = createResource(async () => {
        const result = await api<any[]>('/customers/territories');
        // Sort territories in descending order by name
        return (result || []).sort((a, b) => b.name.localeCompare(a.name));
    });

    // Fetch Sales Reps
    const [salesReps] = createResource(async () => {
        const result = await api<any>('/users', { params: { role: 'sales_rep', limit: '100' } });
        return Array.isArray(result) ? result : (result?.data || []);
    });

    const customers = () => {
        const res = customersResponse();
        if (Array.isArray(res)) return res;
        return res?.data || [];
    };
    const meta = () => (customersResponse() as any)?.meta || { page: 1, totalPages: 1, total: 0 };

    // formatCurrency is now imported from settings store

    const getDebtStatus = (customer: Customer) => {
        const debt = parseFloat(customer.currentDebt || '0');
        const limit = parseFloat(customer.creditLimit || '0');

        if (debt <= 0) return { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Clear' };
        if (limit > 0 && debt >= limit) return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Over Limit' };
        if (debt > 0) return { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Has Debt' };
        return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', label: 'Unknown' };
    };

    const handleEdit = (customer: Customer) => {
        setEditingId(customer.id);
        setFormData({
            name: customer.name,
            code: customer.code || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || '',
            contactPerson: customer.contactPerson || '',
            tierId: customer.tierId || '',
            territoryId: customer.territoryId || '',
            assignedSalesRepId: customer.assignedSalesRepId || '',
            notes: customer.notes || ''
        });
        setShowCreateModal(true);
    };

    // TODO: Implement delete button in UI
    // const handleDelete = async (id: string) => {
    //     if (!confirm('Are you sure you want to delete this customer?')) return;
    //     try {
    //         await api(`/customers/${id}`, { method: 'DELETE' });
    //         refetch();
    //     } catch (err: any) {
    //         alert(err.message || 'Failed to delete customer');
    //     }
    // };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api(editingId() ? `/customers/${editingId()}` : '/customers', {
                method: editingId() ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    ...formData,
                    // Remove empty strings
                    code: formData.code || undefined,
                    email: formData.email || undefined,
                    phone: formData.phone || undefined,
                    tierId: formData.tierId || undefined,
                    territoryId: formData.territoryId || undefined,
                    assignedSalesRepId: formData.assignedSalesRepId || undefined,
                    // For patch, we might send all fields, backend handles it
                })
            });

            setShowCreateModal(false);
            setEditingId(null);
            setFormData({
                name: '',
                code: '',
                email: '',
                phone: '',
                address: '',
                contactPerson: '',
                tierId: '',
                territoryId: '',
                assignedSalesRepId: '',
                notes: ''
            });
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to create customer.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 mt-6 lg:mt-8">
            {/* Header */}
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-white">Customers</h1>
                    <p class="text-slate-400 text-sm">Manage your customer database</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setFormData({
                            name: '',
                            code: '',
                            email: '',
                            phone: '',
                            address: '',
                            contactPerson: '',
                            tierId: '',
                            territoryId: '',
                            assignedSalesRepId: '',
                            notes: ''
                        });
                        setShowCreateModal(true);
                    }}
                    class="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all"
                >
                    <Plus class="w-5 h-5" />
                    Add Customer
                </button>
            </div>

            {/* Search & Filters */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 mb-6">
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="flex-1 relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery()}
                            onInput={(e) => setSearchQuery(e.currentTarget.value)}
                            placeholder="Search customers..."
                            class="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <Show when={searchQuery()}>
                            <button
                                onClick={() => setSearchQuery('')}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </Show>
                    </div>
                    <button class="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition-colors">
                        <Filter class="w-4 h-4" />
                        Filters
                    </button>
                </div>
            </div>

            {/* Table */}
            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                {/* Loading */}
                <Show when={customersResponse.loading}>
                    <div class="flex items-center justify-center py-20">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!customersResponse.loading}>
                    {/* Desktop Table */}
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-slate-800/50 border-b border-slate-700">
                                <tr>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Customer</th>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Contact</th>
                                    <th class="text-left text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Tier</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Credit Limit</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Current Debt</th>
                                    <th class="text-center text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Status</th>
                                    <th class="text-right text-slate-400 text-xs font-medium uppercase tracking-wider px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                <For each={customers()}>
                                    {(customer) => {
                                        const debtStatus = getDebtStatus(customer);
                                        return (
                                            <tr class="hover:bg-slate-800/30 transition-colors">
                                                <td class="px-6 py-4">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                                                            {customer.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div class="text-white font-medium">{customer.name}</div>
                                                            <div class="text-slate-500 text-xs">{customer.code || 'No code'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <div class="space-y-1">
                                                        <Show when={customer.phone}>
                                                            <div class="flex items-center gap-1.5 text-slate-300 text-sm">
                                                                <Phone class="w-3.5 h-3.5 text-slate-500" />
                                                                {customer.phone}
                                                            </div>
                                                        </Show>
                                                        <Show when={customer.address}>
                                                            <div class="flex items-center gap-1.5 text-slate-500 text-xs truncate max-w-[200px]">
                                                                <MapPin class="w-3 h-3 flex-shrink-0" />
                                                                {customer.address}
                                                            </div>
                                                        </Show>
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    <Show when={customer.tierName} fallback={<span class="text-slate-500">-</span>}>
                                                        <span class="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/20">
                                                            <Star class="w-3 h-3" />
                                                            {customer.tierName}
                                                        </span>
                                                    </Show>
                                                </td>
                                                <td class="px-6 py-4 text-right text-slate-300">{formatCurrency(customer.creditLimit)}</td>
                                                <td class="px-6 py-4 text-right">
                                                    <span class={`font-medium ${parseFloat(customer.currentDebt || '0') > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                                                        {formatCurrency(customer.currentDebt)}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-center">
                                                    <span class={`px-2 py-1 rounded-full text-[10px] font-bold ${debtStatus.bg} ${debtStatus.color} border ${debtStatus.border}`}>
                                                        {debtStatus.label}
                                                    </span>
                                                </td>
                                                <td class="px-6 py-4 text-right">
                                                    <div class="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // Assuming row click might show details
                                                                // View details logic
                                                            }}
                                                            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                        >
                                                            <Eye class="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(customer)}
                                                            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                        >
                                                            <Edit2 class="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div class="lg:hidden divide-y divide-slate-800">
                        <For each={customers()}>
                            {(customer) => {
                                const debtStatus = getDebtStatus(customer);
                                return (
                                    <div class="p-4">
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                                                    {customer.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div class="text-white font-medium">{customer.name}</div>
                                                    <div class="text-slate-500 text-xs">{customer.phone || 'No phone'}</div>
                                                </div>
                                            </div>
                                            <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${debtStatus.bg} ${debtStatus.color}`}>
                                                {debtStatus.label}
                                            </span>
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <Show when={customer.tierName}>
                                                <span class="flex items-center gap-1 text-yellow-400 text-xs">
                                                    <Star class="w-3 h-3" />
                                                    {customer.tierName}
                                                </span>
                                            </Show>
                                            <div class={`font-semibold ${parseFloat(customer.currentDebt || '0') > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                                                {formatCurrency(customer.currentDebt)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

                    {/* Empty State */}
                    <Show when={customers().length === 0}>
                        <div class="text-center py-16">
                            <Users class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                            <h3 class="text-lg font-semibold text-white mb-2">No customers found</h3>
                            <p class="text-slate-400 text-sm">Try adjusting your search or add a new customer</p>
                        </div>
                    </Show>
                </Show>

                {/* Pagination */}
                <Show when={meta().totalPages > 1}>
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                        <div class="text-slate-400 text-sm">
                            Page {meta().page} of {meta().totalPages}
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white font-medium px-3">{page()}</span>
                            <button
                                onClick={() => setPage(p => Math.min(meta().totalPages, p + 1))}
                                disabled={page() >= meta().totalPages}
                                class="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </Show>
            </div>

            {/* Create Customer Modal */}
            <Show when={showCreateModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div class="p-6 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
                            <h2 class="text-xl font-bold text-white">{editingId() ? 'Edit Customer' : 'Add New Customer'}</h2>
                            <button onClick={() => setShowCreateModal(false)} class="text-slate-400 hover:text-white transition-colors">
                                <X class="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} class="p-6 space-y-4">
                            <Show when={error()}>
                                <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error()}
                                </div>
                            </Show>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Customer Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onInput={(e) => setFormData('name', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Business Name"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Customer Code</label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onInput={(e) => setFormData('code', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Optional (e.g. CUST001)"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onInput={(e) => setFormData('email', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="email@example.com"
                                    />
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Phone Number</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onInput={(e) => setFormData('phone', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="+1 234 567 890"
                                    />
                                </div>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Contact Person</label>
                                <input
                                    type="text"
                                    value={formData.contactPerson}
                                    onInput={(e) => setFormData('contactPerson', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Primary contact name"
                                />
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Address</label>
                                <textarea
                                    value={formData.address}
                                    onInput={(e) => setFormData('address', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                    placeholder="Full shipping/billing address"
                                />
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Pricing Tier</label>
                                    <select
                                        value={formData.tierId}
                                        onInput={(e) => setFormData('tierId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Default Tier</option>
                                        <For each={tiers()}>
                                            {(tier) => <option value={tier.id}>{tier.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Territory</label>
                                    <select
                                        value={formData.territoryId}
                                        onInput={(e) => setFormData('territoryId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Unassigned</option>
                                        <For each={territories()}>
                                            {(territory) => <option value={territory.id}>{territory.name}</option>}
                                        </For>
                                    </select>
                                </div>

                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Sales Rep</label>
                                    <select
                                        value={formData.assignedSalesRepId}
                                        onInput={(e) => setFormData('assignedSalesRepId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Unassigned</option>
                                        <For each={salesReps()}>
                                            {(rep: any) => <option value={rep.id}>{rep.name}</option>}
                                        </For>
                                    </select>
                                </div>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onInput={(e) => setFormData('notes', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[60px]"
                                    placeholder="Additional notes..."
                                />
                            </div>

                            <div class="pt-4 flex justify-end gap-3 border-t border-slate-800 mt-2">
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
                                    <Show when={submitting()} fallback={editingId() ? 'Update Customer' : 'Create Customer'}>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        {editingId() ? 'Updating...' : 'Creating...'}
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

export default Customers;

