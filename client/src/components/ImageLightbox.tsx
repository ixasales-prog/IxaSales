import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-solid';

interface LightboxImage {
    url: string;
    altText?: string;
}

interface ImageLightboxProps {
    images: LightboxImage[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
}

const ImageLightbox: Component<ImageLightboxProps> = (props) => {
    const [currentIndex, setCurrentIndex] = createSignal(props.initialIndex || 0);
    const [scale, setScale] = createSignal(1);
    const [position, setPosition] = createSignal({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = createSignal(false);
    const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

    // Reset when opening with new initial index
    createEffect(() => {
        if (props.isOpen) {
            setCurrentIndex(props.initialIndex || 0);
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    });

    // Keyboard navigation
    createEffect(() => {
        if (!props.isOpen) return;

        const handleKeydown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    props.onClose();
                    break;
                case 'ArrowLeft':
                    goToPrevious();
                    break;
                case 'ArrowRight':
                    goToNext();
                    break;
                case '+':
                case '=':
                    zoomIn();
                    break;
                case '-':
                    zoomOut();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeydown);
        onCleanup(() => document.removeEventListener('keydown', handleKeydown));
    });

    const goToPrevious = () => {
        setCurrentIndex(i => (i > 0 ? i - 1 : props.images.length - 1));
        resetZoom();
    };

    const goToNext = () => {
        setCurrentIndex(i => (i < props.images.length - 1 ? i + 1 : 0));
        resetZoom();
    };

    const zoomIn = () => {
        setScale(s => Math.min(s + 0.5, 4));
    };

    const zoomOut = () => {
        setScale(s => Math.max(s - 0.5, 0.5));
    };

    const resetZoom = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: MouseEvent) => {
        if (scale() > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position().x, y: e.clientY - position().y });
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging() && scale() > 1) {
            setPosition({
                x: e.clientX - dragStart().x,
                y: e.clientY - dragStart().y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    };

    const currentImage = () => props.images[currentIndex()];

    return (
        <Show when={props.isOpen}>
            <div
                class="fixed inset-0 z-50 bg-black/95 flex items-center justify-center pb-safe"
                onClick={(e) => {
                    if (e.target === e.currentTarget) props.onClose();
                }}
            >
                {/* Close Button */}
                <button
                    onClick={props.onClose}
                    class="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
                >
                    <X class="w-6 h-6" />
                </button>

                {/* Navigation - Previous */}
                <Show when={props.images.length > 1}>
                    <button
                        onClick={goToPrevious}
                        class="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
                    >
                        <ChevronLeft class="w-8 h-8" />
                    </button>
                </Show>

                {/* Navigation - Next */}
                <Show when={props.images.length > 1}>
                    <button
                        onClick={goToNext}
                        class="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
                    >
                        <ChevronRight class="w-8 h-8" />
                    </button>
                </Show>

                {/* Zoom Controls */}
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 rounded-full px-3 py-2 z-10">
                    <button
                        onClick={zoomOut}
                        disabled={scale() <= 0.5}
                        class="p-1 text-white hover:bg-white/20 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ZoomOut class="w-5 h-5" />
                    </button>
                    <span class="text-white text-sm min-w-[3rem] text-center">{Math.round(scale() * 100)}%</span>
                    <button
                        onClick={zoomIn}
                        disabled={scale() >= 4}
                        class="p-1 text-white hover:bg-white/20 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ZoomIn class="w-5 h-5" />
                    </button>
                </div>

                {/* Image Counter */}
                <Show when={props.images.length > 1}>
                    <div class="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm bg-white/10 px-3 py-1 rounded-full z-10">
                        {currentIndex() + 1} / {props.images.length}
                    </div>
                </Show>

                {/* Main Image */}
                <div
                    class="max-w-[90vw] max-h-[calc(85vh-2rem)] overflow-hidden select-none"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    style={{ cursor: scale() > 1 ? (isDragging() ? 'grabbing' : 'grab') : 'default' }}
                >
                    <img
                        src={currentImage()?.url}
                        alt={currentImage()?.altText || 'Image'}
                        class="max-w-full max-h-[calc(85vh-2rem)] object-contain transition-transform duration-200"
                        style={{
                            transform: `scale(${scale()}) translate(${position().x / scale()}px, ${position().y / scale()}px)`
                        }}
                        draggable="false"
                    />
                </div>

                {/* Thumbnail Strip */}
                <Show when={props.images.length > 1}>
                    <div class="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] pb-2 z-10">
                        {props.images.map((img, i) => (
                            <button
                                onClick={() => { setCurrentIndex(i); resetZoom(); }}
                                class={`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${currentIndex() === i
                                    ? 'border-blue-500 opacity-100'
                                    : 'border-transparent opacity-50 hover:opacity-75'
                                    }`}
                            >
                                <img src={img.url} alt="" class="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                </Show>
            </div>
        </Show>
    );
};

export default ImageLightbox;
