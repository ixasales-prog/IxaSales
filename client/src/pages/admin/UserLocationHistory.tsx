/**
 * User Location History Page
 *
 * View historical location data for a specific user.
 */

import { type Component, createResource, createSignal, For, Show } from 'solid-js';
import { Calendar, User } from 'lucide-solid';
import { api } from '../../lib/api';
import UserLocationMap from '../../components/gps-tracking/UserLocationMap';
import PageHeader from '../../components/page/PageHeader';
import PageSection from '../../components/page/PageSection';
import PageShell from '../../components/page/PageShell';
import PageState, { PageLoadingState } from '../../components/page/PageState';

interface LocationPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
}

interface UserRecord {
  id: string;
  name: string;
  role: string;
}

const UserLocationHistory: Component = () => {
  const [selectedUserId, setSelectedUserId] = createSignal('');
  const [startDate, setStartDate] = createSignal('');
  const [endDate, setEndDate] = createSignal('');

  const [users] = createResource(async () => {
    try {
      const allUsers = await api<UserRecord[]>('/users');
      return allUsers.filter((user) => ['sales_rep', 'driver'].includes(user.role));
    } catch {
      return [] as UserRecord[];
    }
  });

  const [history] = createResource(
    () => selectedUserId() && startDate() && endDate(),
    async () => {
      if (!selectedUserId() || !startDate() || !endDate()) return [] as LocationPoint[];
      try {
        return await api<LocationPoint[]>('/gps-tracking/history', {
          params: {
            userId: selectedUserId(),
            startDate: startDate(),
            endDate: endDate(),
          },
        });
      } catch {
        return [] as LocationPoint[];
      }
    },
  );

  const setDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);

    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  if (!startDate() && !endDate()) {
    setDefaultDates();
  }

  return (
    <PageShell>
      <div class="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Location History"
          description="Review historical GPS traces for a selected sales rep or driver."
          backHref="/admin/gps-tracking"
          backLabel="Back to GPS settings"
        />

        <PageSection title="Filters" description="Select a user and date range to render the history path and detailed timeline.">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label class="mb-1.5 flex items-center gap-2 text-sm text-slate-400">
                <User class="h-4 w-4" />
                User
              </label>
              <select
                value={selectedUserId()}
                onChange={(e) => setSelectedUserId(e.currentTarget.value)}
                class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a user...</option>
                <For each={users()}>
                  {(user) => <option value={user.id}>{user.name} ({user.role === 'sales_rep' ? 'Sales Rep' : 'Driver'})</option>}
                </For>
              </select>
            </div>

            <div>
              <label class="mb-1.5 flex items-center gap-2 text-sm text-slate-400">
                <Calendar class="h-4 w-4" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate()}
                onInput={(e) => setStartDate(e.currentTarget.value)}
                max={endDate() || undefined}
                class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="mb-1.5 flex items-center gap-2 text-sm text-slate-400">
                <Calendar class="h-4 w-4" />
                End Date
              </label>
              <input
                type="date"
                value={endDate()}
                onInput={(e) => setEndDate(e.currentTarget.value)}
                min={startDate() || undefined}
                max={new Date().toISOString().split('T')[0]}
                class="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </PageSection>

        <Show
          when={selectedUserId() && startDate() && endDate()}
          fallback={<PageState title="Choose filters to view history" description="Select a user plus a start and end date to load the map and timeline." />}
        >
          <Show when={!history.loading} fallback={<PageLoadingState title="Loading location history" description="Fetching route points for the selected filters." />}>
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <PageSection class="lg:col-span-2 overflow-hidden" contentClass="p-0">
                <div class="h-[520px] lg:h-[620px]">
                  <UserLocationMap
                    history={(history() || []).map((point) => ({
                      latitude: point.latitude,
                      longitude: point.longitude,
                      timestamp: point.timestamp,
                    }))}
                  />
                </div>
              </PageSection>

              <PageSection title={`Timeline (${history()?.length || 0} points)`} description="Chronological location points returned for the selected date range.">
                <Show
                  when={history() && history()!.length > 0}
                  fallback={<PageState title="No location data found" description="No GPS points were returned for the selected user and dates." />}
                >
                  <div class="max-h-[620px] space-y-2 overflow-y-auto">
                    <For each={history()}>
                      {(point) => (
                        <div class="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div class="text-sm font-medium text-white">{new Date(point.timestamp).toLocaleString()}</div>
                          <div class="mt-1 text-xs text-slate-400">
                            {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                            {point.accuracy ? ` • Accuracy: ${Math.round(point.accuracy)}m` : ''}
                            {point.speed ? ` • Speed: ${Math.round(point.speed * 3.6)} km/h` : ''}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </PageSection>
            </div>
          </Show>
        </Show>
      </div>
    </PageShell>
  );
};

export default UserLocationHistory;
