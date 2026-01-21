import { type Component, createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, Save, Loader2, Building2, User, Phone, Mail, MapPin } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface Supplier {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
}

interface AddSupplierModalProps {
    supplier?: Supplier | null;
    onClose: () => void;
    onSuccess: () => void;
}

const AddSupplierModal: Component<AddSupplierModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [formData, setFormData] = createSignal({
        name: props.supplier?.name || '',
        contactPerson: props.supplier?.contactPerson || '',
        phone: props.supplier?.phone || '',
        email: props.supplier?.email || '',
        address: props.supplier?.address || ''
    });

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (props.supplier) {
                await api.put(`/procurement/suppliers/${props.supplier.id}`, formData());
                toast.success('Supplier updated successfully');
            } else {
                await api.post('/procurement/suppliers', formData());
                toast.success('Supplier added successfully');
            }
            props.onSuccess();
            props.onClose();
        } catch (error: any) {
            console.error('Failed to save supplier:', error);
            toast.error(error.message || 'Failed to save supplier');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] overflow-y-auto flex items-end sm:items-center justify-center p-4">
                <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h2 class="text-xl font-bold text-white">{props.supplier ? 'Edit Supplier' : 'Add Supplier'}</h2>
                            <p class="text-slate-400 text-sm mt-1">{props.supplier ? 'Update supplier details' : 'Register a new vendor'}</p>
                        </div>
                        <button onClick={props.onClose} class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-4">
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Company Name <span class="text-red-400">*</span></label>
                            <div class="relative group">
                                <Building2 class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={formData().name}
                                    onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    placeholder="e.g. Acme Corp"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Contact Person</label>
                                <div class="relative group">
                                    <User class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input
                                        type="text"
                                        value={formData().contactPerson}
                                        onInput={(e) => setFormData({ ...formData(), contactPerson: e.currentTarget.value })}
                                        class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Phone</label>
                                <div class="relative group">
                                    <Phone class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input
                                        type="tel"
                                        value={formData().phone}
                                        onInput={(e) => setFormData({ ...formData(), phone: e.currentTarget.value })}
                                        class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                        placeholder="+1 234 567 890"
                                    />
                                </div>
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                            <div class="relative group">
                                <Mail class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="email"
                                    value={formData().email}
                                    onInput={(e) => setFormData({ ...formData(), email: e.currentTarget.value })}
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    placeholder="contact@acme.com"
                                />
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Address</label>
                            <div class="relative group">
                                <MapPin class="absolute left-4 top-3 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <textarea
                                    value={formData().address}
                                    onInput={(e) => setFormData({ ...formData(), address: e.currentTarget.value })}
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium resize-none h-24"
                                    placeholder="123 Business St, Enterprise City"
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
                                    {props.supplier ? 'Update Supplier' : 'Save Supplier'}
                                </Show>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default AddSupplierModal;
