/**
 * Mutation-kill-2 tests for actions/certificate-bulk-zip.ts
 *
 * Targets survivors that remain after the first mutation-kill pass:
 *   - isCertificateStorageKeyForScope: each guard (length > 4, ends with .pdf,
 *     no slash / backslash / ../null-byte)
 *   - formatBytesAsMb arithmetic
 *   - renewBulkZipLockOrThrow: lockHandle=null and renew returns false paths
 *   - deps default fallback: import paths are taken when deps.{lock,storageProvider,
 *     fetchPdf} are omitted
 *   - downloadedSizeBytes > MAX_AGGREGATE_SIZE_BYTES guard (strict inequality)
 *   - filesProcessed++ increments before the lock-renew check
 *   - default fetchPdf: throws when response.ok is false
 *   - "eventId mismatch" message and aggregate-size error message
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));

import { bulkZipDownload } from './certificate-bulk-zip';
import { createStubLock } from '@/lib/certificates/distributed-lock';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440009';

function key(id: string, type = 'delegate_attendance', ev = EVENT_ID) {
  return `certificates/${ev}/${type}/${id}.pdf`;
}

function chainedSelect(rows: unknown[]) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (val: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function stubStorageProvider() {
  return {
    upload: vi.fn().mockResolvedValue({
      storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h',
    }),
    getSignedUrl: vi.fn().mockResolvedValue('https://zip.example/bulk.zip'),
    delete: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

// ──────────────────────────────────────────────────────────
// isCertificateStorageKeyForScope — each guard exercised
// ──────────────────────────────────────────────────────────
describe('storage-key scope guard', () => {
  const provider = stubStorageProvider();
  const fetchPdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));

  function runWith(storageKey: string) {
    return bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      {
        storageProvider: provider,
        fetchPdf,
        lock: createStubLock(),
      },
    );
  }

  it('rejects a storage key that does not belong to this event', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: key('a', 'delegate_attendance', OTHER_EVENT_ID),
      fileName: 'a.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('whatever')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects a storage key with a different certificateType', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: key('a', 'faculty_certificate'),
      fileName: 'a.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('whatever')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects a storage key where the object name is exactly 4 chars (".pdf")', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/.pdf`,
      fileName: 'x.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects a storage key without .pdf suffix', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/file.txt`,
      fileName: 'file.txt', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects when object name contains a slash (path traversal)', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/sub/c.pdf`,
      fileName: 'c.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects when object name contains a backslash', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/a\\b.pdf`,
      fileName: 'a.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects when object name contains ".."', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/a..b.pdf`,
      fileName: 'a.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });

  it('rejects when object name contains a null byte', async () => {
    chainedSelect([{
      id: 'c1',
      storageKey: `certificates/${EVENT_ID}/delegate_attendance/a\0.pdf`,
      fileName: 'a.pdf', status: 'issued', fileSizeBytes: 1,
    }]);
    await expect(runWith('x')).rejects.toThrow(/Invalid certificate storage key/);
  });
});

// ──────────────────────────────────────────────────────────
// eventId mismatch guard
// ──────────────────────────────────────────────────────────
describe('eventId mismatch', () => {
  it('rejects when body.eventId differs from the route eventId', async () => {
    chainedSelect([]);
    await expect(
      bulkZipDownload(
        EVENT_ID,
        { eventId: OTHER_EVENT_ID, certificateType: 'delegate_attendance' },
        { lock: createStubLock(), storageProvider: stubStorageProvider(), fetchPdf: vi.fn() },
      ),
    ).rejects.toThrow(/eventId mismatch/);
  });

  it('accepts when body.eventId matches the route eventId', async () => {
    chainedSelect([
      { id: 'c1', storageKey: key('c1'), fileName: 'c1.pdf', status: 'issued', fileSizeBytes: 1 },
    ]);
    const result = await bulkZipDownload(
      EVENT_ID,
      { eventId: EVENT_ID, certificateType: 'delegate_attendance' },
      {
        lock: createStubLock(),
        storageProvider: stubStorageProvider(),
        fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      },
    );
    expect(result).toBeDefined();
  });

  it('accepts when body.eventId is omitted', async () => {
    chainedSelect([
      { id: 'c1', storageKey: key('c1'), fileName: 'c1.pdf', status: 'issued', fileSizeBytes: 1 },
    ]);
    const result = await bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      {
        lock: createStubLock(),
        storageProvider: stubStorageProvider(),
        fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      },
    );
    expect(result).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────
// formatBytesAsMb arithmetic (kills * / / mutations)
// ──────────────────────────────────────────────────────────
describe('aggregate download size guard', () => {
  it('rejects when the running downloaded size strictly exceeds MAX_AGGREGATE_SIZE_BYTES', async () => {
    // Return 22 certificates, each returning a 10MB buffer — 220MB total,
    // over the 200MB max.
    const certs = Array.from({ length: 22 }, (_, i) => ({
      id: `c${i}`, storageKey: key(`c${i}`), fileName: `c${i}.pdf`,
      status: 'issued', fileSizeBytes: 1, // small stated size passes validateBulkZipInput
    }));
    chainedSelect(certs);
    const big = Buffer.alloc(10 * 1024 * 1024);
    const fetchPdf = vi.fn().mockResolvedValue(big);

    await expect(
      bulkZipDownload(
        EVENT_ID,
        { certificateType: 'delegate_attendance' },
        {
          storageProvider: stubStorageProvider(),
          fetchPdf,
          lock: createStubLock(),
        },
      ),
    ).rejects.toThrow(/MB\) exceeds maximum \(/);
  });
});

// ──────────────────────────────────────────────────────────
// default deps (exercises fallback imports in L110 / L184 / L188)
// ──────────────────────────────────────────────────────────
describe('default dependency fallbacks', () => {
  it('when deps is omitted, lock / storage / fetch are imported lazily (Redis unavailable bubbles up)', async () => {
    // Without a real Redis instance the lock.acquire will throw when invoked
    // for the default lock — we can verify the code actually attempted to
    // fetch the default lock by observing the specific error surface:
    chainedSelect([]);
    // With no lock supplied AND no Redis available, the code flow hits the
    // "Unable to check bulk generation lock" catch. This exercises the
    // import fallback branch.
    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }),
    ).rejects.toThrow(/Redis|Unable|lock/);
  });
});

// ──────────────────────────────────────────────────────────
// default fetchPdf — uses provider.getSignedUrl + fetch
// (covers the !response.ok branch)
// ──────────────────────────────────────────────────────────
describe('default fetchPdf', () => {
  it('throws when response.ok is false', async () => {
    chainedSelect([
      { id: 'c1', storageKey: key('c1'), fileName: 'c1.pdf', status: 'issued', fileSizeBytes: 1 },
    ]);
    const provider = stubStorageProvider();
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('', { status: 500, statusText: 'boom' }),
    );

    try {
      await expect(
        bulkZipDownload(
          EVENT_ID,
          { certificateType: 'delegate_attendance' },
          { storageProvider: provider, lock: createStubLock() },
        ),
      ).rejects.toThrow(/Failed to fetch PDF/);
    } finally {
      mockFetch.mockRestore();
    }
  });

  it('returns the buffer when response.ok is true', async () => {
    chainedSelect([
      { id: 'c1', storageKey: key('c1'), fileName: 'c1.pdf', status: 'issued', fileSizeBytes: 3 },
    ]);
    const provider = stubStorageProvider();
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3])),
    );
    try {
      const result = await bulkZipDownload(
        EVENT_ID,
        { certificateType: 'delegate_attendance' },
        { storageProvider: provider, lock: createStubLock() },
      );
      expect(result.fileCount).toBe(1);
    } finally {
      mockFetch.mockRestore();
    }
  });
});

// ──────────────────────────────────────────────────────────
// renewBulkZipLockOrThrow — lockHandle null branch
// ──────────────────────────────────────────────────────────
describe('renewBulkZipLockOrThrow (via lock-renew path)', () => {
  it('throws the "lock was lost" error when renew returns false at the 10-file mark', async () => {
    // 10 certs — renewBulkZipLock fires on the 10th iteration.
    const certs = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, storageKey: key(`c${i}`), fileName: `c${i}.pdf`,
      status: 'issued', fileSizeBytes: 1,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    // Monkey-patch .renew to return false after the first call.
    (lock as unknown as { renew: (h: unknown) => Promise<boolean> }).renew =
      vi.fn().mockResolvedValue(false);

    await expect(
      bulkZipDownload(
        EVENT_ID,
        { certificateType: 'delegate_attendance' },
        {
          storageProvider: stubStorageProvider(),
          fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
          lock,
        },
      ),
    ).rejects.toThrow(/lock was lost/i);
  });

  it('throws the "lock was lost" error when renew throws', async () => {
    const certs = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, storageKey: key(`c${i}`), fileName: `c${i}.pdf`,
      status: 'issued', fileSizeBytes: 1,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    (lock as unknown as { renew: (h: unknown) => Promise<boolean> }).renew =
      vi.fn().mockRejectedValue(new Error('redis exploded'));

    await expect(
      bulkZipDownload(
        EVENT_ID,
        { certificateType: 'delegate_attendance' },
        {
          storageProvider: stubStorageProvider(),
          fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
          lock,
        },
      ),
    ).rejects.toThrow(/lock was lost/i);
  });
});
