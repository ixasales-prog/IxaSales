import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { Plus, Search, Loader2, RefreshCw, CarFront, Truck } from 'lucide-solid';
import { api } from '../../lib/api';
import AddVehicleModal from './AddVehicleModal';

interface Vehicle {
    id: string;
    name: string;
    plateNumber: string;
    capacity: number | null;
    isActive: boolean;
    createdAt: string;
}

const Vehicles: Component = () => {
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [search, setSearch] = createSignal('');

    const [vehicles, { refetch }] = createResource(async () => {
        const response = await api.get<Vehicle[]>('/delivery/vehicles');
        return response || [];
    });

    const filteredVehicles = () => {
        const query = search().toLowerCase();
        return vehicles()?.filter((v: Vehicle) =>
            v.name.toLowerCase().includes(query) ||
            v.plateNumber.toLowerCase().includes(query)
        ) || [];
    };

    return (
        <div class="p-4 sm:p-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Vehicles</h1>
                    <p class="text-slate-400 mt-1">Manage your delivery fleet</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    class="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    Add Vehicle
                </button>
            </div>

            {/* Search */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search vehicles..."
                        class="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                    />
                </div>
                <button
                    onClick={() => refetch()}
                    class="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                    title="Refresh list"
                >
                    <RefreshCw class="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!vehicles.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading vehicles...</p>
                    </div>
                }>
                    <Show when={filteredVehicles().length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <Truck class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No vehicles found</p>
                            <p class="text-sm">Add vehicles to your delivery fleet.</p>
                        </div>
                    }>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                            <For each={filteredVehicles()}>
                                {(vehicle) => (
                                    <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-blue-500/50 transition-colors">
                                        <div class="flex items-start gap-4">
                                            <div class="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                                <CarFront class="w-6 h-6 text-blue-400" />
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center justify-between gap-2">
                                                    <h3 class="text-white font-semibold truncate">{vehicle.name}</h3>
                                                    <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${vehicle.isActive
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : 'bg-red-500/10 text-red-400'
                                                        }`}>
                                                        {vehicle.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                                <div class="text-slate-400 text-sm mt-1">{vehicle.plateNumber}</div>
                                                <Show when={vehicle.capacity}>
                                                    <div class="text-slate-500 text-xs mt-2">
                                                        Capacity: {vehicle.capacity} units
                                                    </div>
                                                </Show>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={showAddModal()}>
                <AddVehicleModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => refetch()}
                />
            </Show>
        </div>
    );
};

export default Vehicles;
