import { type Component, Show, createSignal, For } from 'solid-js';
import {
    X,
    CheckCircle2,
    Truck,
    XCircle,
    Loader2,
    ChevronDown,
    AlertTriangle,
    ChevronLeft
} from 'lucide-solid';

interface BatchOrderToolbarProps {
    selectedCount: number;
    selectedOrders: Array<{ id: string; orderNumber: string; status: string }>;
    onClearSelection: () => void;
    onBatchStatusChange: (status: string, notes?: string, driverId?: string) => Promise<void>;
    onBatchCancel: (reason?: string) => Promise<void>;
    drivers: Array<{ id: string; name: string }>;
    isLoading: boolean;
}

const BatchOrderToolbar: Component<BatchOrderToolbarProps> = (props) => {
    const [showStatusDropdown, setShowStatusDropdown] = createSignal(false);
    const [showDriverSelection, setShowDriverSelection] = createSignal(false);
    const [pendingStatus, setPendingStatus] = createSignal<string | null>(null);
    const [showCancelModal, setShowCancelModal] = createSignal(false);
    const [cancelReason, setCancelReason] = createSignal('');

    const statusOptions = [
        { value: 'confirmed', label: 'Confirmed', color: 'text-blue-400', requiresDriver: false },
        { value: 'approved', label: 'Approved', color: 'text-green-400', requiresDriver: false },
        { value: 'picking', label: 'Picking', color: 'text-purple-400', requiresDriver: false },
        { value: 'picked', label: 'Picked', color: 'text-indigo-400', requiresDriver: false },
        { value: 'loaded', label: 'Loaded', color: 'text-cyan-400', requiresDriver: true },
        { value: 'delivering', label: 'Delivering', color: 'text-orange-400', requiresDriver: false },
        { value: 'delivered', label: 'Delivered', color: 'text-emerald-400', requiresDriver: false },
    ];

    const handleStatusSelect = async (status: string, requiresDriver: boolean) => {
        if (requiresDriver && props.drivers.length > 0) {
            // Show driver selection step
            setPendingStatus(status);
            setShowDriverSelection(true);
            setShowStatusDropdown(false);
        } else {
            // Proceed directly with status change
            setShowStatusDropdown(false);
            await props.onBatchStatusChange(status);
        }
    };

    const handleDriverSelect = async (driverId: string) => {
        const status = pendingStatus();
        if (status) {
            setShowDriverSelection(false);
            setPendingStatus(null);
            await props.onBatchStatusChange(status, undefined, driverId);
        }
    };

    const handleSkipDriver = async () => {
        const status = pendingStatus();
        if (status) {
            setShowDriverSelection(false);
            setPendingStatus(null);
            await props.onBatchStatusChange(status);
        }
    };

    const handleCancel = async () => {
        setShowCancelModal(false);
        await props.onBatchCancel(cancelReason());
        setCancelReason('');
    };

    const canCancel = () => {
        const cancellable = ['pending', 'confirmed'];
        return props.selectedOrders.some(o => cancellable.includes(o.status));
    };

    const closeDropdowns = () => {
        setShowStatusDropdown(false);
        setShowDriverSelection(false);
        setPendingStatus(null);
    };

    return (
        <>
            {/* Click outside to close dropdowns */}
            <Show when={showStatusDropdown() || showDriverSelection()}>
                <div
                    class="fixed inset-0 z-[90]"
                    onClick={closeDropdowns}
                />
            </Show>

            {/* Inline Action Bar */}
            <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-3 relative z-[95]">
                {/* Left: Selection Count */}
                <div class="flex items-center gap-2">
                    <span class="text-blue-400 font-medium">
                        {props.selectedCount} order{props.selectedCount > 1 ? 's' : ''} selected
                    </span>
                </div>

                {/* Right: Action Buttons */}
                <div class="flex items-center gap-2 flex-wrap">
                    {/* Change Status Dropdown */}
                    <div class="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDriverSelection(false);
                                setPendingStatus(null);
                                setShowStatusDropdown(!showStatusDropdown());
                            }}
                            disabled={props.isLoading}
                            class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border border-slate-700"
                        >
                            <Show when={props.isLoading} fallback={<CheckCircle2 class="w-4 h-4 text-blue-400" />}>
                                <Loader2 class="w-4 h-4 animate-spin" />
                            </Show>
                            Change Status
                            <ChevronDown class="w-3.5 h-3.5" />
                        </button>

                        {/* Status Selection */}
                        <Show when={showStatusDropdown()}>
                            <div
                                class="absolute left-0 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-[100]"
                                style={{ top: '100%', "margin-top": '4px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div class="py-1 max-h-64 overflow-y-auto">
                                    <For each={statusOptions}>
                                        {(option) => (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStatusSelect(option.value, option.requiresDriver);
                                                }}
                                                class="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors text-left group"
                                            >
                                                <div class="flex items-center gap-2">
                                                    <span class={`w-2 h-2 rounded-full ${option.color.replace('text-', 'bg-')}`}></span>
                                                    <span class="text-white text-sm">{option.label}</span>
                                                </div>
                                                <Show when={option.requiresDriver && props.drivers.length > 0}>
                                                    <Truck class="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                                                </Show>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>

                        {/* Driver Selection (shown after selecting "Loaded") */}
                        <Show when={showDriverSelection()}>
                            <div
                                class="absolute left-0 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-[100]"
                                style={{ top: '100%', "margin-top": '4px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Header */}
                                <div class="px-3 py-2 border-b border-slate-700 bg-slate-900/50">
                                    <div class="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowDriverSelection(false);
                                                setShowStatusDropdown(true);
                                            }}
                                            class="p-1 hover:bg-slate-700 rounded transition-colors"
                                        >
                                            <ChevronLeft class="w-4 h-4 text-slate-400" />
                                        </button>
                                        <div class="flex items-center gap-2">
                                            <Truck class="w-4 h-4 text-emerald-400" />
                                            <span class="text-white text-sm font-medium">Select Driver</span>
                                        </div>
                                    </div>
                                    <p class="text-slate-500 text-xs mt-1 ml-7">
                                        Assign driver for delivery
                                    </p>
                                </div>

                                {/* Driver List */}
                                <div class="py-1 max-h-48 overflow-y-auto">
                                    <For each={props.drivers}>
                                        {(driver) => (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDriverSelect(driver.id);
                                                }}
                                                class="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 transition-colors text-left"
                                            >
                                                <div class="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                    <Truck class="w-3.5 h-3.5 text-emerald-400" />
                                                </div>
                                                <span class="text-white text-sm">{driver.name}</span>
                                            </button>
                                        )}
                                    </For>
                                </div>

                                {/* Skip Option */}
                                <div class="px-3 py-2 border-t border-slate-700">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSkipDriver();
                                        }}
                                        class="w-full text-center text-slate-400 hover:text-white text-xs py-1 transition-colors"
                                    >
                                        Skip for now
                                    </button>
                                </div>
                            </div>
                        </Show>
                    </div>

                    {/* Cancel Button */}
                    <button
                        onClick={() => setShowCancelModal(true)}
                        disabled={props.isLoading || !canCancel()}
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border border-red-500/30"
                        title={!canCancel() ? 'Only pending/confirmed orders can be cancelled' : ''}
                    >
                        <XCircle class="w-4 h-4" />
                        Cancel
                    </button>

                    {/* Divider */}
                    <div class="w-px h-6 bg-slate-700 mx-1"></div>

                    {/* Clear Selection */}
                    <button
                        onClick={props.onClearSelection}
                        class="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm transition-colors"
                    >
                        Clear Selection
                        <X class="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Cancel Confirmation Modal */}
            <Show when={showCancelModal()}>
                <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
                        <div class="p-6 border-b border-slate-800">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                    <AlertTriangle class="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold text-white">Cancel Orders</h3>
                                    <p class="text-slate-400 text-sm">This action cannot be undone</p>
                                </div>
                            </div>
                        </div>

                        <div class="p-6 space-y-4">
                            <p class="text-slate-300">
                                Are you sure you want to cancel <strong class="text-white">{props.selectedCount}</strong> selected orders?
                            </p>

                            <Show when={!canCancel()}>
                                <div class="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                                    <AlertTriangle class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                    <p class="text-yellow-300 text-sm">
                                        Some orders cannot be cancelled because they are already being processed.
                                        Only pending and confirmed orders will be cancelled.
                                    </p>
                                </div>
                            </Show>

                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-2">
                                    Cancellation Reason (optional)
                                </label>
                                <textarea
                                    value={cancelReason()}
                                    onInput={(e) => setCancelReason(e.currentTarget.value)}
                                    placeholder="Enter reason for cancellation..."
                                    rows={3}
                                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div class="p-6 border-t border-slate-800 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                class="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={props.isLoading}
                                class="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <Show when={props.isLoading}>
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                </Show>
                                Cancel Orders
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </>
    );
};

export default BatchOrderToolbar;
