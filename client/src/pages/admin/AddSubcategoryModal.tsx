import { type Component, createSignal } from 'solid-js';
import { X, Loader2, Tag } from 'lucide-solid';
import { api } from '../../lib/api';

interface Subcategory {
    id: string;
    categoryId: string;
    name: string;
    isActive: boolean;
}

interface AddSubcategoryModalProps {
    categoryId: string;
    categoryName: string;
    subcategory?: Subcategory | null;
    onClose: () => void;
    onSuccess: () => void;
}

const AddSubcategoryModal: Component<AddSubcategoryModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [name, setName] = createSignal(props.subcategory?.name || '');

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            if (props.subcategory) {
                await api.put(`/products/subcategories/${props.subcategory.id}`, {
                    name: name(),
                });
            } else {
                await api.post('/products/subcategories', {
                    categoryId: props.categoryId,
                    name: name(),
                });
            }

            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save subcategory');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                            <Tag class="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-white">{props.subcategory ? 'Edit Subcategory' : 'Add Subcategory'}</h2>
                            <p class="text-sm text-slate-400">Under: {props.categoryName}</p>
                        </div>
                    </div>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white transition-colors">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} class="p-6 space-y-4">
                    {error() && (
                        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {error()}
                        </div>
                    )}

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Subcategory Name *</label>
                        <input
                            type="text"
                            required
                            value={name()}
                            onInput={(e) => setName(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Enter subcategory name"
                        />
                    </div>

                    <div class="pt-4 flex justify-end gap-3 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={props.onClose}
                            class="px-5 py-2.5 text-slate-300 font-medium hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting()}
                            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting() ? (
                                <>
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                props.subcategory ? 'Update Subcategory' : 'Create Subcategory'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddSubcategoryModal;
