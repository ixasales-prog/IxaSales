import { type Component, Show, createResource } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ArrowLeft, Package, AlertCircle, Loader2 } from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

interface InventoryDetailData {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    stockQuantity: number;
    reorderPoint: number;
    costPrice: number;
    price: number;
}

const InventoryDetail: Component = () => {
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();

    const [product] = createResource(() => params.id, async (id) => {
        const result = await api<InventoryDetailData>(`/warehouse/inventory/${id}`);
        return (result as any)?.data ?? result;
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
    };

    const isLowStock = () => {
        const prod = product();
        if (!prod) return false;
        return prod.stockQuantity <= prod.reorderPoint;
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <button
                    onClick={() => navigate('/warehouse/inventory')}
                    class="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
                >
                    <ArrowLeft class="w-5 h-5" />
                    {t('warehouseApp.inventory.back')}
                </button>
                <h1 class="text-xl font-bold text-white">{t('warehouseApp.inventory.details')}</h1>
            </div>

            <Show when={product.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
            </Show>

            <Show when={product() && !product.loading}>
                <div class="px-4 pt-4 space-y-4">
                    {/* Product Header */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h2 class="text-white font-bold text-lg mb-1">{product()?.name}</h2>
                                <div class="text-slate-500 text-sm font-mono">{t('warehouseApp.inventory.sku')}: {product()?.sku}</div>
                            </div>
                            <Show when={isLowStock()}>
                                <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                    <AlertCircle class="w-3 h-3 text-amber-400" />
                                    <span class="text-amber-300 text-xs font-semibold">{t('warehouseApp.inventory.lowStockBadge')}</span>
                                </div>
                            </Show>
                        </div>

                        <Show when={product()?.description}>
                            <div class="pt-2 border-t border-slate-800/60">
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.description')}</div>
                                <div class="text-white text-sm">{product()?.description}</div>
                            </div>
                        </Show>
                    </div>

                    {/* Stock Levels */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <Package class="w-5 h-5 text-emerald-400" />
                            <h3 class="text-white font-semibold">Stock Levels</h3>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.stockQuantity')}</div>
                                <div class={`text-2xl font-bold ${isLowStock() ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {formatNumber(product()?.stockQuantity || 0)}
                                </div>
                            </div>
                            <div class="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.reorderPoint')}</div>
                                <div class="text-2xl font-bold text-slate-400">
                                    {formatNumber(product()?.reorderPoint || 0)}
                                </div>
                            </div>
                        </div>

                        <Show when={isLowStock()}>
                            <div class="mt-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                <p class="text-amber-300 text-xs flex items-center gap-1">
                                    <AlertCircle class="w-3 h-3" />
                                    {t('warehouseApp.inventory.reorderNeeded')}
                                </p>
                            </div>
                        </Show>
                    </div>

                    {/* Pricing */}
                    <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                        <h3 class="text-white font-semibold mb-4">Pricing</h3>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.costPrice')}</div>
                                <div class="text-white font-semibold text-lg">{formatCurrency(product()?.costPrice || 0)}</div>
                            </div>
                            <div>
                                <div class="text-slate-500 text-xs mb-1">{t('warehouseApp.inventory.price')}</div>
                                <div class="text-emerald-400 font-semibold text-lg">{formatCurrency(product()?.price || 0)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default InventoryDetail;
