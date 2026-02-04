import { type Component, createSignal, onCleanup, Show } from 'solid-js';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine, X } from 'lucide-solid';

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onClose: () => void;
    title?: string;
}

const BarcodeScanner: Component<BarcodeScannerProps> = (props) => {
    const [scanning, setScanning] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    let scanner: Html5Qrcode | null = null;
    let scannerElement: HTMLDivElement | undefined;

    const startScanning = async () => {
        if (!scannerElement) return;

        try {
            setError(null);
            scanner = new Html5Qrcode('barcode-scanner-region');

            await scanner.start(
                { facingMode: 'environment' }, // Use back camera
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                },
                (decodedText) => {
                    // Successfully scanned
                    props.onScan(decodedText);
                    stopScanning();
                    props.onClose();
                },
                (_errorMessage) => {
                    // Scanning error (expected, happens when no code is visible)
                    // Don't show these errors to user
                }
            );

            setScanning(true);
        } catch (err: any) {
            console.error('Failed to start scanner:', err);
            setError(err?.message || 'Failed to access camera');
            setScanning(false);
        }
    };

    const stopScanning = async () => {
        if (scanner) {
            try {
                await scanner.stop();
                scanner.clear();
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
            scanner = null;
        }
        setScanning(false);
    };

    onCleanup(() => {
        stopScanning();
    });

    return (
        <div class="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col pb-safe">
            {/* Header */}
            <div class="sticky top-0 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-bold text-white">{props.title || 'Scan Barcode'}</h2>
                    <button
                        onClick={() => {
                            stopScanning();
                            props.onClose();
                        }}
                        class="p-2 rounded-lg hover:bg-slate-800/60 transition"
                    >
                        <X class="w-6 h-6 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Scanner Area */}
            <div class="flex-1 flex flex-col items-center justify-center p-4">
                <Show when={!scanning() && !error()}>
                    <div class="text-center space-y-6">
                        <div class="w-32 h-32 mx-auto rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                            <ScanLine class="w-16 h-16 text-emerald-400" />
                        </div>
                        <div class="space-y-2">
                            <p class="text-white font-semibold">Ready to Scan</p>
                            <p class="text-slate-400 text-sm max-w-xs mx-auto">
                                Position the barcode within the frame to scan automatically
                            </p>
                        </div>
                        <button
                            onClick={startScanning}
                            class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition"
                        >
                            Start Camera
                        </button>
                    </div>
                </Show>

                <Show when={error()}>
                    <div class="text-center space-y-4">
                        <div class="text-red-400 font-semibold">Camera Error</div>
                        <div class="text-slate-400 text-sm max-w-xs mx-auto">{error()}</div>
                        <button
                            onClick={startScanning}
                            class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition"
                        >
                            Try Again
                        </button>
                    </div>
                </Show>

                <Show when={scanning()}>
                    <div class="w-full max-w-md space-y-4">
                        <div
                            id="barcode-scanner-region"
                            ref={scannerElement}
                            class="rounded-2xl overflow-hidden border-2 border-emerald-500/50"
                        />
                        <p class="text-center text-slate-400 text-sm">
                            Point camera at barcode...
                        </p>
                    </div>
                </Show>

                {/* Manual Entry Option */}
                <div class="mt-8 text-center">
                    <p class="text-slate-500 text-xs">
                        Or enter barcode manually in the search field
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BarcodeScanner;
