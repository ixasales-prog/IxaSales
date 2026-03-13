/**
 * GPS Tracking Settings Page
 *
 * Allows tenant admins to configure GPS tracking settings and manage
 * user tracking preferences.
 */

import { type Component, createResource, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { History, Loader2, Map, Save, Settings as SettingsIcon, Users } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import PageHeader from '../../components/page/PageHeader';
import PageSection from '../../components/page/PageSection';
import PageShell from '../../components/page/PageShell';
import PageState, { PageLoadingState } from '../../components/page/PageState';

interface GPSTrackingSettings {
  enabled: boolean;
  movementThreshold: number;
  fallbackInterval: number;
  historyRetentionDays: number;
  minAccuracy: number;
}

interface UserRecord {
  id: string;
  name: string;
  role: string;
  gpsTrackingEnabled?: boolean;
  lastLocationUpdateAt?: string | null;
}

interface TrackedUser {
  id: string;
  name: string;
  role: string;
  gpsTrackingEnabled: boolean;
  lastLocationUpdateAt?: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const GPSTrackingSettingsPage: Component = () => {
  const [saving, setSaving] = createSignal(false);
  const [form, setForm] = createSignal<GPSTrackingSettings>({
    enabled: false,
    movementThreshold: 50,
    fallbackInterval: 300,
    historyRetentionDays: 30,
    minAccuracy: 50,
  });

  const [settings, { refetch: refetchSettings }] = createResource(async () => {
    try {
      const data = await api<GPSTrackingSettings>('/gps-tracking/settings');
      setForm(data);
      return data;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load GPS tracking settings'));
      return null;
    }
  });

  const [users, { refetch: refetchUsers }] = createResource(async () => {
    try {
      const allUsers = await api<UserRecord[]>('/users');
      return allUsers
        .filter((user) => ['sales_rep', 'driver'].includes(user.role))
        .map(
          (user): TrackedUser => ({
            id: user.id,
            name: user.name,
            role: user.role,
            gpsTrackingEnabled: Boolean(user.gpsTrackingEnabled),
            lastLocationUpdateAt: user.lastLocationUpdateAt ?? null,
          }),
        );
    } catch {
      return [] as TrackedUser[];
    }
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/gps-tracking/settings', form());
      toast.success('GPS tracking settings saved');
      refetchSettings();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const toggleUserTracking = async (userId: string, enabled: boolean) => {
    try {
      await api.put(`/gps-tracking/users/${userId}/tracking`, { enabled });
      toast.success(`GPS tracking ${enabled ? 'enabled' : 'disabled'} for user`);
      refetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user tracking'));
    }
  };

  return (
    <PageShell>
      <div class="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="GPS Tracking Settings"
          description="Configure location tracking thresholds, retention rules, and user-level access."
          backHref="/admin"
          backLabel="Back to admin"
          actions={
            <Show when={form().enabled}>
              <A
                href="/admin/gps-tracking/map"
                class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <Map class="h-4 w-4" />
                View Map
              </A>
              <A
                href="/admin/gps-tracking/history"
                class="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600"
              >
                <History class="h-4 w-4" />
                History
              </A>
            </Show>
          }
        />

        <Show when={!settings.loading} fallback={<PageLoadingState title="Loading GPS settings" description="Fetching tenant tracking configuration and user availability." />}>
          <Show
            when={settings()}
            fallback={
              <PageState
                tone="error"
                title="Unable to load GPS tracking"
                description="The tracking configuration could not be loaded. Refresh the page and try again."
              />
            }
          >
            <div class="space-y-6">
              <PageSection title="Tracking Configuration" description="Define the conditions under which location updates are accepted and retained.">
                <div class="space-y-4">
                  <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <label class="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={form().enabled}
                        onChange={(e) => setForm({ ...form(), enabled: e.currentTarget.checked })}
                        class="mt-0.5 h-5 w-5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div>
                        <div class="flex items-center gap-2 text-white">
                          <SettingsIcon class="h-4 w-4 text-blue-400" />
                          <span class="font-medium">Enable GPS Tracking</span>
                        </div>
                        <p class="mt-1 text-xs text-slate-400">
                          When enabled, sales reps and drivers can send GPS updates to the platform.
                        </p>
                      </div>
                    </label>
                  </div>

                  <Show when={form().enabled}>
                    <div class="grid gap-4 md:grid-cols-2">
                      <div>
                        <label class="mb-1.5 block text-sm text-slate-400">Movement Threshold (meters)</label>
                        <select
                          value={form().movementThreshold}
                          onChange={(e) => setForm({ ...form(), movementThreshold: Number.parseInt(e.currentTarget.value, 10) })}
                          class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={20}>20 meters</option>
                          <option value={50}>50 meters</option>
                          <option value={100}>100 meters</option>
                          <option value={200}>200 meters</option>
                        </select>
                        <p class="mt-2 text-xs text-slate-500">Minimum distance a user must move before sending a new location update.</p>
                      </div>

                      <div>
                        <label class="mb-1.5 block text-sm text-slate-400">Fallback Update Interval</label>
                        <select
                          value={form().fallbackInterval}
                          onChange={(e) => setForm({ ...form(), fallbackInterval: Number.parseInt(e.currentTarget.value, 10) })}
                          class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={120}>2 minutes</option>
                          <option value={300}>5 minutes</option>
                          <option value={600}>10 minutes</option>
                        </select>
                        <p class="mt-2 text-xs text-slate-500">Send a heartbeat update even when the user has not moved.</p>
                      </div>

                      <div>
                        <label class="mb-1.5 block text-sm text-slate-400">History Retention (days)</label>
                        <input
                          type="number"
                          value={form().historyRetentionDays}
                          onInput={(e) =>
                            setForm({ ...form(), historyRetentionDays: Number.parseInt(e.currentTarget.value, 10) || 30 })
                          }
                          min="7"
                          max="90"
                          class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p class="mt-2 text-xs text-slate-500">How long location history is retained, from 7 to 90 days.</p>
                      </div>

                      <div>
                        <label class="mb-1.5 block text-sm text-slate-400">Minimum GPS Accuracy (meters)</label>
                        <input
                          type="number"
                          value={form().minAccuracy}
                          onInput={(e) => setForm({ ...form(), minAccuracy: Number.parseInt(e.currentTarget.value, 10) || 50 })}
                          min="10"
                          max="100"
                          class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p class="mt-2 text-xs text-slate-500">Location updates worse than this accuracy threshold are rejected.</p>
                      </div>
                    </div>
                  </Show>
                </div>
              </PageSection>

              <Show when={form().enabled}>
                <PageSection title="Tracked Users" description="Enable or disable GPS collection for individual sales reps and drivers.">
                  <Show
                    when={(users() || []).length > 0}
                    fallback={<PageState title="No eligible users" description="There are no sales reps or drivers available for tracking in this tenant." />}
                  >
                    <div class="space-y-3">
                      <For each={users()}>
                        {(user) => (
                          <div class="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div class="flex items-center gap-2 text-white">
                                <Users class="h-4 w-4 text-green-400" />
                                <span class="font-medium">{user.name}</span>
                              </div>
                              <div class="mt-1 text-sm text-slate-400">
                                {user.role === 'sales_rep' ? 'Sales Rep' : 'Driver'}
                                {user.lastLocationUpdateAt ? (
                                  <span class="ml-2">• Last update: {new Date(user.lastLocationUpdateAt).toLocaleString()}</span>
                                ) : null}
                              </div>
                            </div>

                            <label class="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={user.gpsTrackingEnabled}
                                onChange={(e) => toggleUserTracking(user.id, e.currentTarget.checked)}
                                class="h-5 w-5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                              />
                              <span class="text-sm text-slate-300">{user.gpsTrackingEnabled ? 'Enabled' : 'Disabled'}</span>
                            </label>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </PageSection>
              </Show>

              <div class="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving()}
                  class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  <Show when={saving()} fallback={<Save class="h-5 w-5" />}>
                    <Loader2 class="h-5 w-5 animate-spin" />
                  </Show>
                  Save Changes
                </button>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </PageShell>
  );
};

export default GPSTrackingSettingsPage;
