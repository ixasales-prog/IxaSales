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
    List,
    ChevronLeft,
    ChevronRight,
    Check,
    Filter
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

// No order reasons (same as QuickVisitModal)
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

// Follow up reasons (same as QuickVisitModal)
const FOLLOW_UP_REASONS = [
    'owner_absent',
    'decision_pending',
    'busy_now',
    'callback_requested',
    'delivery_awaited',
    'other'
] as const;

const Visits: Component = () => {
    const { t } = useI18n();
    const navigate = useNavigate();

    const [selectedVisit, setSelectedVisit] = createSignal<Visit | null>(null);
    const [showCompleteModal, setShowCompleteModal] = createSignal(false);
    const [showQuickVisitModal, setShowQuickVisitModal] = createSignal(false);
    const [showFilterModal, setShowFilterModal] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    const [selectedStatus, setSelectedStatus] = createSignal<'all' | 'completed' | 'in_progress' | 'planned'>('all');
    // Date navigation
    const [selectedDate, setSelectedDate] = createSignal(new Date().toISOString().split('T')[0]);

    // Fetch visits based on mode
    const [visitsData, { refetch }] = createResource(
        () => selectedDate(),
        async (date) => {
            const targetDate = date || new Date().toISOString().split('T')[0];

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
    const filteredVisits = () => {
        const status = selectedStatus();
        if (status !== 'all') {
            return visits().filter((visit) => visit.status === status);
        }
        return visits();
    };
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

    const getStatusAccent = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-emerald-500';
            case 'in_progress': return 'bg-blue-500';
            case 'planned': return 'bg-slate-500';
            case 'cancelled': return 'bg-red-500';
            default: return 'bg-slate-500';
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
                } catch (_e) {
                    // Continue without GPS
                }
            }

            await api.patch(`/visits/${visit.id}/start`, { latitude, longitude });
            toast.success(t('salesApp.visits.visitStarted'));
            
            // Immediately open completion modal for streamlined flow
            setSelectedVisit(visit);
            setShowCompleteModal(true);
            
            refetch();
        } catch (_e) {
            toast.error(t('salesApp.visits.startFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteVisit = async (
        outcome: string, 
        notes?: string, 
        photos: string[] = [],
        extraData: {
            noOrderReason?: string;
            followUpReason?: string;
            followUpDate?: string;
            followUpTime?: string;
        } = {}
    ) => {
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
                } catch (_e) {
                    // Continue without GPS
                }
            }

            const payload: any = {
                outcome,
                outcomeNotes: notes,
                photos,
                latitude,
                longitude
            };

            // Add extra data for no_order and follow_up outcomes
            if (outcome === 'no_order' && extraData.noOrderReason) {
                payload.noOrderReason = extraData.noOrderReason;
            }
            
            if (outcome === 'follow_up') {
                if (extraData.followUpReason) payload.followUpReason = extraData.followUpReason;
                if (extraData.followUpDate) payload.followUpDate = extraData.followUpDate;
                if (extraData.followUpTime) payload.followUpTime = extraData.followUpTime;
            }

            await api.patch(`/visits/${visit.id}/complete`, payload);

            toast.success(t('salesApp.visits.visitCompleted'));
            setShowCompleteModal(false);
            setSelectedVisit(null);
            refetch();
        } catch (_e) {
            toast.error(t('salesApp.visits.completeFailed'));
        } finally {
            setLoading(false);
        }
    };

    const resetFilters = () => {
        setSelectedStatus('all');
        setSelectedDate(new Date().toISOString().split('T')[0]);
    };

    const hasActiveFilters = () => {
        return selectedStatus() !== 'all' || selectedDate() !== new Date().toISOString().split('T')[0];
    };

    return (
        <div class="min-h-screen bg-slate-950 pb-24">
            {/* Header */}
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-3">
                    <div class="flex items-center justify-between">
                        <h1 class="text-xl font-bold text-white">{t('salesApp.visits.title')}</h1>
                        <button
                            onClick={() => setShowFilterModal(true)}
                            class={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${hasActiveFilters() 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                        >
                            <Filter class="w-4 h-4" />
                            <span class="font-medium">
                                {hasActiveFilters() ? t('salesApp.visits.filtersActive') || 'Filters' : t('salesApp.visits.filter') || 'Filter'}
                            </span>
                            {hasActiveFilters() && (
                                <span class="ml-1 w-2 h-2 bg-white rounded-full" />
                            )}
                        </button>
                    </div>


                    {/* Active Filters Display */}
                    <Show when={selectedStatus() !== 'all'}>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 rounded-lg text-xs text-slate-300">
                                {selectedStatus() === 'completed' && <CheckCircle2 class="w-3 h-3 text-green-400" />}
                                {selectedStatus() === 'in_progress' && <Play class="w-3 h-3 text-blue-400" />}
                                {selectedStatus() === 'planned' && <Clock class="w-3 h-3 text-slate-400" />}
                                {getStatusLabel(selectedStatus())}
                                <button
                                    onClick={() => setSelectedStatus('all')}
                                    class="ml-1 hover:text-white"
                                >
                                    <X class="w-3 h-3" />
                                </button>
                            </span>
                        </div>
                    </Show>
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
                <Show when={!visitsData.loading && filteredVisits().length === 0}>
                    <div class="text-center py-12">
                        <Calendar class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">{t('salesApp.visits.noVisits')}</h3>
                        <p class="text-slate-400 text-sm mb-4">{t('salesApp.visits.noVisitsDesc')}</p>
                    </div>
                </Show>

                {/* Visit List */}
                <Show when={!visitsData.loading && filteredVisits().length > 0}>
                    <div class="space-y-3">
                        <For each={filteredVisits()}>
                            {(visit) => (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/sales/visits/${visit.id}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            navigate(`/sales/visits/${visit.id}`);
                                        }
                                    }}
                                    class="relative block bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 pl-5"
                                >
                                    <span
                                        class={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${getStatusAccent(visit.status)}`}
                                        aria-hidden="true"
                                    />
                                    <div class="flex items-start justify-between">
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2 mb-1 overflow-hidden">
                                                <Show when={visit.customerPhone}>
                                                    <a
                                                        onClick={(event) => event.stopPropagation()}
                                                        href={`tel:${visit.customerPhone}`}
                                                        aria-label={`${t('salesApp.visits.callCustomer')} ${visit.customerName}`}
                                                        class={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${visit.outcome === 'follow_up'
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-slate-800 text-slate-400'}`}
                                                    >
                                                        <Phone class="w-3.5 h-3.5" />
                                                    </a>
                                                </Show>
                                                <h3 class="text-white font-semibold truncate flex-1 min-w-0">{visit.customerName}</h3>
                                            </div>

                                            <div class="flex items-center gap-2 text-slate-400 text-sm overflow-hidden">
                                                <Show when={visit.customerAddress || visit.plannedTime}>
                                                    <div class="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                                        <Show when={visit.customerAddress}>
                                                            <div class="flex items-center gap-1.5 overflow-hidden">
                                                                <MapPin class="w-3.5 h-3.5 flex-shrink-0" />
                                                                <span class="truncate">{visit.customerAddress}</span>
                                                            </div>
                                                        </Show>
                                                        <Show when={visit.customerAddress && visit.plannedTime}>
                                                            <span class="text-slate-600">•</span>
                                                        </Show>
                                                        <Show when={visit.plannedTime}>
                                                            <div class="flex items-center gap-1.5 whitespace-nowrap">
                                                                <Clock class="w-3 h-3" />
                                                                <span>{visit.plannedTime}</span>
                                                            </div>
                                                        </Show>
                                                    </div>
                                                </Show>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-2 shrink-0 ml-2">

                                            <Show when={visit.status === 'planned'}>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleStartVisit(visit);
                                                    }}
                                                    disabled={loading()}
                                                    class="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 active:scale-95 transition-transform"
                                                >
                                                    <Play class="w-4 h-4" />
                                                    {t('salesApp.visits.start')}
                                                </button>
                                            </Show>

                                            <Show when={visit.status === 'in_progress'}>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedVisit(visit);
                                                        setShowCompleteModal(true);
                                                    }}
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

            {/* Filter Modal */}
            <Show when={showFilterModal()}>
                <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFilterModal(false)}>
                    <div
                        class="w-full max-w-lg bg-slate-900 rounded-t-3xl p-6 pb-safe animate-slide-up max-h-[80vh] overflow-y-auto"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="filter-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div class="flex items-center justify-between mb-6">
                            <h2 id="filter-title" class="text-xl font-bold text-white">{t('salesApp.visits.filters') || 'Filters'}</h2>
                            <button onClick={() => setShowFilterModal(false)} aria-label={t('salesApp.common.close')} class="text-slate-400 hover:text-white">
                                <X class="w-6 h-6" />
                            </button>
                        </div>

                        {/* Date Selection */}
                        <div class="mb-6">
                            <label class="block text-slate-400 text-sm font-medium mb-3">
                                <Calendar class="w-4 h-4 inline mr-1" />
                                {t('salesApp.visits.date') || 'Date'}
                            </label>
                            <div class="flex items-center gap-2">
                                <button
                                    onClick={() => navigateDate('prev')}
                                    class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-all"
                                >
                                    <ChevronLeft class="w-5 h-5" />
                                </button>
                                <div class="flex-1 px-4 py-2.5 bg-slate-800 rounded-xl text-center">
                                    <span class="text-white font-medium">{formatDisplayDate(selectedDate())}</span>
                                </div>
                                <button
                                    onClick={() => navigateDate('next')}
                                    class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-all"
                                >
                                    <ChevronRight class="w-5 h-5" />
                                </button>
                            </div>
                            <input
                                type="date"
                                value={selectedDate()}
                                onInput={(e) => setSelectedDate(e.currentTarget.value)}
                                class="w-full mt-2 p-3 bg-slate-800 border border-slate-700 rounded-xl text-white"
                            />
                        </div>

                        {/* Status Filter */}
                        <div class="mb-6">
                            <label class="block text-slate-400 text-sm font-medium mb-3">
                                {t('salesApp.visits.status') || 'Status'}
                            </label>
                            <div class="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setSelectedStatus('all')}
                                    class={`p-3 rounded-xl border flex items-center gap-2 transition-all ${selectedStatus() === 'all'
                                        ? 'bg-slate-700 border-slate-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                                >
                                    <List class="w-4 h-4" />
                                    <span>{t('salesApp.visits.all') || 'All'}</span>
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('completed')}
                                    class={`p-3 rounded-xl border flex items-center gap-2 transition-all ${selectedStatus() === 'completed'
                                        ? 'bg-green-500/20 border-green-500/50 text-green-400'
                                        : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                                >
                                    <CheckCircle2 class="w-4 h-4" />
                                    <span>{t('salesApp.visits.completed')}</span>
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('in_progress')}
                                    class={`p-3 rounded-xl border flex items-center gap-2 transition-all ${selectedStatus() === 'in_progress'
                                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                        : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                                >
                                    <Play class="w-4 h-4" />
                                    <span>{t('salesApp.visits.inProgress')}</span>
                                </button>
                                <button
                                    onClick={() => setSelectedStatus('planned')}
                                    class={`p-3 rounded-xl border flex items-center gap-2 transition-all ${selectedStatus() === 'planned'
                                        ? 'bg-slate-500/30 border-slate-500/50 text-slate-200'
                                        : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                                >
                                    <Clock class="w-4 h-4" />
                                    <span>{t('salesApp.visits.planned')}</span>
                                </button>
                            </div>
                        </div>


                        {/* Actions */}
                        <div class="flex gap-3">
                            <button
                                onClick={resetFilters}
                                class="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 transition-colors"
                            >
                                {t('salesApp.visits.reset') || 'Reset'}
                            </button>
                            <button
                                onClick={() => setShowFilterModal(false)}
                                class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold"
                            >
                                {t('salesApp.visits.apply') || 'Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

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
    onComplete: (
        outcome: string, 
        notes?: string, 
        photos?: string[],
        extraData?: {
            noOrderReason?: string;
            followUpReason?: string;
            followUpDate?: string;
            followUpTime?: string;
        }
    ) => void;
    onClose: () => void;
    onCreateOrder: () => void;
}> = (props) => {
    const { t } = useI18n();
    const [outcome, setOutcome] = createSignal<string>('');
    const [notes, setNotes] = createSignal('');
    const [photos, setPhotos] = createSignal<string[]>([]);
    const [uploading, setUploading] = createSignal(false);
    
    // No order form state
    const [noOrderReason, setNoOrderReason] = createSignal('');
    const [customNote, setCustomNote] = createSignal('');
    
    // Follow up form state
    const [followUpReason, setFollowUpReason] = createSignal('');
    const [followUpDate, setFollowUpDate] = createSignal((() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    })());
    const [followUpTime, setFollowUpTime] = createSignal('10:00');
    const [followUpNote, setFollowUpNote] = createSignal('');
    
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
    ];

    const handleComplete = () => {
        const extraData: {
            noOrderReason?: string;
            followUpReason?: string;
            followUpDate?: string;
            followUpTime?: string;
        } = {};

        if (outcome() === 'no_order' && noOrderReason()) {
            extraData.noOrderReason = noOrderReason();
            // If "other" reason, append custom note to outcome notes
            if (noOrderReason() === 'other' && customNote()) {
                setNotes(prev => prev ? `${prev} - ${customNote()}` : customNote());
            }
        }

        if (outcome() === 'follow_up') {
            if (followUpReason()) extraData.followUpReason = followUpReason();
            if (followUpDate()) extraData.followUpDate = followUpDate();
            if (followUpTime()) extraData.followUpTime = followUpTime();
            // Append follow up note to outcome notes
            if (followUpNote()) {
                setNotes(prev => prev ? `${prev} - ${followUpNote()}` : followUpNote());
            }
        }

        props.onComplete(outcome(), notes(), photos(), extraData);
    };

    return (
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
            <div
                class="w-full max-w-lg bg-slate-900 rounded-t-3xl p-6 pb-safe animate-slide-up max-h-[90vh] overflow-y-auto"
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

                {/* No Order Reason Selection */}
                <Show when={outcome() === 'no_order'}>
                    <div class="mb-4">
                        <label class="block text-slate-400 text-sm font-medium mb-2">
                            {t('salesApp.quickVisit.whyNoOrder')}
                        </label>
                        <div class="space-y-2 mb-3">
                            <For each={NO_ORDER_REASONS}>
                                {(reason) => (
                                    <button
                                        onClick={() => setNoOrderReason(reason)}
                                        class={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${noOrderReason() === reason
                                            ? 'bg-orange-500/10 border-orange-500/50 text-orange-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-300'
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
                                class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-20"
                            />
                        </Show>
                    </div>
                </Show>

                {/* Follow Up Details */}
                <Show when={outcome() === 'follow_up'}>
                    <div class="mb-4">
                        <label class="block text-slate-400 text-sm font-medium mb-2">
                            {t('salesApp.quickVisit.scheduleFollowUp')}
                        </label>
                        
                        {/* Reason selection */}
                        <label class="block text-slate-400 text-xs font-medium mb-2">
                            {t('salesApp.quickVisit.reason')}
                        </label>
                        <div class="space-y-2 mb-3">
                            <For each={FOLLOW_UP_REASONS}>
                                {(reason) => (
                                    <button
                                        onClick={() => setFollowUpReason(reason)}
                                        class={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${followUpReason() === reason
                                            ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-300'
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
                        <div class="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label class="block text-slate-400 text-xs font-medium mb-1">
                                    <Calendar class="w-3 h-3 inline mr-1" />
                                    {t('salesApp.quickVisit.date')}
                                </label>
                                <input
                                    type="date"
                                    value={followUpDate()}
                                    onInput={(e) => setFollowUpDate(e.currentTarget.value)}
                                    class="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                />
                            </div>
                            <div>
                                <label class="block text-slate-400 text-xs font-medium mb-1">
                                    <Clock class="w-3 h-3 inline mr-1" />
                                    {t('salesApp.quickVisit.time')}
                                </label>
                                <input
                                    type="time"
                                    value={followUpTime()}
                                    onInput={(e) => setFollowUpTime(e.currentTarget.value)}
                                    class="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                />
                            </div>
                        </div>

                        {/* Follow up note */}
                        <textarea
                            value={followUpNote()}
                            onInput={(e) => setFollowUpNote(e.currentTarget.value)}
                            placeholder={t('salesApp.quickVisit.noteOptional')}
                            class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-20"
                        />
                    </div>
                </Show>

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
                <Show when={outcome() !== 'no_order' && outcome() !== 'follow_up'}>
                    <textarea
                        value={notes()}
                        onInput={(e) => setNotes(e.currentTarget.value)}
                        placeholder={t('salesApp.visits.notesPlaceholder')}
                        class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 resize-none h-20 mb-4"
                    />
                </Show>

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
                        onClick={handleComplete}
                        disabled={!outcome() || props.loading || uploading() || 
                            (outcome() === 'no_order' && !noOrderReason()) ||
                            (outcome() === 'follow_up' && !followUpReason())}
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
