import { type Component, For, Show, createSignal } from 'solid-js';
import { Upload, X, GripVertical, Star, Loader2 } from 'lucide-solid';
import { api } from '../lib/api';
import { getImageUrl } from '../utils/formatters';

interface UploadedImage {
    id?: string;
    url: string;
    thumbnailUrl?: string;
    mediumUrl?: string;
    isPrimary?: boolean;
    altText?: string;
    sortOrder?: number;
}

interface ImageUploaderProps {
    images: UploadedImage[];
    onImagesChange: (images: UploadedImage[]) => void;
    maxImages?: number;
    disabled?: boolean;
}

const ImageUploader: Component<ImageUploaderProps> = (props) => {
    const [isDragging, setIsDragging] = createSignal(false);
    const [uploading, setUploading] = createSignal(false);
    const [uploadProgress, setUploadProgress] = createSignal(0);
    const [error, setError] = createSignal<string | null>(null);

    const maxImages = () => props.maxImages || 10;

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            await uploadFiles(Array.from(files));
        }
    };

    const handleFileSelect = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            await uploadFiles(Array.from(input.files));
            input.value = '';
        }
    };

    const uploadFiles = async (files: File[]) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            setError('Please select valid image files');
            return;
        }

        const remainingSlots = maxImages() - props.images.length;
        const filesToUpload = imageFiles.slice(0, remainingSlots);

        if (filesToUpload.length < imageFiles.length) {
            setError(`Only ${remainingSlots} more images can be added`);
        }

        setUploading(true);
        setError(null);

        const newImages: UploadedImage[] = [];

        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            setUploadProgress(Math.round((i / filesToUpload.length) * 100));

            try {
                const formData = new FormData();
                formData.append('file', file);

                const result: any = await api('/uploads', {
                    method: 'POST',
                    body: formData
                });

                if (result?.url) {
                    newImages.push({
                        url: result.url,
                        thumbnailUrl: result.thumbnails?.thumb,
                        mediumUrl: result.thumbnails?.medium,
                        isPrimary: props.images.length === 0 && newImages.length === 0,
                        sortOrder: props.images.length + newImages.length
                    });
                }
            } catch (err: any) {
                console.error('Upload failed:', err);
                setError(err.message || 'Failed to upload image');
            }
        }

        setUploadProgress(100);

        if (newImages.length > 0) {
            props.onImagesChange([...props.images, ...newImages]);
        }

        setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
        }, 500);
    };

    const removeImage = (index: number) => {
        const newImages = [...props.images];
        const wasFirst = newImages[index].isPrimary;
        newImages.splice(index, 1);

        // If removed was primary, set first remaining as primary
        if (wasFirst && newImages.length > 0) {
            newImages[0].isPrimary = true;
        }

        // Update sort orders
        newImages.forEach((img, i) => {
            img.sortOrder = i;
        });

        props.onImagesChange(newImages);
    };

    const setPrimary = (index: number) => {
        const newImages = props.images.map((img, i) => ({
            ...img,
            isPrimary: i === index
        }));
        props.onImagesChange(newImages);
    };

    const moveImage = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= props.images.length) return;

        const newImages = [...props.images];
        const [removed] = newImages.splice(fromIndex, 1);
        newImages.splice(toIndex, 0, removed);

        // Update sort orders
        newImages.forEach((img, i) => {
            img.sortOrder = i;
        });

        props.onImagesChange(newImages);
    };

    return (
        <div class="space-y-3">
            {/* Upload Zone */}
            <div
                class={`
                    relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
                    ${isDragging()
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
                    }
                    ${props.disabled || props.images.length >= maxImages() ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                    if (!props.disabled && props.images.length < maxImages()) {
                        document.getElementById('image-upload-input')?.click();
                    }
                }}
            >
                <Show when={uploading()} fallback={
                    <div class="flex flex-col items-center gap-2">
                        <Upload class="w-8 h-8 text-slate-400" />
                        <div class="text-sm text-slate-400">
                            <span class="font-medium text-blue-400">Click to upload</span> or drag and drop
                        </div>
                        <p class="text-xs text-slate-500">PNG, JPG, WebP up to 5MB ({props.images.length}/{maxImages()})</p>
                    </div>
                }>
                    <div class="flex flex-col items-center gap-2">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                        <div class="text-sm text-slate-400">Uploading... {uploadProgress()}%</div>
                        <div class="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                class="h-full bg-blue-500 transition-all duration-200"
                                style={{ width: `${uploadProgress()}%` }}
                            />
                        </div>
                    </div>
                </Show>

                <input
                    type="file"
                    id="image-upload-input"
                    class="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    disabled={props.disabled || props.images.length >= maxImages()}
                />
            </div>

            {/* Error Message */}
            <Show when={error()}>
                <div class="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error()}
                </div>
            </Show>

            {/* Image Grid */}
            <Show when={props.images.length > 0}>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <For each={props.images}>
                        {(image, index) => (
                            <div class="relative group aspect-square rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
                                <img
                                    src={getImageUrl(image.mediumUrl || image.thumbnailUrl || image.url)}
                                    alt={image.altText || 'Product image'}
                                    class="w-full h-full object-cover"
                                    loading="lazy"
                                />

                                {/* Overlay Controls */}
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                    <div class="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); moveImage(index(), index() - 1); }}
                                            disabled={index() === 0}
                                            class="p-1.5 bg-slate-700 rounded-lg text-white hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Move left"
                                        >
                                            <GripVertical class="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setPrimary(index()); }}
                                            class={`p-1.5 rounded-lg transition-colors ${image.isPrimary ? 'bg-yellow-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                            title={image.isPrimary ? 'Primary image' : 'Set as primary'}
                                        >
                                            <Star class="w-4 h-4" fill={image.isPrimary ? 'currentColor' : 'none'} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); removeImage(index()); }}
                                            class="p-1.5 bg-red-600 rounded-lg text-white hover:bg-red-500"
                                            title="Remove"
                                        >
                                            <X class="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Primary Badge */}
                                <Show when={image.isPrimary}>
                                    <div class="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-yellow-500 text-[10px] font-bold rounded text-black">
                                        PRIMARY
                                    </div>
                                </Show>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={props.images.length === 0 && !uploading()}>
                <div class="text-center py-4 text-slate-500 text-sm">
                    No images uploaded yet
                </div>
            </Show>
        </div>
    );
};

export default ImageUploader;
