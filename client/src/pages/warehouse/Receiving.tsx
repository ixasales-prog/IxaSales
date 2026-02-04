import { type Component, For, Show, createResource, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Truck, CheckCircle2, Loader2, ScanLine, Plus } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { showToast } from '../../components/Toast';
import BarcodeScanner from '../../components/BarcodeScanner';

interface ReceivingItem {
    id: string;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
}

const WarehouseReceiving: Component = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [updatingReceiving, setUpdatingReceiving] = createSignal<string | null>(null);
    const [showScanner, setShowScanner] = createSignal(false);
    const [searchQuery, setSearchQuery] = createSignal('');

    const [inbound, { refetch }] = createResource(async () => {
        const result = await api<ReceivingItem[]>('/warehouse/receiving');
        return (result as any)?.data ?? result ?? [];
    });

    const handleMarkReceived = async (receivingId: string, event: MouseEvent) => {
        event.stopPropagation();

        setUpdatingReceiving(receivingId);

        try {
            await api(`/warehouse/receiving/${receivingId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'received' })
            });

            showToast(t('warehouseApp.receiving.statusUpdated'), 'success');
            refetch();
        } catch (error: any) {
            console.error('Failed to update receiving:', error);

            // Check for specific error codes
            const errorCode = error?.error?.code;
            if (errorCode === 'PO_NOT_READY') {
                showToast(t('warehouseApp.receiving.poNotReadyError'), 'error');
            } else {
                showToast(t('warehouseApp.receiving.updateFailed'), 'error');
            }
        } finally {
            setUpdatingReceiving(null);
        }
    };

    const handleBarcodeScanned = (barcode: string) => {
        setSearchQuery(barcode);
        const items = inbound() || [];
        const match = items.find((item: ReceivingItem) =>
            item.poNumber === barcode
        );
        if (match) {
            navigate(`/warehouse/receiving/${match.id}`);
        }
    };

    const filteredInbound = () => {
        const items = inbound() || [];
        const query = searchQuery().toLowerCase().trim();
        if (!query) return items;

        return items.filter((item: ReceivingItem) =>
            item.poNumber?.toLowerCase().includes(query) ||
            item.supplierName?.toLowerCase().includes(query)
        );
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex-1">
                        <h1 class="text-xl font-bold text-white">{t('warehouseApp.receiving.title')}</h1>
                        <p class="text-slate-500 text-sm">{t('warehouseApp.receiving.subtitle')}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/warehouse/receiving/create')}
                            class="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 transition"
                            title={t('warehouseApp.createPo.title')}
                        >
                            <Plus class="w-6 h-6 text-indigo-400" />
                        </button>
                        <button
                            onClick={() => setShowScanner(true)}
                            class="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                            title="Scan Barcode"
                        >
                            <ScanLine class="w-6 h-6 text-emerald-400" />
                        </button>
                    </div>
                </div>

                <input
                    type="text"
                    placeholder={t('warehouseApp.receiving.search')}
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    class="w-full px-4 py-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
                />
            </div>

            <Show when={showScanner()}>
                <BarcodeScanner
                    title={t('warehouseApp.receiving.scanBarcode')}
                    onScan={handleBarcodeScanned}
                    onClose={() => setShowScanner(false)}
                />
            </Show>

            <div class="px-4 pt-4 space-y-3">
                <Show when={inbound.loading}>
                    <div class="flex items-center justify-center py-10">
                        <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!inbound.loading && (inbound() ?? []).length === 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                        {t('warehouseApp.receiving.empty')}
                    </div>
                </Show>

                <Show when={!inbound.loading && filteredInbound().length === 0 && searchQuery().length > 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-slate-400 text-sm">
                        {t('warehouseApp.receiving.noResults')}
                    </div>
                </Show>

                <Show when={!inbound.loading && filteredInbound().length > 0}>
                    <For each={filteredInbound()}>
                        {(shipment: ReceivingItem) => (
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => navigate(`/warehouse/receiving/${shipment.id}`)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        navigate(`/warehouse/receiving/${shipment.id}`);
                                    }
                                }}
                                class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80 cursor-pointer"
                            >
                                <div class="flex items-center justify-between">
                                    <div>
                                        <div class="text-white font-semibold">{shipment.supplierName ?? t('warehouseApp.receiving.unknownSupplier')}</div>
                                        <div class="text-slate-400 text-sm">{shipment.poNumber}</div>
                                    </div>
                                    <div class="text-xs flex items-center gap-1">
                                        <Truck class="w-4 h-4 text-emerald-400" />
                                        <span class={`px-2 py-0.5 rounded-full border ${shipment.status === 'draft' ? 'border-slate-500/30 bg-slate-500/10 text-slate-300' :
                                                shipment.status === 'pending' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                                                    shipment.status === 'ordered' ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' :
                                                        shipment.status === 'partial_received' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' :
                                                            'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                            }`}>
                                            {shipment.status === 'draft' ? t('warehouseApp.receiving.statusDraft') :
                                                shipment.status === 'pending' ? t('warehouseApp.receiving.statusPending') :
                                                    shipment.status === 'ordered' ? t('warehouseApp.receiving.statusOrdered') :
                                                        shipment.status === 'partial_received' ? t('warehouseApp.receiving.statusPartial') :
                                                            shipment.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Show Mark Received button only for ordered/partial_received POs */}
                                <Show when={['ordered', 'partial_received'].includes(shipment.status)}>
                                    <button
                                        onClick={(event) => { event.stopPropagation(); handleMarkReceived(shipment.id, event); }}
                                        disabled={updatingReceiving() === shipment.id}
                                        class="mt-3 w-full py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600/30 transition"
                                    >
                                        {updatingReceiving() === shipment.id ? (
                                            <Loader2 class="w-4 h-4 animate-spin" />
                                        ) : (
                                            <CheckCircle2 class="w-4 h-4" />
                                        )}
                                        {t('warehouseApp.receiving.markReceived')}
                                    </button>
                                </Show>

                                {/* Show pending approval message for draft/pending POs */}
                                <Show when={['draft', 'pending'].includes(shipment.status)}>
                                    <div class="mt-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                                        <span>⏳</span>
                                        <span>{t('warehouseApp.receiving.awaitingApproval')}</span>
                                    </div>
                                </Show>
                            </div>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseReceiving;
