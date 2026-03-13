import { type Component, For, Show, createSignal, createResource, createMemo, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    DollarSign,
    File,
    Package,
    Search,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Play,
    ShoppingBag,
    Square,
    CheckSquare,
    MinusSquare,
    Truck,
    XCircle,
    Globe
} from 'lucide-solid';
import { Dynamic } from 'solid-js/web';
import { api, apiResponse } from '../../lib/api';
import { formatDateTime } from '../../stores/settings';
import { useI18n } from '../../i18n';
import BatchOrderToolbar from '../../components/admin/BatchOrderToolbar';
import toast from '../../components/Toast';
import { getOrderStatusConfig, getPaymentStatusConfig } from '../../components/shared/order';

interface Order {
    id: string;
    orderNumber: string;
    customer: { name: string; code: string } | null;
    salesRep: { name: string } | null;
    driver: { name: string } | null;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    paidAmount: string;
    createdAt: string;
    isPortalOrder?: boolean;
}

interface OrdersEnvelope {
    data: Order[];
    meta?: {
        page: string | number;
        limit: string | number;
        total: number;
        totalPages: number;
    };
}

interface Driver {
    id: string;
    name: string;
}

interface BatchResult {
    orderId: string;
    orderNumber: string;
    success: boolean;
    error?: string;
    previousStatus?: string;
}

interface BatchResponse {
    processed: number;
    succeeded: number;
    failed: number;
    results: BatchResult[];
}

interface Territory {
    id: string;
    name: string;
}

interface SalesRep {
    id: string;
    name: string;
}

const Orders: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [search, setSearch] = createSignal('');
    const [statusFilter, setStatusFilter] = createSignal('');
    const [paymentFilter, setPaymentFilter] = createSignal('');
    const [territoryFilter, setTerritoryFilter] = createSignal('');
    const [salesRepFilter, setSalesRepFilter] = createSignal('');
    const [startDate, setStartDate] = createSignal('');
    const [endDate, setEndDate] = createSignal('');
    const [page, setPage] = createSignal(1);
    const limit = 20;

    // Selection state
    const [selectedOrderIds, setSelectedOrderIds] = createSignal<Set<string>>(new Set());
    const [isLoading, setIsLoading] = createSignal(false);
    const statusIcons = {
        AlertCircle,
        CheckCircle2,
        Clock,
        DollarSign,
        File,
        Package,
        Play,
        ShoppingBag,
        Truck,
        XCircle,
    } as const;

    const [orders, { refetch }] = createResource(
        () => ({
            search: search(),
            status: statusFilter(),
            paymentStatus: paymentFilter(),
            territoryId: territoryFilter(),
            salesRepId: salesRepFilter(),
            startDate: startDate(),
            endDate: endDate(),
            page: page()
        }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: limit.toString(),
            };
            if (params.search) queryParams.search = params.search;
            if (params.status) queryParams.status = params.status;
            if (params.paymentStatus) queryParams.paymentStatus = params.paymentStatus;
            if (params.territoryId) queryParams.territoryId = params.territoryId;
            if (params.salesRepId) queryParams.salesRepId = params.salesRepId;
            if (params.startDate) queryParams.startDate = params.startDate;
            if (params.endDate) queryParams.endDate = params.endDate;

            const result = await apiResponse<OrdersEnvelope>('/orders', { params: queryParams });
            return result;
        }
    );

    // Fetch territories for filter
    const [territories] = createResource(async () => {
        try {
            const result = await api<{ data: Territory[] }>('/territories', { params: { limit: '100' } });
            return (result as any)?.data || result || [];
        } catch (e) {
            console.error('Failed to fetch territories:', e);
            return [];
        }
    });

    // Fetch sales reps for filter
    const [salesReps] = createResource(async () => {
        try {
            const result = await api<{ data: SalesRep[] }>('/users', {
                params: { role: 'sales_rep', isActive: 'true', limit: '100' }
            });
            return (result as any)?.data || result || [];
        } catch (e) {
            console.error('Failed to fetch sales reps:', e);
            return [];
        }
    });

    // Fetch drivers for assignment
    const [drivers] = createResource(async () => {
        try {
            const result = await api<{ data: Driver[] }>('/users', {
                params: { role: 'driver', isActive: 'true', limit: '100' }
            });
            return (result as any)?.data || result || [];
        } catch (e) {
            console.error('Failed to fetch drivers:', e);
            return [];
        }
    });

    const orderList = createMemo(() => (orders() as OrdersEnvelope | undefined)?.data || []);
    const total = createMemo(() => (orders() as OrdersEnvelope | undefined)?.meta?.total || orderList().length);
    const totalPages = createMemo(() => Math.ceil(total() / limit));

    // Selected orders with details
    const selectedOrders = createMemo(() => {
        const selectedIds = selectedOrderIds();
        return orderList().filter((o: Order) => selectedIds.has(o.id));
    });

    // Clear selection when page/filter changes
    createEffect(() => {
        page();
        statusFilter();
        paymentFilter();
        territoryFilter();
        salesRepFilter();
        startDate();
        endDate();
        search();
        setSelectedOrderIds(new Set<string>());
    });

    const statusOptions = [
        { value: '', label: t('adminPages.orders.allStatus') },
        { value: 'pending', label: t('adminPages.orders.pending') },
        { value: 'confirmed', label: t('adminPages.orders.confirmed') },
        { value: 'approved', label: t('adminPages.orders.approved') },
        { value: 'picking', label: t('adminPages.orders.picking') },
        { value: 'picked', label: t('adminPages.orders.picked') },
        { value: 'loaded', label: t('adminPages.orders.loaded') },
        { value: 'delivering', label: t('adminPages.orders.delivering') },
        { value: 'delivered', label: t('adminPages.orders.delivered') },
        { value: 'cancelled', label: t('adminPages.orders.cancelled') },
    ];

    const paymentOptions = [
        { value: '', label: t('adminPages.orders.allPayment') },
        { value: 'unpaid', label: t('adminPages.orders.unpaid') },
        { value: 'partial', label: t('adminPages.orders.partial') },
        { value: 'paid', label: t('adminPages.orders.paidStatus') },
    ];

    const translateOrderStatus = (status: string) => t(`adminPages.orders.${status}`);
    const translatePaymentStatus = (status: string) =>
        t(`adminPages.orders.${status === 'paid' ? 'paidStatus' : status}`);

    // Status configs now come from shared/order/constants.ts

    // Selection handlers
    const toggleOrderSelection = (orderId: string) => {
        setSelectedOrderIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(orderId)) {
                newSet.delete(orderId);
            } else {
                newSet.add(orderId);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        const currentOrders = orderList();
        const selected = selectedOrderIds();

        if (selected.size === currentOrders.length) {
            // Deselect all
            setSelectedOrderIds(new Set<string>());
        } else {
            // Select all
            setSelectedOrderIds(new Set<string>(currentOrders.map((o: Order) => o.id)));
        }
    };

    const clearSelection = () => {
        setSelectedOrderIds(new Set<string>());
    };

    // Check if all are selected, some are selected, or none
    const selectionState = createMemo(() => {
        const selected = selectedOrderIds().size;
        const total = orderList().length;
        if (selected === 0) return 'none';
        if (selected === total) return 'all';
        return 'some';
    });

    // Batch action handlers
    const handleBatchStatusChange = async (status: string, notes?: string, driverId?: string) => {
        const orderIds = Array.from(selectedOrderIds());
        if (orderIds.length === 0) return;

        // Check for unpaid orders and show warning
        const unpaidCount = selectedOrders().filter((o: Order) => o.paymentStatus !== 'paid').length;
        if (unpaidCount > 0 && ['loaded', 'delivering', 'delivered'].includes(status)) {
            toast.warning(t('adminPages.orders.batchUnpaidWarning', { unpaid: unpaidCount, total: orderIds.length }));
        }

        setIsLoading(true);
        try {
            // If driver is provided, first assign driver then change status
            if (driverId) {
                await api.post<{ data: BatchResponse }>('/batch-orders/assign-driver',
                    { orderIds, driverId }
                );
            }

            const result = await api.post<{ data: BatchResponse }>('/batch-orders/status',
                { orderIds, newStatus: status, notes }
            );

            const data = (result as any)?.data || result;
            const driverName = driverId
                ? drivers()?.find((d: Driver) => d.id === driverId)?.name
                : null;

            // Show toast notification
            if (data.failed > 0) {
                toast.warning(t('adminPages.orders.batchUpdatedPartial', { ok: data.succeeded, fail: data.failed }));
            } else {
                const message = driverName
                    ? t('adminPages.orders.batchUpdatedWithDriver', { ok: data.succeeded, status, driver: driverName })
                    : t('adminPages.orders.batchUpdatedToStatus', { ok: data.succeeded, status });
                toast.success(message);
            }

            // Refresh orders list
            await refetch();
            clearSelection();
        } catch (error: any) {
            console.error('Batch status change failed:', error);
            toast.error(error.message || t('adminPages.orders.updateFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleBatchCancel = async (reason?: string) => {
        const orderIds = Array.from(selectedOrderIds());
        if (orderIds.length === 0) return;

        setIsLoading(true);
        try {
            const result = await api.post<{ data: BatchResponse }>('/batch-orders/cancel',
                { orderIds, reason }
            );

            const data = (result as any)?.data || result;

            // Show toast notification
            if (data.failed > 0) {
                toast.warning(t('adminPages.orders.batchCancelledPartial', { ok: data.succeeded, fail: data.failed }));
            } else {
                toast.success(t('adminPages.orders.batchCancelledAll', { ok: data.succeeded }));
            }

            await refetch();
            clearSelection();
        } catch (error: any) {
            console.error('Batch cancel failed:', error);
            toast.error(error.message || t('adminPages.orders.cancelFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white">{t('adminPages.orders.title')}</h1>
                    <p class="text-slate-400">{t('adminPages.orders.subtitle')}</p>
                </div>
            </div>

            {/* Filters - All in one row */}
            <div class="flex flex-wrap items-center gap-3 mb-4">
                {/* Search */}
                <div class="relative flex-1 min-w-[200px]">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder={t('adminPages.orders.searchPlaceholder') as string}
                        value={search()}
                        onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
                        class="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>

                {/* Date Range */}
                <input
                    type="date"
                    value={startDate()}
                    onInput={(e) => { setStartDate(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <span class="text-slate-500 text-sm">{t('adminPages.orders.dateTo')}</span>
                <input
                    type="date"
                    value={endDate()}
                    onInput={(e) => { setEndDate(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />

                {/* Territory Filter */}
                <select
                    value={territoryFilter()}
                    onChange={(e) => { setTerritoryFilter(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                    <option value="">{t('adminPages.orders.allTerritories')}</option>
                    <For each={territories() || []}>
                        {(territory) => <option value={territory.id}>{territory.name}</option>}
                    </For>
                </select>

                {/* Sales Rep Filter */}
                <select
                    value={salesRepFilter()}
                    onChange={(e) => { setSalesRepFilter(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                    <option value="">{t('adminPages.orders.allSalesReps')}</option>
                    <For each={salesReps() || []}>
                        {(rep) => <option value={rep.id}>{rep.name}</option>}
                    </For>
                </select>

                {/* Status Filter */}
                <select
                    value={statusFilter()}
                    onChange={(e) => { setStatusFilter(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                    <For each={statusOptions}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                    </For>
                </select>

                {/* Payment Filter */}
                <select
                    value={paymentFilter()}
                    onChange={(e) => { setPaymentFilter(e.currentTarget.value); setPage(1); }}
                    class="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                    <For each={paymentOptions}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                    </For>
                </select>

                {/* Clear Filters Button */}
                <Show when={startDate() || endDate() || territoryFilter() || salesRepFilter() || paymentFilter() || statusFilter()}>
                    <button
                        onClick={() => {
                            setStartDate('');
                            setEndDate('');
                            setTerritoryFilter('');
                            setSalesRepFilter('');
                            setPaymentFilter('');
                            setStatusFilter('');
                            setPage(1);
                        }}
                        class="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors whitespace-nowrap"
                    >
                        {t('adminPages.orders.clear')}
                    </button>
                </Show>
            </div>

            {/* Batch Actions Bar - Inline between filters and table */}
            <Show when={selectedOrderIds().size > 0}>
                <BatchOrderToolbar
                    selectedCount={selectedOrderIds().size}
                    selectedOrders={selectedOrders()}
                    onClearSelection={clearSelection}
                    onBatchStatusChange={handleBatchStatusChange}
                    onBatchCancel={handleBatchCancel}
                    drivers={drivers() || []}
                    isLoading={isLoading()}
                />
            </Show>

            {/* Loading */}
            <Show when={orders.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            {/* Table */}
            <Show when={!orders.loading && orderList().length > 0}>
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                    {/* Desktop Table */}
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-slate-800/50">
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4 w-12">
                                        <button
                                            onClick={toggleSelectAll}
                                            class="p-1 hover:bg-slate-800 rounded transition-colors"
                                            title={selectionState() === 'all' ? t('adminPages.orders.deselectAll') : t('adminPages.orders.selectAll')}
                                        >
                                            <Show when={selectionState() === 'none'}>
                                                <Square class="w-5 h-5 text-slate-500" />
                                            </Show>
                                            <Show when={selectionState() === 'some'}>
                                                <MinusSquare class="w-5 h-5 text-blue-400" />
                                            </Show>
                                            <Show when={selectionState() === 'all'}>
                                                <CheckSquare class="w-5 h-5 text-blue-400" />
                                            </Show>
                                        </button>
                                    </th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.date')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.order')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.customer')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.status')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.payment')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.amount')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.driver')}</th>
                                    <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">{t('adminPages.orders.salesRep')}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50">
                                <For each={orderList()}>
                                    {(order: Order) => {
                                        const statusConfig = getOrderStatusConfig(order.status);
                                        const paymentConfig = getPaymentStatusConfig(order.paymentStatus);
                                        const StatusIcon = statusIcons[statusConfig.icon as keyof typeof statusIcons] || Clock;
                                        const PaymentIcon = statusIcons[paymentConfig.icon as keyof typeof statusIcons] || Clock;
                                        // Use inline check for reactivity - don't store in const
                                        return (
                                            <tr
                                                onClick={(e) => {
                                                    // Don't navigate if clicking the checkbox
                                                    if ((e.target as HTMLElement).closest('button')) return;
                                                    navigate(`/admin/orders/${order.id}`);
                                                }}
                                                class={`transition-colors cursor-pointer ${selectedOrderIds().has(order.id)
                                                    ? 'bg-blue-500/10'
                                                    : 'hover:bg-slate-800/30'
                                                    }`}
                                            >
                                                <td class="px-4 py-4">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleOrderSelection(order.id);
                                                        }}
                                                        class="p-1 hover:bg-slate-800 rounded transition-colors"
                                                    >
                                                        <Show when={selectedOrderIds().has(order.id)} fallback={
                                                            <Square class="w-5 h-5 text-slate-500" />
                                                        }>
                                                            <CheckSquare class="w-5 h-5 text-blue-400" />
                                                        </Show>
                                                    </button>
                                                </td>
                                                <td class="px-4 py-4 text-slate-400 text-sm">
                                                    {formatDateTime(order.createdAt)}
                                                </td>
                                                <td class="px-4 py-4">
                                                    <span class="text-white font-medium">{order.orderNumber}</span>
                                                </td>
                                                <td class="px-4 py-4">
                                                    <div>
                                                        <span class="text-white">{order.customer?.name || t('adminPages.orders.na')}</span>
                                                        <Show when={order.customer?.code}>
                                                            <span class="text-slate-500 text-xs ml-2">{order.customer?.code}</span>
                                                        </Show>
                                                    </div>
                                                </td>
                                                <td class="px-4 py-4">
                                                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                        <Dynamic component={StatusIcon} class="w-3.5 h-3.5" />
                                                        {translateOrderStatus(order.status)}
                                                    </span>
                                                </td>
                                                <td class="px-4 py-4">
                                                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${paymentConfig.bg} ${paymentConfig.text}`}>
                                                        <Dynamic component={PaymentIcon} class="w-3.5 h-3.5" />
                                                        {translatePaymentStatus(order.paymentStatus)}
                                                    </span>
                                                </td>
                                                <td class="px-4 py-4">
                                                    <div class="text-white font-medium">${parseFloat(order.totalAmount).toFixed(2)}</div>
                                                    <div class="text-xs text-slate-500">{t('adminPages.orders.paid')}: ${parseFloat(order.paidAmount).toFixed(2)}</div>
                                                </td>
                                                <td class="px-4 py-4 text-slate-400">
                                                    {order.driver?.name || '-'}
                                                </td>
                                                <td class="px-4 py-4 text-slate-400">
                                                    <div class="flex items-center gap-1.5">
                                                        {order.salesRep?.name || '-'}
                                                        <Show when={order.isPortalOrder}>
                                                            <span title={t('adminPages.orders.portalOrderTitle')} class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px] font-medium">
                                                                <Globe class="w-3 h-3" />
                                                                {t('adminPages.orders.portal')}
                                                            </span>
                                                        </Show>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card List */}
                    <div class="lg:hidden divide-y divide-slate-800/50">
                        <For each={orderList()}>
                            {(order: Order) => {
                                const statusConfig = getOrderStatusConfig(order.status);
                                const paymentConfig = getPaymentStatusConfig(order.paymentStatus);
                                const StatusIcon = statusIcons[statusConfig.icon as keyof typeof statusIcons] || Clock;
                                const PaymentIcon = statusIcons[paymentConfig.icon as keyof typeof statusIcons] || Clock;
                                // Use inline check for reactivity - don't store in const
                                return (
                                    <div
                                        class={`p-4 transition-colors cursor-pointer ${selectedOrderIds().has(order.id)
                                            ? 'bg-blue-500/10'
                                            : 'hover:bg-slate-800/30'
                                            }`}
                                        onClick={(e) => {
                                            // Don't navigate if clicking the checkbox
                                            if ((e.target as HTMLElement).closest('button')) return;
                                            navigate(`/admin/orders/${order.id}`);
                                        }}
                                    >
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-3">
                                                <button
                                                    onClick={() => toggleOrderSelection(order.id)}
                                                    class="p-1"
                                                >
                                                    <Show when={selectedOrderIds().has(order.id)} fallback={
                                                        <Square class="w-5 h-5 text-slate-500" />
                                                    }>
                                                        <CheckSquare class="w-5 h-5 text-blue-400" />
                                                    </Show>
                                                </button>
                                                <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                    <Package class="w-5 h-5 text-blue-400" />
                                                </div>
                                                <div>
                                                    <div class="text-white font-medium">{order.orderNumber}</div>
                                                    <div class="text-slate-400 text-xs">{formatDateTime(order.createdAt)}</div>
                                                </div>
                                            </div>
                                            <div class="flex flex-col gap-1 items-end">
                                                <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                    <Dynamic component={StatusIcon} class="w-3.5 h-3.5" />
                                                    {translateOrderStatus(order.status)}
                                                </span>
                                                <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${paymentConfig.bg} ${paymentConfig.text}`}>
                                                    <Dynamic component={PaymentIcon} class="w-3.5 h-3.5" />
                                                    {translatePaymentStatus(order.paymentStatus)}
                                                </span>
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <div class="text-sm text-white mb-0.5">{order.customer?.name || t('adminPages.orders.na')}</div>
                                            <Show when={order.customer?.code}>
                                                <div class="text-xs text-slate-500">{order.customer?.code}</div>
                                            </Show>
                                        </div>

                                        <div class="flex items-center justify-between pt-3 border-t border-slate-800/50">
                                            <div>
                                                <div class="text-xs text-slate-500">{t('adminPages.orders.totalAmount')}</div>
                                                <div class="text-white font-medium">${parseFloat(order.totalAmount).toFixed(2)}</div>
                                            </div>
                                            <Show when={order.driver}>
                                                <div class="text-center">
                                                    <div class="text-xs text-slate-500">{t('adminPages.orders.driver')}</div>
                                                    <div class="text-slate-300 text-sm">{order.driver?.name}</div>
                                                </div>
                                            </Show>
                                            <div class="text-right">
                                                <div class="text-xs text-slate-500">{t('adminPages.orders.salesRep')}</div>
                                                <div class="text-slate-300 text-sm flex items-center justify-end gap-1.5">
                                                    {order.salesRep?.name || '-'}
                                                    <Show when={order.isPortalOrder}>
                                                        <span title={t('adminPages.orders.portalOrderTitle')} class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px] font-medium">
                                                            <Globe class="w-3 h-3" />
                                                        </span>
                                                    </Show>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

                    {/* Pagination */}
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800/50">
                        <span class="text-slate-400 text-sm">
                            {t('adminPages.orders.showingRange', {
                                from: (page() - 1) * limit + 1,
                                to: Math.min(page() * limit, total()),
                                total: total(),
                            })}
                        </span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white text-sm px-3">
                                {t('adminPages.orders.pageOf', { page: page(), total: totalPages() })}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages(), p + 1))}
                                disabled={page() >= totalPages()}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={!orders.loading && orderList().length === 0}>
                <div class="text-center py-20">
                    <Package class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-white mb-2">{t('adminPages.orders.noOrdersFound')}</h3>
                    <p class="text-slate-400">{t('adminPages.orders.ordersAppearHint')}</p>
                </div>
            </Show>
        </div>
    );
};

export default Orders;
