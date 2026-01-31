import { type Component, Show, createResource, createSignal } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { ArrowLeft, Phone, MapPin, CreditCard, User, Calendar, Clock, X } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import toast from '../../components/Toast';

interface CustomerDetail {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    waymark: string | null;
    creditLimit: string | null;
    currentDebt: string | null;
    tierName?: string;
    territoryName?: string;
}

const CustomerDetailPage: Component = () => {
    const params = useParams<{ id: string }>();
    const [showScheduleModal, setShowScheduleModal] = createSignal(false);
    const [scheduleDate, setScheduleDate] = createSignal(new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = createSignal('');
    const [scheduleNotes, setScheduleNotes] = createSignal('');
    const [submitting, setSubmitting] = createSignal(false);

    const [customer] = createResource(
        () => params.id,
        async (id) => {
            if (!id) return null;
            try {
                const res = await api.get(`/customers/${id}`);
                return (res as any)?.data || res || null;
            } catch (_e) {
                return null;
            }
        }
    );

    const handleScheduleVisit = async () => {
        const customerId = params.id;
        if (!customerId) return;

        if (!scheduleDate()) {
            toast.error('Please select a date');
            return;
        }

        setSubmitting(true);
        try {
            await api.post('/visits', {
                customerId,
                plannedDate: scheduleDate(),
                plannedTime: scheduleTime() || undefined,
                notes: scheduleNotes() || undefined,
                mode: 'scheduled'
            });
            toast.success('Visit scheduled');
            setShowScheduleModal(false);
            setScheduleTime('');
            setScheduleNotes('');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to schedule visit');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div class="min-h-screen pb-24">
            <div class="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="flex items-center gap-3 px-4 py-3">
                    <A href="/sales/customers" class="p-2 -ml-2 text-slate-400 hover:text-white">
                        <ArrowLeft class="w-5 h-5" />
                    </A>
                    <div>
                        <h1 class="text-lg font-bold text-white">Customer</h1>
                        <p class="text-slate-500 text-xs">{params.id}</p>
                    </div>
                </div>
            </div>

            <div class="px-4 pt-4">
                <Show when={!customer.loading && customer()} fallback={
                    <div class="text-center py-12 text-slate-400">Customer not found.</div>
                }>
                    {(detail: () => CustomerDetail) => (
                        <div class="space-y-4">
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                                <div class="flex items-center gap-4 mb-4">
                                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                                        {detail().name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div class="text-white font-bold text-lg">{detail().name}</div>
                                        <div class="text-slate-500 text-xs">{detail().territoryName || 'Territory'}</div>
                                    </div>
                                </div>
                                <div class="space-y-3 text-sm">
                                    <Show when={detail().phone}>
                                        <div class="flex items-center gap-2 text-slate-300">
                                            <Phone class="w-4 h-4 text-blue-400" /> {detail().phone}
                                        </div>
                                    </Show>
                                    <Show when={detail().address}>
                                        <div class="flex items-center gap-2 text-slate-400">
                                            <MapPin class="w-4 h-4 text-blue-400" /> {detail().address}
                                        </div>
                                    </Show>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowScheduleModal(true)}
                                class="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 transition-colors"
                            >
                                Schedule Visit
                            </button>

                            <div class="grid grid-cols-2 gap-3">
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                    <div class="text-slate-500 text-xs mb-2">Credit Limit</div>
                                    <div class="text-white font-semibold">{formatCurrency(detail().creditLimit || '0')}</div>
                                </div>
                                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                    <div class="text-slate-500 text-xs mb-2">Current Debt</div>
                                    <div class="text-white font-semibold">{formatCurrency(detail().currentDebt || '0')}</div>
                                </div>
                            </div>

                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                <div class="flex items-center gap-2 text-slate-300">
                                    <CreditCard class="w-4 h-4 text-blue-400" /> Account status
                                </div>
                                <div class="text-slate-400 text-sm mt-2">
                                    Tier: {detail().tierName || 'Standard'}
                                </div>
                            </div>

                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4">
                                <div class="flex items-center gap-2 text-slate-300">
                                    <User class="w-4 h-4 text-blue-400" /> Notes
                                </div>
                                <div class="text-slate-500 text-sm mt-2">
                                    {detail().waymark || 'No additional notes.'}
                                </div>
                            </div>
                        </div>
                    )}
                </Show>
            </div>

            <Show when={showScheduleModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div class="p-5 border-b border-slate-800 flex items-center justify-between">
                            <h2 class="text-lg font-semibold text-white">Schedule Visit</h2>
                            <button
                                onClick={() => setShowScheduleModal(false)}
                                class="text-slate-400 hover:text-white transition-colors"
                            >
                                <X class="w-5 h-5" />
                            </button>
                        </div>
                        <div class="p-5 space-y-4">
                            <div>
                                <label class="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <Calendar class="w-4 h-4" /> Date
                                </label>
                                <input
                                    type="date"
                                    value={scheduleDate()}
                                    onInput={(e) => setScheduleDate(e.currentTarget.value)}
                                    class="mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                                />
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <Clock class="w-4 h-4" /> Time (optional)
                                </label>
                                <input
                                    type="time"
                                    value={scheduleTime()}
                                    onInput={(e) => setScheduleTime(e.currentTarget.value)}
                                    class="mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
                                />
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-300">Notes (optional)</label>
                                <textarea
                                    value={scheduleNotes()}
                                    onInput={(e) => setScheduleNotes(e.currentTarget.value)}
                                    rows={3}
                                    class="mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white resize-none"
                                />
                            </div>
                        </div>
                        <div class="p-5 border-t border-slate-800 flex justify-end gap-3">
                            <button
                                onClick={() => setShowScheduleModal(false)}
                                class="px-4 py-2.5 text-slate-300 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleScheduleVisit}
                                disabled={submitting()}
                                class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl disabled:opacity-50"
                            >
                                {submitting() ? 'Saving...' : 'Schedule'}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default CustomerDetailPage;
