/**
 * Bulk ZIP Download for Certificates
 *
 * Downloads multiple certificate PDFs from R2, bundles them into a ZIP archive
 * using node-archiver, uploads the ZIP to R2, and returns a signed download URL.
 *
 * The ZIP is stored at: certificates/{eventId}/bulk/{timestamp}.zip
 *
 * NOTE: Concurrent bulk ZIP requests for the same event/type should be guarded
 * by a distributed lock (Req 9). Old ZIP files need a cleanup cron.
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { StorageProvider } from './storage';

/** Maximum aggregate PDF size before ZIP creation (200MB) */
export const MAX_AGGREGATE_SIZE_BYTES = 200 * 1024 * 1024;

export type BulkZipInput = {
  eventId: string;
  certificateType: string;
  certificates: Array<{
    storageKey: string;
    fileName: string;
  }>;
  totalSizeBytes?: number;
};

export type BulkZipResult = {
  zipStorageKey: string;
  zipUrl: string;
  fileCount: number;
  zipSizeBytes: number;
};

/**
 * Build a storage key for a bulk ZIP file.
 */
export function buildBulkZipStorageKey(eventId: string, certificateType: string): string {
  const timestamp = Date.now();
  return `certificates/${eventId}/bulk/${certificateType}-${timestamp}.zip`;
}

/**
 * Sanitize a file name to prevent path traversal (Zip Slip) attacks.
 * Strips path separators and dangerous characters.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim() || 'certificate.pdf';
}

/**
 * Validate the input for bulk ZIP generation.
 * Returns null if valid, or an error message.
 */
export function validateBulkZipInput(input: BulkZipInput): string | null {
  if (!input.eventId) return 'eventId is required';
  if (!input.certificateType) return 'certificateType is required';
  if (!input.certificates.length) return 'At least one certificate is required';
  if (input.certificates.length > 500) return 'Maximum 500 certificates per ZIP';

  if (input.totalSizeBytes !== undefined && input.totalSizeBytes > MAX_AGGREGATE_SIZE_BYTES) {
    return `Total PDF size (${Math.round(input.totalSizeBytes / 1024 / 1024)}MB) exceeds maximum (${MAX_AGGREGATE_SIZE_BYTES / 1024 / 1024}MB)`;
  }

  for (const cert of input.certificates) {
    if (!cert.storageKey) return `Certificate missing storageKey: ${cert.fileName || 'unknown'}`;
    if (!cert.fileName) return `Certificate missing fileName for key: ${cert.storageKey}`;
  }

  return null;
}

/**
 * Collect all file names and detect duplicates.
 * Uses a Set of assigned names to prevent collisions between
 * duplicated names and legitimately-named files.
 */
export function deduplicateFileNames(fileNames: string[]): Map<number, string> {
  const result = new Map<number, string>();
  const assigned = new Set<string>();

  for (let i = 0; i < fileNames.length; i++) {
    let name = sanitizeFileName(fileNames[i]);

    if (!assigned.has(name)) {
      result.set(i, name);
      assigned.add(name);
    } else {
      // Find a unique name by incrementing suffix
      const dotIdx = name.lastIndexOf('.');
      const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
      let counter = 2;
      let candidate = `${base}-${counter}${ext}`;
      while (assigned.has(candidate)) {
        counter++;
        candidate = `${base}-${counter}${ext}`;
      }
      result.set(i, candidate);
      assigned.add(candidate);
    }
  }

  return result;
}

/**
 * Download certificate PDFs from storage and create a ZIP archive buffer.
 *
 * Uses node-archiver for streaming ZIP creation. Each PDF is fetched from the
 * storage provider and appended to the archive.
 *
 * @param certificates - List of certificates with storageKey and fileName
 * @param fetchPdf - Function that fetches a PDF buffer by storage key
 * @returns ZIP buffer
 */
export async function createZipArchive(
  certificates: Array<{ storageKey: string; fileName: string }>,
  fetchPdf: (storageKey: string) => Promise<Buffer>,
): Promise<Buffer> {
  const uniqueNames = deduplicateFileNames(certificates.map(c => c.fileName));

  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);

    archive.on('error', reject);
    archive.pipe(passThrough);

    // Append all PDFs sequentially to avoid memory pressure
    const appendAll = async () => {
      for (let i = 0; i < certificates.length; i++) {
        const cert = certificates[i];
        const pdf = await fetchPdf(cert.storageKey);
        const fileName = uniqueNames.get(i) ?? cert.fileName;
        archive.append(pdf, { name: fileName });
      }
      await archive.finalize();
    };

    appendAll().catch(reject);
  });
}
