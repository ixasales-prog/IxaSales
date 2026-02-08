/**
 * Admin Order Detail Page
 * 
 * Full order view with:
 * - Order header (status, payment, amounts)
 * - Order items
 * - Status history timeline
 * - Edit mode toggle
 */

import { type Component, Show, For, createSignal, createResource, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useParams, A } from '@solidjs/router';
import * as LucideIcons from 'lucide-solid';
import {
    ArrowLeft,
    Package,
    Loader2,
    User,
    Clock,
    DollarSign,
    Edit3,
    Save,
    X,
    MapPin,
    Phone,
    FileText
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDateTime } from '../../stores/settings';
import toast from '../../components/Toast';
import { getOrderStatusConfig, getPaymentStatusConfig } from '../../components/shared/order';

interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unitPrice: string;
    qtyOrdered: number;
    qtyDelivered: number;
    lineTotal: string;
}

interface StatusHistoryEntry {
    id: string;
    status: string;
    notes?: string;
    changedBy?: string;
    createdAt: string;
}

interface OrderDetailData {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    subtotalAmount: string;
    discountAmount: string;
    paidAmount: string;
    createdAt: string;
    requestedDeliveryDate?: string;
    deliveredAt?: string;
    cancelledAt?: string;
    notes?: string;
    customer: {
        id: string;
        name: string;
        code?: string;
        phone?: string;
        address?: string;
    } | null;
    salesRep: {
        id: string;
        name: string;
    } | null;
    driver: {
        id: string;
        name: string;
    } | null;
    items: OrderItem[];
    statusHistory: StatusHistoryEntry[];
}

// Status configs now come from shared/order/constants.ts

const AdminOrderDetail: Component = () => {
    const params = useParams<{ id: string }>();
    const [isEditMode, setIsEditMode] = createSignal(false);
    const [isSaving, setIsSaving] = createSignal(false);

    // Edit state
    const [editedNotes, setEditedNotes] = createSignal('');
    const [editedDeliveryDate, setEditedDeliveryDate] = createSignal<string | null>(null);
    const [editedItems, setEditedItems] = createSignal<Map<string, number>>(new Map());
    const [removedItems, setRemovedItems] = createSignal<Set<string>>(new Set());

    const fetchOrder = async (id: string): Promise<OrderDetailData | null> => {
        if (!id) return null;
        try {
            const res = await api.get(`/orders/${id}/detail`);
            return res || null;
        } catch (e) {
            console.error('Failed to fetch order:', e);
            return null;
        }
    };

    const [order, { refetch }] = createResource(() => params.id, fetchOrder);

    // Check if order can be edited (only pending/confirmed/approved)
    const canEdit = createMemo(() => {
        const status = order()?.status;
        return status && ['pending', 'confirmed', 'approved'].includes(status);
    });

    const statusConfig = createMemo(() => order() ? getOrderStatusConfig(order()!.status) : null);
    const paymentConfig = createMemo(() => order() ? getPaymentStatusConfig(order()!.paymentStatus) : null);
    const StatusIcon = createMemo(() => statusConfig()?.icon ? LucideIcons[statusConfig()!.icon as keyof typeof LucideIcons] as any : Clock);
    const PaymentIcon = createMemo(() => paymentConfig()?.icon ? LucideIcons[paymentConfig()!.icon as keyof typeof LucideIcons] as any : DollarSign);

    // Enter edit mode - initialize edit state from current order
    const enterEditMode = () => {
        const o = order();
        if (!o) return;
        setEditedNotes(o.notes || '');
        setEditedDeliveryDate(o.requestedDeliveryDate || null);
        setEditedItems(new Map<string, number>());
        setRemovedItems(new Set<string>());
        setIsEditMode(true);
    };

    // Cancel edit mode
    const cancelEdit = () => {
        setIsEditMode(false);
        setEditedItems(new Map<string, number>());
        setRemovedItems(new Set<string>());
    };

    // Get edited quantity for an item
    const getItemQty = (item: OrderItem): number => {
        if (removedItems().has(item.id)) return 0;
        return editedItems().get(item.id) ?? item.qtyOrdered;
    };

    // Update item quantity
    const updateItemQty = (itemId: string, qty: number) => {
        const newMap = new Map(editedItems());
        newMap.set(itemId, Math.max(1, qty));
        setEditedItems(newMap);
        // Remove from removed set if it was there
        const newRemoved = new Set(removedItems());
        newRemoved.delete(itemId);
        setRemovedItems(newRemoved);
    };

    // Remove item
    const removeItem = (itemId: string) => {
        const newRemoved = new Set(removedItems());
        newRemoved.add(itemId);
        setRemovedItems(newRemoved);
    };

    // Calculate edited totals
    const editedTotals = createMemo(() => {
        const o = order();
        if (!o || !isEditMode()) return { subtotal: 0, total: 0 };

        let subtotal = 0;
        for (const item of o.items) {
            if (!removedItems().has(item.id)) {
                const qty = editedItems().get(item.id) ?? item.qtyOrdered;
                subtotal += parseFloat(item.unitPrice) * qty;
            }
        }
        const discount = parseFloat(o.discountAmount || '0');
        return { subtotal, total: subtotal - discount };
    });

    // Save changes
    const saveChanges = async () => {
        const o = order();
        if (!o) return;

        setIsSaving(true);
        try {
            // Build items array with changes
            const changedItems: { id: string; qtyOrdered: number }[] = [];
            for (const item of o.items) {
                const newQty = removedItems().has(item.id) ? 0 : (editedItems().get(item.id) ?? item.qtyOrdered);
                // Only include if changed
                if (newQty !== item.qtyOrdered || removedItems().has(item.id)) {
                    changedItems.push({ id: item.id, qtyOrdered: newQty });
                }
            }

            await api.patch(`/orders/${o.id}/edit`, {
                notes: editedNotes(),
                requestedDeliveryDate: editedDeliveryDate(),
                items: changedItems.length > 0 ? changedItems : undefined,
            });

            toast.success('Order updated successfully');
            setIsEditMode(false);
            refetch();
        } catch (e: any) {
            toast.error(e.message || 'Failed to update order');
        } finally {
            setIsSaving(false);
        }
    };

    const formatCurrency = (amount: string | number) => {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        return `$${num.toFixed(2)}`;
    };

    return (
        <div class="min-h-screen">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center justify-between px-6 py-4">
                    <div class="flex items-center gap-4">
                        <A href="/admin/orders" class="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                            <ArrowLeft class="w-5 h-5" />
                        </A>
                        <div>
                            <h1 class="text-xl font-bold text-white">
                                {order()?.orderNumber || 'Order Details'}
                            </h1>
                            <p class="text-slate-500 text-sm">
                                {order()?.createdAt ? formatDateTime(order()!.createdAt) : 'Loading...'}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <Show when={!isEditMode() && canEdit()}>
                            <button
                                onClick={enterEditMode}
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Edit3 class="w-4 h-4" />
                                Edit Order
                            </button>
                        </Show>
                        <Show when={!isEditMode() && !canEdit() && order()}>
                            <span class="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-sm">
                                Cannot edit {order()?.status} orders
                            </span>
                        </Show>
                        <Show when={isEditMode()}>
                            <button
                                onClick={cancelEdit}
                                disabled={isSaving()}
                                class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <X class="w-4 h-4" />
                                Cancel
                            </button>
                            <button
                                onClick={saveChanges}
                                disabled={isSaving()}
                                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <Show when={isSaving()} fallback={<Save class="w-4 h-4" />}>
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                </Show>
                                {isSaving() ? 'Saving...' : 'Save Changes'}
                            </button>
                        </Show>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div class="p-6">
                <Show when={order.loading}>
                    <div class="flex items-center justify-center py-20">
                        <Loader2 class="w-8 h-8 animate-spin text-blue-400" />
                    </div>
                </Show>

                <Show when={!order.loading && !order()}>
                    <div class="text-center py-20">
                        <Package class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-xl font-semibold text-white mb-2">Order not found</h3>
                        <p class="text-slate-400 mb-4">The order you're looking for doesn't exist or you don't have access.</p>
                        <A href="/admin/orders" class="text-blue-400 hover:text-blue-300">
                            ← Back to Orders
                        </A>
                    </div>
                </Show>

                <Show when={!order.loading && order()}>
                    {(detail) => (
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Main Content - Left 2 columns */}
                            <div class="lg:col-span-2 space-y-6">
                                {/* Status Cards */}
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <div class="text-xs text-slate-500 uppercase mb-1">Status</div>
                                        <div class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${statusConfig()?.bg} ${statusConfig()?.text}`}>
                                            <Dynamic component={StatusIcon()} class="w-4 h-4" />
                                            {detail().status}
                                        </div>
                                    </div>
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <div class="text-xs text-slate-500 uppercase mb-1">Payment</div>
                                        <div class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${paymentConfig()?.bg} ${paymentConfig()?.text}`}>
                                            <Dynamic component={PaymentIcon()} class="w-4 h-4" />
                                            {paymentConfig()?.label}
                                        </div>
                                    </div>
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <div class="text-xs text-slate-500 uppercase mb-1">Total</div>
                                        <div class="text-xl font-bold text-white">
                                            {formatCurrency(detail().totalAmount)}
                                        </div>
                                    </div>
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <div class="text-xs text-slate-500 uppercase mb-1">Paid</div>
                                        <div class="text-xl font-bold text-emerald-400">
                                            {formatCurrency(detail().paidAmount)}
                                        </div>
                                    </div>
                                </div>

                                {/* Order Items */}
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
                                    <div class="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
                                        <h3 class="font-semibold text-white flex items-center gap-2">
                                            <Package class="w-4 h-4 text-slate-400" />
                                            Order Items
                                        </h3>
                                        <span class="text-sm text-slate-500">
                                            {isEditMode()
                                                ? `${detail().items.filter(i => !removedItems().has(i.id)).length} items`
                                                : `${detail().items?.length || 0} items`
                                            }
                                        </span>
                                    </div>
                                    <div class="divide-y divide-slate-800/50">
                                        <Show when={detail().items?.length > 0} fallback={
                                            <div class="p-6 text-center text-slate-400">No items</div>
                                        }>
                                            <For each={detail().items}>
                                                {(item) => {
                                                    const isRemoved = () => removedItems().has(item.id);
                                                    const currentQty = () => getItemQty(item);
                                                    const lineTotal = () => parseFloat(item.unitPrice) * currentQty();

                                                    return (
                                                        <div class={`p-4 flex items-center gap-4 transition-all ${isRemoved() ? 'opacity-40 bg-red-900/10' : ''}`}>
                                                            <div class="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                                                                <Package class="w-6 h-6 text-slate-500" />
                                                            </div>
                                                            <div class="flex-1 min-w-0">
                                                                <div class={`text-white font-medium truncate ${isRemoved() ? 'line-through' : ''}`}>
                                                                    {item.productName}
                                                                </div>
                                                                <div class="text-slate-500 text-sm">{item.sku}</div>
                                                            </div>

                                                            {/* Edit Mode Controls */}
                                                            <Show when={isEditMode() && !isRemoved()}>
                                                                <div class="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => updateItemQty(item.id, currentQty() - 1)}
                                                                        disabled={currentQty() <= 1}
                                                                        class="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={currentQty()}
                                                                        onInput={(e) => updateItemQty(item.id, parseInt(e.currentTarget.value) || 1)}
                                                                        class="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-center text-sm"
                                                                    />
                                                                    <button
                                                                        onClick={() => updateItemQty(item.id, currentQty() + 1)}
                                                                        class="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center"
                                                                    >
                                                                        +
                                                                    </button>
                                                                    <button
                                                                        onClick={() => removeItem(item.id)}
                                                                        class="w-8 h-8 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 flex items-center justify-center ml-2"
                                                                        title="Remove item"
                                                                    >
                                                                        <X class="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </Show>

                                                            {/* Restore button for removed items */}
                                                            <Show when={isEditMode() && isRemoved()}>
                                                                <button
                                                                    onClick={() => updateItemQty(item.id, item.qtyOrdered)}
                                                                    class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
                                                                >
                                                                    Restore
                                                                </button>
                                                            </Show>

                                                            <div class="text-right min-w-[100px]">
                                                                <div class="text-slate-400 text-sm">
                                                                    {isEditMode() ? currentQty() : item.qtyOrdered} × {formatCurrency(item.unitPrice)}
                                                                </div>
                                                                <div class="text-white font-medium">
                                                                    {formatCurrency(isEditMode() ? lineTotal() : item.lineTotal)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            </For>
                                        </Show>
                                    </div>
                                    {/* Totals */}
                                    <div class="border-t border-slate-800/50 p-4 space-y-2">
                                        <div class="flex justify-between text-sm">
                                            <span class="text-slate-400">Subtotal</span>
                                            <span class="text-white">
                                                {formatCurrency(isEditMode() ? editedTotals().subtotal : (detail().subtotalAmount || detail().totalAmount))}
                                            </span>
                                        </div>
                                        <Show when={parseFloat(detail().discountAmount || '0') > 0}>
                                            <div class="flex justify-between text-sm">
                                                <span class="text-slate-400">Discount</span>
                                                <span class="text-red-400">-{formatCurrency(detail().discountAmount)}</span>
                                            </div>
                                        </Show>
                                        <div class="flex justify-between text-lg font-bold pt-2 border-t border-slate-800/50">
                                            <span class="text-white">Total</span>
                                            <span class={isEditMode() ? 'text-blue-400' : 'text-white'}>
                                                {formatCurrency(isEditMode() ? editedTotals().total : detail().totalAmount)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <Show when={detail().notes || isEditMode()}>
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <h3 class="font-semibold text-white flex items-center gap-2 mb-2">
                                            <FileText class="w-4 h-4 text-slate-400" />
                                            Notes
                                        </h3>
                                        <Show when={isEditMode()} fallback={
                                            <p class="text-slate-400">{detail().notes}</p>
                                        }>
                                            <textarea
                                                value={editedNotes()}
                                                onInput={(e) => setEditedNotes(e.currentTarget.value)}
                                                placeholder="Add notes..."
                                                rows={3}
                                                class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </Show>
                                    </div>
                                </Show>
                            </div>

                            {/* Sidebar - Right column */}
                            <div class="space-y-6">
                                {/* Customer Info */}
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                    <h3 class="font-semibold text-white flex items-center gap-2 mb-4">
                                        <User class="w-4 h-4 text-slate-400" />
                                        Customer
                                    </h3>
                                    <Show when={detail().customer} fallback={
                                        <p class="text-slate-400">No customer info</p>
                                    }>
                                        <div class="space-y-3">
                                            <div>
                                                <div class="text-white font-medium">{detail().customer!.name}</div>
                                                <Show when={detail().customer!.code}>
                                                    <div class="text-slate-500 text-sm">{detail().customer!.code}</div>
                                                </Show>
                                            </div>
                                            <Show when={detail().customer!.phone}>
                                                <div class="flex items-center gap-2 text-slate-400">
                                                    <Phone class="w-4 h-4" />
                                                    <span>{detail().customer!.phone}</span>
                                                </div>
                                            </Show>
                                            <Show when={detail().customer!.address}>
                                                <div class="flex items-start gap-2 text-slate-400">
                                                    <MapPin class="w-4 h-4 shrink-0 mt-0.5" />
                                                    <span>{detail().customer!.address}</span>
                                                </div>
                                            </Show>
                                        </div>
                                    </Show>
                                </div>

                                {/* Sales Rep & Driver */}
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 space-y-4">
                                    <div>
                                        <div class="text-xs text-slate-500 uppercase mb-1">Sales Rep</div>
                                        <div class="text-white">{detail().salesRep?.name || '-'}</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-slate-500 uppercase mb-1">Driver</div>
                                        <div class="text-white">{detail().driver?.name || 'Not assigned'}</div>
                                    </div>
                                </div>

                                {/* Delivery Date */}
                                <Show when={detail().requestedDeliveryDate || isEditMode()}>
                                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                        <div class="text-xs text-slate-500 uppercase mb-2">Requested Delivery Date</div>
                                        <Show when={isEditMode()} fallback={
                                            <div class="text-white">{detail().requestedDeliveryDate || 'Not set'}</div>
                                        }>
                                            <input
                                                type="date"
                                                value={editedDeliveryDate() || ''}
                                                onInput={(e) => setEditedDeliveryDate(e.currentTarget.value || null)}
                                                class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </Show>
                                    </div>
                                </Show>

                                {/* Status History */}
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                                    <h3 class="font-semibold text-white flex items-center gap-2 mb-4">
                                        <Clock class="w-4 h-4 text-slate-400" />
                                        Status History
                                    </h3>
                                    <Show when={detail().statusHistory?.length > 0} fallback={
                                        <p class="text-slate-400 text-sm">No history</p>
                                    }>
                                        <div class="relative">
                                            {/* Timeline line */}
                                            <div class="absolute left-2 top-3 bottom-3 w-px bg-slate-700" />
                                            <div class="space-y-4">
                                                <For each={detail().statusHistory}>
                                                    {(entry) => {
                                                        const config = getOrderStatusConfig(entry.status);
                                                        return (
                                                            <div class="relative flex gap-4 pl-6">
                                                                <div class={`absolute left-0 w-4 h-4 rounded-full ${config.bg} flex items-center justify-center`}>
                                                                    <div class={`w-2 h-2 rounded-full ${config.text.replace('text-', 'bg-')}`} />
                                                                </div>
                                                                <div class="flex-1 min-w-0">
                                                                    <div class={`text-sm font-medium ${config.text}`}>
                                                                        {entry.status}
                                                                    </div>
                                                                    <div class="text-xs text-slate-500">
                                                                        {formatDateTime(entry.createdAt)}
                                                                    </div>
                                                                    <Show when={entry.notes}>
                                                                        <div class="text-xs text-slate-400 mt-1">{entry.notes}</div>
                                                                    </Show>
                                                                </div>
                                                            </div>
                                                        );
                                                    }}
                                                </For>
                                            </div>
                                        </div>
                                    </Show>
                                </div>

                                {/* Timestamps */}
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 space-y-3">
                                    <div>
                                        <div class="text-xs text-slate-500 uppercase mb-1">Created</div>
                                        <div class="text-slate-300 text-sm">{formatDateTime(detail().createdAt)}</div>
                                    </div>
                                    <Show when={detail().requestedDeliveryDate}>
                                        <div>
                                            <div class="text-xs text-slate-500 uppercase mb-1">Requested Delivery</div>
                                            <div class="text-slate-300 text-sm">{detail().requestedDeliveryDate}</div>
                                        </div>
                                    </Show>
                                    <Show when={detail().deliveredAt}>
                                        <div>
                                            <div class="text-xs text-slate-500 uppercase mb-1">Delivered</div>
                                            <div class="text-emerald-400 text-sm">{formatDateTime(detail().deliveredAt!)}</div>
                                        </div>
                                    </Show>
                                    <Show when={detail().cancelledAt}>
                                        <div>
                                            <div class="text-xs text-slate-500 uppercase mb-1">Cancelled</div>
                                            <div class="text-red-400 text-sm">{formatDateTime(detail().cancelledAt!)}</div>
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
};

export default AdminOrderDetail;
