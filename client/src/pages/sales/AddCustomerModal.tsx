import { type Component, createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
    X,
    User,
    Phone,
    Mail,
    MapPin,
    Save,
    Loader2,
    Locate
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import { getYandexGeocoderApiKey } from '../../stores/settings';

interface AddCustomerModalProps {
    onClose: () => void;
    onSuccess: (customer?: any) => void;
}

const AddCustomerModal: Component<AddCustomerModalProps> = (props) => {
    const [loading, setLoading] = createSignal(false);
    const [formData, setFormData] = createSignal({
        name: '',
        phone: '',
        email: '',

        address: '',
        notes: '',
        latitude: '',
        longitude: ''
    });
    const [geoLoading, setGeoLoading] = createSignal(false);

    const getLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
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
                    // Reverse geocoding using Yandex Geocoder API (better coverage for Uzbekistan)
                    // Uses tenant-specific API key from settings
                    const apiKey = getYandexGeocoderApiKey();
                    if (!apiKey) {
                        toast.error('Yandex API key not configured. Ask your admin to set it in Business Settings.');
                        setGeoLoading(false);
                        return;
                    }
                    const response = await fetch(
                        `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&format=json&geocode=${longitude},${latitude}&lang=uz_UZ`
                    );
                    const data = await response.json();

                    const geoObject = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
                    if (geoObject?.metaDataProperty?.GeocoderMetaData?.text) {
                        setFormData(prev => ({ ...prev, address: geoObject.metaDataProperty.GeocoderMetaData.text }));
                        toast.success('Address updated from location');
                    } else if (geoObject?.name) {
                        setFormData(prev => ({ ...prev, address: geoObject.name }));
                        toast.success('Address updated from location');
                    }
                } catch (error) {
                    console.error('Yandex geocoding error:', error);
                    toast.error('Failed to get address from coordinates');
                } finally {
                    setGeoLoading(false);
                }
            },
            (error) => {
                setGeoLoading(false);
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        toast.error('Location permission denied. Please enable it in browser settings.');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        toast.error('Location information is unavailable. Check your GPS.');
                        break;
                    case error.TIMEOUT:
                        toast.error('Location request timed out.');
                        break;
                    default:
                        toast.error('An unknown error occurred getting location.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Clean up empty fields
            const payload: any = { ...formData() };
            Object.keys(payload).forEach(key => {
                if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });

            const result = await api.post('/customers', payload);
            toast.success('Customer created successfully');
            props.onSuccess(result);
            props.onClose();
        } catch (error: any) {
            toast.error(error.message || 'Failed to create customer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[100] overflow-y-auto flex items-end sm:items-center justify-center sm:p-4">
                <div class="w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-200">
                    {/* Header */}
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-xl font-bold text-white">New Customer</h2>
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
                                Business Name <span class="text-red-400">*</span>
                            </label>
                            <div class="relative group">
                                <User class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={formData().name}
                                    onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
                                    placeholder="Enter business name"
                                    class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>
                        </div>

                        {/* Contact Info Grid */}
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                    Phone
                                </label>
                                <div class="relative group">
                                    <Phone class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input
                                        type="tel"
                                        value={formData().phone}
                                        onInput={(e) => setFormData({ ...formData(), phone: e.currentTarget.value })}
                                        placeholder="Phone number"
                                        class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    />
                                </div>
                            </div>

                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                    Email
                                </label>
                                <div class="relative group">
                                    <Mail class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <input
                                        type="email"
                                        value={formData().email}
                                        onInput={(e) => setFormData({ ...formData(), email: e.currentTarget.value })}
                                        placeholder="Email address"
                                        class="w-full pl-12 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                Address
                            </label>
                            <div class="relative group">
                                <MapPin class="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <textarea
                                    value={formData().address}
                                    onInput={(e) => setFormData({ ...formData(), address: e.currentTarget.value })}
                                    placeholder="Full address"
                                    rows="2"
                                    class="w-full pl-12 pr-12 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium resize-none"
                                />
                                <button
                                    type="button"
                                    onClick={getLocation}
                                    disabled={geoLoading()}
                                    class="absolute right-3 top-3 p-1.5 rounded-lg bg-slate-800 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors disabled:opacity-50"
                                    title="Use current location"
                                >
                                    <Show when={!geoLoading()} fallback={<Loader2 class="w-4 h-4 animate-spin" />}>
                                        <Locate class="w-4 h-4" />
                                    </Show>
                                </button>
                            </div>
                        </div>

                        {/* Notes */}
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                Notes
                            </label>
                            <textarea
                                value={formData().notes}
                                onInput={(e) => setFormData({ ...formData(), notes: e.currentTarget.value })}
                                placeholder="Additional notes..."
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
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading()}
                                class="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Show when={!loading()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
                                    <Save class="w-5 h-5" />
                                    Save Customer
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
