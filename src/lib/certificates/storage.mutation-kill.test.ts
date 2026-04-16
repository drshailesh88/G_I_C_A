import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { createR2Provider, createStubStorageProvider } from './storage';

// Mock sentry to capture and assert error reporting
const mockCaptureStorageError = vi.fn();
vi.mock('@/lib/sentry', () => ({
  captureStorageError: (...args: unknown[]) => mockCaptureStorageError(...args),
}));

// AWS SDK mocks — declared in module scope so constructor call assertions work
const mockSend = vi.fn().mockResolvedValue({});
const MockS3Client = vi.fn().mockImplementation(() => ({ send: mockSend }));
const MockPutObjectCommand = vi.fn().mockImplementation((params: unknown) => ({ ...(params as object), _type: 'PutObject' }));
const MockGetObjectCommand = vi.fn().mockImplementation((params: unknown) => ({ ...(params as object), _type: 'GetObject' }));
const MockDeleteObjectCommand = vi.fn().mockImplementation((params: unknown) => ({ ...(params as object), _type: 'DeleteObject' }));
const mockGetSignedUrlFn = vi.fn().mockResolvedValue('https://r2.example.com/signed?token=abc');
let mockUploadDone = vi.fn().mockResolvedValue(undefined);
const MockUpload = vi.fn().mockImplementation((opts: { params?: { Body?: Readable } }) => ({
  done: () => new Promise<void>((resolve, reject) => {
    const done = mockUploadDone();
    const body = opts.params?.Body;
    if (body && typeof body.on === 'function') {
      body.on('end', () => done.then(resolve, reject));
      body.resume();
    } else {
      done.then(resolve, reject);
    }
  }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
  GetObjectCommand: MockGetObjectCommand,
  DeleteObjectCommand: MockDeleteObjectCommand,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrlFn,
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: MockUpload,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({});
  mockGetSignedUrlFn.mockResolvedValue('https://r2.example.com/signed?token=abc');
  mockUploadDone = vi.fn().mockResolvedValue(undefined);
  process.env.R2_ENDPOINT = 'https://r2.example.com';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_BUCKET_NAME = 'test-bucket';
});

// ── S3Client config assertions (kills region StringLiteral + config ObjectLiteral + credentials ObjectLiteral) ──

describe('createR2Provider — S3Client config assertions', () => {
  it('upload constructs S3Client with correct region, endpoint, and credentials', async () => {
    const provider = createR2Provider();
    await provider.upload('certs/test.pdf', Buffer.from('data'), 'application/pdf');
    expect(MockS3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://r2.example.com',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
  });

  it('uploadStream constructs S3Client with correct region, endpoint, and credentials', async () => {
    const provider = createR2Provider();
    const stream = new Readable({ read() { this.push(Buffer.from('x')); this.push(null); } });
    await provider.uploadStream!('certs/stream.zip', stream, 'application/zip');
    expect(MockS3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://r2.example.com',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
  });

  it('getSignedUrl constructs S3Client with correct region, endpoint, and credentials', async () => {
    const provider = createR2Provider();
    await provider.getSignedUrl('certs/test.pdf', 3600);
    expect(MockS3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://r2.example.com',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
  });

  it('delete constructs S3Client with correct region, endpoint, and credentials', async () => {
    const provider = createR2Provider();
    await provider.delete('certs/test.pdf');
    expect(MockS3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://r2.example.com',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
  });
});

// ── getSignedUrl option and command assertions (kills expiresIn ObjectLiteral + GetObjectCommand ObjectLiteral) ──

describe('createR2Provider — getSignedUrl option assertions', () => {
  it('passes expiresIn to presigner so signed URLs expire at the requested time', async () => {
    const provider = createR2Provider();
    await provider.getSignedUrl('certs/test.pdf', 7200);
    expect(mockGetSignedUrlFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 7200 },
    );
  });

  it('passes bucket and key to GetObjectCommand', async () => {
    const provider = createR2Provider();
    await provider.getSignedUrl('certs/test.pdf', 3600);
    expect(MockGetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'certs/test.pdf',
    });
  });
});

// ── catch block coverage: all 4 operations (kills 12 NoCoverage mutants) ──

describe('createR2Provider — error handling', () => {
  it('upload catch: invokes captureStorageError with operation and storageKey, then rethrows', async () => {
    const err = new Error('S3 put failed');
    mockSend.mockRejectedValueOnce(err);
    const provider = createR2Provider();
    await expect(provider.upload('certs/err.pdf', Buffer.from('data'), 'application/pdf'))
      .rejects.toThrow('S3 put failed');
    expect(mockCaptureStorageError).toHaveBeenCalledWith(err, {
      operation: 'upload',
      storageKey: 'certs/err.pdf',
    });
  });

  it('uploadStream catch: invokes captureStorageError with operation and storageKey, then rethrows', async () => {
    const err = new Error('Multipart failed');
    mockUploadDone = vi.fn().mockRejectedValue(err);
    const provider = createR2Provider();
    const stream = new Readable({ read() { this.push(null); } });
    await expect(provider.uploadStream!('certs/err.zip', stream, 'application/zip'))
      .rejects.toThrow('Multipart failed');
    expect(mockCaptureStorageError).toHaveBeenCalledWith(err, {
      operation: 'uploadStream',
      storageKey: 'certs/err.zip',
    });
  });

  it('getSignedUrl catch: invokes captureStorageError with operation and storageKey, then rethrows', async () => {
    // The presigner return is not awaited, so we trigger the catch via S3Client constructor throw
    const err = new Error('S3Client init failed');
    MockS3Client.mockImplementationOnce(() => { throw err; });
    const provider = createR2Provider();
    await expect(provider.getSignedUrl('certs/err.pdf', 3600))
      .rejects.toThrow('S3Client init failed');
    expect(mockCaptureStorageError).toHaveBeenCalledWith(err, {
      operation: 'getSignedUrl',
      storageKey: 'certs/err.pdf',
    });
  });

  it('delete catch: invokes captureStorageError with operation and storageKey, then rethrows', async () => {
    const err = new Error('S3 delete failed');
    mockSend.mockRejectedValueOnce(err);
    const provider = createR2Provider();
    await expect(provider.delete('certs/err.pdf')).rejects.toThrow('S3 delete failed');
    expect(mockCaptureStorageError).toHaveBeenCalledWith(err, {
      operation: 'delete',
      storageKey: 'certs/err.pdf',
    });
  });
});

// ── Stub checksum format (kills padStart '0'→'' and join ''→"Stryker was here!") ──

describe('createStubStorageProvider — checksum format', () => {
  it('checksum is exactly 64 lowercase hex chars (zero-padded, no delimiter)', async () => {
    // SHA-256 often produces bytes < 0x10 that need zero-padding; a short-circuit in
    // padStart or a non-empty join separator would produce a string != 64 chars.
    const provider = createStubStorageProvider();
    const result = await provider.upload('k.pdf', Buffer.from('mutation-kill-test'), 'application/pdf');
    expect(result.fileChecksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
