/**
 * GPS Tracking Settings Page
 * 
 * Allows tenant admins to configure GPS tracking settings and manage
 * user tracking preferences.
 */

import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft, Save, Loader2, Users, Settings as SettingsIcon, Map, History } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';

// ============================================================================
// TYPES
// ============================================================================

interface GPSTrackingSettings {
    enabled: boolean;
    movementThreshold: number;
    fallbackInterval: number;
    historyRetentionDays: number;
    minAccuracy: number;
}

interface TrackedUser {
    id: string;
    name: string;
    role: string;
    gpsTrackingEnabled: boolean;
    lastLocationUpdateAt?: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

const GPSTrackingSettingsPage: Component = () => {
    const [saving, setSaving] = createSignal(false);
    const [form, setForm] = createSignal<GPSTrackingSettings>({
        enabled: false,
        movementThreshold: 50,
        fallbackInterval: 300,
        historyRetentionDays: 30,
        minAccuracy: 50,
    });

    // Fetch settings
    const [settings, { refetch: refetchSettings }] = createResource(async () => {
        try {
            const data = await api<GPSTrackingSettings>('/gps-tracking/settings');
            setForm(data);
            return data;
        } catch (err: any) {
            console.error('Failed to load GPS settings:', err);
            toast.error(err.message || 'Failed to load GPS tracking settings');
            return null;
        }
    });

    // Fetch tracked users
    const [users, { refetch: refetchUsers }] = createResource(async () => {
        try {
            // Get all users and filter for sales_rep and driver
            const allUsers = await api<any[]>('/users');
            return allUsers.filter((u: any) => ['sales_rep', 'driver'].includes(u.role)) as TrackedUser[];
        } catch (err: any) {
            console.error('Failed to load users:', err);
            return [];
        }
    });

    // Save settings
    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/gps-tracking/settings', form());
            toast.success('GPS tracking settings saved');
            refetchSettings();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    // Toggle user tracking
    const toggleUserTracking = async (userId: string, enabled: boolean) => {
        try {
            await api.put(`/gps-tracking/users/${userId}/tracking`, { enabled });
            toast.success(`GPS tracking ${enabled ? 'enabled' : 'disabled'} for user`);
            refetchUsers();
        } catch (err: any) {
            toast.error(err.message || 'Failed to update user tracking');
        }
    };

    return (
        <div class="min-h-screen bg-slate-950 text-white p-6">
            <div class="max-w-4xl mx-auto">
                {/* Header */}
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-4">
                        <A href="/admin/settings" class="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                            <ArrowLeft class="w-5 h-5" />
                        </A>
                        <div>
                            <h1 class="text-2xl font-bold">GPS Tracking Settings</h1>
                            <p class="text-slate-400 text-sm mt-1">Configure location tracking for sales reps and drivers</p>
                        </div>
                    </div>
                    <Show when={form().enabled}>
                        <div class="flex gap-2">
                            <A
                                href="/admin/gps-tracking/map"
                                class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                            >
                                <Map class="w-4 h-4" />
                                View Map
                            </A>
                            <A
                                href="/admin/gps-tracking/history"
                                class="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                            >
                                <History class="w-4 h-4" />
                                History
                            </A>
                        </div>
                    </Show>
                </div>

                <Show when={settings()}>
                    <div class="space-y-6">
                        {/* Main Settings */}
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                                <SettingsIcon class="w-5 h-5 text-blue-400" />
                                Tracking Configuration
                            </h3>

                            {/* Enable/Disable */}
                            <div class="mb-6">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form().enabled}
                                        onChange={(e) => setForm({ ...form(), enabled: e.currentTarget.checked })}
                                        class="w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div>
                                        <span class="text-white font-medium">Enable GPS Tracking</span>
                                        <p class="text-xs text-slate-400 mt-1">
                                            When enabled, sales reps and drivers can be tracked via GPS
                                        </p>
                                    </div>
                                </label>
                            </div>

                            <Show when={form().enabled}>
                                {/* Movement Threshold */}
                                <div class="mb-4">
                                    <label class="block text-sm text-slate-400 mb-1.5">Movement Threshold (meters)</label>
                                    <select
                                        value={form().movementThreshold}
                                        onChange={(e) => setForm({ ...form(), movementThreshold: parseInt(e.currentTarget.value) })}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value={20}>20 meters</option>
                                        <option value={50}>50 meters</option>
                                        <option value={100}>100 meters</option>
                                        <option value={200}>200 meters</option>
                                    </select>
                                    <p class="text-xs text-slate-500 mt-2">
                                        Minimum distance user must move before sending location update
                                    </p>
                                </div>

                                {/* Fallback Interval */}
                                <div class="mb-4">
                                    <label class="block text-sm text-slate-400 mb-1.5">Fallback Update Interval</label>
                                    <select
                                        value={form().fallbackInterval}
                                        onChange={(e) => setForm({ ...form(), fallbackInterval: parseInt(e.currentTarget.value) })}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value={120}>2 minutes</option>
                                        <option value={300}>5 minutes</option>
                                        <option value={600}>10 minutes</option>
                                    </select>
                                    <p class="text-xs text-slate-500 mt-2">
                                        Send location update even if user hasn't moved (to confirm they're still active)
                                    </p>
                                </div>

                                {/* History Retention */}
                                <div class="mb-4">
                                    <label class="block text-sm text-slate-400 mb-1.5">History Retention (days)</label>
                                    <input
                                        type="number"
                                        value={form().historyRetentionDays}
                                        onInput={(e) => setForm({ ...form(), historyRetentionDays: parseInt(e.currentTarget.value) || 30 })}
                                        min="7"
                                        max="90"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <p class="text-xs text-slate-500 mt-2">
                                        How long to keep location history (7-90 days)
                                    </p>
                                </div>

                                {/* Minimum Accuracy */}
                                <div class="mb-4">
                                    <label class="block text-sm text-slate-400 mb-1.5">Minimum GPS Accuracy (meters)</label>
                                    <input
                                        type="number"
                                        value={form().minAccuracy}
                                        onInput={(e) => setForm({ ...form(), minAccuracy: parseInt(e.currentTarget.value) || 50 })}
                                        min="10"
                                        max="100"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                    <p class="text-xs text-slate-500 mt-2">
                                        Reject location updates with accuracy worse than this (10-100 meters)
                                    </p>
                                </div>
                            </Show>
                        </div>

                        {/* Tracked Users */}
                        <Show when={form().enabled && users()}>
                            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                                <h3 class="text-white font-medium mb-4 flex items-center gap-2">
                                    <Users class="w-5 h-5 text-green-400" />
                                    Tracked Users
                                </h3>

                                <div class="space-y-3">
                                    <For each={users()}>
                                        {(user) => (
                                            <div class="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                                                <div>
                                                    <div class="text-white font-medium">{user.name}</div>
                                                    <div class="text-sm text-slate-400 mt-1">
                                                        {user.role === 'sales_rep' ? 'Sales Rep' : 'Driver'}
                                                        {user.lastLocationUpdateAt && (
                                                            <span class="ml-2">
                                                                • Last update: {new Date(user.lastLocationUpdateAt).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <label class="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={user.gpsTrackingEnabled}
                                                        onChange={(e) => toggleUserTracking(user.id, e.currentTarget.checked)}
                                                        class="w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <span class="text-sm text-slate-300">
                                                        {user.gpsTrackingEnabled ? 'Enabled' : 'Disabled'}
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>

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
        </div>
    );
};

export default GPSTrackingSettingsPage;
