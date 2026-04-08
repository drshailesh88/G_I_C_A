/**
 * Bulk ZIP Download for Certificates
 *
 * Downloads multiple certificate PDFs from R2, bundles them into a ZIP archive
 * using node-archiver, uploads the ZIP to R2, and returns a signed download URL.
 *
 * The ZIP is stored at: certificates/{eventId}/bulk/{timestamp}.zip
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { StorageProvider } from './storage';

export type BulkZipInput = {
  eventId: string;
  certificateType: string;
  certificates: Array<{
    storageKey: string;
    fileName: string;
  }>;
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
 * Validate the input for bulk ZIP generation.
 * Returns null if valid, or an error message.
 */
export function validateBulkZipInput(input: BulkZipInput): string | null {
  if (!input.eventId) return 'eventId is required';
  if (!input.certificateType) return 'certificateType is required';
  if (!input.certificates.length) return 'At least one certificate is required';
  if (input.certificates.length > 500) return 'Maximum 500 certificates per ZIP';

  for (const cert of input.certificates) {
    if (!cert.storageKey) return `Certificate missing storageKey: ${cert.fileName || 'unknown'}`;
    if (!cert.fileName) return `Certificate missing fileName for key: ${cert.storageKey}`;
  }

  return null;
}

/**
 * Collect all file names and detect duplicates.
 * Returns a map from original fileName to unique fileName (with suffix if needed).
 */
export function deduplicateFileNames(fileNames: string[]): Map<number, string> {
  const result = new Map<number, string>();
  const seen = new Map<string, number>();

  for (let i = 0; i < fileNames.length; i++) {
    const name = fileNames[i];
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);

    if (count === 0) {
      result.set(i, name);
    } else {
      // Insert suffix before .pdf extension
      const dotIdx = name.lastIndexOf('.');
      if (dotIdx > 0) {
        result.set(i, `${name.slice(0, dotIdx)}-${count + 1}${name.slice(dotIdx)}`);
      } else {
        result.set(i, `${name}-${count + 1}`);
      }
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
