import { createSignal } from 'solid-js';

export interface SyncQueueItem {
    id?: number;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
}

// Online status
const [isOnline, setIsOnline] = createSignal(navigator.onLine);
const [syncQueue, setSyncQueue] = createSignal<SyncQueueItem[]>([]);
const [isSyncing, setIsSyncing] = createSignal(false);

// Initialize online listeners
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        setIsOnline(true);
        triggerSync();
    });
    window.addEventListener('offline', () => setIsOnline(false));

    // Listen for sync success messages from service worker
    navigator.serviceWorker?.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_SUCCESS') {
            loadSyncQueue();
        }
    });

    // Load initial queue
    loadSyncQueue();
}

// IndexedDB helpers
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

async function loadSyncQueue(): Promise<void> {
    try {
        const db = await openSyncDB();
        const tx = db.transaction('queue', 'readonly');
        const store = tx.objectStore('queue');

        const request = store.getAll();
        request.onsuccess = () => {
            setSyncQueue(request.result || []);
        };
    } catch (error) {
        console.error('[Offline] Failed to load sync queue:', error);
    }
}

async function addToSyncQueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    try {
        const db = await openSyncDB();
        const tx = db.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');

        await new Promise<void>((resolve, reject) => {
            const request = store.add(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        await loadSyncQueue();
    } catch (error) {
        console.error('[Offline] Failed to add to sync queue:', error);
    }
}

async function removeFromSyncQueue(id: number): Promise<void> {
    try {
        const db = await openSyncDB();
        const tx = db.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');

        await new Promise<void>((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        await loadSyncQueue();
    } catch (error) {
        console.error('[Offline] Failed to remove from sync queue:', error);
    }
}

async function clearSyncQueue(): Promise<void> {
    try {
        const db = await openSyncDB();
        const tx = db.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');

        await new Promise<void>((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        setSyncQueue([]);
    } catch (error) {
        console.error('[Offline] Failed to clear sync queue:', error);
    }
}

// Trigger background sync
async function triggerSync(): Promise<void> {
    if (!isOnline() || isSyncing()) return;

    const registration = await navigator.serviceWorker?.ready;
    if (registration && 'sync' in registration) {
        await (registration as any).sync.register('sync-queue');
    } else {
        // Fallback: process queue manually
        await processQueueManually();
    }
}

async function processQueueManually(): Promise<void> {
    if (isSyncing()) return;
    setIsSyncing(true);

    const queue = syncQueue();

    for (const item of queue) {
        try {
            const response = await fetch(item.url, {
                method: item.method,
                headers: item.headers,
                body: item.body,
            });

            if (response.ok && item.id) {
                await removeFromSyncQueue(item.id);
            }
        } catch (error) {
            if (import.meta.env.DEV) console.log('[Offline] Sync failed, will retry:', item.url);
            break; // Stop on first failure
        }
    }

    setIsSyncing(false);
}

// Offline-capable fetch wrapper
export async function offlineFetch<T>(
    url: string,
    options: RequestInit = {}
): Promise<{ data: T | null; queued: boolean; error: string | null }> {
    const method = options.method || 'GET';

    // For GET requests, just use regular fetch (service worker handles caching)
    if (method === 'GET') {
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            return { data, queued: false, error: null };
        } catch (error) {
            return { data: null, queued: false, error: 'Request failed' };
        }
    }

    // For mutations, try network first
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { data, queued: false, error: null };
    } catch (error) {
        // Network failed, queue for later
        if (!isOnline()) {
            await addToSyncQueue({
                url,
                method,
                headers: Object.fromEntries(new Headers(options.headers).entries()),
                body: options.body as string,
                timestamp: Date.now(),
            });
            return { data: null, queued: true, error: null };
        }
        return { data: null, queued: false, error: 'Request failed' };
    }
}

// Export state and actions
export {
    isOnline,
    syncQueue,
    isSyncing,
    addToSyncQueue,
    removeFromSyncQueue,
    clearSyncQueue,
    triggerSync,
};
