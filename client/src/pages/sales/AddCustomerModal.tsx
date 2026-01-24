import { type Component, createSignal, Show, onMount, For, createResource } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
    X,
    User,
    Phone,
    MapPin,
    Save,
    Loader2,
    Locate,
    Map,
    Navigation,
    ChevronDown
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import { getYandexGeocoderApiKey, initSettings } from '../../stores/settings';
import { useI18n } from '../../i18n';

interface Territory {
    id: string;
    name: string;
    level?: number;
}

interface AddCustomerModalProps {
    onClose: () => void;
    onSuccess: (customer?: any) => void;
}

const AddCustomerModal: Component<AddCustomerModalProps> = (props) => {
    const { t } = useI18n();
    const [loading, setLoading] = createSignal(false);
    const [formData, setFormData] = createSignal({
        name: '',
        phone: '',
        address: '',
        waymark: '',
        territoryId: '',
        notes: '',
        latitude: '',
        longitude: ''
    });
    const [geoLoading, setGeoLoading] = createSignal(false);
    const [errors, setErrors] = createSignal<Record<string, string>>({});

    // Fetch territories
    const [territories] = createResource(async () => {
        try {
            const data = await api<Territory[]>('/customers/territories');
            return data || [];
        } catch {
            return [];
        }
    });

    // Refresh settings when modal opens to get latest API key
    onMount(() => {
        initSettings();
    });

    const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const toRad = (value: number) => (value * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    const fetchGeocode = async (lon: number, lat: number, apiKey: string) => {
        const response = await fetch(
            `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&format=json&geocode=${lon},${lat}&lang=uz_UZ&kind=house&results=1`
        );
        const data = await response.json();
        const geoObject = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
        const address = geoObject?.metaDataProperty?.GeocoderMetaData?.text || geoObject?.name || '';
        const pointStr = geoObject?.Point?.pos || '';
        const [pointLon, pointLat] = pointStr.split(' ').map(Number);
        const point = Number.isFinite(pointLat) && Number.isFinite(pointLon)
            ? { lat: pointLat, lon: pointLon }
            : null;
        return { address, point };
    };

    const resolveYandexApiKey = async () => {
        let apiKey = getYandexGeocoderApiKey();
        if (apiKey) return apiKey;

        try {
            await initSettings();
            apiKey = getYandexGeocoderApiKey();
            if (apiKey) return apiKey;
        } catch (e) {
            console.error('Settings refresh failed', e);
        }

        try {
            const res = await api<any>('/display-settings', {
                params: { _t: Date.now().toString() }
            });
            const resolved = res?.data ?? res;
            if (resolved?.yandexGeocoderApiKey) {
                return resolved.yandexGeocoderApiKey;
            }
        } catch (e) {
            console.error('Display settings fetch failed', e);
        }

        return '';
    };

    const getLocation = () => {
        if (!navigator.geolocation) {
            toast.error(t('salesApp.addCustomer.geoNotSupported'));
            return;
        }

        setGeoLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setFormData({
                    ...formData(),
                    latitude: latitude.toString(),
                    longitude: longitude.toString()
                });

                try {
                    const apiKey = await resolveYandexApiKey();

                    if (!apiKey) {
                        toast.error('Yandex API key not configured. Ask your admin to set it in Business Settings.');
                        setGeoLoading(false);
                        return;
                    }
                    const primary = await fetchGeocode(longitude, latitude, apiKey);
                    let best = primary;
                    if (primary.point) {
                        const dist = distanceKm(latitude, longitude, primary.point.lat, primary.point.lon);
                        if (dist > 5) {
                            const swapped = await fetchGeocode(latitude, longitude, apiKey);
                            if (swapped.point) {
                                const swappedDist = distanceKm(latitude, longitude, swapped.point.lat, swapped.point.lon);
                                if (swappedDist < dist) {
                                    best = swapped;
                                }
                            }
                        }
                    }
                    if (best.address) {
                        setFormData(prev => ({ ...prev, address: best.address }));
                        toast.success(t('salesApp.addCustomer.addressFromLocation'));
                    }
                } catch (error) {
                    console.error('Yandex geocoding error:', error);
                    toast.error(t('salesApp.addCustomer.geoFailed'));
                } finally {
                    setGeoLoading(false);
                }
            },
            (error) => {
                setGeoLoading(false);
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        toast.error(t('salesApp.addCustomer.permissionDenied'));
                        break;
                    case error.POSITION_UNAVAILABLE:
                        toast.error(t('salesApp.addCustomer.positionUnavailable'));
                        break;
                    case error.TIMEOUT:
                        toast.error(t('salesApp.addCustomer.timeout'));
                        break;
                    default:
                        toast.error(t('salesApp.addCustomer.unknownGeoError'));
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        const data = formData();

        if (!data.name.trim()) {
            newErrors.name = t('salesApp.addCustomer.required');
        }
        if (!data.phone.trim()) {
            newErrors.phone = t('salesApp.addCustomer.required');
        }
        if (!data.territoryId) {
            newErrors.territoryId = t('salesApp.addCustomer.required');
        }
        if (!data.address.trim()) {
            newErrors.address = t('salesApp.addCustomer.required');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();

        if (!validateForm()) {
            toast.error(t('salesApp.addCustomer.fillRequired') || 'Please fill all required fields');
            return;
        }

        setLoading(true);

        try {
            // Clean up empty fields
            const payload: any = { ...formData() };
            Object.keys(payload).forEach(key => {
                if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });
            if (payload.latitude !== undefined) {
                const parsedLatitude = Number(payload.latitude);
                if (Number.isFinite(parsedLatitude)) {
                    payload.latitude = parsedLatitude;
                } else {
                    delete payload.latitude;
                }
            }
            if (payload.longitude !== undefined) {
                const parsedLongitude = Number(payload.longitude);
                if (Number.isFinite(parsedLongitude)) {
                    payload.longitude = parsedLongitude;
                } else {
                    delete payload.longitude;
                }
            }

            const result = await api.post('/customers', payload);
            toast.success(t('salesApp.addCustomer.customerCreated'));
            props.onSuccess(result);
            props.onClose();
        } catch (error: any) {
            toast.error(error.message || t('salesApp.addCustomer.createFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] overflow-y-auto flex items-end sm:items-center justify-center sm:p-4">
                <div class="w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-xl font-bold text-white">{t('salesApp.addCustomer.title')}</h2>
                        <button
                            onClick={props.onClose}
                            class="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-4">
                        {/* Name */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.businessName')} <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <User class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    value={formData().name}
                                    onInput={(e) => {
                                        setFormData({ ...formData(), name: e.currentTarget.value });
                                        setErrors({ ...errors(), name: '' });
                                    }}
                                    placeholder={t('salesApp.addCustomer.enterName')}
                                    class={`w-full pl-12 pr-4 py-3 bg-slate-950/50 border rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium ${errors().name ? 'border-red-500' : 'border-slate-800'}`}
                                />
                            </div>
                            <Show when={errors().name}>
                                <p class="text-red-400 text-xs ml-1">{errors().name}</p>
                            </Show>
                        </div>

                        {/* Phone */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.phone')} <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <Phone class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="tel"
                                    value={formData().phone}
                                    onInput={(e) => {
                                        setFormData({ ...formData(), phone: e.currentTarget.value });
                                        setErrors({ ...errors(), phone: '' });
                                    }}
                                    placeholder={t('salesApp.addCustomer.phoneNumber')}
                                    class={`w-full pl-12 pr-4 py-3 bg-slate-950/50 border rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium ${errors().phone ? 'border-red-500' : 'border-slate-800'}`}
                                />
                            </div>
                            <Show when={errors().phone}>
                                <p class="text-red-400 text-xs ml-1">{errors().phone}</p>
                            </Show>
                        </div>

                        {/* Territory Dropdown */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.territory')} <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <Map class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <select
                                    value={formData().territoryId}
                                    onChange={(e) => {
                                        setFormData({ ...formData(), territoryId: e.currentTarget.value });
                                        setErrors({ ...errors(), territoryId: '' });
                                    }}
                                    class={`w-full pl-12 pr-10 py-3 bg-slate-950/50 border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium appearance-none cursor-pointer ${errors().territoryId ? 'border-red-500' : 'border-slate-800'} ${!formData().territoryId ? 'text-slate-500' : ''}`}
                                >
                                    <option value="" class="bg-slate-900">{t('salesApp.addCustomer.selectTerritory')}</option>
                                    <For each={territories() || []}>
                                        {(territory) => (
                                            <option value={territory.id} class="bg-slate-900">{territory.name}</option>
                                        )}
                                    </For>
                                </select>
                                <ChevronDown class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                            </div>
                            <Show when={errors().territoryId}>
                                <p class="text-red-400 text-xs ml-1">{errors().territoryId}</p>
                            </Show>
                        </div>

                        {/* Address */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.address')} <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <MapPin class="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <textarea
                                    value={formData().address}
                                    onInput={(e) => {
                                        setFormData({ ...formData(), address: e.currentTarget.value });
                                        setErrors({ ...errors(), address: '' });
                                    }}
                                    placeholder={t('salesApp.addCustomer.fullAddress')}
                                    rows="2"
                                    class={`w-full pl-12 pr-12 py-3 bg-slate-950/50 border rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium resize-none ${errors().address ? 'border-red-500' : 'border-slate-800'}`}
                                />
                                <button
                                    type="button"
                                    onClick={getLocation}
                                    disabled={geoLoading()}
                                    class="absolute right-3 top-3 p-1.5 rounded-lg bg-slate-800 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors disabled:opacity-50"
                                    title={t('salesApp.addCustomer.useLocation') || 'Use current location'}
                                >
                                    <Show when={!geoLoading()} fallback={<Loader2 class="w-4 h-4 animate-spin" />}>
                                        <Locate class="w-4 h-4" />
                                    </Show>
                                </button>
                            </div>
                            <Show when={errors().address}>
                                <p class="text-red-400 text-xs ml-1">{errors().address}</p>
                            </Show>
                        </div>

                        {/* Waymark (Mo'ljal) */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.waymark')}
                            </label>
                            <div class="relative group">
                                <Navigation class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    value={formData().waymark}
                                    onInput={(e) => setFormData({ ...formData(), waymark: e.currentTarget.value })}
                                    placeholder={t('salesApp.addCustomer.waymarkPlaceholder')}
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>
                            <p class="text-slate-500 text-xs ml-1">{t('salesApp.addCustomer.waymarkHint')}</p>
                        </div>

                        {/* Notes */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                {t('salesApp.addCustomer.notes')}
                            </label>
                            <textarea
                                value={formData().notes}
                                onInput={(e) => setFormData({ ...formData(), notes: e.currentTarget.value })}
                                placeholder={t('salesApp.addCustomer.additionalNotes')}
                                rows="2"
                                class="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium resize-none"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div class="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={props.onClose}
                                class="flex-1 py-3.5 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 active:scale-[0.98] transition-all"
                            >
                                {t('salesApp.common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading()}
                                class="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Show when={!loading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                    <Save class="w-5 h-5" />
                                    {t('salesApp.common.save')}
                                </Show>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
};

export default AddCustomerModal;
