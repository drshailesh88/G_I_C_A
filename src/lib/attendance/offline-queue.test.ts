import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type OfflineQueueModule = typeof import('./offline-queue');

type RawStoredRecord = Record<string, unknown> & { id: string };

const DB_NAME = 'gem-attendance-offline';
const STORE_NAME = 'scan-queue';

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class FakeDomStringList {
  constructor(private readonly getNames: () => Iterable<string>) {}

  contains(name: string): boolean {
    return Array.from(this.getNames()).includes(name);
  }
}

class FakeStoreData {
  readonly records = new Map<string, RawStoredRecord>();
  readonly indexes = new Map<string, string>();
  readonly indexNames = new FakeDomStringList(() => this.indexes.keys());

  constructor(readonly keyPath: string) {}
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;
  private pendingRequests = 0;
  private settled = false;

  constructor(private readonly storeData: FakeStoreData) {}

  objectStore(name: string): FakeTransactionStore {
    if (name !== STORE_NAME) {
      throw new Error(`Unknown object store: ${name}`);
    }

    return new FakeTransactionStore(this, this.storeData);
  }

  beginRequest(): void {
    this.pendingRequests += 1;
  }

  completeRequest(): void {
    this.pendingRequests -= 1;

    if (this.pendingRequests === 0 && !this.settled && !this.error) {
      queueMicrotask(() => {
        if (this.pendingRequests === 0 && !this.settled && !this.error) {
          this.settled = true;
          this.oncomplete?.();
        }
      });
    }
  }

  fail(error: Error): void {
    this.error = error;
    if (!this.settled) {
      this.settled = true;
      queueMicrotask(() => this.onerror?.());
    }
  }
}

class FakeCursor {
  constructor(
    private readonly request: FakeRequest<FakeCursor | null>,
    private readonly storeData: FakeStoreData,
    private readonly matches: RawStoredRecord[],
    private currentIndex: number,
    private readonly continueCursor: (nextIndex: number) => void,
  ) {}

  get value(): RawStoredRecord {
    return cloneValue(this.matches[this.currentIndex]);
  }

  delete(): void {
    this.storeData.records.delete(this.matches[this.currentIndex].id);
  }

  update(value: RawStoredRecord): void {
    this.storeData.records.set(value.id, cloneValue(value));
    this.matches[this.currentIndex] = cloneValue(value);
  }

  continue(): void {
    this.continueCursor(this.currentIndex + 1);
  }
}

type FakeRequest<T> = {
  result: T;
  error: Error | null;
  onsuccess: ((event: { target: FakeRequest<T> }) => void) | null;
  onerror: ((event: { target: FakeRequest<T> }) => void) | null;
};

function createCursorRequest(
  tx: FakeTransaction,
  storeData: FakeStoreData,
  matches: RawStoredRecord[],
): FakeRequest<FakeCursor | null> {
  const request: FakeRequest<FakeCursor | null> = {
    result: null,
    error: null,
    onsuccess: null,
    onerror: null,
  };

  tx.beginRequest();

  const emit = (nextIndex: number) => {
    queueMicrotask(() => {
      if (nextIndex >= matches.length) {
        request.result = null;
        request.onsuccess?.({ target: request });
        tx.completeRequest();
        return;
      }

      request.result = new FakeCursor(
        request,
        storeData,
        matches,
        nextIndex,
        emit,
      );
      request.onsuccess?.({ target: request });
    });
  };

  emit(0);
  return request;
}

class FakeTransactionStore {
  constructor(
    private readonly tx: FakeTransaction,
    private readonly storeData: FakeStoreData,
  ) {}

  readonly indexNames = this.storeData.indexNames;

  createIndex(name: string, keyPath: string): void {
    this.storeData.indexes.set(name, keyPath);
  }

  deleteIndex(name: string): void {
    this.storeData.indexes.delete(name);
  }

  put(value: RawStoredRecord): FakeRequest<undefined> {
    return this.runRequest((request) => {
      this.storeData.records.set(value.id, cloneValue(value));
      request.result = undefined;
    });
  }

  get(id: string): FakeRequest<RawStoredRecord | undefined> {
    return this.runRequest((request) => {
      request.result = cloneValue(this.storeData.records.get(id));
    });
  }

  openCursor(): FakeRequest<FakeCursor | null> {
    const matches = Array.from(this.storeData.records.values()).map((record) => cloneValue(record));
    return createCursorRequest(this.tx, this.storeData, matches);
  }

  index(name: string): FakeIndex {
    const keyPath = this.storeData.indexes.get(name);
    if (!keyPath) {
      throw new Error(`Unknown index: ${name}`);
    }

    return new FakeIndex(this.tx, this.storeData, keyPath);
  }

  private runRequest<T>(executor: (request: FakeRequest<T>) => void): FakeRequest<T> {
    const request: FakeRequest<T> = {
      result: undefined as T,
      error: null,
      onsuccess: null,
      onerror: null,
    };

    this.tx.beginRequest();
    queueMicrotask(() => {
      try {
        executor(request);
        request.onsuccess?.({ target: request });
        this.tx.completeRequest();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        request.error = err;
        this.tx.fail(err);
        request.onerror?.({ target: request });
      }
    });

    return request;
  }
}

class FakeIndex {
  constructor(
    private readonly tx: FakeTransaction,
    private readonly storeData: FakeStoreData,
    private readonly keyPath: string,
  ) {}

  getAll(range: { value: unknown }): FakeRequest<RawStoredRecord[]> {
    return this.runRequest((request) => {
      const matches = this.findMatches(range.value);
      const limit = (globalThis as typeof globalThis & { __indexedDbGetAllLimit?: number }).__indexedDbGetAllLimit;
      if (typeof limit === 'number' && matches.length > limit) {
        throw new Error('IndexedDB getAll exhausted the queue');
      }

      request.result = matches.map((record) => cloneValue(record));
    });
  }

  openCursor(range: { value: unknown }): FakeRequest<FakeCursor | null> {
    const matches = this.findMatches(range.value);
    return createCursorRequest(this.tx, this.storeData, matches);
  }

  private findMatches(expectedValue: unknown): RawStoredRecord[] {
    return Array.from(this.storeData.records.values()).filter(
      (record) => record[this.keyPath] === expectedValue,
    );
  }

  private runRequest<T>(executor: (request: FakeRequest<T>) => void): FakeRequest<T> {
    const request: FakeRequest<T> = {
      result: undefined as T,
      error: null,
      onsuccess: null,
      onerror: null,
    };

    this.tx.beginRequest();
    queueMicrotask(() => {
      try {
        executor(request);
        request.onsuccess?.({ target: request });
        this.tx.completeRequest();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        request.error = err;
        this.tx.fail(err);
        request.onerror?.({ target: request });
      }
    });

    return request;
  }
}

class FakeDatabase {
  private readonly stores = new Map<string, FakeStoreData>();
  readonly objectStoreNames = new FakeDomStringList(() => this.stores.keys());

  constructor(readonly name: string, public version: number) {}

  createObjectStore(name: string, options: { keyPath: string }): FakeTransactionStore {
    const storeData = new FakeStoreData(options.keyPath);
    this.stores.set(name, storeData);
    return new FakeTransactionStore(new FakeTransaction(storeData), storeData);
  }

  ensureStoreData(name: string, keyPath: string): FakeStoreData {
    if (!this.objectStoreNames.contains(name)) {
      this.stores.set(name, new FakeStoreData(keyPath));
    }

    return this.getStoreData(name);
  }

  transaction(name: string): FakeTransaction {
    const storeData = this.getStoreData(name);
    return new FakeTransaction(storeData);
  }

  getStoreData(name: string): FakeStoreData {
    const storeData = this.stores.get(name);
    if (!storeData) {
      throw new Error(`Missing object store: ${name}`);
    }

    return storeData;
  }
}

function installIndexedDbMock() {
  const databases = new Map<string, FakeDatabase>();
  const originalIndexedDb = globalThis.indexedDB;
  const originalKeyRange = globalThis.IDBKeyRange;
  const originalGetAllLimit = (globalThis as typeof globalThis & { __indexedDbGetAllLimit?: number }).__indexedDbGetAllLimit;

  const factory = {
    open(name: string, version: number) {
      const request = {
        result: undefined as FakeDatabase,
        error: null as Error | null,
        onsuccess: null as ((event: { target: typeof request }) => void) | null,
        onerror: null as ((event: { target: typeof request }) => void) | null,
        onupgradeneeded: null as ((event: { target: typeof request }) => void) | null,
        transaction: null as { objectStore: (storeName: string) => FakeTransactionStore } | null,
      };

      queueMicrotask(() => {
        let db = databases.get(name);
        const needsUpgrade = !db || version > db.version;

        if (!db) {
          db = new FakeDatabase(name, version);
          databases.set(name, db);
        }

        request.result = db;

        if (needsUpgrade) {
          db.version = version;
          request.transaction = {
            objectStore: (storeName: string) => {
              const storeData = db!.getStoreData(storeName);
              return new FakeTransactionStore(new FakeTransaction(storeData), storeData);
            },
          };
          request.onupgradeneeded?.({ target: request });
        }

        queueMicrotask(() => request.onsuccess?.({ target: request }));
      });

      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: factory,
  });

  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: {
      only(value: unknown) {
        return { value };
      },
    },
  });

  return {
    seed(records: RawStoredRecord[]): void {
      let db = databases.get(DB_NAME);
      if (!db) {
        db = new FakeDatabase(DB_NAME, 2);
        databases.set(DB_NAME, db);
      }

      let storeData: FakeStoreData;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        storeData = db.getStoreData(STORE_NAME);
      } else {
        storeData = db.ensureStoreData(STORE_NAME, 'id');
      }

      if (!storeData.indexNames.contains('syncedKey')) {
        storeData.indexes.set('syncedKey', 'syncedKey');
      }

      for (const record of records) {
        storeData.records.set(record.id, cloneValue(record));
      }
    },
    listStoredIds(): string[] {
      const db = databases.get(DB_NAME);
      if (!db || !db.objectStoreNames.contains(STORE_NAME)) {
        return [];
      }

      return Array.from(db.getStoreData(STORE_NAME).records.keys()).sort();
    },
    setGetAllLimit(limit: number | undefined): void {
      (globalThis as typeof globalThis & { __indexedDbGetAllLimit?: number }).__indexedDbGetAllLimit = limit;
    },
    restore(): void {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: originalIndexedDb,
      });

      Object.defineProperty(globalThis, 'IDBKeyRange', {
        configurable: true,
        value: originalKeyRange,
      });

      (globalThis as typeof globalThis & { __indexedDbGetAllLimit?: number }).__indexedDbGetAllLimit = originalGetAllLimit;
    },
  };
}

function buildScanRecord(overrides: Partial<RawStoredRecord> = {}): RawStoredRecord {
  return {
    id: 'scan-1',
    qrPayload: '550e8400-e29b-41d4-a716-446655440000:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
    sessionId: null,
    scannedAt: '2026-04-17T10:15:30.000Z',
    deviceId: 'ipad-crew-1',
    synced: false,
    syncedKey: 0,
    ...overrides,
  };
}

describe('offline-queue', () => {
  let mod: OfflineQueueModule;
  let indexedDbMock: ReturnType<typeof installIndexedDbMock>;

  beforeEach(async () => {
    vi.resetModules();
    indexedDbMock = installIndexedDbMock();
    mod = await import('./offline-queue');
  });

  afterEach(() => {
    indexedDbMock.restore();
  });

  describe('generateScanId', () => {
    it('generates unique scan IDs with the scan- prefix', () => {
      const id1 = mod.generateScanId();
      const id2 = mod.generateScanId();

      expect(id1).toMatch(/^scan-/);
      expect(id2).toMatch(/^scan-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('queue hardening', () => {
    it('rejects malformed queue rows before they can poison later batch syncs', async () => {
      await expect(
        mod.queueOfflineScan({
          id: 'scan-bad',
          qrPayload: 'payload',
          sessionId: 'not-a-uuid',
          scannedAt: '2026-04-17T10:15:30.000Z',
          deviceId: 'device-1',
          synced: false,
        }),
      ).rejects.toThrow('Session ID must be a UUID or null.');

      expect(await mod.getPendingScans()).toEqual([]);
    });

    it('returns only pending rows and clears synced rows after sync', async () => {
      await mod.queueOfflineScan({
        id: 'scan-pending',
        qrPayload: '550e8400-e29b-41d4-a716-446655440000:TOKENPENDING1234567890',
        sessionId: null,
        scannedAt: '2026-04-17T10:15:30.000Z',
        deviceId: 'ipad-crew-1',
        synced: false,
      });

      await mod.queueOfflineScan({
        id: 'scan-synced',
        qrPayload: '550e8400-e29b-41d4-a716-446655440000:TOKENSYNCED1234567890',
        sessionId: null,
        scannedAt: '2026-04-17T10:16:30.000Z',
        deviceId: 'ipad-crew-2',
        synced: true,
      });

      expect((await mod.getPendingScans()).map((record) => record.id)).toEqual(['scan-pending']);

      await mod.markScansAsSynced(['scan-pending']);
      expect(await mod.getPendingCount()).toBe(0);

      await mod.clearSyncedScans();
      expect(indexedDbMock.listStoredIds()).toEqual([]);
    });

    it('self-heals corrupt legacy rows instead of returning them for sync', async () => {
      indexedDbMock.seed([
        buildScanRecord({ id: 'scan-valid' }),
        buildScanRecord({ id: 'scan-corrupt', deviceId: '', syncedKey: 0 }),
      ]);

      const pending = await mod.getPendingScans();

      expect(pending.map((record) => record.id)).toEqual(['scan-valid']);
      expect(indexedDbMock.listStoredIds()).toEqual(['scan-valid']);
    });
  });

  describe('pending count hardening', () => {
    it('counts pending scans without materializing the whole queue through getAll', async () => {
      indexedDbMock.seed(
        Array.from({ length: 25 }, (_, index) =>
          buildScanRecord({
            id: `scan-${index + 1}`,
            deviceId: `ipad-${index + 1}`,
          }),
        ),
      );
      indexedDbMock.setGetAllLimit(10);

      await expect(mod.getPendingCount()).resolves.toBe(25);
    });
  });
});
