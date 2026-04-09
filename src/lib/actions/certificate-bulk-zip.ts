'use server';

import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { CERTIFICATE_TYPES } from '@/lib/validations/certificate';
import {
  validateBulkZipInput,
  buildBulkZipStorageKey,
  createZipArchive,
  createZipStream,
  type BulkZipResult,
} from '@/lib/certificates/bulk-zip';
import type { StorageProvider } from '@/lib/certificates/storage';
import type { DistributedLock } from '@/lib/certificates/distributed-lock';

const bulkZipRequestSchema = z.object({
  certificateType: z.enum(CERTIFICATE_TYPES),
});

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
  await assertEventAccess(eventId, { requireWrite: true });
  const validated = bulkZipRequestSchema.parse(input);

  // Acquire distributed lock — prevents concurrent bulk generation
  const lock = deps?.lock
    ?? (await import('@/lib/certificates/distributed-lock')).createRedisLock();

  let lockHandle: Awaited<ReturnType<typeof lock.acquire>>;
  try {
    lockHandle = await lock.acquire(eventId, validated.certificateType);
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
      );

    // Filter to only certs with generated PDFs
    const downloadable = certs.filter(c => c.storageKey);

    // Calculate aggregate size for validation
    const totalSizeBytes = downloadable.reduce(
      (sum, c) => sum + (c.fileSizeBytes ?? 0),
      0,
    );

    // Validate (includes count limit and aggregate size check)
    const validationError = validateBulkZipInput({
      eventId,
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
    const renewingFetchPdf = async (storageKey: string) => {
      const buffer = await fetchPdf(storageKey);
      filesProcessed++;
      if (filesProcessed % 10 === 0 && lockHandle) {
        await lock.renew(lockHandle).catch(() => {});
      }
      return buffer;
    };

    const zipKey = buildBulkZipStorageKey(eventId, validated.certificateType);
    const zipEntries = downloadable.map(c => ({ storageKey: c.storageKey, fileName: c.fileName }));

    // Use streaming upload if provider supports it (avoids buffering full ZIP in memory)
    let zipSizeBytes: number;
    if (provider.uploadStream) {
      const { stream, done } = createZipStream(zipEntries, renewingFetchPdf);
      const uploadResult = await provider.uploadStream(zipKey, stream, 'application/zip');
      await done;
      zipSizeBytes = uploadResult.fileSizeBytes;
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
