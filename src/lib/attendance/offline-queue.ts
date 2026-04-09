/**
 * Offline Queue Utilities for QR Scanning
 *
 * Pure logic for managing offline scan records in IndexedDB.
 * Uses the idb-keyval-like interface but operates on raw IndexedDB
 * for zero-dependency operation in Service Worker context.
 */

export type OfflineScanRecord = {
  id: string;
  qrPayload: string;
  sessionId: string | null;
  scannedAt: string;
  deviceId: string;
  synced: boolean;
};

const DB_NAME = 'gem-attendance-offline';
const STORE_NAME = 'scan-queue';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineScan(record: OfflineScanRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingScans(): Promise<OfflineScanRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('synced');
    const request = index.getAll(IDBKeyRange.only(0));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markScansAsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result as OfflineScanRecord | undefined;
        if (record) {
          record.synced = true;
          store.put(record);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncedScans(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('synced');
    const request = index.openCursor(IDBKeyRange.only(1));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingScans();
  return pending.length;
}

export function generateScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
