/**
 * PWA Service - Simplified Module
 * 
 * Consolidated PWA functionality including:
 * - Push notifications
 * - App install prompt
 * 
 * Service worker functionality removed for simplicity.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// Service worker functionality removed - app now requires online connection

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
    return 'PushManager' in window;
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;

    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
    if (!isPushSupported()) {
        if (import.meta.env.DEV) console.log('[PWA] Push not supported');
        return null;
    }

    if (!VAPID_PUBLIC_KEY) {
        if (import.meta.env.DEV) console.log('[PWA] VAPID key not configured');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Check permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            if (import.meta.env.DEV) console.log('[PWA] Notification permission denied');
            return null;
        }

        // Subscribe
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer
        });

        if (import.meta.env.DEV) console.log('[PWA] Push subscription created');
        return subscription;
    } catch (error) {
        console.error('[PWA] Push subscription failed:', error);
        return null;
    }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    const subscription = await getPushSubscription();
    if (!subscription) return true;

    try {
        await subscription.unsubscribe();
        return true;
    } catch (error) {
        console.error('[PWA] Unsubscribe failed:', error);
        return false;
    }
}

/**
 * Send subscription to server
 */
export async function sendSubscriptionToServer(
    subscription: PushSubscription,
    token: string
): Promise<boolean> {
    try {
        const response = await fetch('/api/customer-portal/push-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                subscription: subscription.toJSON()
            })
        });

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

/**
 * Check notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    return Notification.requestPermission();
}

/**
 * Show a local notification
 */
export async function showLocalNotification(
    title: string,
    options?: NotificationOptions
): Promise<void> {
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
        await requestNotificationPermission();
    }

    if (Notification.permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
            icon: '/icons/icon-192.svg',
            badge: '/icons/icon-192.svg',
            ...options
        });
    }
}

// Background sync removed - app now requires online connection

// ============================================================================
// APP INSTALL PROMPT
// ============================================================================

const PWA_INSTALLED_KEY = 'pwa-installed';
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

if (typeof window !== 'undefined') {
    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;

        // Only dispatch if not already installed (tracked in localStorage)
        if (!wasInstalledPreviously()) {
            dispatchEvent(new CustomEvent('pwa-install-available'));
        }
    });

    // Track when app is successfully installed
    window.addEventListener('appinstalled', () => {
        if (import.meta.env.DEV) console.log('[PWA] App installed');
        localStorage.setItem(PWA_INSTALLED_KEY, 'true');
        deferredPrompt = null;
    });
}

/**
 * Prompt the user to install the app
 */
export async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;

    if (outcome === 'accepted') {
        // Mark as installed in localStorage
        localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    }

    return outcome === 'accepted';
}

/**
 * Check if app can be installed
 */
export function canInstall(): boolean {
    return deferredPrompt !== null && !wasInstalledPreviously() && !isInstalledPWA();
}

/**
 * Check if running as installed PWA (standalone mode)
 */
export function isInstalledPWA(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
}

/**
 * Check if user has previously installed the app (tracked in localStorage)
 */
export function wasInstalledPreviously(): boolean {
    return localStorage.getItem(PWA_INSTALLED_KEY) === 'true';
}

/**
 * Reset installation tracking (for testing)
 */
export function resetInstallTracking(): void {
    localStorage.removeItem(PWA_INSTALLED_KEY);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

// ============================================================================
// EXPORTS (for backwards compatibility)
// ============================================================================

export const pwa = {
    // Push
    isPushSupported,
    getPushSubscription,
    subscribeToPush,
    unsubscribeFromPush,
    sendSubscriptionToServer,

    // Notifications
    getNotificationPermission,
    requestNotificationPermission,
    showLocalNotification,

    // Install
    promptInstall,
    canInstall,
    isInstalledPWA,
    wasInstalledPreviously,
    resetInstallTracking,
};

export default pwa;
