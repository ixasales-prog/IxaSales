import { type Component, For, Show, createSignal, createResource, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
    MapPin,
    Clock,
    CheckCircle2,
    Play,
    Phone,
    Package,
    AlertCircle,
    Calendar,
    Plus,
    Loader2,
    X,
    Camera,
    Trash2,
    History,
    ChevronLeft,
    ChevronRight
} from 'lucide-solid';
import { api, apiResponse } from '../../lib/api';
import { useI18n } from '../../i18n';
import toast from '../../components/Toast';
import QuickVisitModal from './QuickVisitModal';

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

interface Visit {
    id: string;
    customerId: string;
    customerName: string;
    customerAddress: string | null;
    customerPhone: string | null;
    visitType: string;
    status: string;
    outcome: string | null;
    plannedTime: string | null;
    startedAt: string | null;
    completedAt: string | null;
    notes: string | null;
    orderId: string | null;
}

interface VisitStats {
    total: number;
    completed: number;
    inProgress: number;
    planned: number;
}

const Visits: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();

    const [selectedVisit, setSelectedVisit] = createSignal<Visit | null>(null);
    const [showCompleteModal, setShowCompleteModal] = createSignal(false);
    const [showQuickVisitModal, setShowQuickVisitModal] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    const [showHistory, setShowHistory] = createSignal(false);

    // Date navigation for history view
    const [selectedDate, setSelectedDate] = createSignal(new Date().toISOString().split('T')[0]);

    // Fetch visits based on mode
    const [visitsData, { refetch }] = createResource(
        () => ({ showHistory: showHistory(), date: selectedDate() }),
        async ({ showHistory: isHistory, date }) => {
            const targetDate = isHistory
                ? date
                : (() => {
                    const d = new Date();
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })();

            try {
                const result = await apiResponse<{ data?: Visit[]; stats?: VisitStats }>(
                    '/visits/today',
                    { params: { date: targetDate } }
                );
                return {
                    visits: result?.data || [],
                    stats: result?.stats || { total: 0, completed: 0, inProgress: 0, planned: 0 }
                };
            } catch (error) {
                console.error('Error fetching visits:', error);
                return {
                    visits: [],
                    stats: { total: 0, completed: 0, inProgress: 0, planned: 0 }
                };
            }
        }
    );

    onMount(() => {
        refetch();
    });

    const visits = () => visitsData()?.visits || [];
    const stats = (): VisitStats => visitsData()?.stats || { total: 0, completed: 0, inProgress: 0, planned: 0 };

    // Date navigation helpers
    const navigateDate = (direction: 'prev' | 'next') => {
        const current = new Date(selectedDate());
        current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
        setSelectedDate(current.toISOString().split('T')[0]);
    };

    const formatDisplayDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);

        if (dateOnly.getTime() === today.getTime()) return t('salesApp.visits.today');

        return date.toLocaleDateString('uz-UZ', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'in_progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'planned': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            case 'cancelled': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return t('salesApp.visits.completed');
            case 'in_progress': return t('salesApp.visits.inProgress');
            case 'planned': return t('salesApp.visits.planned');
            case 'cancelled': return t('salesApp.visits.cancelled');
            default: return status;
        }
    };

    const handleStartVisit = async (visit: Visit) => {
        setLoading(true);
        try {
            // Get current location
            let latitude: number | undefined;
            let longitude: number | undefined;

            if (navigator.geolocation) {
                try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10000
                        });
                    });
                    latitude = position.coords.latitude;
                    longitude = position.coords.longitude;
                } catch (e) {
                    // Continue without GPS
                }
            }

            await api.patch(`/visits/${visit.id}/start`, { latitude, longitude });
            toast.success(t('salesApp.visits.visitStarted'));
            refetch();
        } catch (e) {
            toast.error(t('salesApp.visits.startFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteVisit = async (outcome: string, notes?: string, photos: string[] = []) => {
        const visit = selectedVisit();
        if (!visit) return;

        setLoading(true);
        try {
            let latitude: number | undefined;
            let longitude: number | undefined;

            if (navigator.geolocation) {
                try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10000
                        });
                    });
                    latitude = position.coords.latitude;
                    longitude = position.coords.longitude;
                } catch (e) {
                    // Continue without GPS
                }
            }

            await api.patch(`/visits/${visit.id}/complete`, {
                outcome,
                outcomeNotes: notes,
                photos,
                latitude,
                longitude
            });

            toast.success(t('salesApp.visits.visitCompleted'));
            setShowCompleteModal(false);
            setSelectedVisit(null);
            refetch();
        } catch (e) {
            toast.error(t('salesApp.visits.completeFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-3">
                    <div class="flex items-center justify-between">
                        <h1 class="text-xl font-bold text-white">{t('salesApp.visits.title')}</h1>
                        <div class="flex items-center gap-2">
                            {/* History toggle */}
                            <button
                                onClick={() => {
                                    setShowHistory(!showHistory());
                                    if (!showHistory()) {
                                        setSelectedDate(new Date().toISOString().split('T')[0]);
                                    }
                                }}
                                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${showHistory()
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}
                            >
                                <History class="w-4 h-4" />
                                {t('salesApp.visits.history')}
                            </button>
                        </div>
                    </div>

                    {/* Date Navigation (shown in history mode) */}
                    <Show when={showHistory()}>
                        <div class="flex items-center justify-center gap-4 mt-3">
                            <button
                                onClick={() => navigateDate('prev')}
                                aria-label={t('salesApp.visits.previousDay')}
                                class="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-all"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <div class="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl">
                                <Calendar class="w-4 h-4 text-blue-400" />
                                <span class="text-white font-medium">{formatDisplayDate(selectedDate())}</span>
                            </div>
                            <button
                                onClick={() => navigateDate('next')}
                                aria-label={t('salesApp.visits.nextDay')}
                                class="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-all"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </Show>

                    {/* Today indicator (shown when not in history mode) */}
                    <Show when={!showHistory()}>
                        <div class="flex items-center gap-2 mt-2">
                            <Calendar class="w-4 h-4 text-slate-400" />
                            <span class="text-slate-400 text-sm">{t('salesApp.visits.today')}</span>
                        </div>
                    </Show>

                    {/* Stats */}
                    <div class="flex gap-3 mt-3 overflow-x-auto pb-1 -mx-4 px-4">
                        <div class="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full shrink-0">
                            <span class="text-white font-bold">{stats().total}</span>
                            <span class="text-slate-400 text-xs">{t('salesApp.visits.total')}</span>
                        </div>
                        <div class="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full shrink-0">
                            <CheckCircle2 class="w-4 h-4 text-green-400" />
                            <span class="text-green-400 font-bold">{stats().completed}</span>
                        </div>
                        <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-full shrink-0">
                            <Play class="w-4 h-4 text-blue-400" />
                            <span class="text-blue-400 font-bold">{stats().inProgress}</span>
                        </div>
                        <div class="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full shrink-0">
                            <Clock class="w-4 h-4 text-slate-400" />
                            <span class="text-slate-400 font-bold">{stats().planned}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div class="px-4 pt-4">
                {/* Loading */}
                <Show when={visitsData.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                </Show>

                {/* Empty State */}
                <Show when={!visitsData.loading && visits().length === 0}>
                    <div class="text-center py-12">
                        <Calendar class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">{t('salesApp.visits.noVisits')}</h3>
                        <p class="text-slate-400 text-sm mb-4">{t('salesApp.visits.noVisitsDesc')}</p>
                    </div>
                </Show>

                {/* Visit List */}
                <Show when={!visitsData.loading && visits().length > 0}>
                    <div class="space-y-3">
                        <For each={visits()}>
                            {(visit) => (
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                    <div class="flex items-start justify-between">
                                        <div class="flex-1">
                                            <div class="flex items-center gap-2 mb-1">
                                                <h3 class="text-white font-semibold">{visit.customerName}</h3>
                                                <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(visit.status)}`}>
                                                    {getStatusLabel(visit.status)}
                                                </span>
                                            </div>

                                            <Show when={visit.customerAddress}>
                                                <div class="flex items-center gap-1.5 text-slate-400 text-sm mb-1">
                                                    <MapPin class="w-3.5 h-3.5" />
                                                    <span class="truncate">{visit.customerAddress}</span>
                                                </div>
                                            </Show>

                                            <Show when={visit.plannedTime}>
                                                <div class="flex items-center gap-1.5 text-slate-500 text-xs">
                                                    <Clock class="w-3 h-3" />
                                                    <span>{visit.plannedTime}</span>
                                                </div>
                                            </Show>
                                        </div>

                                        {/* Actions */}
                                        <div class="flex items-center gap-2">
                                            <Show when={visit.customerPhone}>
                                                <a
                                                    href={`tel:${visit.customerPhone}`}
                                                    aria-label={`${t('salesApp.visits.callCustomer')} ${visit.customerName}`}
                                                    class="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400"
                                                >
                                                    <Phone class="w-4 h-4" />
                                                </a>
                                            </Show>

                                            <Show when={visit.status === 'planned'}>
                                                <button
                                                    onClick={() => handleStartVisit(visit)}
                                                    disabled={loading()}
                                                    class="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 active:scale-95 transition-transform"
                                                >
                                                    <Play class="w-4 h-4" />
                                                    {t('salesApp.visits.start')}
                                                </button>
                                            </Show>

                                            <Show when={visit.status === 'in_progress'}>
                                                <button
                                                    onClick={() => { setSelectedVisit(visit); setShowCompleteModal(true); }}
                                                    disabled={loading()}
                                                    class="px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-medium flex items-center gap-1.5 active:scale-95 transition-transform"
                                                >
                                                    <CheckCircle2 class="w-4 h-4" />
                                                    {t('salesApp.visits.complete')}
                                                </button>
                                            </Show>

                                            <Show when={visit.status === 'completed' && visit.outcome}>
                                                <div class={`flex items-center gap-1 text-sm ${visit.outcome === 'order_placed' ? 'text-green-400' :
                                                    visit.outcome === 'no_order' ? 'text-orange-400' :
                                                        visit.outcome === 'follow_up' ? 'text-blue-400' :
                                                            'text-slate-400'
                                                    }`}>
                                                    <Show when={visit.outcome === 'order_placed'}>
                                                        <Package class="w-4 h-4" />
                                                        <span>{t('salesApp.quickVisit.orderPlaced')}</span>
                                                    </Show>
                                                    <Show when={visit.outcome === 'no_order'}>
                                                        <AlertCircle class="w-4 h-4" />
                                                        <span>{t('salesApp.quickVisit.noOrder')}</span>
                                                    </Show>
                                                    <Show when={visit.outcome === 'follow_up'}>
                                                        <Clock class="w-4 h-4" />
                                                        <span>{t('salesApp.quickVisit.followUp')}</span>
                                                    </Show>
                                                    <Show when={visit.outcome === 'not_available'}>
                                                        <AlertCircle class="w-4 h-4" />
                                                        <span>{t('salesApp.visits.outcomeNotAvailable')}</span>
                                                    </Show>
                                                </div>
                                            </Show>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Complete Visit Modal */}
            <Show when={showCompleteModal()}>
                <CompleteVisitModal
                    visit={selectedVisit()!}
                    loading={loading()}
                    onComplete={handleCompleteVisit}
                    onClose={() => { setShowCompleteModal(false); setSelectedVisit(null); }}
                    onCreateOrder={() => {
                        // Navigate to catalog with this customer pre-selected
                        navigate(`/sales/catalog?customer=${selectedVisit()?.customerId}`);
                    }}
                />
            </Show>

            {/* Quick Visit Modal */}
            <Show when={showQuickVisitModal()}>
                <QuickVisitModal
                    onClose={() => setShowQuickVisitModal(false)}
                    onOrderPlaced={(customerId) => {
                        setShowQuickVisitModal(false);
                        navigate(`/sales/catalog?customer=${customerId}`);
                    }}
                    onVisitCompleted={() => {
                        setShowQuickVisitModal(false);
                        refetch();
                    }}
                />
            </Show>

            {/* FAB - Quick Visit */}
            <button
                onClick={() => setShowQuickVisitModal(true)}
                aria-label={t('salesApp.quickVisit.title')}
                class="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-600/30 active:scale-95 transition-all z-40"
            >
                <Plus size={28} />
            </button>
        </div>
    );
};

// Complete Visit Modal Component
const CompleteVisitModal: Component<{
    visit: Visit;
    loading: boolean;
    onComplete: (outcome: string, notes?: string, photos?: string[]) => void;
    onClose: () => void;
    onCreateOrder: () => void;
}> = (props) => {
    const { t } = useI18n();
    const [outcome, setOutcome] = createSignal<string>('');
    const [notes, setNotes] = createSignal('');
    const [photos, setPhotos] = createSignal<string[]>([]);
    const [uploading, setUploading] = createSignal(false);
    let fileInputRef: HTMLInputElement | undefined;

    const handleFileUpload = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/uploads', formData) as any;
            if (res.success) {
                setPhotos([...photos(), res.data.url]);
            } else {
                toast.error('Failed to upload photo');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error uploading photo');
        } finally {
            setUploading(false);
            if (fileInputRef) fileInputRef.value = '';
        }
    };

    const removePhoto = (index: number) => {
        const newPhotos = [...photos()];
        newPhotos.splice(index, 1);
        setPhotos(newPhotos);
    };

    const outcomes = [
        { value: 'order_placed', label: t('salesApp.visits.outcomeOrderPlaced'), icon: Package, color: 'bg-green-500/10 text-green-400 border-green-500/30' },
        { value: 'no_order', label: t('salesApp.visits.outcomeNoOrder'), icon: X, color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
        { value: 'follow_up', label: t('salesApp.visits.outcomeFollowUp'), icon: Clock, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
        { value: 'not_available', label: t('salesApp.visits.outcomeNotAvailable'), icon: AlertCircle, color: 'bg-red-500/10 text-red-400 border-red-500/30' },
    ];

    return (
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
            <div
                class="w-full max-w-lg bg-slate-900 rounded-t-3xl p-6 pb-safe animate-slide-up"
                role="dialog"
                aria-modal="true"
                aria-labelledby="complete-visit-title"
                aria-describedby="complete-visit-customer"
                onClick={(e) => e.stopPropagation()}
            >
                <div class="flex items-center justify-between mb-6">
                    <h2 id="complete-visit-title" class="text-xl font-bold text-white">{t('salesApp.visits.completeVisit')}</h2>
                    <button onClick={props.onClose} aria-label={t('salesApp.common.close')} class="text-slate-400">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <p id="complete-visit-customer" class="text-slate-400 text-sm mb-4">{props.visit.customerName}</p>

                {/* Outcome Selection */}
                <div class="space-y-2 mb-4">
                    <For each={outcomes}>
                        {(opt) => (
                            <button
                                onClick={() => setOutcome(opt.value)}
                                class={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${outcome() === opt.value
                                    ? opt.color + ' ring-2 ring-offset-2 ring-offset-slate-900'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-300'
                                    }`}
                            >
                                <opt.icon class="w-5 h-5" />
                                <span class="font-medium">{opt.label}</span>
                            </button>
                        )}
                    </For>
                </div>

                {/* Photos */}
                <div class="mb-4">
                    <label class="block text-slate-400 text-sm font-medium mb-2">
                        {t('salesApp.visits.photos') || 'Photos'}
                    </label>
                    <div class="flex gap-2 overflow-x-auto pb-2">
                        <For each={photos()}>
                            {(photo, index) => (
                                <div class="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 group">
                                    <img src={getImageUrl(photo)} class="w-full h-full object-cover" />
                                    <button
                                        onClick={() => removePhoto(index())}
                                        aria-label={t('salesApp.visits.removePhoto')}
                                        class="absolute inset-0 bg-black/40 items-center justify-center hidden group-hover:flex"
                                    >
                                        <Trash2 class="w-5 h-5 text-white" />
                                    </button>
                                </div>
                            )}
                        </For>

                        <button
                            onClick={() => fileInputRef?.click()}
                            disabled={uploading()}
                            aria-label={t('salesApp.visits.addPhoto')}
                            class="w-20 h-20 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
                        >
                            <Show when={uploading()} fallback={<Camera class="w-6 h-6" />}>
                                <Loader2 class="w-6 h-6 animate-spin text-blue-400" />
                            </Show>
                        </button>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        capture="environment"
                        class="hidden"
                        onChange={handleFileUpload}
                    />
                </div>

                {/* Notes */}
                <textarea
                    value={notes()}
                    onInput={(e) => setNotes(e.currentTarget.value)}
                    placeholder={t('salesApp.visits.notesPlaceholder')}
                    class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-20 mb-4"
                />

                {/* Actions */}
                <div class="flex gap-3">
                    <Show when={outcome() === 'order_placed'}>
                        <button
                            onClick={props.onCreateOrder}
                            class="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2"
                        >
                            <Package class="w-5 h-5" />
                            {t('salesApp.visits.createOrder')}
                        </button>
                    </Show>
                    <button
                        onClick={() => props.onComplete(outcome(), notes(), photos())}
                        disabled={!outcome() || props.loading || uploading()}
                        class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {props.loading ? t('salesApp.common.loading') : t('salesApp.visits.finish')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Visits;
