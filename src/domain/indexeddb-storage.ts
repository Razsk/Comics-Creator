import { Comic, ComicStorageAdapter } from './types';

const DB_NAME = 'comics-creator-db';
const STORE_NAME = 'comics';
const DEFAULT_KEY = 'active-comic';
const FALLBACK_STORAGE_KEY = 'comics-creator:active-comic';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createBrowserStorageAdapter(): ComicStorageAdapter {
  return {
    async load(): Promise<Comic | null> {
      if (typeof window === 'undefined') return null;

      if ('indexedDB' in window && window.indexedDB) {
        try {
          const db = await openDatabase();
          const result = await new Promise<Comic | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(DEFAULT_KEY);
            req.onsuccess = () => resolve((req.result as Comic) ?? null);
            req.onerror = () => reject(req.error);
          });
          db.close();
          if (result) return result;
        } catch {
          // Fall back to localStorage below
        }
      }

      try {
        const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Comic) : null;
      } catch {
        return null;
      }
    },

    async save(comic: Comic): Promise<void> {
      if (typeof window === 'undefined') return;

      try {
        window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(comic));
      } catch {
        // Ignore quota errors
      }

      if ('indexedDB' in window && window.indexedDB) {
        try {
          const db = await openDatabase();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(comic, DEFAULT_KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
          db.close();
        } catch {
          // Already saved to localStorage fallback
        }
      }
    },
  };
}
