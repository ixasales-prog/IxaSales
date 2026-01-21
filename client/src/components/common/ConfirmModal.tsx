import { type Component, createSignal, Show } from 'solid-js';
import { AlertTriangle, Loader2 } from 'lucide-solid';

interface ConfirmModalProps {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: Component<ConfirmModalProps> = (props) => {
    const variant = () => props.variant || 'warning';

    const variantStyles = {
        danger: {
            iconBg: 'bg-red-500/10',
            iconColor: 'text-red-400',
            buttonBg: 'from-red-600 to-red-700',
            buttonShadow: 'hover:shadow-red-500/20'
        },
        warning: {
            iconBg: 'bg-amber-500/10',
            iconColor: 'text-amber-400',
            buttonBg: 'from-amber-600 to-orange-600',
            buttonShadow: 'hover:shadow-amber-500/20'
        },
        info: {
            iconBg: 'bg-blue-500/10',
            iconColor: 'text-blue-400',
            buttonBg: 'from-blue-600 to-indigo-600',
            buttonShadow: 'hover:shadow-blue-500/20'
        }
    };

    const styles = () => variantStyles[variant()];

    return (
        <Show when={props.open}>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
                    <div class="p-6">
                        <div class="flex items-start gap-4 mb-4">
                            <div class={`w-12 h-12 rounded-xl ${styles().iconBg} flex items-center justify-center shrink-0`}>
                                <AlertTriangle class={`w-6 h-6 ${styles().iconColor}`} />
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-white mb-1">{props.title}</h3>
                                <p class="text-slate-400 text-sm">{props.message}</p>
                            </div>
                        </div>

                        <div class="flex gap-3 mt-6">
                            <button
                                onClick={props.onCancel}
                                disabled={props.loading}
                                class="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors disabled:opacity-50"
                            >
                                {props.cancelText || 'Cancel'}
                            </button>
                            <button
                                onClick={props.onConfirm}
                                disabled={props.loading}
                                class={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r ${styles().buttonBg} text-white font-medium hover:shadow-lg ${styles().buttonShadow} transition-all flex items-center justify-center gap-2 disabled:opacity-50`}
                            >
                                <Show when={props.loading}>
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                </Show>
                                {props.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Show>
    );
};

// Helper hook for managing confirm modal state
export function createConfirmModal() {
    const [open, setOpen] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    const [config, setConfig] = createSignal<{
        title: string;
        message: string;
        variant?: 'danger' | 'warning' | 'info';
        confirmText?: string;
        onConfirm: () => Promise<void> | void;
    }>({
        title: '',
        message: '',
        onConfirm: () => { }
    });

    const show = (options: typeof config extends () => infer T ? T : never) => {
        setConfig(options);
        setOpen(true);
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await config().onConfirm();
            setOpen(false);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setOpen(false);
    };

    return {
        open,
        loading,
        config,
        show,
        handleConfirm,
        handleCancel
    };
}

export default ConfirmModal;
