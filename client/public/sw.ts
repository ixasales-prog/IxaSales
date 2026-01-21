/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ixasales-static-${CACHE_VERSION}`;
const API_CACHE = `ixasales-api-${CACHE_VERSION}`;
const SYNC_QUEUE_KEY = 'ixasales-sync-queue';

// Static assets to precache
const PRECACHE_ASSETS = [
    '/',
    '/manifest.json',
    '/index.html',
];

// API routes to cache for offline access
const CACHEABLE_API_ROUTES = [
    '/api/products',
    '/api/products/categories',
    '/api/products/brands',
    '/api/customers',
    '/api/delivery/trips',
];

// Install event - precache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log('[SW] Precaching static assets');
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
                    .map((key) => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests for caching (but handle sync queue)
    if (request.method !== 'GET') {
        // Check if this is a syncable mutation
        if (isSyncableRequest(request)) {
            event.respondWith(handleSyncableRequest(request));
        }
        return;
    }

    // API requests - network first, cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Static assets - cache first, network fallback
    event.respondWith(handleStaticRequest(request));
});

// Handle API requests with network-first strategy
async function handleApiRequest(request: Request): Promise<Response> {
    const cache = await caches.open(API_CACHE);

    try {
        const response = await fetch(request);

        // Cache successful GET responses for cacheable routes
        if (response.ok && isCacheableApiRoute(request.url)) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Network failed, try cache
        const cached = await cache.match(request);
        if (cached) {
            console.log('[SW] Serving from cache:', request.url);
            return cached;
        }

        // Return offline response
        return new Response(
            JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'You are offline' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request: Request): Promise<Response> {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // For navigation requests, return cached index.html (SPA fallback)
        if (request.mode === 'navigate') {
            const index = await caches.match('/index.html');
            if (index) return index;
        }
        throw error;
    }
}

// Check if API route should be cached
function isCacheableApiRoute(url: string): boolean {
    const path = new URL(url).pathname;
    return CACHEABLE_API_ROUTES.some((route) => path.startsWith(route));
}

// Check if request should be queued for sync
function isSyncableRequest(request: Request): boolean {
    const url = new URL(request.url);
    const syncableRoutes = [
        '/api/orders',
        '/api/payments',
        '/api/customers',
    ];
    return (
        ['POST', 'PUT', 'PATCH'].includes(request.method) &&
        syncableRoutes.some((route) => url.pathname.startsWith(route))
    );
}

// Handle syncable requests (queue if offline)
async function handleSyncableRequest(request: Request): Promise<Response> {
    try {
        const response = await fetch(request.clone());
        return response;
    } catch (error) {
        // Offline - queue for later sync
        const body = await request.clone().text();
        await queueForSync({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body,
            timestamp: Date.now(),
        });

        return new Response(
            JSON.stringify({
                success: true,
                queued: true,
                message: 'Request queued for sync when online'
            }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Queue request for background sync
async function queueForSync(item: SyncQueueItem): Promise<void> {
    const db = await openSyncDB();
    const tx = db.transaction('queue', 'readwrite');
    const store = tx.objectStore('queue');
    await store.add(item);

    // Request background sync
    if ('sync' in self.registration) {
        await (self.registration as any).sync.register('sync-queue');
    }
}

// Background sync event
self.addEventListener('sync', (event: any) => {
    if (event.tag === 'sync-queue') {
        event.waitUntil(processSyncQueue());
    }
});

// Process queued requests
async function processSyncQueue(): Promise<void> {
    const db = await openSyncDB();
    const tx = db.transaction('queue', 'readonly');
    const store = tx.objectStore('queue');
    const items: SyncQueueItem[] = await store.getAll();

    for (const item of items) {
        try {
            const response = await fetch(item.url, {
                method: item.method,
                headers: item.headers,
                body: item.body,
            });

            if (response.ok) {
                // Remove from queue
                const deleteTx = db.transaction('queue', 'readwrite');
                await deleteTx.objectStore('queue').delete(item.id!);

                // Notify clients
                const clients = await self.clients.matchAll();
                clients.forEach((client) => {
                    client.postMessage({ type: 'SYNC_SUCCESS', item });
                });
            }
        } catch (error) {
            console.log('[SW] Sync failed, will retry:', item.url);
        }
    }
}

// IndexedDB for sync queue
interface SyncQueueItem {
    id?: number;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
}

function openSyncDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ixasales-sync', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('queue')) {
                db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Push notifications
self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};

    const options: NotificationOptions = {
        body: data.body || 'New notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        vibrate: [100, 50, 100],
        data: data.url || '/',
        actions: data.actions || [],
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'IxaSales', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients.openWindow(event.notification.data)
    );
});

export { };
