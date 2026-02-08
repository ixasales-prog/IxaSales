import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Loader2, RefreshCw, Warehouse, ArrowUpCircle, ArrowDownCircle, Package } from 'lucide-solid';
import { api } from '../../lib/api';
import BatchAdjustmentModal from './BatchAdjustmentModal';

interface StockMovement {
    id: string;
    productName: string;
    movementType: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    notes: string | null;
    userName: string | null;
    createdAt: string;
}

const Inventory: Component = () => {
    const [activeTab, setActiveTab] = createSignal<'movements' | 'adjustments'>('movements');
    const [showAdjustmentModal, setShowAdjustmentModal] = createSignal(false);
    // TODO: Implement product filter UI
    // const [productFilter, setProductFilter] = createSignal('');

    const [movements, { refetch }] = createResource(async () => {
        const response = await api.get<{ data: StockMovement[]; meta: any }>('/inventory/movements', { params: { limit: '50' } });
        return response?.data || response || [];
    });

    const getMovementIcon = (type: string) => {
        switch (type) {
            case 'in':
                return <ArrowUpCircle class="w-5 h-5 text-emerald-400" />;
            case 'out':
                return <ArrowDownCircle class="w-5 h-5 text-red-400" />;
            default:
                return <Package class="w-5 h-5 text-blue-400" />;
        }
    };

    const getMovementLabel = (type: string) => {
        switch (type) {
            case 'in': return 'Stock In';
            case 'out': return 'Stock Out';
            case 'adjust': return 'Adjustment';
            case 'reserve': return 'Reserved';
            case 'release': return 'Released';
            default: return type;
        }
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Inventory</h1>
                    <p class="text-slate-400 mt-1">Track stock movements and make adjustments</p>
                </div>
                <button
                    onClick={() => setShowAdjustmentModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    New Adjustment
                </button>
            </div>

            {/* Tabs */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex gap-1">
                <button
                    onClick={() => setActiveTab('movements')}
                    class={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${activeTab() === 'movements'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Stock Movements
                </button>
                <button
                    onClick={() => setActiveTab('adjustments')}
                    class={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${activeTab() === 'adjustments'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Adjustments
                </button>
            </div>

            {/* Content */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={activeTab() === 'movements'}>
                    {/* Toolbar */}
                    <div class="p-4 border-b border-slate-800 flex justify-end">
                        <button
                            onClick={() => refetch()}
                            class="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw class="w-5 h-5" />
                        </button>
                    </div>

                    <Show when={!movements.loading} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                            <p>Loading movements...</p>
                        </div>
                    }>
                        <Show when={(movements() as StockMovement[])?.length > 0} fallback={
                            <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                                <Warehouse class="w-16 h-16 mb-4 opacity-20" />
                                <p class="text-lg font-medium text-slate-400">No stock movements</p>
                                <p class="text-sm">Stock movements will appear here as orders and adjustments are made.</p>
                            </div>
                        }>
                            <div class="overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead class="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                        <tr>
                                            <th class="px-6 py-4">Type</th>
                                            <th class="px-6 py-4">Product</th>
                                            <th class="px-6 py-4 text-right">Qty</th>
                                            <th class="px-6 py-4 text-right">Before</th>
                                            <th class="px-6 py-4 text-right">After</th>
                                            <th class="px-6 py-4">User</th>
                                            <th class="px-6 py-4 text-right">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-800">
                                        <For each={movements() as StockMovement[]}>
                                            {(movement) => (
                                                <tr class="hover:bg-slate-800/50 transition-colors">
                                                    <td class="px-6 py-4">
                                                        <div class="flex items-center gap-2">
                                                            {getMovementIcon(movement.movementType)}
                                                            <span class="text-slate-300">{getMovementLabel(movement.movementType)}</span>
                                                        </div>
                                                    </td>
                                                    <td class="px-6 py-4">
                                                        <div class="text-white font-medium">{movement.productName}</div>
                                                        <Show when={movement.notes}>
                                                            <div class="text-slate-500 text-xs truncate max-w-[200px]">{movement.notes}</div>
                                                        </Show>
                                                    </td>
                                                    <td class="px-6 py-4 text-right">
                                                        <span class={`font-medium ${movement.movementType === 'in' ? 'text-emerald-400' : movement.movementType === 'out' ? 'text-red-400' : 'text-white'}`}>
                                                            {movement.movementType === 'out' ? '-' : '+'}{movement.quantity}
                                                        </span>
                                                    </td>
                                                    <td class="px-6 py-4 text-right text-slate-400">{movement.quantityBefore}</td>
                                                    <td class="px-6 py-4 text-right text-white font-medium">{movement.quantityAfter}</td>
                                                    <td class="px-6 py-4 text-slate-400">{movement.userName || '-'}</td>
                                                    <td class="px-6 py-4 text-right text-slate-500 text-sm">
                                                        {new Date(movement.createdAt).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </Show>
                    </Show>
                </Show>

                <Show when={activeTab() === 'adjustments'}>
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Warehouse class="w-16 h-16 mb-4 opacity-20" />
                        <p class="text-lg font-medium text-slate-400">Create adjustments</p>
                        <p class="text-sm mb-4">Use the "New Adjustment" button to correct stock levels.</p>
                        <button
                            onClick={() => setShowAdjustmentModal(true)}
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                        >
                            New Adjustment
                        </button>
                    </div>
                </Show>
            </div>

            <Show when={showAdjustmentModal()}>
                <BatchAdjustmentModal
                    onClose={() => setShowAdjustmentModal(false)}
                    onSuccess={() => refetch()}
                />
            </Show>
        </div>
    );
};

export default Inventory;

