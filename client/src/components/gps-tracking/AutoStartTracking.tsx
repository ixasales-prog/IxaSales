/**
 * Auto-Start GPS Tracking Component
 * 
 * Automatically starts GPS tracking when a sales rep or driver logs in,
 * if tracking is enabled for the tenant and user.
 */

import { type Component, onMount, onCleanup, Show, createSignal } from 'solid-js';
import { currentUser } from '../../stores/auth';
import { gpsTrackingService } from '../../services/gps-tracking';
import { api } from '../../lib/api';

const AutoStartTracking: Component = () => {
    const [error, setError] = createSignal<string | null>(null);
    const [tracking, setTracking] = createSignal(false);

    onMount(async () => {
        const user = currentUser();
        
        // Only auto-start for sales_rep and driver roles
        if (!user || !['sales_rep', 'driver'].includes(user.role)) {
            return;
        }

        try {
            // Fetch GPS tracking settings
            const settings = await api<{
                enabled: boolean;
                movementThreshold: number;
                fallbackInterval: number;
                minAccuracy: number;
            }>('/gps-tracking/settings');

            // Check if tracking is enabled for tenant
            if (!settings.enabled) {
                console.log('[GPS] Tracking disabled for tenant');
                return;
            }

            // Check if user has tracking enabled (self endpoint, no admin permission needed)
            const me = await api<{ user: { id: string; gpsTrackingEnabled?: boolean } }>('/auth/me');
            if (!me?.user?.gpsTrackingEnabled) {
                console.log('[GPS] Tracking disabled for user');
                return;
            }

            // Start tracking
            await gpsTrackingService.startTracking(
                {
                    movementThreshold: settings.movementThreshold || 50,
                    fallbackInterval: settings.fallbackInterval || 300,
                    minAccuracy: settings.minAccuracy || 50,
                },
                (err) => {
                    console.error('[GPS] Tracking error:', err);
                    setError(err.message);
                    if (err.code === err.PERMISSION_DENIED) {
                        setTracking(false);
                    }
                }
            );

            setTracking(true);
            console.log('[GPS] Auto-started tracking');
        } catch (err: any) {
            // 404 = GPS routes not mounted or not available
            const is404 = err?.message === 'Resource not found' || err?.message?.includes('404');
            // Permission denials from API should not be shown as browser GPS permission errors
            const isPermissionError = /insufficient permissions|forbidden|permission denied|only tenant admins/i.test(err?.message || '');
            
            if (is404 || isPermissionError) {
                // Silently skip when GPS API is not available or user doesn't have permission
                console.log('[GPS] Tracking not available:', is404 ? 'API not found' : 'Permission denied');
                return;
            }
            console.error('[GPS] Failed to start tracking:', err);
            setError(err.message || 'Failed to start GPS tracking');
        }
    });

    onCleanup(() => {
        if (tracking()) {
            gpsTrackingService.stopTracking();
            setTracking(false);
        }
    });

    return (
        <Show when={error()}>
            <div class="fixed bottom-4 right-4 bg-red-500 text-white p-3 rounded-lg shadow-lg z-50 max-w-sm">
                <p class="text-sm">GPS Tracking Error: {error()}</p>
                <p class="text-xs mt-1 opacity-90">Please enable location permissions in your browser settings</p>
            </div>
        </Show>
    );
};

export default AutoStartTracking;
