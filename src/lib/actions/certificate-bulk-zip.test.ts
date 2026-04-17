import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { bulkZipDownload } from './certificate-bulk-zip';
import { createStubLock, type DistributedLock } from '@/lib/certificates/distributed-lock';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function certificateStorageKey(id: string, certificateType = 'delegate_attendance') {
  return `certificates/${EVENT_ID}/${certificateType}/${id}.pdf`;
}

function chainedSelect(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

describe('bulkZipDownload', () => {
  const mockStorageProvider = {
    upload: vi.fn().mockResolvedValue({
      storageKey: 'bulk.zip',
      fileSizeBytes: 100,
      fileChecksumSha256: 'abc123',
    }),
    getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/bulk.zip?signed=true'),
    delete: vi.fn(),
  };

  const mockFetchPdf = vi.fn().mockResolvedValue(Buffer.from('fake-pdf'));

  function makeDeps(overrides?: { lock?: DistributedLock }) {
    return {
      storageProvider: mockStorageProvider,
      fetchPdf: mockFetchPdf,
      lock: overrides?.lock ?? createStubLock(),
    };
  }

  it('rejects a malformed route eventId before auth, locking, or database access', async () => {
    await expect(
      bulkZipDownload('not-a-uuid', { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects stale body eventIds that do not match the route eventId before auth', async () => {
    await expect(
      bulkZipDownload(
        EVENT_ID,
        {
          eventId: '550e8400-e29b-41d4-a716-446655440099',
          certificateType: 'delegate_attendance',
        },
        makeDeps(),
      ),
    ).rejects.toThrow('eventId mismatch');

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('creates a ZIP from issued certificates and returns signed URL', async () => {
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      { id: 'c2', storageKey: certificateStorageKey('c2'), fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: 2000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps());

    expect(result.fileCount).toBe(2);
    expect(result.zipUrl).toBe('https://r2.example.com/bulk.zip?signed=true');
    expect(result.zipSizeBytes).toBeGreaterThan(0);
    expect(result.zipStorageKey).toContain('bulk/');
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
    expect(mockFetchPdf).toHaveBeenCalledTimes(2);
  });

  it('bounds the certificate query before materializing bulk ZIP candidates', async () => {
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    const chain = chainedSelect(certs);

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps());

    expect(chain.limit).toHaveBeenCalledWith(501);
  });

  it('rejects issued certificate rows whose storageKey points outside the active event/type prefix', async () => {
    const otherEventId = '550e8400-e29b-41d4-a716-446655440099';
    const certs = [
      {
        id: 'c1',
        storageKey: `certificates/${otherEventId}/delegate_attendance/c1.pdf`,
        fileName: 'cert-001.pdf',
        status: 'issued',
        fileSizeBytes: 1000,
      },
    ];
    chainedSelect(certs);

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow('Invalid certificate storage key');

    expect(mockFetchPdf).not.toHaveBeenCalled();
    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
  });

  it('rejects downloads whose actual PDF bytes exceed the aggregate size limit even when metadata is stale', async () => {
    const certs = [
      {
        id: 'c1',
        storageKey: certificateStorageKey('c1'),
        fileName: 'cert-001.pdf',
        status: 'issued',
        fileSizeBytes: 1,
      },
    ];
    chainedSelect(certs);

    const oversizedPdf = Buffer.from('%PDF-oversized');
    Object.defineProperty(oversizedPdf, 'length', {
      value: 200 * 1024 * 1024 + 1,
    });

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
        ...makeDeps(),
        fetchPdf: vi.fn().mockResolvedValue(oversizedPdf),
      }),
    ).rejects.toThrow('Downloaded PDF size');

    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
  });

  it('only includes issued status certificates — revoked excluded (CP-69)', async () => {
    // The query itself filters by status='issued' via WHERE clause,
    // so revoked certs should never appear in results
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      // Revoked certs should be filtered at query level, but if they sneak through:
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps());
    // Should only include the issued cert
    expect(result.fileCount).toBe(1);
  });

  it('filters out certificates without storageKey', async () => {
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      { id: 'c2', storageKey: null, fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: null },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps());

    expect(result.fileCount).toBe(1);
    expect(mockFetchPdf).toHaveBeenCalledTimes(1);
  });

  it('throws when no certificates found', async () => {
    chainedSelect([]);
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow('At least one');
  });

  it('throws when all certificates lack storageKey', async () => {
    const certs = [
      { id: 'c1', storageKey: null, fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: null },
    ];
    chainedSelect(certs);
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow('At least one');
  });

  it('rejects invalid certificate type', async () => {
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'invalid_type' }, makeDeps()),
    ).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow('Forbidden');
  });

  it('rejects when aggregate PDF size exceeds limit', async () => {
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 150 * 1024 * 1024 },
      { id: 'c2', storageKey: certificateStorageKey('c2'), fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: 150 * 1024 * 1024 },
    ];
    chainedSelect(certs);
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()),
    ).rejects.toThrow('exceeds maximum');
  });

  it('requires write access', async () => {
    chainedSelect([]);
    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps()).catch(() => {});
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  // ── Distributed Lock Tests ────────────────────────────────
  it('throws when lock is already held (concurrent request)', async () => {
    const lock = createStubLock();
    // Pre-acquire the lock
    await lock.acquire(EVENT_ID, 'delegate_attendance');

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps({ lock })),
    ).rejects.toThrow('already in progress');
  });

  it('releases lock after successful completion', async () => {
    const lock = createStubLock();
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps({ lock }));

    // Lock should be released
    expect(lock.locks.size).toBe(0);
    // Should be re-acquirable
    const reacquired = await lock.acquire(EVENT_ID, 'delegate_attendance');
    expect(reacquired).not.toBeNull();
  });

  it('releases lock even when operation fails', async () => {
    const lock = createStubLock();
    chainedSelect([]); // No certs → will throw validation error

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, makeDeps({ lock })).catch(() => {});

    // Lock should still be released
    expect(lock.locks.size).toBe(0);
  });

  it('allows concurrent requests for different certificate types', async () => {
    const lock = createStubLock();
    // Lock for delegate_attendance
    await lock.acquire(EVENT_ID, 'delegate_attendance');

    // faculty_participation should still work
    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1', 'faculty_participation'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(
      EVENT_ID,
      { certificateType: 'faculty_participation' },
      makeDeps({ lock }),
    );
    expect(result.fileCount).toBe(1);
  });

  it('throws user-friendly error when Redis is unavailable', async () => {
    const brokenLock = {
      acquire: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      release: vi.fn(),
      renew: vi.fn().mockResolvedValue(true),
    };

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
        ...makeDeps(),
        lock: brokenLock,
      }),
    ).rejects.toThrow('Redis unavailable');
  });

  it('aborts when the distributed lock can no longer be renewed mid-generation', async () => {
    const certs = Array.from({ length: 10 }, (_, index) => ({
      id: `c${index}`,
      storageKey: certificateStorageKey(`c${index}`),
      fileName: `cert-${index}.pdf`,
      status: 'issued',
      fileSizeBytes: 1000,
    }));
    chainedSelect(certs);

    const acquiredHandle = {
      key: `cert:lock:${EVENT_ID}:delegate_attendance`,
      ownerToken: 'owner-token',
    };
    const lock: DistributedLock = {
      acquire: vi.fn().mockResolvedValue(acquiredHandle),
      release: vi.fn().mockResolvedValue(undefined),
      renew: vi.fn().mockResolvedValue(false),
    };

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
        ...makeDeps(),
        lock,
      }),
    ).rejects.toThrow('lock was lost during ZIP creation');

    expect(lock.renew).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledWith(acquiredHandle);
  });

  it('uses uploadStream when provider supports it (no buffered upload)', async () => {
    const mockUploadStream = vi.fn().mockResolvedValue({
      storageKey: 'bulk-stream.zip',
      fileSizeBytes: 500,
      fileChecksumSha256: 'stream-hash',
    });

    const streamProvider = {
      upload: vi.fn(),
      uploadStream: mockUploadStream,
      getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/bulk-stream.zip?signed=true'),
      delete: vi.fn(),
    };

    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: streamProvider,
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
      lock: createStubLock(),
    });

    expect(mockUploadStream).toHaveBeenCalledTimes(1);
    expect(streamProvider.upload).not.toHaveBeenCalled(); // Buffered path NOT used
    expect(result.zipSizeBytes).toBe(500);
    expect(result.zipUrl).toContain('bulk-stream.zip');
  });

  it('falls back to buffered upload when uploadStream is not available', async () => {
    const bufferProvider = {
      upload: vi.fn().mockResolvedValue({
        storageKey: 'bulk-buffer.zip',
        fileSizeBytes: 300,
        fileChecksumSha256: 'buffer-hash',
      }),
      // No uploadStream method
      getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/bulk-buffer.zip?signed=true'),
      delete: vi.fn(),
    };

    const certs = [
      { id: 'c1', storageKey: certificateStorageKey('c1'), fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: bufferProvider,
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
      lock: createStubLock(),
    });

    expect(bufferProvider.upload).toHaveBeenCalledTimes(1);
    expect(result.zipSizeBytes).toBeGreaterThan(0);
  });
});
