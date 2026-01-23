/**
 * Service Worker for Customer Portal
 * 
 * Provides:
 * - Offline caching for static assets
 * - Background sync for failed requests
 * - Push notifications for order status updates
 */

const CACHE_NAME = 'customer-portal-v1';
const STATIC_CACHE_NAME = 'static-v1';
const API_CACHE_NAME = 'api-cache-v1';

// ============================================================================
// ASSETS TO CACHE
// ============================================================================

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/manifest.sales.json',
    '/manifest.driver.json',
    '/manifest.warehouse.json',
    '/manifest.admin.json',
    '/manifest.superadmin.json',
    '/manifest.customer.json',
    '/icons/icon.svg',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    '/icons/sales.svg',
    '/icons/driver.svg',
    '/icons/warehouse.svg',
    '/icons/admin.svg',
    '/icons/customer.svg'
];

const CACHE_FIRST_PATTERNS = [
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    /\.(?:woff2?|ttf|eot)$/,
    /\.(?:css)$/
];

// ============================================================================
// INSTALL EVENT
// ============================================================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================================================
// ACTIVATE EVENT
// ============================================================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== STATIC_CACHE_NAME && name !== API_CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================================================
// FETCH EVENT - CACHING STRATEGIES
// ============================================================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin requests
    if (url.origin !== self.location.origin) return;

    // API requests - Network first with cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Static assets - Cache first
    if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // JS files and HTML - Network first
    event.respondWith(networkFirst(request));
});

/**
 * Cache first strategy
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network first strategy
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Return cached index.html for navigation requests
        if (request.mode === 'navigate') {
            const indexCached = await caches.match('/index.html');
            if (indexCached) return indexCached;
        }

        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network first with cache for API
 */
async function networkFirstWithCache(request) {
    const url = new URL(request.url);

    // Only cache GET requests for certain endpoints
    const cacheable = ['/api/customer-portal/products', '/api/customer-portal/categories'];
    const shouldCache = cacheable.some(path => url.pathname.startsWith(path));

    try {
        const response = await fetch(request);

        if (response.ok && shouldCache) {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (e) {
        // Return cached response if available
        const cached = await caches.match(request);
        if (cached) return cached;

        return new Response(
            JSON.stringify({
                success: false,
                error: { code: 'OFFLINE', message: 'You are offline' }
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    if (!event.data) return;

    let data;

    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'IxaSales',
            body: event.data.text()
        };
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/icon-192.svg',
        badge: data.badge || '/icons/icon-192.svg',
        tag: data.tag || 'default',
        data: data.data,
        vibrate: [100, 50, 100],
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ============================================================================
// NOTIFICATION CLICK
// ============================================================================

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');

    event.notification.close();

    const data = event.notification.data;
    let targetUrl = '/customer';

    if (data && data.url) {
        targetUrl = data.url;
    } else if (data && data.orderId) {
        targetUrl = '/customer/orders/' + data.orderId;
    }

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // Focus existing window if found
                for (const client of clients) {
                    if (client.url.includes('/customer') && 'focus' in client) {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
                // Open new window
                return self.clients.openWindow(targetUrl);
            })
    );
});

// ============================================================================
// BACKGROUND SYNC
// ============================================================================

self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-cart') {
        event.waitUntil(syncCart());
    }

    if (event.tag === 'sync-favorites') {
        event.waitUntil(syncFavorites());
    }
});

async function syncCart() {
    try {
        const pendingData = await getPendingData('cart-sync');
        if (pendingData) {
            await fetch('/api/customer-portal/cart', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pendingData)
            });
            await clearPendingData('cart-sync');
        }
    } catch (error) {
        console.error('[SW] Cart sync failed:', error);
    }
}

async function syncFavorites() {
    try {
        const pendingData = await getPendingData('favorites-sync');
        if (pendingData) {
            for (const item of pendingData) {
                if (item.action === 'add') {
                    await fetch('/api/customer-portal/favorites/' + item.productId, { method: 'POST' });
                } else {
                    await fetch('/api/customer-portal/favorites/' + item.productId, { method: 'DELETE' });
                }
            }
            await clearPendingData('favorites-sync');
        }
    } catch (error) {
        console.error('[SW] Favorites sync failed:', error);
    }
}

// Simple IndexedDB helpers for pending data
async function getPendingData(key) {
    return new Promise((resolve) => {
        const request = indexedDB.open('sw-pending', 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('pending', 'readonly');
                const store = tx.objectStore('pending');
                const getRequest = store.get(key);
                getRequest.onsuccess = () => resolve(getRequest.result && getRequest.result.data);
                getRequest.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        };
        request.onupgradeneeded = () => {
            request.result.createObjectStore('pending', { keyPath: 'key' });
        };
    });
}

async function clearPendingData(key) {
    return new Promise((resolve) => {
        const request = indexedDB.open('sw-pending', 1);
        request.onerror = () => resolve();
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('pending', 'readwrite');
                const store = tx.objectStore('pending');
                store.delete(key);
                tx.oncomplete = () => resolve();
            } catch (e) {
                resolve();
            }
        };
    });
}
