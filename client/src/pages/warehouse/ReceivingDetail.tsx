import { type Component, Show, For, createResource, createSignal } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ArrowLeft, Package, Truck, Calendar, Loader2, CheckCircle2, ScanLine, AlertTriangle, Plus, Trash2, Minus } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';
import BarcodeScanner from '../../components/BarcodeScanner';
import AddProductToPoModal from './AddProductToPoModal';

interface ReceivingItem {
    id: string;
    productName: string;
    qtyOrdered: number;
    qtyReceived: number;
}

interface ReceivingDetailData {
    id: string;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
    notes: string | null;
    items: ReceivingItem[];
}

const ReceivingDetail: Component = () => {
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();

    const [showScanner, setShowScanner] = createSignal(false);
    const [scanning, setScanning] = createSignal(false);
    const [showAddProduct, setShowAddProduct] = createSignal(false);

    const [shipment, { refetch }] = createResource(() => params.id, async (id) => {
        const result = await api<ReceivingDetailData>(`/warehouse/receiving/${id}`);
        return (result as any)?.data ?? result;
    });

    const handleBarcodeScanned = async (barcode: string) => {
        setScanning(true);

        try {
            const result = await api(`/warehouse/receiving/${params.id}/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode, quantity: 1 })
            });

            const data = (result as any)?.data;

            if (data) {
                // Show success toast
                showToast(`✅ ${data.productName}: ${data.qtyReceived}/${data.qtyOrdered}`, 'success');

                // Ref etch data
                await refetch();

                // Show warning if over-received
                if (data.isOverReceived) {
                    showToast(`⚠️ Over-received! Expected: ${data.qtyOrdered}`, 'warning');
                }
            }
        } catch (error: any) {
            const errorCode = error?.error?.code;

            if (errorCode === 'PRODUCT_NOT_FOUND') {
                showToast('❌ Product not found', 'error');
            } else if (errorCode === 'ITEM_NOT_IN_PO') {
                showToast('❌ Product not in this PO', 'error');
            } else {
                showToast('❌ Scan failed', 'error');
            }
        } finally {
            setScanning(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Check if PO is ready for receiving (only 'ordered' or 'partial_received')
    const canReceive = () => {
        const status = shipment()?.status;
        return status === 'ordered' || status === 'partial_received';
    };

    // Check if PO can be edited (only 'draft')
    const canEdit = () => {
        return shipment()?.status === 'draft';
    };

    // Check if can add products (draft for editing, or approved for adjustments)
    const canAddProducts = () => {
        const status = shipment()?.status;
        return status === 'draft' || status === 'ordered' || status === 'partial_received';
    };

    const [deletingItem, setDeletingItem] = createSignal<string | null>(null);

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm(t('warehouseApp.receiving.confirmDeleteItem') as string)) return;

        setDeletingItem(itemId);
        try {
            await api(`/warehouse/receiving/${params.id}/items/${itemId}`, {
                method: 'DELETE'
            });
            showToast(t('warehouseApp.receiving.itemDeleted'), 'success');
            refetch();
        } catch (error: any) {
            const errorCode = error?.error?.code;
            if (errorCode === 'PO_NOT_EDITABLE') {
                showToast(t('warehouseApp.receiving.cannotDeleteApproved'), 'error');
            } else {
                showToast(t('warehouseApp.receiving.deleteFailed'), 'error');
            }
        } finally {
            setDeletingItem(null);
        }
    };

    const [updatingItem, setUpdatingItem] = createSignal<string | null>(null);

    const handleUpdateQuantity = async (itemId: string, currentQty: number, delta: number) => {
        const newQty = currentQty + delta;
        if (newQty < 1) return; // Minimum quantity is 1

        setUpdatingItem(itemId);
        try {
            await api(`/warehouse/receiving/${params.id}/items/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: newQty })
            });
            refetch();
        } catch (error: any) {
            const errorCode = error?.error?.code;
            if (errorCode === 'PO_NOT_EDITABLE') {
                showToast(t('warehouseApp.receiving.cannotEditApproved'), 'error');
            } else {
                showToast(t('warehouseApp.receiving.updateFailed'), 'error');
            }
        } finally {
            setUpdatingItem(null);
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            'draft': t('warehouseApp.receiving.statusDraft'),
            'pending': t('warehouseApp.receiving.statusPending'),
            'ordered': t('warehouseApp.receiving.statusOrdered'),
            'partial_received': t('warehouseApp.receiving.statusPartial'),
            'received': t('warehouseApp.receiving.statusReceived'),
            'cancelled': t('warehouseApp.receiving.statusCancelled')
        };
        return labels[status] || status;
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'draft': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
            'pending': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            'ordered': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            'partial_received': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
            'received': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            'cancelled': 'bg-red-500/20 text-red-400 border-red-500/30'
        };
        return colors[status] || 'bg-slate-500/20 text-slate-400';
    };

    const calculateProgress = (received: number, ordered: number) => {
        if (ordered === 0) return 0;
        return Math.round((received / ordered) * 100);
    };

    const getTotalProgress = () => {
        const items = shipment()?.items || [];
        if (items.length === 0) return 0;

        const totalOrdered = items.reduce((sum: number, item: ReceivingItem) => sum + item.qtyOrdered, 0);
        const totalReceived = items.reduce((sum: number, item: ReceivingItem) => sum + item.qtyReceived, 0);

        return calculateProgress(totalReceived, totalOrdered);
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    onClick={() => navigate('/warehouse/receiving')}
                    class="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
                >
                    <ArrowLeft class="w-5 h-5" />
                    {t('warehouseApp.receiving.back')}
                </button>

                <div class="flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold text-white">{t('warehouseApp.receiving.receivingDetail')}</h1>
                            <Show when={shipment()?.status}>
                                <span class={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(shipment()!.status)}`}>
                                    {getStatusLabel(shipment()!.status)}
                                </span>
                            </Show>
                        </div>
                        <div class="text-slate-500 text-sm">PO: {shipment()?.poNumber}</div>
                    </div>

                    <div class="flex items-center gap-2">
                        {/* Add Product button - available for draft, ordered, partial_received */}
                        <Show when={canAddProducts()}>
                            <button
                                onClick={() => setShowAddProduct(true)}
                                class="p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 transition"
                                title={t('warehouseApp.receiving.addProduct')}
                            >
                                <Plus class="w-6 h-6 text-blue-400" />
                            </button>
                        </Show>

                        {/* Scan button - only for receiving (ordered/partial_received) */}
                        <Show when={canReceive()}>
                            <button
                                onClick={() => setShowScanner(true)}
                                disabled={scanning()}
                                class="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition disabled:opacity-50"
                                title="Scan Product"
                            >
                                {scanning() ? (
                                    <Loader2 class="w-6 h-6 text-emerald-400 animate-spin" />
                                ) : (
                                    <ScanLine class="w-6 h-6 text-emerald-400" />
                                )}
                            </button>
                        </Show>
                    </div>
                </div>

                {/* Info message for draft POs */}
                <Show when={canEdit() && shipment() && !shipment.loading}>
                    <div class="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-2">
                        <Package class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <div class="text-blue-400 font-medium text-sm">{t('warehouseApp.receiving.draftModeTitle')}</div>
                            <div class="text-blue-300/70 text-xs mt-0.5">{t('warehouseApp.receiving.draftModeMessage')}</div>
                        </div>
                    </div>
                </Show>

                {/* Warning for pending POs */}
                <Show when={shipment()?.status === 'pending' && !shipment.loading}>
                    <div class="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                        <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <div class="text-amber-400 font-medium text-sm">{t('warehouseApp.receiving.notReadyTitle')}</div>
                            <div class="text-amber-300/70 text-xs mt-0.5">{t('warehouseApp.receiving.notReadyMessage')}</div>
                        </div>
                    </div>
                </Show>

                {/* Overall Progress Bar */}
                <Show when={canReceive()}>
                    <div class="mt-3">
                        <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
                            <span>Overall Progress</span>
                            <span>{getTotalProgress()}%</span>
                        </div>
                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                                style={{ width: `${getTotalProgress()}%` }}
                            />
                        </div>
                    </div>
                </Show>
            </div>

            {/* Add Product Modal */}
            <Show when={showAddProduct()}>
                <AddProductToPoModal
                    poId={params.id}
                    onClose={() => setShowAddProduct(false)}
                    onProductAdded={() => refetch()}
                />
            </Show>

            {/* Barcode Scanner Modal */}
            <Show when={showScanner()}>
                <BarcodeScanner
                    title="Scan Product Barcode"
                    onScan={handleBarcodeScanned}
                    onClose={() => setShowScanner(false)}
                />
            </Show>

            <Show when={shipment.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
            </Show>

            <Show when={shipment() && !shipment.loading}>
                <div class="px-4 pt-4 space-y-4">
                    {/* PO Info Card */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="flex items-start gap-2">
                                <Truck class="w-4 h-4 text-emerald-400 mt-0.5" />
                                <div>
                                    <div class="text-slate-500 text-xs">{t('warehouseApp.receiving.supplier')}</div>
                                    <div class="text-white text-sm font-medium">{shipment()?.supplierName || '-'}</div>
                                </div>
                            </div>

                            <div class="flex items-start gap-2">
                                <Calendar class="w-4 h-4 text-blue-400 mt-0.5" />
                                <div>
                                    <div class="text-slate-500 text-xs">{t('warehouseApp.receiving.expectedDate')}</div>
                                    <div class="text-white text-sm font-medium">{formatDate(shipment()?.expectedDate || null)}</div>
                                </div>
                            </div>
                        </div>

                        <Show when={shipment()?.notes}>
                            <div class="pt-3 border-t border-slate-800/60">
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.receiving.notes')}</div>
                                <div class="text-white text-sm">{shipment()?.notes}</div>
                            </div>
                        </Show>
                    </div>

                    {/* Items List */}
                    <div class="space-y-2">
                        <h2 class="text-white font-semibold px-1">{t('warehouseApp.receiving.items')}</h2>

                        <For each={shipment()?.items}>
                            {(item) => {
                                const progress = () => calculateProgress(item.qtyReceived, item.qtyOrdered);
                                const isComplete = () => item.qtyReceived >= item.qtyOrdered;
                                const isOverReceived = () => item.qtyReceived > item.qtyOrdered;

                                return (
                                    <div class={`bg-slate-900/60 border rounded-2xl p-4 transition ${isOverReceived()
                                        ? 'border-orange-500/50'
                                        : isComplete()
                                            ? 'border-emerald-500/50'
                                            : 'border-slate-800/60'
                                        }`}>
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex-1">
                                                <div class="text-white font-medium flex items-center gap-2">
                                                    <Package class="w-4 h-4 text-slate-400" />
                                                    {item.productName}
                                                </div>
                                            </div>

                                            <div class="flex items-center gap-2">
                                                {/* Delete button - only for draft POs */}
                                                <Show when={canEdit()}>
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        disabled={deletingItem() === item.id}
                                                        class="p-1.5 rounded-lg bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 transition disabled:opacity-50"
                                                        title={t('warehouseApp.receiving.deleteItem')}
                                                    >
                                                        {deletingItem() === item.id ? (
                                                            <Loader2 class="w-4 h-4 text-red-400 animate-spin" />
                                                        ) : (
                                                            <Trash2 class="w-4 h-4 text-red-400" />
                                                        )}
                                                    </button>
                                                </Show>

                                                <Show when={isComplete() && !isOverReceived()}>
                                                    <CheckCircle2 class="w-5 h-5 text-emerald-400" />
                                                </Show>

                                                <Show when={isOverReceived()}>
                                                    <AlertTriangle class="w-5 h-5 text-orange-400" />
                                                </Show>
                                            </div>
                                        </div>

                                        {/* Quantity controls for draft POs */}
                                        <Show when={canEdit()}>
                                            <div class="flex items-center justify-between mb-3">
                                                <span class="text-slate-400 text-sm">{t('warehouseApp.receiving.orderedQuantity')}</span>
                                                <div class="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleUpdateQuantity(item.id, item.qtyOrdered, -1)}
                                                        disabled={updatingItem() === item.id || item.qtyOrdered <= 1}
                                                        class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <Minus class="w-4 h-4 text-white" />
                                                    </button>
                                                    <span class="w-12 text-center text-white font-bold text-lg">
                                                        {updatingItem() === item.id ? (
                                                            <Loader2 class="w-5 h-5 animate-spin mx-auto text-blue-400" />
                                                        ) : (
                                                            item.qtyOrdered
                                                        )}
                                                    </span>
                                                    <button
                                                        onClick={() => handleUpdateQuantity(item.id, item.qtyOrdered, 1)}
                                                        disabled={updatingItem() === item.id}
                                                        class="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center hover:bg-blue-600/50 transition disabled:opacity-40"
                                                    >
                                                        <Plus class="w-4 h-4 text-blue-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </Show>

                                        {/* Receiving progress for non-draft POs */}
                                        <Show when={!canEdit()}>
                                            <div class="flex items-center justify-between text-sm mb-2">
                                                <span class="text-slate-400">
                                                    {t('warehouseApp.receiving.received')}: <span class={`font-bold ${isOverReceived() ? 'text-orange-400' : 'text-emerald-400'}`}>
                                                        {item.qtyReceived}
                                                    </span> / {item.qtyOrdered}
                                                </span>
                                                <span class="text-slate-500">{progress()}%</span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    class={`h-full transition-all duration-500 ${isOverReceived()
                                                        ? 'bg-gradient-to-r from-orange-600 to-orange-400'
                                                        : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                                        }`}
                                                    style={{ width: `${Math.min(progress(), 100)}%` }}
                                                />
                                            </div>
                                        </Show>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default ReceivingDetail;
