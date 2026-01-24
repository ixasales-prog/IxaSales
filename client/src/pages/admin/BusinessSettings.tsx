import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import {
    ArrowLeft, Settings, Save, Loader2, DollarSign, Hash, Clock, MapPin
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface BusinessSettings {
    currency: string;
    timezone: string;
    orderNumberPrefix: string;
    invoiceNumberPrefix: string;
    defaultPaymentTerms: number;
    yandexGeocoderApiKey: string;
    openWeatherApiKey: string;
}

const CURRENCIES = [
    { code: 'UZS', name: 'Uzbek Sum', symbol: "so'm" },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
    { code: 'KZT', name: 'Kazakh Tenge', symbol: '₸' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
];

const TIMEZONES = [
    'Asia/Tashkent',
    'Asia/Almaty',
    'Europe/Moscow',
    'Europe/London',
    'America/New_York',
    'UTC',
];

const BusinessSettingsPage: Component = () => {
    const [saving, setSaving] = createSignal(false);

    const [data, { refetch }] = createResource(async () => {
        try {
            // api() helper already unwraps { success, data } and returns the data directly
            const result = await api<BusinessSettings>('/tenant/settings');
            return result;
        } catch {
            return null;
        }
    });

    const [form, setForm] = createStore<BusinessSettings>({
        currency: 'UZS',
        timezone: 'Asia/Tashkent',
        orderNumberPrefix: 'ORD-',
        invoiceNumberPrefix: 'INV-',
        defaultPaymentTerms: 7,
        yandexGeocoderApiKey: '',
        openWeatherApiKey: '',
    });

    createEffect(() => {
        const d = data();
        if (d) {
            setForm({
                currency: d.currency || 'UZS',
                timezone: d.timezone || 'Asia/Tashkent',
                orderNumberPrefix: d.orderNumberPrefix ?? 'ORD-',
                invoiceNumberPrefix: d.invoiceNumberPrefix ?? 'INV-',
                defaultPaymentTerms: d.defaultPaymentTerms ?? 7,
                yandexGeocoderApiKey: d.yandexGeocoderApiKey ?? '',
                openWeatherApiKey: d.openWeatherApiKey ?? '',
            });
        }
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            await api('/tenant/settings', {
                method: 'PUT',
                body: JSON.stringify(form)
            });
            toast.success('Business settings saved!');
            await refetch();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const selectedCurrency = () => CURRENCIES.find(c => c.code === form.currency);

    return (
        <div class="p-6 lg:p-8 max-w-3xl mx-auto">
            <A
                href="/admin/settings"
                class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft class="w-4 h-4" />
                Back to Settings
            </A>

            <div class="mb-8">
                <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Settings class="w-5 h-5 text-white" />
                    </div>
                    Business Settings
                </h1>
                <p class="text-slate-400 mt-2">
                    Configure currency, tax rates, and document settings
                </p>
            </div>

            <Show when={data.loading}>
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            </Show>

            <Show when={!data.loading}>
                <div class="space-y-6">
                    {/* Currency & Timezone */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <DollarSign class="w-5 h-5 text-emerald-400" />
                            Regional Settings
                        </h3>
                        <div class="grid gap-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Currency</label>
                                    <select
                                        value={form.currency}
                                        onChange={(e) => setForm('currency', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {CURRENCIES.map(c => (
                                            <option value={c.code}>
                                                {c.code} - {c.name} ({c.symbol})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Timezone</label>
                                    <select
                                        value={form.timezone}
                                        onChange={(e) => setForm('timezone', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {TIMEZONES.map(tz => (
                                            <option value={tz}>{tz}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div class="p-4 bg-slate-800/50 rounded-xl">
                                <div class="flex items-center gap-3">
                                    <div class="text-2xl">
                                        {selectedCurrency()?.symbol || '$'}
                                    </div>
                                    <div>
                                        <div class="text-white font-medium">
                                            {selectedCurrency()?.name || 'US Dollar'}
                                        </div>
                                        <div class="text-sm text-slate-400">
                                            All prices will be displayed in {form.currency}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Document Numbering */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <Hash class="w-5 h-5 text-purple-400" />
                            Document Numbering
                        </h3>
                        <div class="grid gap-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Order Number Prefix</label>
                                    <input
                                        type="text"
                                        value={form.orderNumberPrefix}
                                        onInput={(e) => setForm('orderNumberPrefix', e.currentTarget.value)}
                                        placeholder="ORD-"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <p class="text-xs text-slate-500 mt-1">
                                        Example: {form.orderNumberPrefix}00001
                                    </p>
                                </div>
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Invoice Number Prefix</label>
                                    <input
                                        type="text"
                                        value={form.invoiceNumberPrefix}
                                        onInput={(e) => setForm('invoiceNumberPrefix', e.currentTarget.value)}
                                        placeholder="INV-"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <p class="text-xs text-slate-500 mt-1">
                                        Example: {form.invoiceNumberPrefix}00001
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payment Terms */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <Clock class="w-5 h-5 text-blue-400" />
                            Payment Terms
                        </h3>
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5">Default Payment Terms (Days)</label>
                            <div class="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="90"
                                    value={form.defaultPaymentTerms}
                                    onInput={(e) => setForm('defaultPaymentTerms', parseInt(e.currentTarget.value) || 0)}
                                    class="w-32 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span class="text-slate-500">days</span>
                            </div>
                            <p class="text-xs text-slate-500 mt-2">
                                Number of days customers have to pay their invoices. Common values: 7, 14, 30 days.
                            </p>
                        </div>
                    </div>

                    {/* Location Services */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <MapPin class="w-5 h-5 text-red-400" />
                            Location Services
                        </h3>
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5">Yandex Geocoder API Key</label>
                            <input
                                type="text"
                                value={form.yandexGeocoderApiKey}
                                onInput={(e) => setForm('yandexGeocoderApiKey', e.currentTarget.value)}
                                placeholder="Enter your Yandex Geocoder API key"
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <p class="text-xs text-slate-500 mt-2">
                                Get your API key from <a href="https://developer.tech.yandex.ru/" target="_blank" class="text-blue-400 hover:underline">Yandex Developer Console</a>.
                                Used for accurate address lookup in Uzbekistan.
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5">OpenWeather API Key</label>
                            <input
                                type="text"
                                value={form.openWeatherApiKey}
                                onInput={(e) => setForm('openWeatherApiKey', e.currentTarget.value)}
                                placeholder="Enter your OpenWeather API key"
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <p class="text-xs text-slate-500 mt-2">
                                Get your free API key from <a href="https://openweathermap.org/api" target="_blank" class="text-blue-400 hover:underline">OpenWeatherMap</a>.
                                Used for weather information in the sales dashboard.
                            </p>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div class="flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving()}
                            class="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={saving()} fallback={<Save class="w-5 h-5" />}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            Save Changes
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default BusinessSettingsPage;
