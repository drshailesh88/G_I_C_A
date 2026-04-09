import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import {
  buildCertificateStorageKey,
  createStubStorageProvider,
  createR2Provider,
} from './storage';

// ── AWS SDK mocks for createR2Provider tests ─────────────────
const mockSend = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((params: any) => ({ ...params, _type: 'PutObject' })),
  GetObjectCommand: vi.fn().mockImplementation((params: any) => ({ ...params, _type: 'GetObject' })),
  DeleteObjectCommand: vi.fn().mockImplementation((params: any) => ({ ...params, _type: 'DeleteObject' })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed?token=abc'),
}));

// Upload mock that actually consumes the Body stream before resolving done()
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation((opts: any) => ({
    done: () => new Promise<void>((resolve) => {
      const body = opts.params?.Body;
      if (body && typeof body.on === 'function') {
        body.on('end', () => resolve());
        body.resume(); // Ensure data flows
      } else {
        resolve();
      }
    }),
  })),
}));

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

// ── createR2Provider (mocked SDK) ────────────────────────────
describe('createR2Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_ENDPOINT = 'https://r2.example.com';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  it('upload sends PutObjectCommand with correct params', async () => {
    const provider = createR2Provider();
    const data = Buffer.from('pdf-content');

    const result = await provider.upload('certs/test.pdf', data, 'application/pdf');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.Key).toBe('certs/test.pdf');
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.ContentType).toBe('application/pdf');
    expect(result.storageKey).toBe('certs/test.pdf');
    expect(result.fileSizeBytes).toBe(data.length);
    expect(result.fileChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getSignedUrl returns presigned URL', async () => {
    const provider = createR2Provider();
    const url = await provider.getSignedUrl('certs/test.pdf', 3600);

    expect(url).toBe('https://r2.example.com/signed?token=abc');
  });

  it('delete sends DeleteObjectCommand', async () => {
    const provider = createR2Provider();
    await provider.delete('certs/old.pdf');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.Key).toBe('certs/old.pdf');
    expect(cmd._type).toBe('DeleteObject');
  });

  it('uploadStream uses @aws-sdk/lib-storage Upload with multipart params', async () => {
    const { Upload } = await import('@aws-sdk/lib-storage');
    const provider = createR2Provider();

    // Create a readable stream with known content
    const content = Buffer.from('streaming-pdf-content');
    const stream = new Readable({
      read() {
        this.push(content);
        this.push(null);
      },
    });

    const result = await provider.uploadStream!('certs/stream.zip', stream, 'application/zip');

    // Verify Upload was constructed with correct params
    expect(Upload).toHaveBeenCalledTimes(1);
    const uploadCall = (Upload as any).mock.calls[0][0];
    expect(uploadCall.params.Bucket).toBe('test-bucket');
    expect(uploadCall.params.Key).toBe('certs/stream.zip');
    expect(uploadCall.params.ContentType).toBe('application/zip');
    expect(uploadCall.partSize).toBe(5 * 1024 * 1024);
    expect(uploadCall.leavePartsOnError).toBe(false);

    // Verify result
    expect(result.storageKey).toBe('certs/stream.zip');
    expect(result.fileSizeBytes).toBe(content.length);
    expect(result.fileChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uploadStream computes correct SHA-256 hash', async () => {
    const crypto = await import('crypto');
    const provider = createR2Provider();

    const content = Buffer.from('hash-me-please');
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

    const stream = new Readable({
      read() {
        this.push(content);
        this.push(null);
      },
    });

    const result = await provider.uploadStream!('certs/hash.zip', stream, 'application/zip');
    expect(result.fileChecksumSha256).toBe(expectedHash);
  });
});
