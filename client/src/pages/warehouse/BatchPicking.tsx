import { type Component, Show, For, createSignal, createResource, createMemo } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { ArrowLeft, Package, Loader2, CheckCircle2, Boxes, ScanLine, Users } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';
import BarcodeScanner from '../../components/BarcodeScanner';

interface BatchOrder {
    id: string;
    orderNumber: string;
    status: string;
    customerName: string | null;
}

interface BatchItemOrder {
    orderId: string;
    orderNumber: string;
    customerName: string | null;
    qtyOrdered: number;
    qtyPicked: number;
}

interface BatchItem {
    productId: string;
    productName: string;
    productSku: string | null;
    productBarcode: string | null;
    stockQuantity: number;
    totalQtyOrdered: number;
    totalQtyPicked: number;
    orders: BatchItemOrder[];
}

interface BatchData {
    orders: BatchOrder[];
    batchItems: BatchItem[];
    summary: {
        totalOrders: number;
        totalProducts: number;
        totalItemsToPickl: number;
    };
}

const BatchPicking: Component = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useI18n();

    const [showScanner, setShowScanner] = createSignal(false);
    const [picking, setPicking] = createSignal(false);
    const [expandedProduct, setExpandedProduct] = createSignal<string | null>(null);

    const orderIds = createMemo(() => {
        const ids = searchParams.orderIds;
        if (!ids) return [];
        return typeof ids === 'string' ? ids.split(',') : ids;
    });

    const [batchData, { refetch }] = createResource(
        () => orderIds().length > 0 ? orderIds().join(',') : null,
        async (ids) => {
            if (!ids) return null;
            const result = await api<{ data: BatchData }>(`/warehouse/tasks/batch?orderIds=${ids}`);
            return (result as any)?.data ?? result ?? null;
        }
    );

    const handleBarcodeScanned = async (barcode: string) => {
        // Find matching product by barcode or SKU
        const items = batchData()?.batchItems || [];
        const matchingItem = items.find((item: BatchItem) =>
            item.productBarcode === barcode || item.productSku === barcode
        );

        if (!matchingItem) {
            showToast(t('warehouseApp.batchPicking.productNotInBatch'), 'error');
            return;
        }

        // Pick 1 item
        await handlePickProduct(matchingItem.productId, 1);
    };

    const handlePickProduct = async (productId: string, quantity: number) => {
        setPicking(true);
        try {
            await api('/warehouse/tasks/batch/pick', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    orderIds: orderIds(),
                    quantity
                })
            });

            showToast(t('warehouseApp.batchPicking.itemPicked'), 'success');
            await refetch();
        } catch (error) {
            console.error('Failed to pick item:', error);
            showToast(t('warehouseApp.batchPicking.pickFailed'), 'error');
        } finally {
            setPicking(false);
        }
    };

    const getProgress = (item: BatchItem) => {
        if (item.totalQtyOrdered === 0) return 0;
        return Math.round((item.totalQtyPicked / item.totalQtyOrdered) * 100);
    };

    const totalProgress = createMemo(() => {
        const items = batchData()?.batchItems || [];
        if (items.length === 0) return 0;

        const totalOrdered = items.reduce((sum: number, item: BatchItem) => sum + item.totalQtyOrdered, 0);
        const totalPicked = items.reduce((sum: number, item: BatchItem) => sum + item.totalQtyPicked, 0);

        if (totalOrdered === 0) return 0;
        return Math.round((totalPicked / totalOrdered) * 100);
    });

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    onClick={() => navigate('/warehouse/tasks')}
                    class="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
                >
                    <ArrowLeft class="w-5 h-5" />
                    {t('warehouseApp.tasks.back')}
                </button>

                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-xl font-bold text-white">{t('warehouseApp.batchPicking.title')}</h1>
                        <div class="text-slate-500 text-sm">
                            {batchData()?.summary?.totalOrders || 0} {t('warehouseApp.batchPicking.orders')} • {batchData()?.summary?.totalProducts || 0} {t('warehouseApp.batchPicking.products')}
                        </div>
                    </div>

                    <button
                        onClick={() => setShowScanner(true)}
                        class="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                        title="Scan Product"
                    >
                        <ScanLine class="w-6 h-6 text-emerald-400" />
                    </button>
                </div>

                {/* Overall Progress */}
                <div class="mt-3">
                    <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>{t('warehouseApp.batchPicking.overallProgress')}</span>
                        <span>{totalProgress()}%</span>
                    </div>
                    <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                            style={{ width: `${totalProgress()}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Barcode Scanner Modal */}
            <Show when={showScanner()}>
                <BarcodeScanner
                    title={t('warehouseApp.batchPicking.scanProduct')}
                    onScan={handleBarcodeScanned}
                    onClose={() => setShowScanner(false)}
                />
            </Show>

            {/* Loading */}
            <Show when={batchData.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
            </Show>

            {/* No orders selected */}
            <Show when={!batchData.loading && orderIds().length === 0}>
                <div class="px-4 pt-8 text-center">
                    <Boxes class="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <div class="text-slate-400">{t('warehouseApp.batchPicking.noOrdersSelected')}</div>
                </div>
            </Show>

            {/* Batch Items List */}
            <Show when={!batchData.loading && batchData()}>
                <div class="px-4 pt-4 space-y-3">
                    {/* Selected Orders Summary */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                        <div class="flex items-center gap-2 mb-2">
                            <Users class="w-4 h-4 text-indigo-400" />
                            <span class="text-sm text-slate-400">{t('warehouseApp.batchPicking.selectedOrders')}</span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <For each={batchData()?.orders || []}>
                                {(order) => (
                                    <span class="px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-white">
                                        {order.orderNumber}
                                    </span>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* Products to Pick */}
                    <h2 class="text-white font-semibold px-1">{t('warehouseApp.batchPicking.productsToPick')}</h2>

                    <For each={batchData()?.batchItems || []}>
                        {(item) => {
                            const progress = getProgress(item);
                            const isComplete = item.totalQtyPicked >= item.totalQtyOrdered;
                            const remaining = item.totalQtyOrdered - item.totalQtyPicked;
                            const isExpanded = () => expandedProduct() === item.productId;

                            return (
                                <div class={`bg-slate-900/60 border rounded-2xl overflow-hidden transition ${isComplete ? 'border-emerald-500/50' : 'border-slate-800/60'
                                    }`}>
                                    {/* Main Product Row */}
                                    <div
                                        class="p-4 cursor-pointer"
                                        onClick={() => setExpandedProduct(isExpanded() ? null : item.productId)}
                                    >
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex-1">
                                                <div class="text-white font-medium flex items-center gap-2">
                                                    <Package class="w-4 h-4 text-slate-400" />
                                                    {item.productName}
                                                </div>
                                                <div class="text-slate-500 text-xs mt-0.5">
                                                    {item.productSku && <span>SKU: {item.productSku}</span>}
                                                    {item.productSku && item.productBarcode && <span> • </span>}
                                                    {item.productBarcode && <span>{item.productBarcode}</span>}
                                                </div>
                                            </div>
                                            <Show when={isComplete}>
                                                <CheckCircle2 class="w-5 h-5 text-emerald-400" />
                                            </Show>
                                        </div>

                                        <div class="flex items-center justify-between text-sm mb-2">
                                            <span class="text-slate-400">
                                                {t('warehouseApp.batchPicking.picked')}: <span class="text-emerald-400 font-bold">{item.totalQtyPicked}</span> / {item.totalQtyOrdered}
                                            </span>
                                            <span class="text-slate-500">{progress}%</span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>

                                        {/* Stock Warning */}
                                        <Show when={item.stockQuantity < remaining}>
                                            <div class="mt-2 text-xs text-orange-400">
                                                ⚠️ {t('warehouseApp.batchPicking.insufficientStock')}: {item.stockQuantity} {t('warehouseApp.inventory.available')}
                                            </div>
                                        </Show>
                                    </div>

                                    {/* Expanded: Order Details */}
                                    <Show when={isExpanded()}>
                                        <div class="border-t border-slate-800/60 p-3 bg-slate-950/40">
                                            <div class="text-xs text-slate-500 mb-2">{t('warehouseApp.batchPicking.orderBreakdown')}</div>
                                            <div class="space-y-2">
                                                <For each={item.orders}>
                                                    {(order) => (
                                                        <div class="flex items-center justify-between text-sm">
                                                            <div>
                                                                <span class="text-white">{order.orderNumber}</span>
                                                                <span class="text-slate-500 ml-2">({order.customerName})</span>
                                                            </div>
                                                            <span class={order.qtyPicked >= order.qtyOrdered ? 'text-emerald-400' : 'text-slate-400'}>
                                                                {order.qtyPicked}/{order.qtyOrdered}
                                                            </span>
                                                        </div>
                                                    )}
                                                </For>
                                            </div>

                                            {/* Pick Button */}
                                            <Show when={!isComplete}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePickProduct(item.productId, 1);
                                                    }}
                                                    disabled={picking()}
                                                    class="mt-3 w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-600/30 transition"
                                                >
                                                    {picking() ? (
                                                        <Loader2 class="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 class="w-4 h-4" />
                                                    )}
                                                    {t('warehouseApp.batchPicking.pickOne')}
                                                </button>
                                            </Show>
                                        </div>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </div>
            </Show>
        </div>
    );
};

export default BatchPicking;
