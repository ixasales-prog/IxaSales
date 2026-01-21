import { type Component, createSignal, createResource, Show, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import {
    ArrowLeft, Building2, Save, Loader2, MapPin, Phone, Camera
} from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

interface CompanyProfile {
    name: string;
    subdomain: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
    logo?: string;
}

const CompanyProfile: Component = () => {
    const [saving, setSaving] = createSignal(false);
    const [logoPreview, setLogoPreview] = createSignal<string | null>(null);
    const [logoError, setLogoError] = createSignal(false);

    const [data, { refetch }] = createResource(async () => {
        try {
            // api() helper already unwraps { success, data } and returns the data directly
            const result = await api<CompanyProfile>('/tenant/profile');
            return result;
        } catch {
            return null;
        }
    });

    const [form, setForm] = createStore<CompanyProfile>({
        name: '',
        subdomain: '',
        address: '',
        city: '',
        country: '',
        phone: '',
        email: '',
        website: '',
        taxId: '',
        logo: '',
    });

    createEffect(() => {
        const d = data();
        if (d) {
            setForm({
                name: d.name || '',
                subdomain: d.subdomain || '',
                address: d.address || '',
                city: d.city || '',
                country: d.country || '',
                phone: d.phone || '',
                email: d.email || '',
                website: d.website || '',
                taxId: d.taxId || '',
                logo: d.logo || '',
            });
            if (d.logo) {
                setLogoPreview(d.logo);
            }
        }
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            await api('/tenant/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    name: form.name,
                    address: form.address,
                    city: form.city,
                    country: form.country,
                    phone: form.phone,
                    email: form.email,
                    website: form.website,
                    taxId: form.taxId,
                    logo: form.logo,
                })
            });
            toast.success('Company profile saved!');
            await refetch();
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

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
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <Building2 class="w-5 h-5 text-white" />
                    </div>
                    Company Profile
                </h1>
                <p class="text-slate-400 mt-2">
                    Manage your company information and branding
                </p>
            </div>

            <Show when={data.loading}>
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            </Show>

            <Show when={!data.loading}>
                <div class="space-y-6">
                    {/* Logo Section */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <Camera class="w-5 h-5 text-slate-400" />
                            Company Logo
                        </h3>
                        <div class="flex items-center gap-6">
                            <div class="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
                                <Show
                                    when={logoPreview() && !logoError()}
                                    fallback={<Building2 class="w-10 h-10 text-slate-600" />}
                                >
                                    <img
                                        src={logoPreview()!}
                                        alt="Logo"
                                        class="w-full h-full object-cover"
                                        onError={() => setLogoError(true)}
                                        onLoad={() => setLogoError(false)}
                                    />
                                </Show>
                            </div>
                            <div class="flex-1">
                                <input
                                    type="url"
                                    value={form.logo || ''}
                                    onInput={(e) => {
                                        setForm('logo', e.currentTarget.value);
                                        setLogoPreview(e.currentTarget.value);
                                        setLogoError(false);
                                    }}
                                    placeholder="https://example.com/logo.png"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <p class="text-xs text-slate-500 mt-2">
                                    Enter a URL to your logo image (PNG, JPG, or SVG)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4">Basic Information</h3>
                        <div class="grid gap-4">
                            <div>
                                <label class="block text-sm text-slate-400 mb-1.5">Company Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onInput={(e) => setForm('name', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Subdomain</label>
                                    <div class="flex items-center bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                        <span class="px-3 text-slate-500 bg-slate-900">{form.subdomain}</span>
                                        <span class="px-3 text-slate-600">.ixasales.com</span>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Tax ID / Registration</label>
                                    <input
                                        type="text"
                                        value={form.taxId || ''}
                                        onInput={(e) => setForm('taxId', e.currentTarget.value)}
                                        placeholder="e.g., 123456789"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Address */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <MapPin class="w-5 h-5 text-slate-400" />
                            Address
                        </h3>
                        <div class="grid gap-4">
                            <div>
                                <label class="block text-sm text-slate-400 mb-1.5">Street Address</label>
                                <input
                                    type="text"
                                    value={form.address || ''}
                                    onInput={(e) => setForm('address', e.currentTarget.value)}
                                    placeholder="123 Business Street"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">City</label>
                                    <input
                                        type="text"
                                        value={form.city || ''}
                                        onInput={(e) => setForm('city', e.currentTarget.value)}
                                        placeholder="Tashkent"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Country</label>
                                    <input
                                        type="text"
                                        value={form.country || ''}
                                        onInput={(e) => setForm('country', e.currentTarget.value)}
                                        placeholder="Uzbekistan"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                            <Phone class="w-5 h-5 text-slate-400" />
                            Contact Information
                        </h3>
                        <div class="grid gap-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Phone</label>
                                    <input
                                        type="tel"
                                        value={form.phone || ''}
                                        onInput={(e) => setForm('phone', e.currentTarget.value)}
                                        placeholder="+998 90 123 45 67"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label class="block text-sm text-slate-400 mb-1.5">Email</label>
                                    <input
                                        type="email"
                                        value={form.email || ''}
                                        onInput={(e) => setForm('email', e.currentTarget.value)}
                                        placeholder="contact@company.com"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm text-slate-400 mb-1.5">Website</label>
                                <input
                                    type="url"
                                    value={form.website || ''}
                                    onInput={(e) => setForm('website', e.currentTarget.value)}
                                    placeholder="https://www.company.com"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
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

export default CompanyProfile;
