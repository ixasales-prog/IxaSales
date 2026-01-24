/**
 * User Location Map Component
 * 
 * Displays current locations of tracked users (sales reps and drivers) on a map.
 * For supervisors and admins only.
 */

import { type Component, createSignal, onMount, onCleanup, Show, createEffect } from 'solid-js';
import { api } from '../../lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// ============================================================================
// TYPES
// ============================================================================

interface UserLocation {
    userId: string;
    name: string;
    role: string;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    timestamp: string;
    lastUpdateAt?: string | null;
}

interface LocationPoint {
    latitude: number;
    longitude: number;
    timestamp?: string;
}

interface UserLocationMapProps {
    userId?: string; // Optional: filter by specific user
    history?: LocationPoint[]; // Optional: show history path instead of current locations
    onUserClick?: (userId: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const UserLocationMap: Component<UserLocationMapProps> = (props) => {
    const [map, setMap] = createSignal<L.Map | null>(null);
    const [locations, setLocations] = createSignal<UserLocation[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [markers, setMarkers] = createSignal<Map<string, L.Marker>>(new Map());
    const [polyline, setPolyline] = createSignal<L.Polyline | null>(null);
    let mapContainer: HTMLDivElement | undefined;
    let updateInterval: number | null = null;

    // Fetch current locations (only if not showing history)
    const fetchLocations = async () => {
        if (props.history) return; // Don't fetch if showing history

        try {
            setError(null);
            const params: Record<string, string> = {};
            if (props.userId) {
                params.userId = props.userId;
            }

            const data = await api<UserLocation[]>('/gps-tracking/current', { params });
            setLocations(data);
        } catch (err: any) {
            console.error('Failed to fetch locations:', err);
            setError(err.message || 'Failed to load locations');
        } finally {
            setLoading(false);
        }
    };

    // Update markers on map (for current locations)
    const updateMarkers = () => {
        const mapInstance = map();
        if (!mapInstance || props.history) return; // Don't update markers if showing history

        const currentMarkers = markers();
        const newMarkers = new Map<string, L.Marker>();

        locations().forEach((location) => {
            // Remove old marker if exists
            const oldMarker = currentMarkers.get(location.userId);
            if (oldMarker) {
                mapInstance.removeLayer(oldMarker);
            }

            // Create new marker
            const marker = L.marker([location.latitude, location.longitude], {
                icon: DefaultIcon,
            });

            // Create popup content
            const popupContent = `
                <div style="min-width: 200px;">
                    <strong>${location.name}</strong><br/>
                    <span style="color: #666; font-size: 0.9em;">${location.role === 'sales_rep' ? 'Sales Rep' : 'Driver'}</span><br/>
                    ${location.accuracy ? `<span style="color: #666; font-size: 0.85em;">Accuracy: ${Math.round(location.accuracy)}m</span><br/>` : ''}
                    ${location.speed ? `<span style="color: #666; font-size: 0.85em;">Speed: ${Math.round(location.speed * 3.6)} km/h</span><br/>` : ''}
                    <span style="color: #666; font-size: 0.85em;">Updated: ${new Date(location.timestamp).toLocaleTimeString()}</span>
                </div>
            `;

            marker.bindPopup(popupContent);

            // Handle click
            marker.on('click', () => {
                if (props.onUserClick) {
                    props.onUserClick(location.userId);
                }
            });

            marker.addTo(mapInstance);
            newMarkers.set(location.userId, marker);
        });

        // Remove markers for users no longer in the list
        currentMarkers.forEach((marker, userId) => {
            if (!newMarkers.has(userId)) {
                mapInstance.removeLayer(marker);
            }
        });

        setMarkers(newMarkers);

        // Fit map to show all markers
        if (locations().length > 0) {
            const bounds = L.latLngBounds(
                locations().map(loc => [loc.latitude, loc.longitude] as [number, number])
            );
            mapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    };

    // Draw history path on map
    const drawHistoryPath = () => {
        const mapInstance = map();
        if (!mapInstance || !props.history || props.history.length === 0) return;

        // Remove existing polyline
        const existingPolyline = polyline();
        if (existingPolyline) {
            mapInstance.removeLayer(existingPolyline);
        }

        // Create path from history points
        const pathPoints = props.history.map(point => [point.latitude, point.longitude] as [number, number]);
        
        // Create polyline
        const newPolyline = L.polyline(pathPoints, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.7,
        }).addTo(mapInstance);

        // Add start marker
        if (pathPoints.length > 0) {
            const startMarker = L.marker(pathPoints[0], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color: #10b981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                    iconSize: [12, 12],
                }),
            }).addTo(mapInstance);
            startMarker.bindPopup('Start');
        }

        // Add end marker
        if (pathPoints.length > 1) {
            const endMarker = L.marker(pathPoints[pathPoints.length - 1], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                    iconSize: [12, 12],
                }),
            }).addTo(mapInstance);
            endMarker.bindPopup('End');
        }

        setPolyline(newPolyline);

        // Fit map to show entire path
        const bounds = L.latLngBounds(pathPoints);
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
    };

    // Initialize map
    onMount(() => {
        if (!mapContainer) return;

        // Initialize Leaflet map (default to Tashkent, Uzbekistan)
        const mapInstance = L.map(mapContainer).setView([41.3111, 69.2797], 12);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(mapInstance);

        setMap(mapInstance);

        // If showing history, draw path immediately
        if (props.history) {
            setLoading(false);
            // Small delay to ensure map is fully initialized
            setTimeout(() => {
                drawHistoryPath();
            }, 100);
        } else {
            // Initial fetch for current locations
            fetchLocations();

            // Poll for updates every 15 seconds
            updateInterval = window.setInterval(() => {
                fetchLocations();
            }, 15000);
        }
    });

    // Update markers when locations change (reactive)
    createEffect(() => {
        if (map() && locations().length > 0 && !props.history) {
            updateMarkers();
        }
    });

    // Draw history path when history prop changes
    createEffect(() => {
        if (map() && props.history) {
            drawHistoryPath();
        }
    });

    // Cleanup
    onCleanup(() => {
        if (updateInterval !== null) {
            clearInterval(updateInterval);
        }
        const mapInstance = map();
        if (mapInstance) {
            mapInstance.remove();
        }
    });

    return (
        <div class="w-full h-full relative">
            <Show when={loading()}>
                <div class="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-50">
                    <div class="text-white">Loading map...</div>
                </div>
            </Show>

            <Show when={error()}>
                <div class="absolute top-4 left-4 right-4 bg-red-500 text-white p-3 rounded-lg z-50">
                    {error()}
                </div>
            </Show>

            <Show when={!loading() && !props.history && locations().length === 0}>
                <div class="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-50">
                    <div class="text-white text-center">
                        <p class="text-lg mb-2">No tracked users found</p>
                        <p class="text-sm text-slate-400">No sales reps or drivers with active GPS tracking</p>
                    </div>
                </div>
            </Show>

            <Show when={props.history && (!props.history || props.history.length === 0)}>
                <div class="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-50">
                    <div class="text-white text-center">
                        <p class="text-lg mb-2">No location history</p>
                        <p class="text-sm text-slate-400">No location data found for selected period</p>
                    </div>
                </div>
            </Show>

            <div
                ref={mapContainer}
                class="w-full h-full"
                style={{ 'min-height': '500px' }}
            />
        </div>
    );
};

export default UserLocationMap;
