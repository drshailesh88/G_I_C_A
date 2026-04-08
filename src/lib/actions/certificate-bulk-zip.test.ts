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

  it('creates a ZIP from issued certificates and returns signed URL', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      { id: 'c2', storageKey: 'certs/c2.pdf', fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: 2000 },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    );

    expect(result.fileCount).toBe(2);
    expect(result.zipUrl).toBe('https://r2.example.com/bulk.zip?signed=true');
    expect(result.zipSizeBytes).toBeGreaterThan(0);
    expect(result.zipStorageKey).toContain('bulk/');
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
    expect(mockFetchPdf).toHaveBeenCalledTimes(2);
  });

  it('filters out certificates without storageKey', async () => {
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 1000 },
      { id: 'c2', storageKey: null, fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: null },
    ];
    chainedSelect(certs);

    const result = await bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    );

    expect(result.fileCount).toBe(1);
    expect(mockFetchPdf).toHaveBeenCalledTimes(1);
  });

  it('throws when no certificates found', async () => {
    chainedSelect([]);

    await expect(bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    )).rejects.toThrow('At least one');
  });

  it('throws when all certificates lack storageKey', async () => {
    const certs = [
      { id: 'c1', storageKey: null, fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: null },
    ];
    chainedSelect(certs);

    await expect(bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    )).rejects.toThrow('At least one');
  });

  it('rejects invalid certificate type', async () => {
    await expect(bulkZipDownload(
      EVENT_ID,
      { certificateType: 'invalid_type' },
      { storageProvider: mockStorageProvider },
    )).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider },
    )).rejects.toThrow('Forbidden');
  });

  it('rejects when aggregate PDF size exceeds limit', async () => {
    // 2 certs, each ~150MB = 300MB total (over 200MB limit)
    const certs = [
      { id: 'c1', storageKey: 'certs/c1.pdf', fileName: 'cert-001.pdf', status: 'issued', fileSizeBytes: 150 * 1024 * 1024 },
      { id: 'c2', storageKey: 'certs/c2.pdf', fileName: 'cert-002.pdf', status: 'issued', fileSizeBytes: 150 * 1024 * 1024 },
    ];
    chainedSelect(certs);

    await expect(bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    )).rejects.toThrow('exceeds maximum');
  });

  it('requires write access', async () => {
    chainedSelect([]);
    await bulkZipDownload(
      EVENT_ID,
      { certificateType: 'delegate_attendance' },
      { storageProvider: mockStorageProvider, fetchPdf: mockFetchPdf },
    ).catch(() => {});
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});
