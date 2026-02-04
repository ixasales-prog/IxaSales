import { type Component, For, Show, createSignal } from 'solid-js';
import { Megaphone, X, Save, Loader2, CheckCircle } from 'lucide-solid';
import type { AlertType, AnnouncementSettings, RoleOption } from '../../types';

interface BroadcastModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (settings: AnnouncementSettings) => Promise<void>;
    initialSettings?: AnnouncementSettings;
}

const AVAILABLE_ROLES: RoleOption[] = [
    { id: 'super_admin', label: 'Super Admins' },
    { id: 'tenant_admin', label: 'Admins' },
    { id: 'sales_rep', label: 'Sales Reps' },
    { id: 'supervisor', label: 'Supervisors' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'driver', label: 'Drivers' },
];

const ALERT_TYPES: { value: AlertType; label: string }[] = [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'critical', label: 'Critical' },
];

const getAlertTypeStyles = (type: AlertType, isSelected: boolean): string => {
    if (!isSelected) {
        return 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700';
    }

    const styles: Record<AlertType, string> = {
        info: 'bg-blue-500/20 border-blue-500 text-blue-400',
        warning: 'bg-amber-500/20 border-amber-500 text-amber-400',
        critical: 'bg-red-500/20 border-red-500 text-red-400',
    };

    return styles[type];
};

export const BroadcastModal: Component<BroadcastModalProps> = (props) => {
    const [enabled, setEnabled] = createSignal(props.initialSettings?.enabled ?? false);
    const [message, setMessage] = createSignal(props.initialSettings?.message ?? '');
    const [alertType, setAlertType] = createSignal<AlertType>(props.initialSettings?.type ?? 'info');
    const [targetRoles, setTargetRoles] = createSignal<string[]>(props.initialSettings?.targetRoles ?? []);
    const [saving, setSaving] = createSignal(false);

    // Update state when initialSettings change
    const syncSettings = (settings?: AnnouncementSettings) => {
        if (settings) {
            setEnabled(settings.enabled);
            setMessage(settings.message);
            setAlertType(settings.type);
            setTargetRoles(settings.targetRoles || []);
        }
    };

    // Sync on initial render and when modal opens
    const handleOpen = () => {
        syncSettings(props.initialSettings);
    };

    const toggleRole = (roleId: string) => {
        const current = targetRoles();
        if (current.includes(roleId)) {
            setTargetRoles(current.filter(r => r !== roleId));
        } else {
            setTargetRoles([...current, roleId]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await props.onSave({
                enabled: enabled(),
                message: message(),
                type: alertType(),
                targetRoles: targetRoles(),
            });
            props.onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Show when={props.open}>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pb-safe" ref={handleOpen}>
                <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl relative">
                    <div class="p-6">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-xl font-bold text-white flex items-center gap-2">
                                <Megaphone class="w-6 h-6 text-amber-400" />
                                Broadcast Message
                            </h3>
                            <button
                                onClick={props.onClose}
                                class="text-slate-400 hover:text-white transition-colors"
                            >
                                <X class="w-6 h-6" />
                            </button>
                        </div>

                        <div class="space-y-4">
                            {/* Enable Toggle */}
                            <div class="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                <div class="text-slate-300 font-medium">Enable Announcement</div>
                                <button
                                    onClick={() => setEnabled(!enabled())}
                                    class={`w-12 h-6 rounded-full transition-colors relative ${enabled() ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                >
                                    <div class={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled() ? 'left-7' : 'left-1'}`}></div>
                                </button>
                            </div>

                            {/* Alert Type */}
                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1.5">Alert Type</label>
                                <div class="grid grid-cols-3 gap-2">
                                    <For each={ALERT_TYPES}>
                                        {(type) => (
                                            <button
                                                onClick={() => setAlertType(type.value)}
                                                class={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${getAlertTypeStyles(type.value, alertType() === type.value)}`}
                                            >
                                                {type.label}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </div>

                            {/* Message */}
                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-1.5">Message</label>
                                <textarea
                                    value={message()}
                                    onInput={(e) => setMessage(e.currentTarget.value)}
                                    class="w-full h-32 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                    placeholder="Enter global announcement message..."
                                ></textarea>
                            </div>

                            {/* Target Roles */}
                            <div>
                                <label class="block text-sm font-medium text-slate-400 mb-2">Target Audience</label>
                                <div class="grid grid-cols-2 gap-2">
                                    <For each={AVAILABLE_ROLES}>
                                        {(role) => (
                                            <button
                                                onClick={() => toggleRole(role.id)}
                                                class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${targetRoles().includes(role.id)
                                                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                                    }`}
                                            >
                                                <div class={`w-4 h-4 rounded border flex items-center justify-center ${targetRoles().includes(role.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-500'
                                                    }`}>
                                                    <Show when={targetRoles().includes(role.id)}>
                                                        <CheckCircle class="w-3 h-3 text-white" />
                                                    </Show>
                                                </div>
                                                {role.label}
                                            </button>
                                        )}
                                    </For>
                                </div>
                                <p class="text-xs text-slate-500 mt-2">
                                    {targetRoles().length === 0 ? 'Visible to everyone' : `Visible to ${targetRoles().length} selected roles only`}
                                </p>
                            </div>
                        </div>

                        <div class="mt-8 flex gap-3">
                            <button
                                onClick={props.onClose}
                                class="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving()}
                                class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Show when={!saving()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                    <Save class="w-5 h-5" />
                                </Show>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default BroadcastModal;
