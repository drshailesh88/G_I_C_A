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
const SYNCED_INDEX = 'syncedKey';
const DB_VERSION = 2;
const QR_PAYLOAD_MAX_LENGTH = 500;
const DEVICE_ID_MAX_LENGTH = 100;

type PersistedOfflineScanRecord = OfflineScanRecord & {
  syncedKey: 0 | 1;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeNonEmptyString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function normalizeSessionId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new Error('Session ID must be a UUID or null.');
  }

  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('Session ID must be a UUID or null.');
  }

  return normalized;
}

function normalizeScannedAt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Scanned timestamp must be an ISO datetime string.');
  }

  const normalized = value.trim();
  if (normalized.length === 0 || Number.isNaN(Date.parse(normalized))) {
    throw new Error('Scanned timestamp must be an ISO datetime string.');
  }

  return normalized;
}

function toPersistedRecord(record: OfflineScanRecord): PersistedOfflineScanRecord {
  const synced = Boolean(record.synced);

  return {
    id: normalizeNonEmptyString(record.id, 'Scan ID', 200),
    qrPayload: normalizeNonEmptyString(record.qrPayload, 'QR payload', QR_PAYLOAD_MAX_LENGTH),
    sessionId: normalizeSessionId(record.sessionId),
    scannedAt: normalizeScannedAt(record.scannedAt),
    deviceId: normalizeNonEmptyString(record.deviceId, 'Device ID', DEVICE_ID_MAX_LENGTH),
    synced,
    syncedKey: synced ? 1 : 0,
  };
}

function fromPersistedRecord(value: unknown): OfflineScanRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  try {
    const normalized = toPersistedRecord(value as OfflineScanRecord);
    return {
      id: normalized.id,
      qrPayload: normalized.qrPayload,
      sessionId: normalized.sessionId,
      scannedAt: normalized.scannedAt,
      deviceId: normalized.deviceId,
      synced: normalized.synced,
    };
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });

      if ('indexNames' in store && store.indexNames.contains('synced')) {
        store.deleteIndex('synced');
      }

      if (!('indexNames' in store) || !store.indexNames.contains(SYNCED_INDEX)) {
        store.createIndex(SYNCED_INDEX, SYNCED_INDEX, { unique: false });
      }

      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;

        const nextValue = cursor.value as OfflineScanRecord | PersistedOfflineScanRecord;
        if (nextValue && typeof nextValue === 'object' && typeof nextValue.synced === 'boolean') {
          const syncedKey = nextValue.synced ? 1 : 0;
          if ((nextValue as Partial<PersistedOfflineScanRecord>).syncedKey !== syncedKey) {
            cursor.update({
              ...nextValue,
              syncedKey,
            });
          }
        }

        cursor.continue();
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineScan(record: OfflineScanRecord): Promise<void> {
  const db = await openDb();
  const persistedRecord = toPersistedRecord(record);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(persistedRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingScans(): Promise<OfflineScanRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const pendingRecords: OfflineScanRecord[] = [];
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index(SYNCED_INDEX);
    const request = index.openCursor(IDBKeyRange.only(0));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      const record = fromPersistedRecord(cursor.value);
      if (record) {
        pendingRecords.push(record);
      } else {
        cursor.delete();
      }

      cursor.continue();
    };

    tx.oncomplete = () => resolve(pendingRecords);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
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
        const record = getReq.result as PersistedOfflineScanRecord | undefined;
        if (record) {
          record.synced = true;
          record.syncedKey = 1;
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
    const index = store.index(SYNCED_INDEX);
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let pendingCount = 0;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index(SYNCED_INDEX);
    const request = index.openCursor(IDBKeyRange.only(0));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (fromPersistedRecord(cursor.value)) {
        pendingCount++;
      } else {
        cursor.delete();
      }

      cursor.continue();
    };

    tx.oncomplete = () => resolve(pendingCount);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

export function generateScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
