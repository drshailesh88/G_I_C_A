/**
 * Certificate Storage Service
 *
 * Abstracts R2 object storage behind an interface.
 * All certificate PDFs are private — access via signed URLs only.
 * No permanent public file URLs.
 */

export type StorageUploadResult = {
  storageKey: string;
  fileSizeBytes: number;
  fileChecksumSha256: string;
};

export type StorageProvider = {
  /** Upload a PDF buffer to storage. Returns the storage key and metadata. */
  upload(key: string, data: Buffer, contentType: string): Promise<StorageUploadResult>;
  /** Upload a stream to storage (for large files like ZIPs). Falls back to buffered upload if not supported. */
  uploadStream?(key: string, stream: import('stream').Readable, contentType: string): Promise<StorageUploadResult>;
  /** Generate a signed URL for temporary download access. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** Delete a stored file. */
  delete(key: string): Promise<void>;
};

/** Default signed URL expiration: 1 hour */
const DEFAULT_SIGNED_URL_EXPIRY = 3600;

/**
 * Build an R2 storage key for a certificate PDF.
 *
 * Format: certificates/{eventId}/{certificateType}/{certificateId}.pdf
 * This structure enables prefix-based listing by event and type.
 */
export function buildCertificateStorageKey(
  eventId: string,
  certificateType: string,
  certificateId: string,
): string {
  return `certificates/${eventId}/${certificateType}/${certificateId}.pdf`;
}

/**
 * Build the R2 storage provider using environment variables.
 * In tests, swap with a stub implementation.
 */
export function createR2Provider(): StorageProvider {
  // Lazy import to avoid side effects in test environments
  return {
    async upload(key, data, contentType) {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const crypto = await import('crypto');

      const client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      await client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: data,
        ContentType: contentType,
        ContentLength: data.length,
      }));

      return {
        storageKey: key,
        fileSizeBytes: data.length,
        fileChecksumSha256: checksum,
      };
    },

    async getSignedUrl(key, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY) {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl: s3GetSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      return s3GetSignedUrl(client, new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      }), { expiresIn: expiresInSeconds });
    },

    async delete(key) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

      const client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      await client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      }));
    },
  };
}

/**
 * Stub storage provider for testing.
 * Stores files in memory and generates deterministic "signed" URLs.
 */
export function createStubStorageProvider(): StorageProvider & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();

  return {
    files,
    async upload(key, data) {
      files.set(key, data);
      // Simple hash for deterministic testing
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data.toString()));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return {
        storageKey: key,
        fileSizeBytes: data.length,
        fileChecksumSha256: checksum,
      };
    },
    async getSignedUrl(key, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY) {
      if (!files.has(key)) throw new Error(`File not found: ${key}`);
      return `https://stub-r2.example.com/${key}?expires=${expiresInSeconds}`;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}
