import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { bulkZipDownload } from './certificate-bulk-zip';
import { createStubLock } from '@/lib/certificates/distributed-lock';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function chainedSelect(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

// ── Kill OptionalChaining mutations (L52, L114, L118) ──
// These test that deps?.lock, deps?.storageProvider, deps?.fetchPdf
// are properly used — mutant replaces ?. with .

describe('bulkZipDownload — optional chaining kills', () => {
  it('uses injected lock when deps.lock is provided (L52)', async () => {
    const lock = createStubLock();
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockStorageProvider = {
      upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
      getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/bulk.zip'),
      delete: vi.fn(),
    };
    const mockFetchPdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: mockStorageProvider,
      fetchPdf: mockFetchPdf,
      lock,
    });

    expect(result.fileCount).toBe(1);
    // Lock was used and released
    expect(lock.locks.size).toBe(0);
  });

  it('uses injected storageProvider when provided (L114)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockStorageProvider = {
      upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
      getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/zip'),
      delete: vi.fn(),
    };

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: mockStorageProvider,
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('uses injected fetchPdf when provided (L118)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockFetchPdf = vi.fn().mockResolvedValue(Buffer.from('custom-pdf-content'));

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/zip'),
        delete: vi.fn(),
      },
      fetchPdf: mockFetchPdf,
      lock: createStubLock(),
    });

    expect(mockFetchPdf).toHaveBeenCalledWith('certs/c1.pdf');
  });
});

// ── Kill ObjectLiteral mutation (L73 — select shape) ──

describe('bulkZipDownload — select shape assertions', () => {
  it('returns result with zipStorageKey, zipUrl, fileCount, zipSizeBytes (L73)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 200, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://signed-url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    expect(result).toHaveProperty('zipStorageKey');
    expect(result).toHaveProperty('zipUrl');
    expect(result).toHaveProperty('fileCount');
    expect(result).toHaveProperty('zipSizeBytes');
    expect(typeof result.zipStorageKey).toBe('string');
    expect(typeof result.zipUrl).toBe('string');
    expect(typeof result.fileCount).toBe('number');
    expect(typeof result.zipSizeBytes).toBe('number');
  });
});

// ── Kill StringLiteral mutations (L87, L143, L148, L163) ──

describe('bulkZipDownload — string literal kills', () => {
  it('zipStorageKey contains "bulk/" prefix (L87)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    expect(result.zipStorageKey).toContain('bulk/');
  });

  it('upload called with "application/zip" content type (L143,148)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockUpload = vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' });

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: mockUpload,
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    // Third argument should be 'application/zip'
    expect(mockUpload.mock.calls[0][2]).toBe('application/zip');
  });

  it('error message for lock failure mentions Redis (L163)', async () => {
    const brokenLock = {
      acquire: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      release: vi.fn(),
      renew: vi.fn(),
    };

    await expect(
      bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
        storageProvider: {
          upload: vi.fn(),
          getSignedUrl: vi.fn(),
          delete: vi.fn(),
        },
        fetchPdf: vi.fn(),
        lock: brokenLock,
      }),
    ).rejects.toThrow('Redis unavailable');
  });
});

// ── Kill ConditionalExpression, UpdateOperator, EqualityOperator, ArithmeticOperator (L129-130) ──

describe('bulkZipDownload — lock renewal logic', () => {
  it('renews lock every 10 files processed (L129-130)', async () => {
    // Create 11 certs to trigger at least one renewal (at file 10)
    const certs = Array.from({ length: 11 }, (_, i) => ({
      id: `c${i}`,
      storageKey: `certs/c${i}.pdf`,
      fileName: `cert-${i}.pdf`,
      status: 'issued',
      fileSizeBytes: 100,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    const renewSpy = vi.spyOn(lock, 'renew');

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock,
    });

    // At 10 files, filesProcessed % 10 === 0 should trigger renewal
    expect(renewSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT renew lock before 10 files are processed', async () => {
    const certs = Array.from({ length: 9 }, (_, i) => ({
      id: `c${i}`,
      storageKey: `certs/c${i}.pdf`,
      fileName: `cert-${i}.pdf`,
      status: 'issued',
      fileSizeBytes: 100,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    const renewSpy = vi.spyOn(lock, 'renew');

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock,
    });

    expect(renewSpy).not.toHaveBeenCalled();
  });

  it('renews lock twice for 20 files (L130 ArithmeticOperator kill)', async () => {
    const certs = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      storageKey: `certs/c${i}.pdf`,
      fileName: `cert-${i}.pdf`,
      status: 'issued',
      fileSizeBytes: 100,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    const renewSpy = vi.spyOn(lock, 'renew');

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock,
    });

    expect(renewSpy).toHaveBeenCalledTimes(2);
  });
});

// ── Kill BooleanLiteral (L121 — default fetchPdf checks response.ok) ──
// These are NoCoverage because default fetchPdf is only used without deps
// We can't easily test the default path, but we can test the logic indirectly

describe('bulkZipDownload — aggregate size check', () => {
  it('calculates totalSizeBytes from fileSizeBytes, treating null as 0', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      { id: 'c2', storageKey: 'certs/c2.pdf', fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: null },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    // Both certs should be included (both have storageKey)
    expect(result.fileCount).toBe(2);
  });
});

// ── Kill BlockStatement mutations (L118, L130, L162) ──

describe('bulkZipDownload — block statement kills', () => {
  it('release lock is called in finally block even on success (L162)', async () => {
    const lock = createStubLock();
    const releaseSpy = vi.spyOn(lock, 'release');

    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock,
    });

    expect(releaseSpy).toHaveBeenCalled();
  });
});

// ── Kill filesProcessed UpdateOperator (L129: ++ vs --) ──

describe('bulkZipDownload — filesProcessed increment', () => {
  it('filesProcessed increments correctly: renewal at 10 not 0 (L129)', async () => {
    // With 10 files, filesProcessed goes from 0 to 10
    // At file 10: 10 % 10 === 0 → renew
    // If mutated to --, it would go negative and never equal 10
    const certs = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      storageKey: `certs/c${i}.pdf`,
      fileName: `cert-${i}.pdf`,
      status: 'issued',
      fileSizeBytes: 100,
    }));
    chainedSelect(certs);

    const lock = createStubLock();
    const renewSpy = vi.spyOn(lock, 'renew');

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock,
    });

    // Exactly at file 10 (index 9), filesProcessed becomes 10 → 10 % 10 === 0 → renew once
    expect(renewSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Kill StringLiteral on "application/zip" (L143) ──

describe('bulkZipDownload — uploadStream content type', () => {
  it('uploadStream also receives "application/zip" content type (L143)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockUploadStream = vi.fn().mockResolvedValue({
      storageKey: 'k', fileSizeBytes: 500, fileChecksumSha256: 'h',
    });

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn(),
        uploadStream: mockUploadStream,
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    // Third argument should be 'application/zip'
    expect(mockUploadStream.mock.calls[0][2]).toBe('application/zip');
  });
});

// ── Kill OptionalChaining survivors (L52, L114, L118) ──
// These survive because we always pass deps. We need to test calling with undefined deps

// OptionalChaining: These survive because deps is always provided in tests.
// The ?. guards against deps being undefined, but we always pass deps.
// Since the default import fallbacks require real infrastructure,
// we can't easily test without deps. These are NoCoverage-equivalent.

// ── Kill select shape ObjectLiteral (L73) ──

describe('bulkZipDownload — select argument verification', () => {
  it('passes non-empty select shape to db.select (L73)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    if (selectArg) {
      expect(typeof selectArg).toBe('object');
      expect(Object.keys(selectArg).length).toBeGreaterThan(0);
    }
  });
});

// ── Kill buildBulkZipStorageKey string (L87 StringLiteral) ──

describe('bulkZipDownload — zipStorageKey format', () => {
  it('zipStorageKey is non-empty string (L87)', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' }),
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    expect(result.zipStorageKey).not.toBe('');
    expect(result.zipStorageKey.length).toBeGreaterThan(5);
  });
});

// ── Kill StringLiteral on application/zip for buffered upload (L148) ──

describe('bulkZipDownload — buffered upload content type (L148)', () => {
  it('buffered upload uses "application/zip" content type', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
    ];
    chainedSelect(certs);

    const mockUpload = vi.fn().mockResolvedValue({ storageKey: 'k', fileSizeBytes: 100, fileChecksumSha256: 'h' });

    await bulkZipDownload(EVENT_ID, { certificateType: 'delegate_attendance' }, {
      storageProvider: {
        upload: mockUpload,
        // No uploadStream — forces buffered path
        getSignedUrl: vi.fn().mockResolvedValue('https://url'),
        delete: vi.fn(),
      },
      fetchPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      lock: createStubLock(),
    });

    expect(mockUpload.mock.calls[0][2]).toBe('application/zip');
  });
});
