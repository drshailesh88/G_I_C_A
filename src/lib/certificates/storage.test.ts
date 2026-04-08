import { describe, expect, it } from 'vitest';
import {
  buildCertificateStorageKey,
  createStubStorageProvider,
} from './storage';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CERT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('buildCertificateStorageKey', () => {
  it('builds correct key format', () => {
    const key = buildCertificateStorageKey(EVENT_ID, 'delegate_attendance', CERT_ID);
    expect(key).toBe(`certificates/${EVENT_ID}/delegate_attendance/${CERT_ID}.pdf`);
  });

  it('includes event ID for isolation', () => {
    const key = buildCertificateStorageKey(EVENT_ID, 'cme_attendance', CERT_ID);
    expect(key).toContain(EVENT_ID);
  });

  it('includes certificate type for prefix-based listing', () => {
    const key = buildCertificateStorageKey(EVENT_ID, 'speaker_recognition', CERT_ID);
    expect(key).toContain('speaker_recognition');
  });
});

describe('createStubStorageProvider', () => {
  it('uploads and retrieves files', async () => {
    const provider = createStubStorageProvider();
    const data = Buffer.from('fake-pdf-content');

    const result = await provider.upload('test/key.pdf', data, 'application/pdf');
    expect(result.storageKey).toBe('test/key.pdf');
    expect(result.fileSizeBytes).toBe(data.length);
    expect(result.fileChecksumSha256).toBeTruthy();

    expect(provider.files.has('test/key.pdf')).toBe(true);
  });

  it('generates signed URLs for uploaded files', async () => {
    const provider = createStubStorageProvider();
    const data = Buffer.from('pdf-content');
    await provider.upload('cert.pdf', data, 'application/pdf');

    const url = await provider.getSignedUrl('cert.pdf', 3600);
    expect(url).toContain('cert.pdf');
    expect(url).toContain('expires=3600');
  });

  it('throws for signed URL of non-existent file', async () => {
    const provider = createStubStorageProvider();
    await expect(provider.getSignedUrl('missing.pdf')).rejects.toThrow('File not found');
  });

  it('deletes files', async () => {
    const provider = createStubStorageProvider();
    const data = Buffer.from('temp-pdf');
    await provider.upload('temp.pdf', data, 'application/pdf');
    expect(provider.files.has('temp.pdf')).toBe(true);

    await provider.delete('temp.pdf');
    expect(provider.files.has('temp.pdf')).toBe(false);
  });

  it('generates deterministic checksums', async () => {
    const provider = createStubStorageProvider();
    const data = Buffer.from('same-content');

    const result1 = await provider.upload('a.pdf', data, 'application/pdf');
    const result2 = await provider.upload('b.pdf', data, 'application/pdf');
    expect(result1.fileChecksumSha256).toBe(result2.fileChecksumSha256);
  });
});
