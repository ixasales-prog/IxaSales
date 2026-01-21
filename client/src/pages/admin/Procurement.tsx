import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import {
    Plus,
    Search,
    Building2,
    ShoppingCart,
    FileText,
    Phone,
    Mail,
    MapPin,
    Edit,
    Trash2,
    Eye
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import AddSupplierModal from './AddSupplierModal';
import CreatePurchaseOrderModal from './CreatePurchaseOrderModal';
import ViewPurchaseOrderModal from './ViewPurchaseOrderModal';

const Procurement: Component = () => {
    const [activeTab, setActiveTab] = createSignal<'orders' | 'suppliers'>('orders');
    const [showAddSupplier, setShowAddSupplier] = createSignal(false);
    const [showCreatePO, setShowCreatePO] = createSignal(false);
    const [editingSupplier, setEditingSupplier] = createSignal<any>(null);
    const [viewingOrderId, setViewingOrderId] = createSignal<string | null>(null);

    // Filters
    const [search, setSearch] = createSignal('');
    const [statusFilter, setStatusFilter] = createSignal('');

    // Resources
    const [orders, { refetch: refetchOrders }] = createResource(
        () => ({ tab: activeTab(), search: search(), status: statusFilter() }),
        async ({ tab, status }) => {
            if (tab !== 'orders') return [];
            try {
                // Determine status based on search/filter or generic
                // Note: The backend supports 'status' query param
                const params: any = {};
                if (status) params.status = status;

                const res = await api.get('/procurement/purchase-orders', { params });
                // Handle both cases: res could be the array directly or { data: [...] }
                return Array.isArray(res) ? res : (res?.data || []);
            } catch (e) { return []; }
        }
    );

    const [suppliers, { refetch: refetchSuppliers }] = createResource(
        () => ({ tab: activeTab(), search: search() }),
        async ({ tab }) => {
            if (tab !== 'suppliers') return [];
            try {
                const res = await api.get('/procurement/suppliers');
                // Handle both cases: res could be the array directly or { data: [...] }
                return Array.isArray(res) ? res : (res?.data || []);
            } catch (e) { return []; }
        }
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'received': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'ordered': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            case 'draft': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
            case 'cancelled': return 'text-red-400 bg-red-400/10 border-red-400/20';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    const handleEditSupplier = (supplier: any) => {
        setEditingSupplier(supplier);
        setShowAddSupplier(true);
    };

    const handleDeleteSupplier = async (id: string) => {
        if (!confirm('Are you sure you want to delete this supplier?')) return;
        try {
            await api.delete(`/procurement/suppliers/${id}`);
            toast.success('Supplier deleted successfully');
            refetchSuppliers();
        } catch (error: any) {
            console.error('Failed to delete supplier:', error);
            toast.error(error.message || 'Failed to delete supplier');
        }
    };

    const handleCloseSupplierModal = () => {
        setShowAddSupplier(false);
        setEditingSupplier(null);
    };

    return (
        <div class="p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Header */}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        <ShoppingCart class="w-7 h-7 text-blue-400" />
                        Procurement
                    </h1>
                    <p class="text-slate-400 mt-1">Manage purchase orders and supplier relationships</p>
                </div>
                <div class="flex items-center gap-3">
                    <button
                        onClick={() => activeTab() === 'orders' ? setShowCreatePO(true) : setShowAddSupplier(true)}
                        class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 active:scale-95"
                    >
                        <Plus class="w-5 h-5" />
                        {activeTab() === 'orders' ? 'New Purchase Order' : 'Add Supplier'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div class="flex gap-1 p-1 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 w-fit">
                <button
                    onClick={() => setActiveTab('orders')}
                    class={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab() === 'orders'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                >
                    <FileText class="w-4 h-4" />
                    Purchase Orders
                </button>
                <button
                    onClick={() => setActiveTab('suppliers')}
                    class={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab() === 'suppliers'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                >
                    <Building2 class="w-4 h-4" />
                    Suppliers
                </button>
            </div>

            {/* Filters */}
            <div class="flex flex-col sm:flex-row gap-4">
                <div class="relative flex-1 max-w-md">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder={activeTab() === 'orders' ? "Search PO number..." : "Search suppliers..."}
                        class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none text-white placeholder:text-slate-500 transition-all"
                    />
                </div>

                <Show when={activeTab() === 'orders'}>
                    <div class="flex gap-2">
                        <select
                            value={statusFilter()}
                            onChange={(e) => setStatusFilter(e.currentTarget.value)}
                            class="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                            <option value="">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="ordered">Ordered</option>
                            <option value="received">Received</option>
                        </select>
                    </div>
                </Show>
            </div>

            {/* Content */}
            <div class="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
                <Show when={activeTab() === 'orders'}>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b border-slate-800 bg-slate-900/50">
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">PO Number</th>
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Supplier</th>
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Amount</th>
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                    <th class="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                <For each={orders()}>
                                    {(order: any) => (
                                        <tr
                                            class="group hover:bg-slate-800/50 transition-colors cursor-pointer"
                                            onClick={() => setViewingOrderId(order.id)}
                                        >
                                            <td class="p-4">
                                                <div class="font-medium text-white">{order.poNumber}</div>
                                            </td>
                                            <td class="p-4">
                                                <div class="text-slate-300">{order.supplierName}</div>
                                            </td>
                                            <td class="p-4">
                                                <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                                                    <span class="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                                </span>
                                            </td>
                                            <td class="p-4">
                                                <div class="font-mono text-slate-300">${Number(order.totalAmount || 0).toFixed(2)}</div>
                                            </td>
                                            <td class="p-4">
                                                <div class="text-slate-400 text-sm">
                                                    {new Date(order.createdAt).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td class="p-4 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setViewingOrderId(order.id);
                                                    }}
                                                    class="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye class="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                                <Show when={orders.loading}>
                                    <tr><td colSpan={6} class="p-8 text-center text-slate-500">Loading orders...</td></tr>
                                </Show>
                                <Show when={!orders.loading && orders()?.length === 0}>
                                    <tr><td colSpan={6} class="p-12 text-center text-slate-500">No purchase orders found</td></tr>
                                </Show>
                            </tbody>
                        </table>
                    </div>
                </Show>

                <Show when={activeTab() === 'suppliers'}>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                        <For each={suppliers()}>
                            {(supplier: any) => (
                                <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all group">
                                    <div class="flex items-start justify-between mb-4">
                                        <div class="p-3 bg-blue-500/10 rounded-xl">
                                            <Building2 class="w-6 h-6 text-blue-400" />
                                        </div>
                                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditSupplier(supplier)}
                                                class="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                            >
                                                <Edit class="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSupplier(supplier.id)}
                                                class="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <h3 class="font-bold text-lg text-white mb-1">{supplier.name}</h3>
                                    <div class="space-y-2 mt-4">
                                        <div class="flex items-center gap-2 text-sm text-slate-400">
                                            <UserIcon class="w-4 h-4 text-slate-500" />
                                            {supplier.contactPerson || 'No contact person'}
                                        </div>
                                        <div class="flex items-center gap-2 text-sm text-slate-400">
                                            <Phone class="w-4 h-4 text-slate-500" />
                                            {supplier.phone || 'No phone'}
                                        </div>
                                        <div class="flex items-center gap-2 text-sm text-slate-400">
                                            <Mail class="w-4 h-4 text-slate-500" />
                                            {supplier.email || 'No email'}
                                        </div>
                                        <div class="flex items-center gap-2 text-sm text-slate-400">
                                            <MapPin class="w-4 h-4 text-slate-500" />
                                            <span class="truncate">{supplier.address || 'No address'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                        <Show when={suppliers.loading}>
                            <div class="col-span-full text-center text-slate-500 py-12">Loading suppliers...</div>
                        </Show>
                        <Show when={!suppliers.loading && suppliers()?.length === 0}>
                            <div class="col-span-full text-center text-slate-500 py-12">No suppliers found</div>
                        </Show>
                    </div>
                </Show>
            </div>

            {/* Modals */}
            <Show when={showAddSupplier()}>
                <AddSupplierModal
                    supplier={editingSupplier()}
                    onClose={handleCloseSupplierModal}
                    onSuccess={refetchSuppliers}
                />
            </Show>

            <Show when={showCreatePO()}>
                <CreatePurchaseOrderModal
                    onClose={() => setShowCreatePO(false)}
                    onSuccess={refetchOrders}
                />
            </Show>

            <Show when={viewingOrderId()}>
                <ViewPurchaseOrderModal
                    orderId={viewingOrderId()!}
                    onClose={() => setViewingOrderId(null)}
                    onSuccess={refetchOrders}
                />
            </Show>
        </div>
    );
};

const UserIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);

export default Procurement;
