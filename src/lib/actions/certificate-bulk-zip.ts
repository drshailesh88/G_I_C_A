'use server';

import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { assertCertificateWriteRole } from './certificate-rbac';
import { CERTIFICATE_TYPES } from '@/lib/validations/certificate';
import {
  MAX_AGGREGATE_SIZE_BYTES,
  validateBulkZipInput,
  buildBulkZipStorageKey,
  createZipArchive,
  createZipStream,
  type BulkZipResult,
} from '@/lib/certificates/bulk-zip';
import type { StorageProvider } from '@/lib/certificates/storage';
import type { DistributedLock } from '@/lib/certificates/distributed-lock';

const MAX_CERTIFICATES_PER_ZIP = 500;

const eventIdSchema = z.string().uuid('Invalid event ID');

const bulkZipRequestSchema = z.object({
  eventId: z.string().uuid('Invalid event ID').optional(),
  certificateType: z.enum(CERTIFICATE_TYPES),
}).strict();

function isCertificateStorageKeyForScope(
  storageKey: string,
  eventId: string,
  certificateType: string,
): boolean {
  const expectedPrefix = `certificates/${eventId}/${certificateType}/`;
  if (!storageKey.startsWith(expectedPrefix)) return false;

  const objectName = storageKey.slice(expectedPrefix.length);
  return (
    objectName.length > 4 &&
    objectName.endsWith('.pdf') &&
    !objectName.includes('/') &&
    !objectName.includes('\\') &&
    !objectName.includes('..') &&
    !objectName.includes('\0')
  );
}

function formatBytesAsMb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

async function renewBulkZipLockOrThrow(
  lock: DistributedLock,
  lockHandle: Awaited<ReturnType<DistributedLock['acquire']>>,
) {
  if (!lockHandle) {
    throw new Error(
      'Bulk certificate generation lock was lost during ZIP creation. Please try again.',
    );
  }

  try {
    const renewed = await lock.renew(lockHandle);
    if (!renewed) {
      throw new Error('lost');
    }
  } catch {
    throw new Error(
      'Bulk certificate generation lock was lost during ZIP creation. Please try again.',
    );
  }
}

/**
 * Generate a bulk ZIP of all current (issued) certificates for a given type.
 *
 * Protected by a distributed lock — only one bulk generation per event/type
 * can run at a time. The lock auto-expires after 5 minutes as a safety net.
 *
 * Flow:
 * 1. Acquire distributed lock
 * 2. Query all issued certificates for event + type (with aggregate size check)
 * 3. Download each PDF from R2
 * 4. Bundle into ZIP via archiver
 * 5. Upload ZIP to R2
 * 6. Release lock
 * 7. Return signed download URL
 */
export async function bulkZipDownload(
  eventId: string,
  input: unknown,
  deps?: {
    storageProvider?: StorageProvider;
    fetchPdf?: (storageKey: string) => Promise<Buffer>;
    lock?: DistributedLock;
  },
): Promise<BulkZipResult> {
  const scopedEventId = eventIdSchema.parse(eventId);
  const validated = bulkZipRequestSchema.parse(input);
  if (validated.eventId && validated.eventId !== scopedEventId) {
    throw new Error('eventId mismatch');
  }

  const { role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);

  // Acquire distributed lock — prevents concurrent bulk generation
  const lock = deps?.lock
    ?? (await import('@/lib/certificates/distributed-lock')).createRedisLock();

  let lockHandle: Awaited<ReturnType<typeof lock.acquire>>;
  try {
    lockHandle = await lock.acquire(scopedEventId, validated.certificateType);
  } catch (err) {
    throw new Error(
      'Unable to check bulk generation lock (Redis unavailable). Please try again later.',
    );
  }

  if (!lockHandle) {
    throw new Error(
      'Bulk certificate generation is already in progress for this event and certificate type. Please wait and try again.',
    );
  }

  try {
    // Fetch all current (issued) certificates for this event + type, including file size
    const certs = await db
      .select({
        id: issuedCertificates.id,
        storageKey: issuedCertificates.storageKey,
        fileName: issuedCertificates.fileName,
        status: issuedCertificates.status,
        fileSizeBytes: issuedCertificates.fileSizeBytes,
      })
      .from(issuedCertificates)
      .where(
        withEventScope(
          issuedCertificates.eventId,
          eventId,
          and(
            eq(issuedCertificates.certificateType, validated.certificateType),
            eq(issuedCertificates.status, 'issued'),
          )!,
        ),
      )
      .limit(MAX_CERTIFICATES_PER_ZIP + 1);

    // Filter to only certs with generated PDFs
    const downloadable = certs.filter(c => c.storageKey);

    const invalidStorageKey = downloadable.find(
      c => !isCertificateStorageKeyForScope(
        c.storageKey,
        scopedEventId,
        validated.certificateType,
      ),
    );
    if (invalidStorageKey) {
      throw new Error('Invalid certificate storage key for event scope');
    }

    // Calculate aggregate size for validation
    const totalSizeBytes = downloadable.reduce(
      (sum, c) => sum + (c.fileSizeBytes ?? 0),
      0,
    );

    // Validate (includes count limit and aggregate size check)
    const validationError = validateBulkZipInput({
      eventId: scopedEventId,
      certificateType: validated.certificateType,
      certificates: downloadable.map(c => ({
        storageKey: c.storageKey,
        fileName: c.fileName,
      })),
      totalSizeBytes,
    });
    if (validationError) throw new Error(validationError);

    // Build the storage provider
    const provider = deps?.storageProvider
      ?? (await import('@/lib/certificates/storage')).createR2Provider();

    // Fetch function: download PDF from R2 via signed URL
    const fetchPdf = deps?.fetchPdf ?? (async (storageKey: string) => {
      const url = await provider.getSignedUrl(storageKey, 300);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${storageKey}`);
      return Buffer.from(await response.arrayBuffer());
    });

    // Create ZIP with periodic lock renewal to prevent TTL expiry on large jobs
    let filesProcessed = 0;
    let downloadedSizeBytes = 0;
    const renewingFetchPdf = async (storageKey: string) => {
      const buffer = await fetchPdf(storageKey);
      downloadedSizeBytes += buffer.length;
      if (downloadedSizeBytes > MAX_AGGREGATE_SIZE_BYTES) {
        throw new Error(
          `Downloaded PDF size (${formatBytesAsMb(downloadedSizeBytes)}MB) exceeds maximum (${formatBytesAsMb(MAX_AGGREGATE_SIZE_BYTES)}MB)`,
        );
      }

      filesProcessed++;
      if (filesProcessed % 10 === 0 && lockHandle) {
        await renewBulkZipLockOrThrow(lock, lockHandle);
      }
      return buffer;
    };

    const zipKey = buildBulkZipStorageKey(scopedEventId, validated.certificateType);
    const zipEntries = downloadable.map(c => ({ storageKey: c.storageKey, fileName: c.fileName }));

    // Use streaming upload if provider supports it (avoids buffering full ZIP in memory)
    let zipSizeBytes: number;
    if (provider.uploadStream) {
      const { stream, done } = createZipStream(zipEntries, renewingFetchPdf);
      const guardedDone = done.catch((err) => {
        stream.destroy(err instanceof Error ? err : new Error(String(err)));
        throw err;
      });
      const uploadPromise = provider.uploadStream(zipKey, stream, 'application/zip');

      try {
        const [uploadResult] = await Promise.all([
          uploadPromise,
          guardedDone.then(() => undefined),
        ]);
        zipSizeBytes = uploadResult.fileSizeBytes;
      } catch (err) {
        stream.destroy(err instanceof Error ? err : undefined);
        await uploadPromise.catch(() => {});
        throw err;
      }
    } else {
      const zipBuffer = await createZipArchive(zipEntries, renewingFetchPdf);
      await provider.upload(zipKey, zipBuffer, 'application/zip');
      zipSizeBytes = zipBuffer.length;
    }

    const zipUrl = await provider.getSignedUrl(zipKey, 3600);

    return {
      zipStorageKey: zipKey,
      zipUrl,
      fileCount: downloadable.length,
      zipSizeBytes,
    };
  } finally {
    // Always release the lock — only if we own it (conditional release)
    await lock.release(lockHandle).catch((err) => {
      console.error('[bulk-zip] failed to release distributed lock:', err);
    });
  }
}
