/**
 * Pre-Event Emergency Kit — GEM India Conference Management
 *
 * Generates a comprehensive backup ZIP for an event:
 * 1. Attendee list (CSV)
 * 2. Travel roster (CSV)
 * 3. Rooming list (CSV)
 * 4. Transport plan (CSV)
 * 5. Program schedule (JSON)
 * 6. Certificate R2 storage keys (JSON)
 *
 * Uploaded to R2 at events/{eventId}/emergency-kit/{timestamp}.zip
 * Returns a signed download URL (1-hour expiry).
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import { db } from '@/lib/db';
import {
  events,
  eventRegistrations,
  people,
  travelRecords,
  accommodationRecords,
  transportBatches,
  vehicleAssignments,
  transportPassengerAssignments,
  sessions,
  sessionAssignments,
  halls,
  issuedCertificates,
} from '@/lib/db/schema';
import { withEventScope } from '@/lib/db/with-event-scope';
import { eq, and, gte, lte, ne, inArray } from 'drizzle-orm';
import type { StorageProvider } from '@/lib/certificates/storage';
import { eventIdSchema } from '@/lib/validations/event';

// ── Types ─────────────────────────────────────────────────────

export type EmergencyKitResult = {
  storageKey: string;
  downloadUrl: string;
  fileCount: number;
  sizeBytes: number;
};

const EMERGENCY_KIT_STORAGE_KEY_CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const EMERGENCY_KIT_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.zip$/;

function validateEmergencyKitEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

function assertScopedEmergencyKitStorageKey(eventId: string, storageKey: string): void {
  if (
    typeof storageKey !== 'string'
    || storageKey.length === 0
    || storageKey !== storageKey.trim()
    || storageKey.length > 1024
    || storageKey.startsWith('/')
    || storageKey.endsWith('/')
    || storageKey.includes('\\')
    || EMERGENCY_KIT_STORAGE_KEY_CONTROL_CHAR_PATTERN.test(storageKey)
  ) {
    throw new Error('Invalid emergency kit storage key for event');
  }

  const segments = storageKey.split('/');
  if (segments.length !== 4) {
    throw new Error('Invalid emergency kit storage key for event');
  }

  const scopedEventId = validateEmergencyKitEventId(eventId);
  const [root, keyEventId, folder, fileName] = segments;

  if (
    root !== 'events'
    || keyEventId !== scopedEventId
    || folder !== 'emergency-kit'
    || !EMERGENCY_KIT_FILENAME_PATTERN.test(fileName)
  ) {
    throw new Error('Invalid emergency kit storage key for event');
  }
}

// ── Storage Key Builder ───────────────────────────────────────

/**
 * Build a unique storage key for manual emergency kit downloads.
 * Uses timestamp + random suffix for uniqueness.
 */
export function buildEmergencyKitStorageKey(eventId: string): string {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `events/${scopedEventId}/emergency-kit/kit-${timestamp}-${random}.zip`;
}

/**
 * Build a deterministic storage key for cron-generated backups.
 * Uses a fixed key per event so the daily cron overwrites rather than
 * duplicating when the 48h window catches the same event twice.
 */
export function buildCronBackupStorageKey(eventId: string): string {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  return `events/${scopedEventId}/emergency-kit/pre-event-backup.zip`;
}

// ── CSV Helpers ───────────────────────────────────────────────

function escapeCsv(value: string | number | null | undefined): string {
  let str = value == null ? '' : String(value);
  // Neutralize CSV formula injection
  if (str.length > 0 && '=+-@'.includes(str[0])) {
    str = `\t${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function toCsvBuffer(headers: string[], rows: string[][]): Buffer {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ── 1. Attendee CSV ───────────────────────────────────────────

export async function generateAttendeeCsv(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const rows = await db
    .select({
      regNumber: eventRegistrations.registrationNumber,
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      category: eventRegistrations.category,
      status: eventRegistrations.status,
      designation: people.designation,
      specialty: people.specialty,
      organization: people.organization,
      city: people.city,
      registeredAt: eventRegistrations.registeredAt,
    })
    .from(eventRegistrations)
    .innerJoin(people, eq(eventRegistrations.personId, people.id))
    .where(withEventScope(eventRegistrations.eventId, scopedEventId));

  return toCsvBuffer(
    ['Reg #', 'Name', 'Email', 'Phone', 'Category', 'Status', 'Designation', 'Specialty', 'Organization', 'City', 'Registered At'],
    rows.map((r) => [
      r.regNumber ?? '', r.fullName, r.email ?? '', r.phone ?? '',
      r.category ?? '', r.status, r.designation ?? '', r.specialty ?? '',
      r.organization ?? '', r.city ?? '', formatDateTime(r.registeredAt),
    ]),
  );
}

// ── 2. Travel CSV ─────────────────────────────────────────────

export async function generateTravelCsv(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      direction: travelRecords.direction,
      travelMode: travelRecords.travelMode,
      fromCity: travelRecords.fromCity,
      toCity: travelRecords.toCity,
      departureAtUtc: travelRecords.departureAtUtc,
      arrivalAtUtc: travelRecords.arrivalAtUtc,
      carrier: travelRecords.carrierName,
      flightTrainNumber: travelRecords.serviceNumber,
      pnr: travelRecords.pnrOrBookingRef,
      recordStatus: travelRecords.recordStatus,
    })
    .from(travelRecords)
    .innerJoin(people, eq(travelRecords.personId, people.id))
    .where(withEventScope(travelRecords.eventId, scopedEventId, ne(travelRecords.recordStatus, 'cancelled')));

  return toCsvBuffer(
    ['Name', 'Email', 'Phone', 'Direction', 'Mode', 'From', 'To', 'Departure', 'Arrival', 'Carrier', 'Flight/Train #', 'PNR', 'Status'],
    rows.map((r) => [
      r.fullName, r.email ?? '', r.phone ?? '', r.direction, r.travelMode,
      r.fromCity, r.toCity, formatDateTime(r.departureAtUtc), formatDateTime(r.arrivalAtUtc),
      r.carrier ?? '', r.flightTrainNumber ?? '', r.pnr ?? '', r.recordStatus,
    ]),
  );
}

// ── 3. Rooming CSV ────────────────────────────────────────────

export async function generateRoomingCsv(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      hotelName: accommodationRecords.hotelName,
      roomType: accommodationRecords.roomType,
      roomNumber: accommodationRecords.roomNumber,
      sharedRoomGroup: accommodationRecords.sharedRoomGroup,
      checkInDate: accommodationRecords.checkInDate,
      checkOutDate: accommodationRecords.checkOutDate,
      recordStatus: accommodationRecords.recordStatus,
    })
    .from(accommodationRecords)
    .innerJoin(people, eq(accommodationRecords.personId, people.id))
    .where(withEventScope(accommodationRecords.eventId, scopedEventId, ne(accommodationRecords.recordStatus, 'cancelled')));

  return toCsvBuffer(
    ['Hotel', 'Name', 'Email', 'Phone', 'Room Type', 'Room #', 'Shared Group', 'Check-In', 'Check-Out', 'Status'],
    rows.map((r) => [
      r.hotelName, r.fullName, r.email ?? '', r.phone ?? '',
      r.roomType ?? '', r.roomNumber ?? '', r.sharedRoomGroup ?? '',
      formatDateTime(r.checkInDate), formatDateTime(r.checkOutDate), r.recordStatus,
    ]),
  );
}

// ── 4. Transport CSV ──────────────────────────────────────────
// Mirrors the existing excel export pattern: 3 separate queries for
// batches, vehicles, passengers so empty batches/vehicles still appear.

export async function generateTransportCsv(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  // Fetch batches (excluding cancelled)
  const batchRows = await db
    .select({
      batchId: transportBatches.id,
      serviceDate: transportBatches.serviceDate,
      movementType: transportBatches.movementType,
      pickupHub: transportBatches.pickupHub,
      dropHub: transportBatches.dropHub,
      batchStatus: transportBatches.batchStatus,
    })
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, scopedEventId, ne(transportBatches.batchStatus, 'cancelled')));

  // Fetch vehicles
  const vehicleRows = await db
    .select({
      vehicleId: vehicleAssignments.id,
      batchId: vehicleAssignments.batchId,
      vehicleLabel: vehicleAssignments.vehicleLabel,
      vehicleType: vehicleAssignments.vehicleType,
    })
    .from(vehicleAssignments)
    .where(withEventScope(vehicleAssignments.eventId, scopedEventId));

  // Fetch passengers
  const passengerRows = await db
    .select({
      batchId: transportPassengerAssignments.batchId,
      vehicleAssignmentId: transportPassengerAssignments.vehicleAssignmentId,
      fullName: people.fullName,
      phone: people.phoneE164,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
    })
    .from(transportPassengerAssignments)
    .innerJoin(people, eq(transportPassengerAssignments.personId, people.id))
    .where(withEventScope(transportPassengerAssignments.eventId, scopedEventId));

  // Build denormalized rows: batch → vehicle → passenger.
  // Empty batches (no vehicles) and empty vehicles (no passengers) each get a row.
  const csvRows: string[][] = [];

  for (const batch of batchRows) {
    const batchVehicles = vehicleRows.filter((v) => v.batchId === batch.batchId);

    if (batchVehicles.length === 0) {
      // Batch with no vehicles assigned
      csvRows.push([
        formatDateTime(batch.serviceDate), batch.movementType,
        batch.pickupHub ?? '', batch.dropHub ?? '', batch.batchStatus,
        '', '', '', '', '',
      ]);
    } else {
      for (const vehicle of batchVehicles) {
        const vehiclePassengers = passengerRows.filter(
          (p) => p.vehicleAssignmentId === vehicle.vehicleId,
        );

        if (vehiclePassengers.length === 0) {
          // Vehicle with no passengers assigned
          csvRows.push([
            formatDateTime(batch.serviceDate), batch.movementType,
            batch.pickupHub ?? '', batch.dropHub ?? '', batch.batchStatus,
            vehicle.vehicleLabel ?? '', vehicle.vehicleType ?? '',
            '', '', '',
          ]);
        } else {
          for (const p of vehiclePassengers) {
            csvRows.push([
              formatDateTime(batch.serviceDate), batch.movementType,
              batch.pickupHub ?? '', batch.dropHub ?? '', batch.batchStatus,
              vehicle.vehicleLabel ?? '', vehicle.vehicleType ?? '',
              p.fullName, p.phone ?? '', p.assignmentStatus,
            ]);
          }
        }
      }
    }
  }

  return toCsvBuffer(
    ['Date', 'Movement', 'Pickup Hub', 'Drop Hub', 'Batch Status', 'Vehicle', 'Type', 'Passenger', 'Phone', 'Passenger Status'],
    csvRows,
  );
}

// ── 5. Program JSON ───────────────────────────────────────────

export async function generateProgramJson(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const sessionRows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      sessionType: sessions.sessionType,
      sessionDate: sessions.sessionDate,
      startAtUtc: sessions.startAtUtc,
      endAtUtc: sessions.endAtUtc,
      hallName: halls.name,
      track: sessions.track,
      status: sessions.status,
      cmeCredits: sessions.cmeCredits,
      parentSessionId: sessions.parentSessionId,
    })
    .from(sessions)
    .leftJoin(halls, withEventScope(halls.eventId, scopedEventId, eq(sessions.hallId, halls.id)))
    .where(withEventScope(sessions.eventId, scopedEventId));

  const assignments = await db
    .select({
      sessionId: sessionAssignments.sessionId,
      personName: people.fullName,
      personEmail: people.email,
      role: sessionAssignments.role,
    })
    .from(sessionAssignments)
    .innerJoin(people, eq(sessionAssignments.personId, people.id))
    .where(withEventScope(sessionAssignments.eventId, scopedEventId));

  // Group assignments by session
  const assignmentsBySession = new Map<string, Array<{ name: string; email: string | null; role: string }>>();
  for (const a of assignments) {
    const list = assignmentsBySession.get(a.sessionId) ?? [];
    list.push({ name: a.personName, email: a.personEmail, role: a.role });
    assignmentsBySession.set(a.sessionId, list);
  }

  const program = sessionRows.map((s) => ({
    id: s.id,
    title: s.title,
    type: s.sessionType,
    date: s.sessionDate ? s.sessionDate.toISOString().slice(0, 10) : null,
    startUtc: s.startAtUtc?.toISOString() ?? null,
    endUtc: s.endAtUtc?.toISOString() ?? null,
    hall: s.hallName ?? null,
    track: s.track ?? null,
    status: s.status,
    cmeCredits: s.cmeCredits ?? null,
    parentSessionId: s.parentSessionId ?? null,
    faculty: assignmentsBySession.get(s.id) ?? [],
  }));

  // Sort by date then start time
  program.sort((a, b) => {
    const dateA = a.date ?? '';
    const dateB = b.date ?? '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const startA = a.startUtc ?? '';
    const startB = b.startUtc ?? '';
    return startA.localeCompare(startB);
  });

  return Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), sessions: program }, null, 2), 'utf-8');
}

// ── 6. Certificate Keys JSON ──────────────────────────────────

export async function generateCertificateKeysJson(eventId: string): Promise<Buffer> {
  const scopedEventId = validateEmergencyKitEventId(eventId);
  const rows = await db
    .select({
      storageKey: issuedCertificates.storageKey,
      fileName: issuedCertificates.fileName,
      certificateType: issuedCertificates.certificateType,
      status: issuedCertificates.status,
    })
    .from(issuedCertificates)
    .where(withEventScope(issuedCertificates.eventId, scopedEventId, eq(issuedCertificates.status, 'issued')));

  return Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), certificates: rows }, null, 2), 'utf-8');
}

// ── Build Emergency Kit ZIP ───────────────────────────────────

export type EmergencyKitOptions = {
  eventId: string;
  storageProvider: StorageProvider;
  /** Override the storage key (used by cron for deterministic keys). */
  storageKeyOverride?: string;
};

export async function generateEmergencyKit(options: EmergencyKitOptions): Promise<EmergencyKitResult> {
  const { eventId, storageProvider, storageKeyOverride } = options;
  const scopedEventId = validateEmergencyKitEventId(eventId);

  if (storageKeyOverride !== undefined) {
    assertScopedEmergencyKitStorageKey(scopedEventId, storageKeyOverride);
  }

  // Generate all exports in parallel
  const [attendeeCsv, travelCsv, roomingCsv, transportCsv, programJson, certKeysJson] = await Promise.all([
    generateAttendeeCsv(scopedEventId),
    generateTravelCsv(scopedEventId),
    generateRoomingCsv(scopedEventId),
    generateTransportCsv(scopedEventId),
    generateProgramJson(scopedEventId),
    generateCertificateKeysJson(scopedEventId),
  ]);

  // Create streaming ZIP archive
  const archive = archiver('zip', { zlib: { level: 6 } });
  const passThrough = new PassThrough();
  archive.on('error', (err) => passThrough.destroy(err));
  archive.pipe(passThrough);

  let fileCount = 0;

  archive.append(attendeeCsv, { name: 'attendees.csv' });
  fileCount++;
  archive.append(travelCsv, { name: 'travel-roster.csv' });
  fileCount++;
  archive.append(roomingCsv, { name: 'rooming-list.csv' });
  fileCount++;
  archive.append(transportCsv, { name: 'transport-plan.csv' });
  fileCount++;
  archive.append(programJson, { name: 'program.json' });
  fileCount++;
  archive.append(certKeysJson, { name: 'certificate-keys.json' });
  fileCount++;

  // Finalize the archive
  const finalizePromise = archive.finalize();

  // Upload ZIP to R2
  const storageKey = storageKeyOverride ?? buildEmergencyKitStorageKey(scopedEventId);

  let sizeBytes: number;
  if (storageProvider.uploadStream) {
    const uploadResult = await storageProvider.uploadStream(storageKey, passThrough, 'application/zip');
    await finalizePromise;
    sizeBytes = uploadResult.fileSizeBytes;
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
    sizeBytes = fullBuffer.length;
    await storageProvider.upload(storageKey, fullBuffer, 'application/zip');
  }

  // Generate signed download URL (1-hour expiry)
  const downloadUrl = await storageProvider.getSignedUrl(storageKey, 3600);

  return { storageKey, downloadUrl, fileCount, sizeBytes };
}

// ── Find Events Needing Pre-Event Backup ──────────────────────
// Uses a 48h window so the daily cron (00:00 UTC) reliably catches
// every event at least 24h before start, regardless of timezone.

export async function findEventsNeedingBackup(): Promise<Array<{ id: string; name: string; startDate: Date }>> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      startDate: events.startDate,
    })
    .from(events)
    .where(
      and(
        gte(events.startDate, now),
        lte(events.startDate, in48h),
        inArray(events.status, ['draft', 'published']),
      ),
    );

  return rows;
}
