/**
 * GPS Tracking Service
 * 
 * Handles movement-based location tracking for sales reps and drivers.
 * Uses watchPosition API to detect movement and only sends updates when
 * user moves significantly or fallback timer expires.
 */

import { api } from '../lib/api';

// ============================================================================
// TYPES
// ============================================================================

export interface GPSTrackingConfig {
    movementThreshold: number; // meters
    fallbackInterval: number; // seconds
    minAccuracy: number; // meters
}

export interface LocationUpdate {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
}

// ============================================================================
// GPS TRACKING SERVICE
// ============================================================================

class GPSTrackingService {
    private watchId: number | null = null;
    private fallbackIntervalId: number | null = null;
    private lastSentLocation: { lat: number; lon: number } | null = null;
    private config: GPSTrackingConfig | null = null;
    private isTracking = false;
    private onErrorCallback?: (error: GeolocationPositionError) => void;

    /**
     * Calculate distance between two coordinates using Haversine formula
     */
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // Earth radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * Check if we should send an update based on movement threshold
     */
    private shouldSendUpdate(newLocation: GeolocationPosition): boolean {
        if (!this.lastSentLocation) {
            return true; // Always send first location
        }

        const distance = this.calculateDistance(
            this.lastSentLocation.lat,
            this.lastSentLocation.lon,
            newLocation.coords.latitude,
            newLocation.coords.longitude
        );

        return distance >= (this.config?.movementThreshold || 50);
    }

    /**
     * Send location update to server
     */
    private async sendLocationUpdate(position: GeolocationPosition): Promise<void> {
        if (!this.config) return;

        // Check accuracy threshold
        if (position.coords.accuracy > this.config.minAccuracy) {
            console.warn(`[GPS] Location accuracy (${position.coords.accuracy}m) below threshold (${this.config.minAccuracy}m)`);
            // Still send, but log warning
        }

        const update: LocationUpdate = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading ?? undefined,
            speed: position.coords.speed ?? undefined,
        };

        try {
            await api.post('/gps-tracking/update', update);
            
            // Update last sent location
            this.lastSentLocation = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
            };
        } catch (error) {
            console.error('[GPS] Failed to send location update:', error);
            // Don't throw - continue tracking even if one update fails
        }
    }

    /**
     * Handle geolocation position update
     */
    private handlePositionUpdate = (position: GeolocationPosition): void => {
        if (!this.isTracking || !this.config) return;

        if (this.shouldSendUpdate(position)) {
            this.sendLocationUpdate(position);
        }
    };

    /**
     * Handle geolocation errors
     */
    private handlePositionError = (error: GeolocationPositionError): void => {
        console.error('[GPS] Geolocation error:', error);
        
        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }

        // Stop tracking on permission denied
        if (error.code === error.PERMISSION_DENIED) {
            this.stopTracking();
        }
    };

    /**
     * Fallback periodic update (even if no movement)
     */
    private scheduleFallbackUpdate = (): void => {
        if (!this.config || !this.isTracking) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Force send update (ignore movement threshold for fallback)
                    this.sendLocationUpdate(position);
                },
                (error) => {
                    console.warn('[GPS] Fallback update failed:', error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000, // Accept cached position up to 1 minute old
                }
            );
        }
    };

    /**
     * Start GPS tracking
     */
    async startTracking(config: GPSTrackingConfig, onError?: (error: GeolocationPositionError) => void): Promise<void> {
        if (this.isTracking) {
            console.warn('[GPS] Tracking already started');
            return;
        }

        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by this browser');
        }

        this.config = config;
        this.onErrorCallback = onError;
        this.isTracking = true;

        // Request permission and start watching position
        try {
            this.watchId = navigator.geolocation.watchPosition(
                this.handlePositionUpdate,
                this.handlePositionError,
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0, // Always get fresh position
                }
            );

            // Schedule fallback periodic updates
            const fallbackMs = (config.fallbackInterval || 300) * 1000;
            this.fallbackIntervalId = window.setInterval(this.scheduleFallbackUpdate, fallbackMs);

            console.log('[GPS] Tracking started', { config });
        } catch (error) {
            this.isTracking = false;
            throw error;
        }
    }

    /**
     * Stop GPS tracking
     */
    stopTracking(): void {
        if (!this.isTracking) return;

        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        if (this.fallbackIntervalId !== null) {
            clearInterval(this.fallbackIntervalId);
            this.fallbackIntervalId = null;
        }

        this.isTracking = false;
        this.lastSentLocation = null;
        this.config = null;
        this.onErrorCallback = undefined;

        console.log('[GPS] Tracking stopped');
    }

    /**
     * Check if tracking is active
     */
    isActive(): boolean {
        return this.isTracking;
    }

    /**
     * Get current location (one-time)
     */
    async getCurrentLocation(): Promise<GeolocationPosition> {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000,
                }
            );
        });
    }
}

// Export singleton instance
export const gpsTrackingService = new GPSTrackingService();
