import { type Component, createSignal } from 'solid-js';
import { X, Loader2, CarFront } from 'lucide-solid';
import { api } from '../../lib/api';

interface AddVehicleModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const AddVehicleModal: Component<AddVehicleModalProps> = (props) => {
    const [submitting, setSubmitting] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const [name, setName] = createSignal('');
    const [plateNumber, setPlateNumber] = createSignal('');
    const [capacity, setCapacity] = createSignal('');

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api.post('/delivery/vehicles', {
                name: name(),
                plateNumber: plateNumber(),
                capacity: capacity() ? parseInt(capacity()) : undefined,
            });

            props.onSuccess();
            props.onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to add vehicle');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <CarFront class="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 class="text-xl font-bold text-white">Add Vehicle</h2>
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
                        <label class="text-sm font-medium text-slate-300">Vehicle Name *</label>
                        <input
                            type="text"
                            required
                            value={name()}
                            onInput={(e) => setName(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Delivery Van 1"
                        />
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Plate Number *</label>
                        <input
                            type="text"
                            required
                            value={plateNumber()}
                            onInput={(e) => setPlateNumber(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. ABC-1234"
                        />
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-slate-300">Capacity (units)</label>
                        <input
                            type="number"
                            min="0"
                            value={capacity()}
                            onInput={(e) => setCapacity(e.currentTarget.value)}
                            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Optional"
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
                                    Adding...
                                </>
                            ) : (
                                'Add Vehicle'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddVehicleModal;
