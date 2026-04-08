'use server';

import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { CERTIFICATE_TYPES } from '@/lib/validations/certificate';
import {
  validateBulkZipInput,
  buildBulkZipStorageKey,
  createZipArchive,
  type BulkZipResult,
} from '@/lib/certificates/bulk-zip';
import type { StorageProvider } from '@/lib/certificates/storage';

const bulkZipRequestSchema = z.object({
  certificateType: z.enum(CERTIFICATE_TYPES),
});

/**
 * Generate a bulk ZIP of all current (issued) certificates for a given type.
 *
 * Flow:
 * 1. Query all issued certificates for event + type
 * 2. Download each PDF from R2
 * 3. Bundle into ZIP via archiver
 * 4. Upload ZIP to R2
 * 5. Return signed download URL
 */
export async function bulkZipDownload(
  eventId: string,
  input: unknown,
  deps?: {
    storageProvider?: StorageProvider;
    fetchPdf?: (storageKey: string) => Promise<Buffer>;
  },
): Promise<BulkZipResult> {
  await assertEventAccess(eventId, { requireWrite: true });
  const validated = bulkZipRequestSchema.parse(input);

  // Fetch all current (issued) certificates for this event + type
  const certs = await db
    .select({
      id: issuedCertificates.id,
      storageKey: issuedCertificates.storageKey,
      fileName: issuedCertificates.fileName,
      status: issuedCertificates.status,
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

  // Validate
  const validationError = validateBulkZipInput({
    eventId,
    certificateType: validated.certificateType,
    certificates: downloadable.map(c => ({
      storageKey: c.storageKey,
      fileName: c.fileName,
    })),
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

  // Create ZIP archive
  const zipBuffer = await createZipArchive(
    downloadable.map(c => ({ storageKey: c.storageKey, fileName: c.fileName })),
    fetchPdf,
  );

  // Upload ZIP to R2
  const zipKey = buildBulkZipStorageKey(eventId, validated.certificateType);
  await provider.upload(zipKey, zipBuffer, 'application/zip');

  // Generate signed download URL for the ZIP (1-hour expiry)
  const zipUrl = await provider.getSignedUrl(zipKey, 3600);

  return {
    zipStorageKey: zipKey,
    zipUrl,
    fileCount: downloadable.length,
    zipSizeBytes: zipBuffer.length,
  };
}
