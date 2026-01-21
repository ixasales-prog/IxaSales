import { type Component, For, Show, createResource, createMemo } from 'solid-js';
import {
    DollarSign,
    ShoppingCart,
    Package,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    Check
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency, formatCurrencyShort, formatDate } from '../../stores/settings';

interface SalesByRep {
    salesRepId: string;
    salesRepName: string;
    totalOrders: number;
    totalSales: string | null;
}

interface CustomerDebt {
    id: string;
    name: string;
    debtBalance: string;
    creditLimit: string | null;
}

interface InventoryItem {
    id: string;
    name: string;
    stockQuantity: number;
    costPrice: string | null;
    valuation: number;
}

interface RecentOrder {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
}

interface LowStockItem {
    id: string;
    name: string;
    stockQuantity: number;
    reorderPoint: number;
    sku: string;
}

const Dashboard: Component = () => {
    // Fetch sales by rep
    const [salesByRep] = createResource(async () => {
        const result = await api<SalesByRep[]>('/reports/sales-by-rep');
        return result;
    });

    // Fetch customer debts
    const [customerDebts] = createResource(async () => {
        const result = await api<CustomerDebt[]>('/reports/customer-debts');
        return result;
    });

    // Fetch inventory
    const [inventory] = createResource(async () => {
        const result = await api<InventoryItem[]>('/reports/inventory-valuation');
        return result;
    });

    // Fetch recent orders
    const [recentOrders] = createResource(async () => {
        const result = await api<RecentOrder[]>('/reports/recent-orders');
        return result || [];
    });

    // Fetch low stock items
    const [lowStockItems] = createResource(async () => {
        const result = await api<LowStockItem[]>('/reports/low-stock');
        return result || [];
    });

    // Calculate totals
    const totalSales = createMemo(() => {
        const reps = salesByRep() || [];
        return reps.reduce((sum, rep) => sum + parseFloat(rep.totalSales || '0'), 0);
    });

    const totalOrders = createMemo(() => {
        const reps = salesByRep() || [];
        return reps.reduce((sum, rep) => sum + rep.totalOrders, 0);
    });

    const totalDebt = createMemo(() => {
        const debts = customerDebts() || [];
        return debts.reduce((sum, c) => sum + parseFloat(c.debtBalance || '0'), 0);
    });

    const inventoryValue = createMemo(() => {
        const items = inventory() || [];
        return items.reduce((sum, item) => sum + (item.valuation || 0), 0);
    });

    const topSalesReps = createMemo(() => {
        const reps = salesByRep() || [];
        return [...reps]
            .sort((a, b) => parseFloat(b.totalSales || '0') - parseFloat(a.totalSales || '0'))
            .slice(0, 5);
    });

    const topDebtors = createMemo(() => {
        const debts = customerDebts() || [];
        return [...debts].slice(0, 5);
    });

    // formatCurrency is now imported from settings store

    const stats = [
        { label: 'Total Sales', value: () => formatCurrencyShort(totalSales()), icon: DollarSign, color: 'from-emerald-500 to-teal-600', change: '+12.5%', up: true },
        { label: 'Orders', value: () => totalOrders().toString(), icon: ShoppingCart, color: 'from-blue-500 to-indigo-600', change: '+8.2%', up: true },
        { label: 'Customer Debt', value: () => formatCurrencyShort(totalDebt()), icon: AlertTriangle, color: 'from-orange-500 to-red-600', change: '-3.1%', up: false },
        { label: 'Inventory Value', value: () => formatCurrencyShort(inventoryValue()), icon: Package, color: 'from-purple-500 to-pink-600', change: '+5.4%', up: true },
    ];

    const loading = () => salesByRep.loading || customerDebts.loading || inventory.loading || recentOrders.loading || lowStockItems.loading;

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="mb-8">
                <h1 class="text-2xl lg:text-3xl font-bold text-white mb-2">Dashboard</h1>
                <p class="text-slate-400">Welcome back! Here's what's happening today.</p>
            </div>

            {/* Loading */}
            <Show when={loading()}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            <Show when={!loading()}>
                {/* Stats Grid */}
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
                    <For each={stats}>
                        {(stat) => (
                            <div class="relative overflow-hidden bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
                                <div class="flex items-start justify-between mb-4">
                                    <div class={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                                        <stat.icon class="w-6 h-6 text-white" />
                                    </div>
                                    <span class={`flex items-center gap-0.5 text-sm font-medium ${stat.up ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {stat.up ? <ArrowUpRight class="w-4 h-4" /> : <ArrowDownRight class="w-4 h-4" />}
                                        {stat.change}
                                    </span>
                                </div>
                                <div class="text-2xl lg:text-3xl font-bold text-white mb-1">{stat.value()}</div>
                                <div class="text-slate-400 text-sm">{stat.label}</div>
                            </div>
                        )}
                    </For>
                </div>

                {/* Charts Row */}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Sales by Rep */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">Top Sales Reps</h3>
                        <div class="space-y-4">
                            <For each={topSalesReps()}>
                                {(rep, index) => {
                                    const maxSales = topSalesReps()[0]?.totalSales || '1';
                                    const percent = (parseFloat(rep.totalSales || '0') / parseFloat(maxSales)) * 100;
                                    return (
                                        <div>
                                            <div class="flex items-center justify-between mb-1.5">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center">
                                                        {index() + 1}
                                                    </span>
                                                    <span class="text-white font-medium text-sm">{rep.salesRepName || 'Unknown'}</span>
                                                </div>
                                                <span class="text-slate-400 text-sm">{formatCurrency(rep.totalSales)}</span>
                                            </div>
                                            <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                            <Show when={topSalesReps().length === 0}>
                                <div class="text-center py-8 text-slate-500">No sales data available</div>
                            </Show>
                        </div>
                    </div>

                    {/* Top Debtors */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle class="w-5 h-5 text-orange-400" />
                            Top Debtors
                        </h3>
                        <div class="space-y-3">
                            <For each={topDebtors()}>
                                {(customer) => {
                                    const limit = parseFloat(customer.creditLimit || '0');
                                    const debt = parseFloat(customer.debtBalance || '0');
                                    const percent = limit > 0 ? Math.min((debt / limit) * 100, 100) : 100;
                                    const isOverLimit = limit > 0 && debt >= limit;

                                    return (
                                        <div class="bg-slate-800/50 rounded-xl p-3">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-white font-medium text-sm">{customer.name}</span>
                                                <span class={`font-semibold text-sm ${isOverLimit ? 'text-red-400' : 'text-orange-400'}`}>
                                                    {formatCurrency(debt)}
                                                </span>
                                            </div>
                                            <Show when={limit > 0}>
                                                <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        class={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-orange-500'}`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <div class="flex justify-between mt-1 text-[10px] text-slate-500">
                                                    <span>0</span>
                                                    <span>Limit: {formatCurrency(limit)}</span>
                                                </div>
                                            </Show>
                                        </div>
                                    );
                                }}
                            </For>
                            <Show when={topDebtors().length === 0}>
                                <div class="text-center py-8 text-slate-500">No outstanding debts</div>
                            </Show>
                        </div>
                    </div>
                </div>

                {/* New Widgets Row */}
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Recent Orders */}
                    <div class="lg:col-span-2 bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-white">Recent Orders</h3>
                            <a href="/admin/orders" class="text-sm text-blue-400 hover:text-blue-300">View All</a>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th class="pb-3 pl-2">Order #</th>
                                        <th class="pb-3">Customer</th>
                                        <th class="pb-3">Status</th>
                                        <th class="pb-3 text-right">Amount</th>
                                        <th class="pb-3 text-right pr-2">Date</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800">
                                    <For each={recentOrders()}>
                                        {(order) => (
                                            <tr class="hover:bg-slate-800/30 transition-colors">
                                                <td class="py-3 pl-2 font-medium text-white">{order.orderNumber}</td>
                                                <td class="py-3 text-slate-300">{order.customerName || 'Unknown'}</td>
                                                <td class="py-3">
                                                    <span class={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' :
                                                        order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                                            order.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                                                'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                                    </span>
                                                </td>
                                                <td class="py-3 text-right text-white font-medium">{formatCurrency(order.totalAmount)}</td>
                                                <td class="py-3 text-right text-slate-400 pr-2">
                                                    {formatDate(order.createdAt)}
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                    <Show when={recentOrders()?.length === 0}>
                                        <tr>
                                            <td colspan="5" class="py-8 text-center text-slate-500">
                                                No recent orders found
                                            </td>
                                        </tr>
                                    </Show>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Low Stock Alerts */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle class="w-5 h-5 text-red-400" />
                            Low Stock Alerts
                        </h3>
                        <div class="space-y-3">
                            <For each={lowStockItems()}>
                                {(item) => (
                                    <div class="bg-slate-800/50 rounded-xl p-3 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                                        <div>
                                            <div class="text-white font-medium text-sm mb-1">{item.name}</div>
                                            <div class="text-xs text-slate-400">SKU: {item.sku}</div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-red-400 font-bold text-sm">{item.stockQuantity} / {item.reorderPoint}</div>
                                            <div class="text-xs text-slate-500">In Stock</div>
                                        </div>
                                    </div>
                                )}
                            </For>
                            <Show when={lowStockItems()?.length === 0}>
                                <div class="text-center py-12 text-slate-500 flex flex-col items-center gap-2">
                                    <Check class="w-8 h-8 text-emerald-500/50" />
                                    <p>All stock levels healthy</p>
                                </div>
                            </Show>
                        </div>
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                        <div class="text-3xl font-bold text-white mb-1">{(salesByRep() || []).length}</div>
                        <div class="text-slate-400 text-sm">Active Sales Reps</div>
                    </div>
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                        <div class="text-3xl font-bold text-white mb-1">{(customerDebts() || []).length}</div>
                        <div class="text-slate-400 text-sm">Customers with Debt</div>
                    </div>
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                        <div class="text-3xl font-bold text-white mb-1">{(inventory() || []).length}</div>
                        <div class="text-slate-400 text-sm">Active Products</div>
                    </div>
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                        <div class="text-3xl font-bold text-emerald-400 mb-1">98.2%</div>
                        <div class="text-slate-400 text-sm">Delivery Rate</div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Dashboard;
