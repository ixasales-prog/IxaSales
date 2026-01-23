import { type Component, For, Show, createSignal, createResource } from 'solid-js';
import { A, useSearchParams, useNavigate } from '@solidjs/router';
import {
    Search,
    X,
    User,
    Phone,
    MapPin,
    CreditCard,
    ChevronRight,
    Loader2,
    AlertCircle,
    Star,
    Plus,
    Calendar,
    Map
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import { useI18n } from '../../i18n';
import toast from '../../components/Toast';
import AddCustomerModal from './AddCustomerModal';

interface Customer {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    waymark: string | null;
    creditLimit: string | null;
    currentDebt: string | null;
    tierName?: string;
    territoryId?: string;
    territoryName?: string;
}

const Customers: Component = () => {
    const { t } = useI18n();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // State
    const [searchQuery, setSearchQuery] = createSignal('');
    const [selectedCustomer, setSelectedCustomer] = createSignal<Customer | null>(null);
    const [showAddModal, setShowAddModal] = createSignal(false);
    const [showScheduleVisitModal, setShowScheduleVisitModal] = createSignal(false);

    // Debounced search
    const debouncedSearch = () => searchQuery();

    // Fetch customers
    const [customers, { refetch }] = createResource(
        () => ({ search: debouncedSearch() }),
        async (params) => {
            const queryParams: Record<string, string> = { limit: '50' };
            if (params.search) queryParams.search = params.search;
            const data = await api<Customer[]>('/customers', { params: queryParams });
            return data;
        }
    );

    const customerList = () => customers() || [];

    // Get debt status
    const getDebtStatus = (customer: Customer) => {
        const debt = parseFloat(customer.currentDebt || '0');
        const limit = parseFloat(customer.creditLimit || '0');

        if (debt <= 0) return { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Clear' };
        if (limit > 0 && debt >= limit) return { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Limit Reached' };
        if (debt > 0) return { color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Has Balance' };
        return { color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Unknown' };
    };

    return (
        <div class="min-h-screen pb-20">
            {/* Header */}
            <div class="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
                <div class="px-4 py-3">
                    <h1 class="text-lg font-bold text-white mb-3">{t('salesApp.customers.title')}</h1>

                    {/* Search Bar */}
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery()}
                            onInput={(e) => setSearchQuery(e.currentTarget.value)}
                            placeholder={t('salesApp.customers.search')}
                            class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                        />
                        <Show when={searchQuery()}>
                            <button
                                onClick={() => setSearchQuery('')}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </Show>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div class="pt-28 px-4">
                {/* Loading */}
                <Show when={customers.loading}>
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                </Show>

                {/* Empty State */}
                <Show when={!customers.loading && customerList().length === 0}>
                    <div class="text-center py-12">
                        <User class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 class="text-lg font-semibold text-white mb-2">{t('salesApp.customers.noCustomers')}</h3>
                        <p class="text-slate-400 text-sm">
                            {searchQuery()
                                ? t('salesApp.customers.adjustSearch')
                                : t('salesApp.customers.customersAppear')
                            }
                        </p>
                    </div>
                </Show>

                {/* Customer List */}
                <Show when={!customers.loading && customerList().length > 0}>
                    <div class="space-y-3">
                        <For each={customerList()}>
                            {(customer) => {
                                const debtStatus = getDebtStatus(customer);

                                return (
                                    <button
                                        onClick={() => {
                                            setSelectedCustomer(customer);
                                            if (searchParams.mode === 'schedule') {
                                                setShowScheduleVisitModal(true);
                                            }
                                        }}
                                        class="w-full bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm active:scale-[0.99] transition-transform text-left"
                                    >
                                        <div class="flex items-start gap-3">
                                            {/* Avatar */}
                                            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                                {customer.name.charAt(0).toUpperCase()}
                                            </div>

                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <h3 class="text-white font-medium text-[15px] truncate">{customer.name}</h3>
                                                    <Show when={customer.tierName}>
                                                        <span class="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-500/20">
                                                            <Star class="w-2.5 h-2.5" />
                                                            {customer.tierName}
                                                        </span>
                                                    </Show>
                                                    <Show when={customer.territoryName}>
                                                        <span class="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-medium rounded-full border border-blue-500/20">
                                                            <Map class="w-2.5 h-2.5" />
                                                            {customer.territoryName}
                                                        </span>
                                                    </Show>
                                                </div>

                                                <Show when={customer.phone}>
                                                    <div class="flex items-center gap-1.5 mt-1 text-slate-400 text-xs">
                                                        <Phone class="w-3 h-3" />
                                                        <span>{customer.phone}</span>
                                                    </div>
                                                </Show>

                                                <Show when={customer.address}>
                                                    <div class="flex items-center gap-1.5 mt-0.5 text-slate-500 text-xs">
                                                        <MapPin class="w-3 h-3" />
                                                        <span class="truncate">{customer.address}</span>
                                                    </div>
                                                </Show>
                                            </div>

                                            <div class="flex flex-col items-end gap-1">
                                                <span class={`px-2 py-0.5 rounded-full ${debtStatus.bg} ${debtStatus.color} text-[10px] font-bold`}>
                                                    {debtStatus.label}
                                                </span>
                                                <Show when={parseFloat(customer.currentDebt || '0') > 0}>
                                                    <span class="text-orange-400 font-semibold text-sm">
                                                        {formatCurrency(customer.currentDebt || '0')}
                                                    </span>
                                                </Show>
                                                <ChevronRight class="w-4 h-4 text-slate-600 mt-1" />
                                            </div>
                                        </div>
                                    </button>
                                );
                            }}
                        </For>
                    </div>
                </Show>
            </div>

            {/* Floating Action Button */}
            <button
                onClick={() => setShowAddModal(true)}
                class="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-600/30 active:scale-95 transition-all z-40"
            >
                <Plus size={28} />
            </button>

            {/* Customer Detail Modal */}
            <Show when={selectedCustomer() && !showScheduleVisitModal()}>
                <CustomerDetailModal
                    customer={selectedCustomer()!}
                    onClose={() => setSelectedCustomer(null)}
                    onScheduleVisit={() => setShowScheduleVisitModal(true)}
                />
            </Show>

            {/* Add Customer Modal */}
            <Show when={showAddModal()}>
                <AddCustomerModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        refetch();
                        setShowAddModal(false);
                    }}
                />
            </Show>

            {/* Schedule Visit Modal */}
            <Show when={showScheduleVisitModal() && selectedCustomer()}>
                <ScheduleVisitModal
                    customer={selectedCustomer()!}
                    onClose={() => setShowScheduleVisitModal(false)}
                    onSuccess={() => {
                        setShowScheduleVisitModal(false);
                        setSelectedCustomer(null);
                        navigate('/sales/visits');
                    }}
                />
            </Show>
        </div>
    );
};

// ... (CustomerDetailModal types)

// Schedule Visit Modal
const ScheduleVisitModal: Component<{
    customer: Customer;
    onClose: () => void;
    onSuccess: () => void;
}> = (props) => {
    const { t } = useI18n();
    const [loading, setLoading] = createSignal(false);

    // Form state
    const [formData, setFormData] = createSignal({
        visitType: 'scheduled',
        plannedDate: new Date().toISOString().split('T')[0],
        plannedTime: new Date().toTimeString().slice(0, 5),
        notes: ''
    });

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.post('/visits', {
                customerId: props.customer.id,
                ...formData()
            });
            toast.success(t('salesApp.visits.scheduleSuccess') || 'Visit scheduled successfully');
            props.onSuccess();
        } catch (error) {
            console.error(error);
            toast.error(t('salesApp.visits.scheduleFailed') || 'Failed to schedule visit');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-scale-in">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar class="w-6 h-6 text-blue-400" />
                        {t('salesApp.visits.scheduleTitle') || 'Schedule Visit'}
                    </h2>
                    <button onClick={props.onClose} class="text-slate-400 hover:text-white">
                        <X class="w-6 h-6" />
                    </button>
                </div>

                <p class="text-slate-400 mb-6">
                    {t('salesApp.visits.schedulingFor') || 'Scheduling for'}: <span class="text-white font-medium">{props.customer.name}</span>
                </p>

                <form onSubmit={handleSubmit} class="space-y-4">
                    {/* Date */}
                    <div>
                        <label class="block text-slate-400 text-sm font-medium mb-1">
                            {t('salesApp.visits.date') || 'Date'}
                        </label>
                        <input
                            type="date"
                            required
                            value={formData().plannedDate}
                            onInput={(e) => setFormData({ ...formData(), plannedDate: e.currentTarget.value })}
                            class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Time */}
                    <div>
                        <label class="block text-slate-400 text-sm font-medium mb-1">
                            {t('salesApp.visits.time') || 'Time (Optional)'}
                        </label>
                        <input
                            type="time"
                            value={formData().plannedTime}
                            onInput={(e) => setFormData({ ...formData(), plannedTime: e.currentTarget.value })}
                            class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label class="block text-slate-400 text-sm font-medium mb-1">
                            {t('salesApp.visits.notes') || 'Notes'}
                        </label>
                        <textarea
                            value={formData().notes}
                            onInput={(e) => setFormData({ ...formData(), notes: e.currentTarget.value })}
                            placeholder={t('salesApp.visits.notesPlaceholder') || 'Add visit notes...'}
                            class="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none h-24"
                        />
                    </div>

                    <div class="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={props.onClose}
                            class="flex-1 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition-colors"
                        >
                            {t('salesApp.common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading()}
                            class="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Show when={loading()} fallback={<Calendar class="w-5 h-5" />}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            {t('salesApp.common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Customer Detail Modal
const CustomerDetailModal: Component<{
    customer: Customer;
    onClose: () => void;
    onScheduleVisit: () => void;
}> = (props) => {
    const { t } = useI18n();

    const debtStatus = () => {
        const debt = parseFloat(props.customer.currentDebt || '0');
        const limit = parseFloat(props.customer.creditLimit || '0');
        if (debt <= 0) return { color: 'text-green-400', label: t('salesApp.customerDetail.noBalance') };
        if (limit > 0 && debt >= limit) return { color: 'text-red-400', label: t('salesApp.customerDetail.creditLimitReached') };
        return { color: 'text-orange-400', label: t('salesApp.customerDetail.hasBalance') };
    };

    return (
        <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 overflow-y-auto">
            <div class="min-h-full p-4">
                {/* Header */}
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-lg font-bold text-white">{t('salesApp.customerDetail.title')}</h2>
                    <button
                        onClick={props.onClose}
                        class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Customer Info Card */}
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-4">
                    <div class="flex items-center gap-4 mb-6">
                        <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl">
                            {props.customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 class="text-white font-bold text-xl">{props.customer.name}</h3>
                            <Show when={props.customer.tierName}>
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/20 mt-1">
                                    <Star class="w-3 h-3" />
                                    {props.customer.tierName}
                                </span>
                            </Show>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <Show when={props.customer.phone}>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                                    <Phone class="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <div class="text-slate-500 text-xs">{t('salesApp.customerDetail.phone')}</div>
                                    <div class="text-white font-medium">{props.customer.phone}</div>
                                </div>
                            </div>
                        </Show>

                        <Show when={props.customer.address}>
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                                    <MapPin class="w-5 h-5 text-green-400" />
                                </div>
                                <div>
                                    <div class="text-slate-500 text-xs">{t('salesApp.customerDetail.address')}</div>
                                    <div class="text-white font-medium">{props.customer.address}</div>
                                </div>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Credit Info Card */}
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                    <h4 class="text-white font-semibold mb-4 flex items-center gap-2">
                        <CreditCard class="w-5 h-5 text-blue-400" />
                        {t('salesApp.customerDetail.creditInfo')}
                    </h4>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="bg-slate-800/50 rounded-xl p-4">
                            <div class="text-slate-500 text-xs mb-1">{t('salesApp.customerDetail.creditLimit')}</div>
                            <div class="text-white font-bold text-lg">
                                {formatCurrency(props.customer.creditLimit || '0')}
                            </div>
                        </div>
                        <div class="bg-slate-800/50 rounded-xl p-4">
                            <div class="text-slate-500 text-xs mb-1">{t('salesApp.customerDetail.currentDebt')}</div>
                            <div class={`font-bold text-lg ${parseFloat(props.customer.currentDebt || '0') > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                                {formatCurrency(props.customer.currentDebt || '0')}
                            </div>
                        </div>
                    </div>

                    <div class={`p-3 rounded-xl ${parseFloat(props.customer.currentDebt || '0') > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                        <div class={`flex items-center gap-2 text-sm ${debtStatus().color}`}>
                            <AlertCircle class="w-4 h-4" />
                            {debtStatus().label}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div class="mt-6 space-y-3">
                    <A
                        href={`/sales/catalog?customer=${props.customer.id}`}
                        class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                        {t('salesApp.customerDetail.createOrder')}
                    </A>
                    <button
                        onClick={props.onScheduleVisit}
                        class="w-full py-3.5 bg-slate-800 border border-slate-700 text-blue-400 font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    >
                        <Calendar class="w-5 h-5" />
                        {t('salesApp.customerDetail.scheduleVisit')}
                    </button>
                    <button
                        onClick={props.onClose}
                        class="w-full py-3.5 bg-slate-800 text-white font-medium rounded-xl active:scale-[0.98] transition-all"
                    >
                        {t('salesApp.customerDetail.close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Customers;
