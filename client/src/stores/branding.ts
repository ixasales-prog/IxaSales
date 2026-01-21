/**
 * Branding Store
 * 
 * Fetches and caches platform branding settings for use across the app.
 */

import { createSignal, createRoot } from 'solid-js';

interface BrandingSettings {
    platformName: string;
    primaryColor: string;
    logoUrl: string;
}

const DEFAULT_BRANDING: BrandingSettings = {
    platformName: 'IxaSales',
    primaryColor: '#3B82F6',
    logoUrl: '',
};

// Get the API base URL from environment or default to /api for dev
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create a singleton store
function createBrandingStore() {
    const [branding, setBranding] = createSignal<BrandingSettings>(DEFAULT_BRANDING);
    const [loaded, setLoaded] = createSignal(false);

    // Fetch branding on first use
    const fetchBranding = async () => {
        if (loaded()) return;

        try {
            const response = await fetch(`${API_BASE_URL}/branding`);
            if (response.ok) {
                const data = await response.json();
                if (data.data) {
                    setBranding(data.data);
                }
            }
        } catch (error) {
            console.error('Failed to fetch branding:', error);
        } finally {
            setLoaded(true);
        }
    };

    // Auto-fetch on first access
    fetchBranding();

    return {
        branding,
        loaded,
        refetch: fetchBranding,
    };
}

// Export singleton
export const brandingStore = createRoot(createBrandingStore);

// Convenience accessors
export const useBranding = () => brandingStore.branding();
export const getPlatformName = () => brandingStore.branding().platformName;
export const getPrimaryColor = () => brandingStore.branding().primaryColor;
export const getLogoUrl = () => brandingStore.branding().logoUrl;
