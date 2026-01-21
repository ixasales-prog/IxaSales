import { type Component, createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, Save, Loader2, Package } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface Brand {
    id: string;
    name: string;
    isActive: boolean;
}

interface AddBrandModalProps {
    brand?: Brand | null;
    onClose: () => void;
    onSuccess: () => void;
}

const AddBrandModal: Component<AddBrandModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [name, setName] = createSignal(props.brand?.name || '');

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (props.brand) {
                await api.put(`/products/brands/${props.brand.id}`, { name: name() });
                toast.success('Brand updated successfully');
            } else {
                await api.post('/products/brands', { name: name() });
                toast.success('Brand created successfully');
            }
            props.onSuccess();
            props.onClose();
        } catch (error: any) {
            console.error('Failed to save brand:', error);
            toast.error(error.message || 'Failed to save brand');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-xl font-bold text-white">{props.brand ? 'Edit Brand' : 'New Brand'}</h2>
                        <button
                            onClick={props.onClose}
                            class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                Brand Name <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <Package class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={name()}
                                    onInput={(e) => setName(e.currentTarget.value)}
                                    placeholder="Enter brand name"
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>
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
                                    {props.brand ? 'Update Brand' : 'Save Brand'}
                                </Show>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default AddBrandModal;
