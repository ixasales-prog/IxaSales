import { type Component, For, Show, createSignal, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import {
    Search,
    X,
    User,
    Phone,
    MapPin,
    ChevronRight,
    Loader2,
    Star,
    Plus,
    Map
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatCurrency } from '../../stores/settings';
import { useI18n } from '../../i18n';
// import toast from '../../components/Toast';
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
    // State
    const [searchQuery, setSearchQuery] = createSignal('');
    const [showAddModal, setShowAddModal] = createSignal(false);

    // Fetch customers — source must be a stable primitive to avoid infinite refetch
    const [customers, { refetch }] = createResource(
        () => searchQuery(),
        async (search) => {
            const queryParams: Record<string, string> = { limit: '50' };
            if (search) queryParams.search = search;
            const raw = await api<any[]>('/customers', { params: queryParams });
            const list = Array.isArray(raw) ? raw : [];
            return list.map((c: any) => ({
                ...c,
                currentDebt: c.debtBalance ?? c.currentDebt ?? null,
                creditLimit: c.creditLimit ?? null,
            }));
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
                                    <A
                                        href={`/sales/customers/${customer.id}`}
                                        class="block w-full bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm active:scale-[0.99] transition-transform text-left"
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
                                    </A>
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

        </div>
    );
};

export default Customers;
