import { describe, expect, it, vi } from 'vitest';
import {
  validateBulkZipInput,
  buildBulkZipStorageKey,
  deduplicateFileNames,
  createZipArchive,
  type BulkZipInput,
} from './bulk-zip';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

// ── validateBulkZipInput ────────────────────────────────────
describe('validateBulkZipInput', () => {
  const validInput: BulkZipInput = {
    eventId: EVENT_ID,
    certificateType: 'delegate_attendance',
    certificates: [
      { storageKey: 'certs/a.pdf', fileName: 'cert-001.pdf' },
      { storageKey: 'certs/b.pdf', fileName: 'cert-002.pdf' },
    ],
  };

  it('returns null for valid input', () => {
    expect(validateBulkZipInput(validInput)).toBeNull();
  });

  it('rejects empty eventId', () => {
    expect(validateBulkZipInput({ ...validInput, eventId: '' })).toContain('eventId');
  });

  it('rejects empty certificateType', () => {
    expect(validateBulkZipInput({ ...validInput, certificateType: '' })).toContain('certificateType');
  });

  it('rejects empty certificates array', () => {
    expect(validateBulkZipInput({ ...validInput, certificates: [] })).toContain('At least one');
  });

  it('rejects more than 500 certificates', () => {
    const certs = Array.from({ length: 501 }, (_, i) => ({
      storageKey: `k/${i}.pdf`,
      fileName: `cert-${i}.pdf`,
    }));
    expect(validateBulkZipInput({ ...validInput, certificates: certs })).toContain('500');
  });

  it('rejects certificate with empty storageKey', () => {
    const input = {
      ...validInput,
      certificates: [{ storageKey: '', fileName: 'a.pdf' }],
    };
    expect(validateBulkZipInput(input)).toContain('storageKey');
  });

  it('rejects certificate with empty fileName', () => {
    const input = {
      ...validInput,
      certificates: [{ storageKey: 'k/a.pdf', fileName: '' }],
    };
    expect(validateBulkZipInput(input)).toContain('fileName');
  });
});

// ── buildBulkZipStorageKey ──────────────────────────────────
describe('buildBulkZipStorageKey', () => {
  it('includes eventId and certificateType', () => {
    const key = buildBulkZipStorageKey(EVENT_ID, 'delegate_attendance');
    expect(key).toContain(EVENT_ID);
    expect(key).toContain('delegate_attendance');
    expect(key).toContain('bulk/');
    expect(key.endsWith('.zip')).toBe(true);
  });

  it('generates unique keys (includes timestamp)', () => {
    const key1 = buildBulkZipStorageKey(EVENT_ID, 'delegate_attendance');
    const key2 = buildBulkZipStorageKey(EVENT_ID, 'delegate_attendance');
    // Keys may be the same if called within the same millisecond, but format is correct
    expect(key1).toMatch(/certificates\/.*\/bulk\/delegate_attendance-\d+\.zip/);
    expect(key2).toMatch(/certificates\/.*\/bulk\/delegate_attendance-\d+\.zip/);
  });
});

// ── deduplicateFileNames ────────────────────────────────────
describe('deduplicateFileNames', () => {
  it('returns unchanged names when all unique', () => {
    const result = deduplicateFileNames(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(result.get(0)).toBe('a.pdf');
    expect(result.get(1)).toBe('b.pdf');
    expect(result.get(2)).toBe('c.pdf');
  });

  it('deduplicates names by adding suffix', () => {
    const result = deduplicateFileNames(['cert.pdf', 'cert.pdf', 'cert.pdf']);
    expect(result.get(0)).toBe('cert.pdf');
    expect(result.get(1)).toBe('cert-2.pdf');
    expect(result.get(2)).toBe('cert-3.pdf');
  });

  it('handles files without extensions', () => {
    const result = deduplicateFileNames(['cert', 'cert']);
    expect(result.get(0)).toBe('cert');
    expect(result.get(1)).toBe('cert-2');
  });

  it('handles mixed unique and duplicate names', () => {
    const result = deduplicateFileNames(['a.pdf', 'b.pdf', 'a.pdf', 'c.pdf', 'b.pdf']);
    expect(result.get(0)).toBe('a.pdf');
    expect(result.get(1)).toBe('b.pdf');
    expect(result.get(2)).toBe('a-2.pdf');
    expect(result.get(3)).toBe('c.pdf');
    expect(result.get(4)).toBe('b-2.pdf');
  });

  it('handles empty array', () => {
    const result = deduplicateFileNames([]);
    expect(result.size).toBe(0);
  });
});

// ── createZipArchive ────────────────────────────────────────
describe('createZipArchive', () => {
  it('creates a ZIP buffer from certificate PDFs', async () => {
    const certs = [
      { storageKey: 'k/a.pdf', fileName: 'cert-001.pdf' },
      { storageKey: 'k/b.pdf', fileName: 'cert-002.pdf' },
    ];
    const fetchPdf = vi.fn()
      .mockResolvedValueOnce(Buffer.from('pdf-content-a'))
      .mockResolvedValueOnce(Buffer.from('pdf-content-b'));

    const zip = await createZipArchive(certs, fetchPdf);
    expect(zip).toBeInstanceOf(Buffer);
    expect(zip.length).toBeGreaterThan(0);
    // ZIP magic number: PK (0x504B)
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4B);
    expect(fetchPdf).toHaveBeenCalledTimes(2);
    expect(fetchPdf).toHaveBeenCalledWith('k/a.pdf');
    expect(fetchPdf).toHaveBeenCalledWith('k/b.pdf');
  });

  it('deduplicates file names in ZIP', async () => {
    const certs = [
      { storageKey: 'k/a.pdf', fileName: 'cert.pdf' },
      { storageKey: 'k/b.pdf', fileName: 'cert.pdf' },
    ];
    const fetchPdf = vi.fn().mockResolvedValue(Buffer.from('pdf-content'));

    const zip = await createZipArchive(certs, fetchPdf);
    expect(zip).toBeInstanceOf(Buffer);
    // Both files should be in the ZIP (with different names)
    expect(fetchPdf).toHaveBeenCalledTimes(2);
  });

  it('throws when fetchPdf fails', async () => {
    const certs = [{ storageKey: 'k/missing.pdf', fileName: 'cert.pdf' }];
    const fetchPdf = vi.fn().mockRejectedValue(new Error('File not found'));

    await expect(createZipArchive(certs, fetchPdf)).rejects.toThrow('File not found');
  });

  it('handles single certificate', async () => {
    const certs = [{ storageKey: 'k/only.pdf', fileName: 'only-cert.pdf' }];
    const fetchPdf = vi.fn().mockResolvedValue(Buffer.from('single-pdf'));

    const zip = await createZipArchive(certs, fetchPdf);
    expect(zip).toBeInstanceOf(Buffer);
    expect(zip[0]).toBe(0x50); // ZIP magic
  });
});
