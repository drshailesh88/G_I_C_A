/**
 * Per-Event PDF Archive — GEM India Conference Management
 *
 * Bundles event data into a ZIP archive:
 * 1. Agenda PDF (session schedule as styled Excel converted to concept)
 * 2. Certificate PDFs (collected from R2)
 * 3. Notification log CSV
 *
 * Uploaded to R2 at events/{eventId}/archives/{timestamp}.zip
 * Returns a signed download URL (1-hour expiry).
 * Uses streaming ZIP via archiver to avoid memory issues.
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import {
  sessions,
  sessionAssignments,
  halls,
  people,
  issuedCertificates,
  notificationLog,
  events,
} from '@/lib/db/schema';
import { withEventScope } from '@/lib/db/with-event-scope';
import { eq } from 'drizzle-orm';
import type { StorageProvider } from '@/lib/certificates/storage';
import { eventIdSchema } from '@/lib/validations/event';

// ── Types ─────────────────────────────────────────────────────

export type ArchiveResult = {
  archiveStorageKey: string;
  archiveUrl: string;
  fileCount: number;
  archiveSizeBytes: number;
};

function validateArchiveEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

// ── Storage Key Builder ───────────────────────────────────────

export function buildArchiveStorageKey(eventId: string): string {
  const scopedEventId = validateArchiveEventId(eventId);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `events/${scopedEventId}/archives/archive-${timestamp}-${random}.zip`;
}

// ── 1. Agenda Excel Buffer ────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

function styleHeaders(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 28;
}

function autoWidth(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 50);
  });
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export async function generateAgendaExcel(eventId: string): Promise<Buffer> {
  const scopedEventId = validateArchiveEventId(eventId);

  // Fetch event info
  const [event] = await db
    .select({ name: events.name, startDate: events.startDate, endDate: events.endDate, venueName: events.venueName })
    .from(events)
    .where(eq(events.id, scopedEventId))
    .limit(1);

  // Fetch sessions with hall and assignments
  const sessionRows = await db
    .select({
      title: sessions.title,
      sessionType: sessions.sessionType,
      sessionDate: sessions.sessionDate,
      startAtUtc: sessions.startAtUtc,
      endAtUtc: sessions.endAtUtc,
      hallName: halls.name,
      track: sessions.track,
      status: sessions.status,
      cmeCredits: sessions.cmeCredits,
    })
    .from(sessions)
    .leftJoin(halls, withEventScope(halls.eventId, scopedEventId, eq(sessions.hallId, halls.id)))
    .where(withEventScope(sessions.eventId, scopedEventId));

  // Sort by date then start time
  sessionRows.sort((a, b) => {
    const dateA = a.sessionDate?.getTime() ?? 0;
    const dateB = b.sessionDate?.getTime() ?? 0;
    if (dateA !== dateB) return dateA - dateB;
    const startA = a.startAtUtc?.getTime() ?? 0;
    const startB = b.startAtUtc?.getTime() ?? 0;
    return startA - startB;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Agenda');

  // Title row
  if (event) {
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${event.name} — Agenda`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    ws.mergeCells('A2:I2');
    const infoCell = ws.getCell('A2');
    infoCell.value = `${formatDate(event.startDate)} to ${formatDate(event.endDate)}${event.venueName ? ` | ${event.venueName}` : ''}`;
    infoCell.alignment = { horizontal: 'center' };
  }

  // Headers start at row 4
  const headerRow = 4;
  const headers = ['Session', 'Type', 'Date', 'Start', 'End', 'Hall', 'Track', 'Status', 'CME Credits'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(headerRow).height = 28;

  for (const s of sessionRows) {
    ws.addRow([
      s.title,
      s.sessionType,
      formatDate(s.sessionDate),
      formatDateTime(s.startAtUtc),
      formatDateTime(s.endAtUtc),
      s.hallName ?? '',
      s.track ?? '',
      s.status,
      s.cmeCredits ?? '',
    ]);
  }

  // Set column widths
  ws.columns = [
    { width: 30 }, { width: 15 }, { width: 12 }, { width: 20 },
    { width: 20 }, { width: 15 }, { width: 15 }, { width: 12 }, { width: 12 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── 2. Notification Log CSV ───────────────────────────────────

export async function generateNotificationLogCsv(eventId: string): Promise<Buffer> {
  const scopedEventId = validateArchiveEventId(eventId);

  const rows = await db
    .select({
      channel: notificationLog.channel,
      provider: notificationLog.provider,
      status: notificationLog.status,
      recipientEmail: notificationLog.recipientEmail,
      recipientPhone: notificationLog.recipientPhoneE164,
      templateKey: notificationLog.templateKeySnapshot,
      triggerType: notificationLog.triggerType,
      sendMode: notificationLog.sendMode,
      renderedSubject: notificationLog.renderedSubject,
      attempts: notificationLog.attempts,
      lastErrorCode: notificationLog.lastErrorCode,
      lastErrorMessage: notificationLog.lastErrorMessage,
      queuedAt: notificationLog.queuedAt,
      sentAt: notificationLog.sentAt,
      deliveredAt: notificationLog.deliveredAt,
      failedAt: notificationLog.failedAt,
      fullName: people.fullName,
    })
    .from(notificationLog)
    .innerJoin(people, eq(notificationLog.personId, people.id))
    .where(withEventScope(notificationLog.eventId, scopedEventId));

  const csvHeaders = [
    'Recipient', 'Email', 'Phone', 'Channel', 'Provider', 'Status',
    'Template Key', 'Trigger', 'Send Mode', 'Subject',
    'Attempts', 'Error Code', 'Error Message',
    'Queued At', 'Sent At', 'Delivered At', 'Failed At',
  ];

  const csvRows = rows.map((r) => [
    escapeCsvField(r.fullName),
    escapeCsvField(r.recipientEmail ?? ''),
    escapeCsvField(r.recipientPhone ?? ''),
    escapeCsvField(r.channel),
    escapeCsvField(r.provider),
    escapeCsvField(r.status),
    escapeCsvField(r.templateKey ?? ''),
    escapeCsvField(r.triggerType ?? ''),
    escapeCsvField(r.sendMode),
    escapeCsvField(r.renderedSubject ?? ''),
    String(r.attempts),
    escapeCsvField(r.lastErrorCode ?? ''),
    escapeCsvField(r.lastErrorMessage ?? ''),
    formatDateTime(r.queuedAt),
    formatDateTime(r.sentAt),
    formatDateTime(r.deliveredAt),
    formatDateTime(r.failedAt),
  ].join(','));

  const csv = [csvHeaders.join(','), ...csvRows].join('\n');
  return Buffer.from(csv, 'utf-8');
}

function escapeCsvField(value: string | null | undefined): string {
  let str = value ?? '';
  // Neutralize CSV formula injection: prefix dangerous first chars with a tab
  if (str.length > 0 && '=+-@'.includes(str[0])) {
    str = `\t${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── 3. Collect Certificate Storage Keys ───────────────────────

export async function getCertificateStorageKeys(eventId: string): Promise<
  Array<{ storageKey: string; fileName: string }>
> {
  const scopedEventId = validateArchiveEventId(eventId);

  const rows = await db
    .select({
      storageKey: issuedCertificates.storageKey,
      fileName: issuedCertificates.fileName,
    })
    .from(issuedCertificates)
    .where(withEventScope(issuedCertificates.eventId, scopedEventId, eq(issuedCertificates.status, 'issued')));

  return rows;
}

// ── 4. Build Archive ZIP ──────────────────────────────────────

export type ArchiveOptions = {
  eventId: string;
  storageProvider: StorageProvider;
  fetchCertificatePdf: (storageKey: string) => Promise<Buffer>;
};

export async function generateEventArchive(options: ArchiveOptions): Promise<ArchiveResult> {
  const { eventId, storageProvider, fetchCertificatePdf } = options;
  const scopedEventId = validateArchiveEventId(eventId);

  // Generate agenda and notification CSV in parallel
  const [agendaBuffer, notifCsvBuffer, certKeys] = await Promise.all([
    generateAgendaExcel(scopedEventId),
    generateNotificationLogCsv(scopedEventId),
    getCertificateStorageKeys(scopedEventId),
  ]);

  // Create streaming ZIP archive
  const archive = archiver('zip', { zlib: { level: 6 } });
  const passThrough = new PassThrough();
  archive.on('error', (err) => passThrough.destroy(err));
  archive.pipe(passThrough);

  let fileCount = 0;

  // Add agenda
  archive.append(agendaBuffer, { name: 'agenda.xlsx' });
  fileCount++;

  // Add notification log CSV
  archive.append(notifCsvBuffer, { name: 'notification-log.csv' });
  fileCount++;

  // Add certificate PDFs in a certificates/ subfolder
  const usedNames = new Set<string>();
  for (const cert of certKeys) {
    try {
      const pdfBuffer = await fetchCertificatePdf(cert.storageKey);
      let name = sanitizeFileName(cert.fileName);

      // Deduplicate file names
      if (usedNames.has(name)) {
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
        let counter = 2;
        let candidate = `${base}-${counter}${ext}`;
        while (usedNames.has(candidate)) {
          counter++;
          candidate = `${base}-${counter}${ext}`;
        }
        name = candidate;
      }
      usedNames.add(name);

      archive.append(pdfBuffer, { name: `certificates/${name}` });
      fileCount++;
    } catch {
      // Skip certificates that fail to fetch — archive should not fail for one bad PDF
      continue;
    }
  }

  // Finalize the archive
  const finalizePromise = archive.finalize();

  // Upload streaming ZIP to R2
  const archiveKey = buildArchiveStorageKey(scopedEventId);

  let archiveSizeBytes: number;
  if (storageProvider.uploadStream) {
    const uploadResult = await storageProvider.uploadStream(archiveKey, passThrough, 'application/zip');
    await finalizePromise;
    archiveSizeBytes = uploadResult.fileSizeBytes;
  } else {
    // Fallback: buffer the entire ZIP
    const chunks: Buffer[] = [];
    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      passThrough.on('end', resolve);
      passThrough.on('error', reject);
    });
    await finalizePromise;
    const fullBuffer = Buffer.concat(chunks);
    archiveSizeBytes = fullBuffer.length;
    await storageProvider.upload(archiveKey, fullBuffer, 'application/zip');
  }

  // Generate signed download URL (1-hour expiry)
  const archiveUrl = await storageProvider.getSignedUrl(archiveKey, 3600);

  return {
    archiveStorageKey: archiveKey,
    archiveUrl,
    fileCount,
    archiveSizeBytes,
  };
}

function sanitizeFileName(name: string): string {
  let sanitized = name
    // Strip null bytes and control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Replace path separators and dangerous chars
    .replace(/[/\\:*?"<>|]/g, '_')
    // Strip leading dots (after trimming spaces)
    .trim()
    .replace(/^\.+/, '')
    // Collapse any remaining ".." sequences (defense-in-depth)
    .replace(/\.\./g, '_')
    .trim();

  // Truncate to 200 chars max (preserving extension)
  if (sanitized.length > 200) {
    const dotIdx = sanitized.lastIndexOf('.');
    const ext = dotIdx > 0 ? sanitized.slice(dotIdx) : '';
    sanitized = sanitized.slice(0, 200 - ext.length) + ext;
  }

  return sanitized || 'certificate.pdf';
}
