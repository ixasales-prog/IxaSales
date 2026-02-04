import { type Component, For, Show, createResource, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Package, AlertCircle, Loader2, ScanLine } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import BarcodeScanner from '../../components/BarcodeScanner';

interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    reorderPoint: number;
    barcode?: string;
}

const WarehouseInventory: Component = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [showScanner, setShowScanner] = createSignal(false);
    const [searchQuery, setSearchQuery] = createSignal('');

    const [inventory] = createResource(async () => {
        const result = await api<InventoryItem[]>('/warehouse/inventory');
        return (result as any)?.data ?? result ?? [];
    });

    const isLowStock = (item: InventoryItem) => item.stockQuantity <= item.reorderPoint;

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
    };

    const handleBarcodeScanned = (barcode: string) => {
        setSearchQuery(barcode);
        // Optionally auto-navigate to first match
        const items = inventory() || [];
        const match = items.find((item: InventoryItem) =>
            item.barcode === barcode ||
            item.sku === barcode
        );
        if (match) {
            navigate(`/warehouse/inventory/${match.id}`);
        }
    };

    const filteredInventory = () => {
        const items = inventory() || [];
        const query = searchQuery().toLowerCase().trim();
        if (!query) return items;

        return items.filter((item: InventoryItem) =>
            item.name?.toLowerCase().includes(query) ||
            item.sku?.toLowerCase().includes(query) ||
            item.barcode?.toLowerCase().includes(query)
        );
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-safe">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex-1">
                        <h1 class="text-xl font-bold text-white">{t('warehouseApp.inventory.title')}</h1>
                        <p class="text-slate-500 text-sm">{t('warehouseApp.inventory.subtitle')}</p>
                    </div>
                    <button
                        onClick={() => setShowScanner(true)}
                        class="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                        title="Scan Barcode"
                    >
                        <ScanLine class="w-6 h-6 text-emerald-400" />
                    </button>
                </div>

                {/* Search Bar */}
                <input
                    type="text"
                    placeholder={t('warehouseApp.inventory.search')}
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    class="w-full px-4 py-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
                />
            </div>

            {/* Barcode Scanner Modal */}
            <Show when={showScanner()}>
                <BarcodeScanner
                    title={t('warehouseApp.inventory.scanBarcode')}
                    onScan={handleBarcodeScanned}
                    onClose={() => setShowScanner(false)}
                />
            </Show>

            <div class="px-4 pt-4 space-y-3">
                <Show when={inventory.loading}>
                    <div class="flex items-center justify-center py-10">
                        <Loader2 class="w-7 h-7 text-emerald-400 animate-spin" />
                    </div>
                </Show>

                <Show when={!inventory.loading && (inventory() ?? []).length === 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-8 text-center">
                        <Package class="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p class="text-slate-400 text-sm">{t('warehouseApp.inventory.empty')}</p>
                    </div>
                </Show>

                <Show when={!inventory.loading && filteredInventory().length === 0 && searchQuery().length > 0}>
                    <div class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-8 text-center">
                        <Package class="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p class="text-slate-400 text-sm">{t('warehouseApp.inventory.noResults')}</p>
                    </div>
                </Show>

                <Show when={!inventory.loading && filteredInventory().length > 0}>
                    <For each={filteredInventory()}>
                        {(item: InventoryItem) => {
                            const lowStock = isLowStock(item);
                            return (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/warehouse/inventory/${item.id}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            navigate(`/warehouse/inventory/${item.id}`);
                                        }
                                    }}
                                    class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 transition hover:border-slate-700/70 hover:bg-slate-900/80 cursor-pointer"
                                >
                                    <div class="flex items-start justify-between mb-3">
                                        <div class="flex-1">
                                            <div class="text-white font-semibold mb-1">{item.name}</div>
                                            <div class="text-slate-500 text-xs font-mono">{t('warehouseApp.inventory.sku')}: {item.sku}</div>
                                        </div>
                                        <Show when={lowStock}>
                                            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                                <AlertCircle class="w-3 h-3 text-amber-400" />
                                                <span class="text-amber-300 text-xs font-semibold">{t('warehouseApp.inventory.lowStockBadge')}</span>
                                            </div>
                                        </Show>
                                        <Show when={!lowStock}>
                                            <div class="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                                <span class="text-emerald-300 text-xs font-semibold">{t('warehouseApp.inventory.okBadge')}</span>
                                            </div>
                                        </Show>
                                    </div>

                                    <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/60">
                                        <div>
                                            <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.available')}</div>
                                            <div class={`text-lg font-semibold ${lowStock ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                {formatNumber(item.stockQuantity)}
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.reorderPoint')}</div>
                                            <div class="text-lg font-semibold text-slate-400">
                                                {formatNumber(item.reorderPoint)}
                                            </div>
                                        </div>
                                    </div>

                                    <Show when={lowStock}>
                                        <div class="mt-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                            <p class="text-amber-300 text-xs flex items-center gap-1">
                                                <AlertCircle class="w-3 h-3" />
                                                {t('warehouseApp.inventory.reorderNeeded')}
                                            </p>
                                        </div>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default WarehouseInventory;
