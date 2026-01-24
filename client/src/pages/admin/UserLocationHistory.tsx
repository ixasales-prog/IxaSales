/**
 * User Location History Page
 * 
 * View historical location data for a specific user.
 */

import { type Component, createSignal, createResource, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft, Calendar, User } from 'lucide-solid';
import { api } from '../../lib/api';
import UserLocationMap from '../../components/gps-tracking/UserLocationMap';

interface LocationPoint {
    id: string;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    timestamp: string;
}

interface User {
    id: string;
    name: string;
    role: string;
}

const UserLocationHistory: Component = () => {
    const [selectedUserId, setSelectedUserId] = createSignal<string>('');
    const [startDate, setStartDate] = createSignal<string>('');
    const [endDate, setEndDate] = createSignal<string>('');

    // Fetch users (sales reps and drivers)
    const [users] = createResource(async () => {
        try {
            const allUsers = await api<User[]>('/users');
            return allUsers.filter(u => ['sales_rep', 'driver'].includes(u.role));
        } catch (err) {
            console.error('Failed to load users:', err);
            return [];
        }
    });

    // Fetch location history
    const [history] = createResource(
        () => selectedUserId() && startDate() && endDate(),
        async () => {
            if (!selectedUserId() || !startDate() || !endDate()) return [];
            try {
                const data = await api<LocationPoint[]>('/gps-tracking/history', {
                    params: {
                        userId: selectedUserId(),
                        startDate: startDate(),
                        endDate: endDate(),
                    },
                });
                return data;
            } catch (err: any) {
                console.error('Failed to load history:', err);
                return [];
            }
        }
    );

    // Set default dates (last 24 hours)
    const setDefaultDates = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 1);

        setEndDate(end.toISOString().split('T')[0]);
        setStartDate(start.toISOString().split('T')[0]);
    };

    // Initialize default dates
    if (!startDate() && !endDate()) {
        setDefaultDates();
    }

    // const selectedUser = () => users()?.find(u => u.id === selectedUserId());

    return (
        <div class="min-h-screen bg-slate-950 text-white p-6">
            <div class="max-w-7xl mx-auto">
                {/* Header */}
                <div class="flex items-center gap-4 mb-6">
                    <A href="/admin/gps-tracking" class="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <ArrowLeft class="w-5 h-5" />
                    </A>
                    <div>
                        <h1 class="text-2xl font-bold">Location History</h1>
                        <p class="text-slate-400 text-sm mt-1">View historical location data for users</p>
                    </div>
                </div>

                {/* Filters */}
                <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* User Selection */}
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5 flex items-center gap-2">
                                <User class="w-4 h-4" />
                                User
                            </label>
                            <select
                                value={selectedUserId()}
                                onChange={(e) => setSelectedUserId(e.currentTarget.value)}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="">Select a user...</option>
                                <For each={users()}>
                                    {(user) => (
                                        <option value={user.id}>
                                            {user.name} ({user.role === 'sales_rep' ? 'Sales Rep' : 'Driver'})
                                        </option>
                                    )}
                                </For>
                            </select>
                        </div>

                        {/* Start Date */}
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5 flex items-center gap-2">
                                <Calendar class="w-4 h-4" />
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate()}
                                onInput={(e) => setStartDate(e.currentTarget.value)}
                                max={endDate() || undefined}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        {/* End Date */}
                        <div>
                            <label class="block text-sm text-slate-400 mb-1.5 flex items-center gap-2">
                                <Calendar class="w-4 h-4" />
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate()}
                                onInput={(e) => setEndDate(e.currentTarget.value)}
                                min={startDate() || undefined}
                                max={new Date().toISOString().split('T')[0]}
                                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Map and History */}
                <Show when={selectedUserId() && startDate() && endDate() && history()}>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Map */}
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <h3 class="text-white font-medium mb-4">Location Path</h3>
                            <div class="h-96 rounded-lg overflow-hidden">
                                <UserLocationMap 
                                    history={history()?.map(h => ({
                                        latitude: h.latitude,
                                        longitude: h.longitude,
                                        timestamp: h.timestamp,
                                    }))}
                                />
                            </div>
                        </div>

                        {/* History List */}
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <h3 class="text-white font-medium mb-4">
                                History ({history()?.length || 0} points)
                            </h3>
                            <div class="space-y-2 max-h-96 overflow-y-auto">
                                <Show when={history() && history()!.length > 0} fallback={
                                    <div class="text-center text-slate-400 py-8">
                                        No location data found for selected period
                                    </div>
                                }>
                                    <For each={history()}>
                                        {(point) => (
                                            <div class="p-3 bg-slate-950 rounded-lg border border-slate-800">
                                                <div class="text-sm text-white font-medium">
                                                    {new Date(point.timestamp).toLocaleString()}
                                                </div>
                                                <div class="text-xs text-slate-400 mt-1">
                                                    {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                                                    {point.accuracy && ` • Accuracy: ${Math.round(point.accuracy)}m`}
                                                    {point.speed && ` • Speed: ${Math.round(point.speed * 3.6)} km/h`}
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </Show>
                            </div>
                        </div>
                    </div>
                </Show>

                <Show when={!selectedUserId() || !startDate() || !endDate()}>
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-12 text-center">
                        <p class="text-slate-400">Select a user and date range to view location history</p>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default UserLocationHistory;
