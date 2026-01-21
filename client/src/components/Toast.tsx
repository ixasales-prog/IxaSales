/**
 * Toast Notifications - Unified Component
 * 
 * Global toast notification system used across all portals.
 * Single source of truth for toast functionality.
 */

import { type Component, createSignal, For, Show } from 'solid-js';
import { CheckCircle, AlertTriangle, Info, X, AlertCircle } from 'lucide-solid';

// ============================================================================
// TYPES
// ============================================================================

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

// ============================================================================
// TOAST STORE (Global)
// ============================================================================

let toastId = 0;
const [toasts, setToasts] = createSignal<Toast[]>([]);

/**
 * Show a toast notification
 */
export function showToast(message: string, type: ToastType = 'info', duration = 4000): number {
    const id = ++toastId;

    setToasts(prev => [...prev, { id, type, message }]);

    if (duration > 0) {
        setTimeout(() => {
            dismissToast(id);
        }, duration);
    }

    return id;
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: number): void {
    setToasts(prev => prev.filter(t => t.id !== id));
}

/**
 * Convenience methods
 */
export const toast = {
    success: (message: string, duration?: number) => showToast(message, 'success', duration),
    error: (message: string, duration?: number) => showToast(message, 'error', duration ?? 5000),
    info: (message: string, duration?: number) => showToast(message, 'info', duration),
    warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
};

// ============================================================================
// TOAST STYLES
// ============================================================================

const toastStyles: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon: 'text-emerald-400'
    },
    error: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        icon: 'text-red-400'
    },
    warning: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        icon: 'text-amber-400'
    },
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon: 'text-blue-400'
    }
};

// ============================================================================
// TOAST ICON COMPONENT
// ============================================================================

const ToastIcon: Component<{ type: ToastType }> = (props) => {
    const iconClass = () => `w-5 h-5 ${toastStyles[props.type].icon}`;

    return (
        <Show when={props.type === 'success'} fallback={
            <Show when={props.type === 'error'} fallback={
                <Show when={props.type === 'warning'} fallback={
                    <Info class={iconClass()} />
                }>
                    <AlertTriangle class={iconClass()} />
                </Show>
            }>
                <AlertCircle class={iconClass()} />
            </Show>
        }>
            <CheckCircle class={iconClass()} />
        </Show>
    );
};

// ============================================================================
// TOAST CONTAINER COMPONENT
// ============================================================================

/**
 * Toast container component - render this at the app root level
 */
export const ToastContainer: Component = () => {
    return (
        <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
            <For each={toasts()}>
                {(t) => (
                    <div
                        class={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-xl animate-slide-in ${toastStyles[t.type].bg} ${toastStyles[t.type].border}`}
                    >
                        <ToastIcon type={t.type} />
                        <p class="text-sm text-white flex-1">{t.message}</p>
                        <button
                            onClick={() => dismissToast(t.id)}
                            class="text-slate-400 hover:text-white transition-colors"
                        >
                            <X class="w-4 h-4" />
                        </button>
                    </div>
                )}
            </For>
        </div>
    );
};

export default toast;
