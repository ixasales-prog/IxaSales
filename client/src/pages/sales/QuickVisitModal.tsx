import { type Component, For, Show, createSignal, createResource } from 'solid-js';
import {
    X,
    Camera,
    Package,
    XCircle,
    Clock,
    Loader2,
    Search,
    User,
    ChevronRight,
    MapPin,
    Calendar,
    Check
} from 'lucide-solid';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import toast from '../../components/Toast';
import { setCustomer, setPendingVisit } from '../../stores/cart';

// API base URL for constructing absolute image URLs
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper to get absolute image URL
const getImageUrl = (url: string | null): string => {
    if (!url) return '';
    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    // If URL starts with /uploads, it's a static asset served from root, not /api
    if (url.startsWith('/uploads')) {
        // Strip '/api' from the end of API_BASE_URL if present
        const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
        return `${baseUrl}${url}`;
    }

    // Fallback for other paths
    return `${API_BASE_URL}${url}`;
};

interface Customer {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
}

interface QuickVisitModalProps {
    onClose: () => void;
    onOrderPlaced: (customerId: string) => void;
    onVisitCompleted: () => void;
}

type Step = 'customer' | 'photo' | 'outcome' | 'no_order' | 'follow_up';

const NO_ORDER_REASONS = [
    'closed',
    'has_stock',
    'high_price',
    'competitor',
    'no_budget',
    'payment_issue',
    'quality_issue',
    'not_interested',
    'other'
] as const;

const FOLLOW_UP_REASONS = [
    'owner_absent',
    'decision_pending',
    'busy_now',
    'callback_requested',
    'delivery_awaited',
    'other'
] as const;

const QuickVisitModal: Component<QuickVisitModalProps> = (props) => {
    const { t } = useI18n();

    // Current step in the flow
    const [step, setStep] = createSignal<Step>('customer');
    const [loading, setLoading] = createSignal(false);

    // Selected data
    const [selectedCustomer, setSelectedCustomer] = createSignal<Customer | null>(null);
    const [photo, setPhoto] = createSignal<string | null>(null);
    const [photoPreview, setPhotoPreview] = createSignal<string | null>(null);
    const [photoUploading, setPhotoUploading] = createSignal(false);

    // GPS coordinates
    const [latitude, setLatitude] = createSignal<number | undefined>();
    const [longitude, setLongitude] = createSignal<number | undefined>();

    // No order form
    const [noOrderReason, setNoOrderReason] = createSignal('');
    const [customNote, setCustomNote] = createSignal('');

    // Follow up form
    const [followUpReason, setFollowUpReason] = createSignal('');
    const [followUpDate, setFollowUpDate] = createSignal((() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    })());
    const [followUpTime, setFollowUpTime] = createSignal('10:00');
    const [followUpNote, setFollowUpNote] = createSignal('');

    // Customer search
    const [customerSearch, setCustomerSearch] = createSignal('');

    let fileInputRef: HTMLInputElement | undefined;

    // Fetch customers
    const [customers] = createResource(
        () => customerSearch(),
        async (search) => {
            const params: Record<string, string> = { limit: '30' };
            if (search) params.search = search;
            return await api<Customer[]>('/customers', { params });
        }
    );

    // Capture GPS on mount
    const captureGPS = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLatitude(position.coords.latitude);
                    setLongitude(position.coords.longitude);
                },
                () => {
                    // Silently fail - GPS is optional
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    };

    // Handle customer selection
    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        captureGPS();
        setStep('photo');
    };

    // Compress image before upload
    const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.7): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                // Create canvas and compress
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to compress image'));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    };

    // Handle photo capture
    const handlePhotoCapture = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        setPhotoUploading(true);

        try {
            // Compress image before upload
            const compressedBlob = await compressImage(file);
            const compressedFile = new File([compressedBlob], 'photo.jpg', { type: 'image/jpeg' });

            // Set local preview immediately
            setPhotoPreview(URL.createObjectURL(compressedBlob));

            const formData = new FormData();
            formData.append('file', compressedFile);

            const res = await api.post('/uploads', formData) as any;
            if (res.url) {
                setPhoto(res.url);
            }
        } catch (error) {
            console.error('Photo upload failed:', error);
            toast.error(t('salesApp.quickVisit.photoUploadFailed'));
        } finally {
            setPhotoUploading(false);
            if (fileInputRef) fileInputRef.value = '';
        }
    };

    // Skip photo
    const handleSkipPhoto = () => {
        setStep('outcome');
    };

    // Photo captured, go to outcome
    const handlePhotoNext = () => {
        setStep('outcome');
    };

    // Handle outcome selection
    const handleOutcomeSelect = (outcome: 'order_placed' | 'no_order' | 'follow_up') => {
        if (outcome === 'order_placed') {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date().toTimeString().slice(0, 5);

            setPendingVisit({
                customerId: selectedCustomer()!.id,
                outcome: 'order_placed',
                plannedDate: today,
                plannedTime: now,
                photo: photo() || undefined,
                latitude: latitude() !== undefined ? latitude() : undefined,
                longitude: longitude() !== undefined ? longitude() : undefined
            });

            // Set the customer in the cart store to avoid re-selection
            setCustomer(selectedCustomer()!.id);
            props.onOrderPlaced(selectedCustomer()!.id);
        } else if (outcome === 'no_order') {
            setStep('no_order');
        } else if (outcome === 'follow_up') {
            setStep('follow_up');
        }
    };

    // Create quick visit
    const createQuickVisit = async (
        outcome: string,
        extraData: Record<string, any> = {}
    ) => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date().toTimeString().slice(0, 5);

            const payload: any = {
                customerId: selectedCustomer()!.id,
                outcome,
                plannedDate: today,
                plannedTime: now,
                ...extraData
            };

            // Only add photo if it exists
            if (photo()) {
                payload.photo = photo();
            }

            // Only add GPS if captured
            if (latitude() !== undefined) {
                payload.latitude = latitude();
                payload.longitude = longitude();
            }

            await api.post('/visits/quick', payload);

            toast.success(t('salesApp.quickVisit.visitCompleted'));
            props.onVisitCompleted();
        } catch (error: any) {
            console.error('Failed to create visit:', error);
            console.error('Error details:', error?.message);
            toast.error(t('salesApp.quickVisit.visitFailed'));
        } finally {
            setLoading(false);
        }
    };

    // Submit no order
    const handleNoOrderSubmit = () => {
        if (!noOrderReason()) {
            toast.error(t('salesApp.quickVisit.selectReason'));
            return;
        }

        createQuickVisit('no_order', {
            noOrderReason: noOrderReason(),
            outcomeNotes: noOrderReason() === 'other' ? customNote() : undefined
        });
    };

    // Submit follow up
    const handleFollowUpSubmit = () => {
        if (!followUpReason()) {
            toast.error(t('salesApp.quickVisit.selectReason'));
            return;
        }

        createQuickVisit('follow_up', {
            followUpReason: followUpReason(),
            followUpDate: followUpDate(),
            followUpTime: followUpTime(),
            outcomeNotes: followUpNote() || undefined
        });
    };

    return (
        <div class="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-sm overflow-y-auto pb-safe">
            {/* Header */}
            <div class="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center justify-between px-4 py-3">
                    <h2 class="text-lg font-bold text-white">
                        {t('salesApp.quickVisit.title')}
                    </h2>
                    <button
                        onClick={props.onClose}
                        class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                    >
                        <X class="w-5 h-5" />
                    </button>
                </div>

                {/* Progress indicator */}
                <div class="px-4 pb-3">
                    <div class="flex items-center gap-2">
                        <div class={`h-1 flex-1 rounded-full ${step() !== 'customer' ? 'bg-blue-500' : 'bg-slate-700'}`} />
                        <div class={`h-1 flex-1 rounded-full ${['outcome', 'no_order', 'follow_up'].includes(step()) ? 'bg-blue-500' : 'bg-slate-700'}`} />
                        <div class={`h-1 flex-1 rounded-full ${['no_order', 'follow_up'].includes(step()) ? 'bg-blue-500' : 'bg-slate-700'}`} />
                    </div>
                </div>
            </div>

            {/* Step 1: Customer Selection */}
            <Show when={step() === 'customer'}>
                <div class="p-4">
                    {/* Search */}
                    <div class="relative mb-4">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={customerSearch()}
                            onInput={(e) => setCustomerSearch(e.currentTarget.value)}
                            placeholder={t('salesApp.quickVisit.searchCustomer')}
                            class="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>

                    {/* Customer list */}
                    <Show when={customers.loading}>
                        <div class="flex items-center justify-center py-12">
                            <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                        </div>
                    </Show>

                    <Show when={!customers.loading && customers()}>
                        <div class="space-y-2">
                            <For each={customers()}>
                                {(customer) => (
                                    <button
                                        onClick={() => handleCustomerSelect(customer)}
                                        class="w-full bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
                                    >
                                        <div class="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
                                            {customer.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-white font-medium truncate">{customer.name}</div>
                                            <Show when={customer.address}>
                                                <div class="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                                                    <MapPin class="w-3 h-3" />
                                                    <span class="truncate">{customer.address}</span>
                                                </div>
                                            </Show>
                                        </div>
                                        <ChevronRight class="w-5 h-5 text-slate-600" />
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>

                    <Show when={!customers.loading && (!customers() || customers()!.length === 0)}>
                        <div class="text-center py-12">
                            <User class="w-12 h-12 text-slate-600 mx-auto mb-3" />
                            <p class="text-slate-400">{t('salesApp.quickVisit.noCustomers')}</p>
                        </div>
                    </Show>
                </div>
            </Show>

            {/* Step 2: Photo Capture */}
            <Show when={step() === 'photo'}>
                <div class="p-4">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                            <Camera class="w-8 h-8 text-blue-400" />
                        </div>
                        <h3 class="text-white font-semibold text-lg mb-1">
                            {t('salesApp.quickVisit.takePhoto')}
                        </h3>
                        <p class="text-slate-400 text-sm">
                            {selectedCustomer()?.name}
                        </p>
                    </div>

                    {/* Photo preview */}
                    <Show when={photoPreview() || photo()}>
                        <div class="relative mb-4 rounded-xl overflow-hidden">
                            <img src={photoPreview() || getImageUrl(photo())} class="w-full h-48 object-cover" />
                            <button
                                onClick={() => {
                                    setPhoto(null);
                                    setPhotoPreview(null);
                                }}
                                class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white"
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </div>
                    </Show>

                    {/* Camera button */}
                    <Show when={!photo() && !photoPreview()}>
                        <button
                            onClick={() => fileInputRef?.click()}
                            disabled={photoUploading()}
                            class="w-full py-16 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors mb-4"
                        >
                            <Show when={photoUploading()} fallback={<Camera class="w-10 h-10" />}>
                                <Loader2 class="w-10 h-10 animate-spin text-blue-400" />
                            </Show>
                            <span>{photoUploading() ? t('salesApp.quickVisit.uploading') : t('salesApp.quickVisit.tapToCapture')}</span>
                        </button>
                    </Show>

                    <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        capture="environment"
                        class="hidden"
                        onChange={handlePhotoCapture}
                    />

                    {/* Actions */}
                    <div class="flex gap-3 mt-6">
                        <button
                            onClick={handleSkipPhoto}
                            class="flex-1 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl"
                        >
                            {t('salesApp.quickVisit.skip')}
                        </button>
                        <button
                            onClick={handlePhotoNext}
                            disabled={!photo()}
                            class="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
                        >
                            {t('salesApp.quickVisit.next')}
                        </button>
                    </div>
                </div>
            </Show>

            {/* Step 3: Outcome Selection */}
            <Show when={step() === 'outcome'}>
                <div class="p-4">
                    <div class="text-center mb-6">
                        <p class="text-slate-400 text-sm mb-1">{t('salesApp.quickVisit.visitTo')}</p>
                        <h3 class="text-white font-semibold text-lg">{selectedCustomer()?.name}</h3>
                    </div>

                    <h4 class="text-slate-400 text-sm font-medium mb-3">
                        {t('salesApp.quickVisit.whatHappened')}
                    </h4>

                    <div class="space-y-3">
                        {/* Order Placed */}
                        <button
                            onClick={() => handleOutcomeSelect('order_placed')}
                            disabled={loading()}
                            class="w-full p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-4 active:scale-[0.99] transition-all"
                        >
                            <div class="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                <Package class="w-6 h-6 text-green-400" />
                            </div>
                            <div class="flex-1 text-left">
                                <div class="text-green-400 font-semibold">{t('salesApp.quickVisit.orderPlaced')}</div>
                                <div class="text-green-400/60 text-sm">{t('salesApp.quickVisit.orderPlacedDesc')}</div>
                            </div>
                            <ChevronRight class="w-5 h-5 text-green-400/50" />
                        </button>

                        {/* No Order */}
                        <button
                            onClick={() => handleOutcomeSelect('no_order')}
                            class="w-full p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center gap-4 active:scale-[0.99] transition-all"
                        >
                            <div class="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                <XCircle class="w-6 h-6 text-orange-400" />
                            </div>
                            <div class="flex-1 text-left">
                                <div class="text-orange-400 font-semibold">{t('salesApp.quickVisit.noOrder')}</div>
                                <div class="text-orange-400/60 text-sm">{t('salesApp.quickVisit.noOrderDesc')}</div>
                            </div>
                            <ChevronRight class="w-5 h-5 text-orange-400/50" />
                        </button>

                        {/* Follow Up */}
                        <button
                            onClick={() => handleOutcomeSelect('follow_up')}
                            class="w-full p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-4 active:scale-[0.99] transition-all"
                        >
                            <div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                <Clock class="w-6 h-6 text-blue-400" />
                            </div>
                            <div class="flex-1 text-left">
                                <div class="text-blue-400 font-semibold">{t('salesApp.quickVisit.followUp')}</div>
                                <div class="text-blue-400/60 text-sm">{t('salesApp.quickVisit.followUpDesc')}</div>
                            </div>
                            <ChevronRight class="w-5 h-5 text-blue-400/50" />
                        </button>
                    </div>
                </div>
            </Show>

            {/* Step 4a: No Order - Reason Selection */}
            <Show when={step() === 'no_order'}>
                <div class="p-4">
                    <h3 class="text-white font-semibold text-lg mb-1">
                        {t('salesApp.quickVisit.whyNoOrder')}
                    </h3>
                    <p class="text-slate-400 text-sm mb-4">{selectedCustomer()?.name}</p>

                    <div class="space-y-2 mb-4">
                        <For each={NO_ORDER_REASONS}>
                            {(reason) => (
                                <button
                                    onClick={() => setNoOrderReason(reason)}
                                    class={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${noOrderReason() === reason
                                        ? 'bg-orange-500/10 border-orange-500/50 text-orange-400'
                                        : 'bg-slate-900 border-slate-700 text-slate-300'
                                        }`}
                                >
                                    <div class={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${noOrderReason() === reason ? 'border-orange-400 bg-orange-400' : 'border-slate-600'
                                        }`}>
                                        <Show when={noOrderReason() === reason}>
                                            <Check class="w-3 h-3 text-white" />
                                        </Show>
                                    </div>
                                    <span>{t(`salesApp.quickVisit.reasons.${reason}`)}</span>
                                </button>
                            )}
                        </For>
                    </div>

                    {/* Custom note for "other" */}
                    <Show when={noOrderReason() === 'other'}>
                        <textarea
                            value={customNote()}
                            onInput={(e) => setCustomNote(e.currentTarget.value)}
                            placeholder={t('salesApp.quickVisit.enterReason')}
                            class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-24 mb-4"
                        />
                    </Show>

                    <div class="flex gap-3 mt-4">
                        <button
                            onClick={() => setStep('outcome')}
                            class="flex-1 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl"
                        >
                            {t('salesApp.common.cancel')}
                        </button>
                        <button
                            onClick={handleNoOrderSubmit}
                            disabled={!noOrderReason() || loading()}
                            class="flex-1 py-3 bg-orange-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Show when={loading()}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            {t('salesApp.quickVisit.complete')}
                        </button>
                    </div>
                </div>
            </Show>

            {/* Step 4b: Follow Up - Schedule */}
            <Show when={step() === 'follow_up'}>
                <div class="p-4">
                    <h3 class="text-white font-semibold text-lg mb-1">
                        {t('salesApp.quickVisit.scheduleFollowUp')}
                    </h3>
                    <p class="text-slate-400 text-sm mb-4">{selectedCustomer()?.name}</p>

                    {/* Reason selection */}
                    <label class="block text-slate-400 text-sm font-medium mb-2">
                        {t('salesApp.quickVisit.reason')}
                    </label>
                    <div class="space-y-2 mb-4">
                        <For each={FOLLOW_UP_REASONS}>
                            {(reason) => (
                                <button
                                    onClick={() => setFollowUpReason(reason)}
                                    class={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${followUpReason() === reason
                                        ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                                        : 'bg-slate-900 border-slate-700 text-slate-300'
                                        }`}
                                >
                                    <div class={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${followUpReason() === reason ? 'border-blue-400 bg-blue-400' : 'border-slate-600'
                                        }`}>
                                        <Show when={followUpReason() === reason}>
                                            <Check class="w-3 h-3 text-white" />
                                        </Show>
                                    </div>
                                    <span>{t(`salesApp.quickVisit.followUpReasons.${reason}`)}</span>
                                </button>
                            )}
                        </For>
                    </div>

                    {/* Date & Time */}
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-slate-400 text-sm font-medium mb-1">
                                <Calendar class="w-4 h-4 inline mr-1" />
                                {t('salesApp.quickVisit.date')}
                            </label>
                            <input
                                type="date"
                                value={followUpDate()}
                                onInput={(e) => setFollowUpDate(e.currentTarget.value)}
                                class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white"
                            />
                        </div>
                        <div>
                            <label class="block text-slate-400 text-sm font-medium mb-1">
                                <Clock class="w-4 h-4 inline mr-1" />
                                {t('salesApp.quickVisit.time')}
                            </label>
                            <input
                                type="time"
                                value={followUpTime()}
                                onInput={(e) => setFollowUpTime(e.currentTarget.value)}
                                class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white"
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <textarea
                        value={followUpNote()}
                        onInput={(e) => setFollowUpNote(e.currentTarget.value)}
                        placeholder={t('salesApp.quickVisit.noteOptional')}
                        class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-20 mb-4"
                    />

                    <div class="flex gap-3">
                        <button
                            onClick={() => setStep('outcome')}
                            class="flex-1 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl"
                        >
                            {t('salesApp.common.cancel')}
                        </button>
                        <button
                            onClick={handleFollowUpSubmit}
                            disabled={!followUpReason() || loading()}
                            class="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Show when={loading()}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            {t('salesApp.quickVisit.schedule')}
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default QuickVisitModal;
