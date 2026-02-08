import { type Component, Show, For } from 'solid-js';
import {
    X,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Package
} from 'lucide-solid';

interface BatchResult {
    orderId: string;
    orderNumber: string;
    success: boolean;
    error?: string;
    previousStatus?: string;
}

interface BatchResultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    processed: number;
    succeeded: number;
    failed: number;
    results: BatchResult[];
}

const BatchResultsModal: Component<BatchResultsModalProps> = (props) => {
    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
                    {/* Header */}
                    <div class="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class={`w-12 h-12 rounded-xl flex items-center justify-center ${props.failed === 0 ? 'bg-emerald-500/20' : props.succeeded === 0 ? 'bg-red-500/20' : 'bg-yellow-500/20'
                                }`}>
                                <Show when={props.failed === 0}>
                                    <CheckCircle2 class="w-6 h-6 text-emerald-400" />
                                </Show>
                                <Show when={props.failed > 0 && props.succeeded > 0}>
                                    <AlertTriangle class="w-6 h-6 text-yellow-400" />
                                </Show>
                                <Show when={props.succeeded === 0}>
                                    <XCircle class="w-6 h-6 text-red-400" />
                                </Show>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">{props.title}</h3>
                                <p class="text-slate-400 text-sm">
                                    Batch operation completed
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={props.onClose}
                            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    {/* Summary Stats */}
                    <div class="grid grid-cols-3 gap-4 p-6 border-b border-slate-800">
                        <div class="text-center">
                            <div class="text-3xl font-bold text-white">{props.processed}</div>
                            <div class="text-slate-400 text-sm">Processed</div>
                        </div>
                        <div class="text-center">
                            <div class="text-3xl font-bold text-emerald-400">{props.succeeded}</div>
                            <div class="text-slate-400 text-sm">Succeeded</div>
                        </div>
                        <div class="text-center">
                            <div class="text-3xl font-bold text-red-400">{props.failed}</div>
                            <div class="text-slate-400 text-sm">Failed</div>
                        </div>
                    </div>

                    {/* Results List */}
                    <div class="flex-1 overflow-y-auto p-6">
                        <div class="space-y-2">
                            <For each={props.results}>
                                {(result) => (
                                    <div class={`flex items-center gap-4 p-4 rounded-xl ${result.success
                                            ? 'bg-emerald-500/5 border border-emerald-500/20'
                                            : 'bg-red-500/5 border border-red-500/20'
                                        }`}>
                                        <div class={`w-10 h-10 rounded-lg flex items-center justify-center ${result.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
                                            }`}>
                                            <Show when={result.success} fallback={
                                                <XCircle class="w-5 h-5 text-red-400" />
                                            }>
                                                <CheckCircle2 class="w-5 h-5 text-emerald-400" />
                                            </Show>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2">
                                                <Package class="w-4 h-4 text-slate-400" />
                                                <span class="text-white font-medium">{result.orderNumber}</span>
                                                <Show when={result.previousStatus}>
                                                    <span class="text-slate-500 text-xs">
                                                        (was: {result.previousStatus})
                                                    </span>
                                                </Show>
                                            </div>
                                            <Show when={result.error}>
                                                <p class="text-red-400 text-sm mt-1 truncate">{result.error}</p>
                                            </Show>
                                            <Show when={result.success && !result.error}>
                                                <p class="text-emerald-400 text-sm mt-1">Updated successfully</p>
                                            </Show>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* Footer */}
                    <div class="p-6 border-t border-slate-800 flex justify-end">
                        <button
                            onClick={props.onClose}
                            class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default BatchResultsModal;
