import { type Component, createSignal, createResource, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, Save, Loader2, Search, Plus, Trash2, Building2, Package } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface CreatePurchaseOrderModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const CreatePurchaseOrderModal: Component<CreatePurchaseOrderModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [supplierId, setSupplierId] = createSignal('');
    const [expectedDate, setExpectedDate] = createSignal('');
    const [notes, setNotes] = createSignal('');
    const [status, setStatus] = createSignal('draft');

    // Product Search
    const [search, setSearch] = createSignal('');
    const [items, setItems] = createSignal<any[]>([]);

    const [suppliers] = createResource(async () => {
        try {
            const res = await api.get('/procurement/suppliers');
            return Array.isArray(res) ? res : (res as any)?.data || [];
        } catch (e) { return []; }
    });

    const [products] = createResource(search, async (query) => {
        if (!query || query.length < 2) return [];
        try {
            const res = await api.get('/products', { params: { search: query, limit: '10' } });
            return Array.isArray(res) ? res : (res as any)?.data || [];
        } catch (e) { return []; }
    });

    const addItem = (product: any) => {
        if (items().some(i => i.productId === product.id)) {
            toast.error('Product already added');
            return;
        }
        const unitPrice = Number(product.costPrice) || Number(product.price) || 0;
        setItems([...items(), {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            qtyOrdered: 1,
            unitPrice: unitPrice,
            lineTotal: unitPrice
        }]);
        setSearch('');
    };

    const updateItem = (index: number, field: string, value: number) => {
        setItems(prevItems => {
            return prevItems.map((item, i) => {
                if (i !== index) return item;

                // Create a new object with the updated field
                const updatedItem = { ...item, [field]: value };

                // Recalculate lineTotal
                const qty = Number(updatedItem.qtyOrdered) || 0;
                const price = Number(updatedItem.unitPrice) || 0;
                updatedItem.lineTotal = qty * price;

                return updatedItem;
            });
        });
    };

    const removeItem = (index: number) => {
        setItems(items().filter((_, i) => i !== index));
    };

    const totals = () => {
        // Ensure all lineTotals are converted to numbers
        const subtotal = items().reduce((acc, item) => acc + (Number(item.lineTotal) || 0), 0);
        return { subtotal, total: subtotal };
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!supplierId()) {
            toast.error('Please select a supplier');
            return;
        }
        if (items().length === 0) {
            toast.error('Please add at least one product');
            return;
        }

        setLoading(true);

        try {
            const { subtotal, total } = totals();
            const payload = {
                supplierId: supplierId(),
                status: status(),
                expectedDate: expectedDate() || undefined,
                notes: notes(),
                items: items().map(i => ({
                    productId: i.productId,
                    qtyOrdered: Number(i.qtyOrdered),
                    unitPrice: Number(i.unitPrice),
                    lineTotal: Number(i.lineTotal)
                })),
                subtotalAmount: subtotal,
                taxAmount: 0,
                totalAmount: total
            };

            await api.post('/procurement/purchase-orders', payload);
            toast.success('Purchase Order created successfully');
            props.onSuccess();
            props.onClose();
        } catch (error: any) {
            console.error('Failed to create PO:', error);
            toast.error(error.message || 'Failed to create PO');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] overflow-y-auto flex items-end sm:items-center justify-center p-4">
                <div class="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h2 class="text-xl font-bold text-white">Create Purchase Order</h2>
                            <p class="text-slate-400 text-sm mt-1">Draft a new order for supplies</p>
                        </div>
                        <button onClick={props.onClose} class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-6">
                        {/* Header Info */}
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Supplier <span class="text-red-400">*</span></label>
                                <div class="relative group">
                                    <Building2 class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                                    <select
                                        required
                                        value={supplierId()}
                                        onChange={(e) => setSupplierId(e.currentTarget.value)}
                                        class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium appearance-none"
                                    >
                                        <option value="">Select Supplier...</option>
                                        <For each={suppliers()}>
                                            {(s: any) => <option value={s.id}>{s.name}</option>}
                                        </For>
                                    </select>
                                </div>
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Status</label>
                                <select
                                    value={status()}
                                    onChange={(e) => setStatus(e.currentTarget.value)}
                                    class="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium appearance-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="ordered">Ordered</option>
                                    <option value="received">Received</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Expected Date</label>
                                <input
                                    type="date"
                                    value={expectedDate()}
                                    onInput={(e) => setExpectedDate(e.currentTarget.value)}
                                    class="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Notes</label>
                                <input
                                    type="text"
                                    value={notes()}
                                    onInput={(e) => setNotes(e.currentTarget.value)}
                                    placeholder="Reference or comments"
                                    class="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>
                        </div>

                        {/* Product Search */}
                        <div class="space-y-1.5 relative z-20">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Add Products</label>
                            <div class="relative">
                                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    value={search()}
                                    onInput={(e) => setSearch(e.currentTarget.value)}
                                    placeholder="Search products by name or SKU..."
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>

                            {/* Search Results Dropdown */}
                            <Show when={search().length >= 2 && !products.loading}>
                                <div class="absolute w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto z-50">
                                    <Show when={products() && products().length > 0} fallback={
                                        <div class="p-4 text-center text-slate-500 text-sm">
                                            No products found
                                        </div>
                                    }>
                                        <For each={products()}>
                                            {(product: any) => (
                                                <div
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        addItem(product);
                                                    }}
                                                    class="flex items-center justify-between p-3 hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-800/50 last:border-0"
                                                >
                                                    <div class="flex items-center gap-3">
                                                        <div class="p-2 bg-slate-800 rounded-lg">
                                                            <Package class="w-4 h-4 text-blue-400" />
                                                        </div>
                                                        <div>
                                                            <div class="text-white font-medium">{product.name}</div>
                                                            <div class="text-xs text-slate-400">SKU: {product.sku}</div>
                                                        </div>
                                                    </div>
                                                    <div class="flex items-center gap-3">
                                                        <div class="text-right">
                                                            <div class="text-slate-300 text-sm font-mono">${product.costPrice || product.price}</div>
                                                            <div class="text-xs text-slate-500">Current Cost</div>
                                                        </div>
                                                        <Plus class="w-5 h-5 text-blue-400" />
                                                    </div>
                                                </div>
                                            )}
                                        </For>
                                    </Show>
                                </div>
                            </Show>
                        </div>

                        {/* Items Table */}
                        <div class="bg-slate-950/30 rounded-xl border border-slate-800 overflow-hidden">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-950/50 text-slate-400 font-medium">
                                    <tr>
                                        <th class="p-4">Product</th>
                                        <th class="p-4 w-32">Qty</th>
                                        <th class="p-4 w-32">Unit Cost ($)</th>
                                        <th class="p-4 w-32 text-right">Total</th>
                                        <th class="p-4 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-800/50">
                                    <For each={items()}>
                                        {(item, index) => (
                                            <tr class="hover:bg-slate-800/20 transition-colors">
                                                <td class="p-4">
                                                    <div class="font-medium text-white">{item.name}</div>
                                                    <div class="text-xs text-slate-500">{item.sku}</div>
                                                </td>
                                                <td class="p-4">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.qtyOrdered}
                                                        onChange={(e) => updateItem(index(), 'qtyOrdered', Number(e.currentTarget.value))}
                                                        class="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                                    />
                                                </td>
                                                <td class="p-4">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.unitPrice}
                                                        onChange={(e) => updateItem(index(), 'unitPrice', Number(e.currentTarget.value))}
                                                        class="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                                    />
                                                </td>
                                                <td class="p-4 text-right font-mono text-slate-300">
                                                    ${Number(item.lineTotal || 0).toFixed(2)}
                                                </td>
                                                <td class="p-4 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(index())}
                                                        class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 class="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                    <Show when={items().length === 0}>
                                        <tr>
                                            <td colSpan={5} class="p-8 text-center text-slate-500">
                                                No items added using the search above
                                            </td>
                                        </tr>
                                    </Show>
                                </tbody>
                                <tfoot class="bg-slate-950/50 font-semibold text-white">
                                    <tr>
                                        <td colSpan={3} class="p-4 text-right">Total Amount</td>
                                        <td class="p-4 text-right font-mono text-xl text-blue-400">${Number(totals().total || 0).toFixed(2)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div class="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={props.onClose}
                                class="flex-1 py-3.5 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 active:scale-[0.98] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading()}
                                class="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Show when={!loading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                    <Save class="w-5 h-5" />
                                    Create Order
                                </Show>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default CreatePurchaseOrderModal;
