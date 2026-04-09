'use server';

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { people } from '@/lib/db/schema/people';
import { eq, and, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { qrScanSchema, manualCheckInSchema } from '@/lib/validations/attendance';
import { parseQrPayload, determineScanResult, type ScanLookupResult } from '@/lib/attendance/qr-utils';

type CheckInRegistration = {
  id: string;
  personId: string;
  status: string;
  cancelledAt: Date | null;
  registrationNumber: string;
  category: string;
};

function buildAttendanceRecordId(eventId: string, personId: string, sessionId: string | null): string {
  const hash = createHash('sha256')
    .update(`${eventId}:${personId}:${sessionId ?? 'event'}`)
    .digest('hex');

  const versionedHash = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((parseInt(hash[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ];

  return versionedHash.join('-');
}

function buildExistingAttendanceConditions(personId: string, sessionId: string | null) {
  return sessionId
    ? and(
        eq(attendanceRecords.personId, personId),
        eq(attendanceRecords.sessionId, sessionId),
      )!
    : and(
        eq(attendanceRecords.personId, personId),
        isNull(attendanceRecords.sessionId),
      )!;
}

function isDuplicateAttendanceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const databaseCode = 'code' in error ? String(error.code) : undefined;
  return databaseCode === '23505' || error.message.toLowerCase().includes('duplicate key');
}

function buildScanRegistration(
  registration: CheckInRegistration,
  personName: string,
) {
  return {
    status: registration.status,
    cancelledAt: registration.cancelledAt,
    personName,
    registrationNumber: registration.registrationNumber,
    category: registration.category,
  };
}

function buildDuplicateResult(
  registration: CheckInRegistration,
  personName: string,
  sessionId: string | null,
): ScanLookupResult {
  return determineScanResult({
    tokenFound: true,
    registration: buildScanRegistration(registration, personName),
    alreadyCheckedIn: true,
    sessionId,
  });
}

// ── QR Scan Check-in ─────────────────────────────────────────

export async function processQrScan(eventId: string, input: unknown): Promise<ScanLookupResult> {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = qrScanSchema.parse(input);

  // Parse the QR payload
  const parsed = parseQrPayload(validated.qrPayload);
  if (!parsed.valid) {
    return { type: 'invalid', message: parsed.error };
  }

  // Verify the event ID matches (case-insensitive — UUIDs may differ in casing)
  if (parsed.eventId.toLowerCase() !== eventId.toLowerCase()) {
    return { type: 'invalid', message: 'QR code belongs to a different event.' };
  }

  // Look up registration by QR token
  const [registration] = await db
    .select({
      id: eventRegistrations.id,
      personId: eventRegistrations.personId,
      status: eventRegistrations.status,
      cancelledAt: eventRegistrations.cancelledAt,
      registrationNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
    })
    .from(eventRegistrations)
    .where(
      withEventScope(
        eventRegistrations.eventId,
        eventId,
        eq(eventRegistrations.qrCodeToken, parsed.token),
      ),
    )
    .limit(1);

  if (!registration) {
    return { type: 'invalid', message: 'QR code not recognized. No matching registration found.' };
  }

  // Get person name
  const [person] = await db
    .select({ fullName: people.fullName })
    .from(people)
    .where(eq(people.id, registration.personId))
    .limit(1);

  const personName = person?.fullName ?? 'Unknown';
  const sessionId = validated.sessionId ?? null;

  // Check for existing attendance (duplicate detection)
  const existingConditions = buildExistingAttendanceConditions(
    registration.personId,
    sessionId,
  );

  const [existingAttendance] = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(
      withEventScope(attendanceRecords.eventId, eventId, existingConditions),
    )
    .limit(1);

  const alreadyCheckedIn = !!existingAttendance;

  // Determine scan result using pure logic
  const result = determineScanResult({
    tokenFound: true,
    registration: buildScanRegistration(registration, personName),
    alreadyCheckedIn,
    sessionId,
  });

  // Only insert attendance record on success
  if (result.type === 'success') {
    try {
      await db.insert(attendanceRecords).values({
        id: buildAttendanceRecordId(eventId, registration.personId, sessionId),
        eventId,
        personId: registration.personId,
        registrationId: registration.id,
        sessionId,
        checkInMethod: 'qr_scan',
        checkInBy: userId,
        offlineDeviceId: validated.deviceId ?? null,
      });
    } catch (error) {
      if (isDuplicateAttendanceError(error)) {
        return buildDuplicateResult(registration, personName, sessionId);
      }

      throw error;
    }

    revalidatePath(`/events/${eventId}/qr`);
  }

  return result;
}

// ── Manual Check-in ──────────────────────────────────────────

export async function processManualCheckIn(eventId: string, input: unknown): Promise<ScanLookupResult> {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = manualCheckInSchema.parse(input);

  // Look up registration by ID
  const [registration] = await db
    .select({
      id: eventRegistrations.id,
      personId: eventRegistrations.personId,
      status: eventRegistrations.status,
      cancelledAt: eventRegistrations.cancelledAt,
      registrationNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
    })
    .from(eventRegistrations)
    .where(
      withEventScope(
        eventRegistrations.eventId,
        eventId,
        eq(eventRegistrations.id, validated.registrationId),
      ),
    )
    .limit(1);

  if (!registration) {
    return { type: 'invalid', message: 'Registration not found.' };
  }

  // Get person name
  const [person] = await db
    .select({ fullName: people.fullName })
    .from(people)
    .where(eq(people.id, registration.personId))
    .limit(1);

  const personName = person?.fullName ?? 'Unknown';
  const sessionId = validated.sessionId ?? null;

  // Check for existing attendance
  const existingConditions = buildExistingAttendanceConditions(
    registration.personId,
    sessionId,
  );

  const [existingAttendance] = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(
      withEventScope(attendanceRecords.eventId, eventId, existingConditions),
    )
    .limit(1);

  const alreadyCheckedIn = !!existingAttendance;

  const result = determineScanResult({
    tokenFound: true,
    registration: buildScanRegistration(registration, personName),
    alreadyCheckedIn,
    sessionId,
  });

  if (result.type === 'success') {
    try {
      await db.insert(attendanceRecords).values({
        id: buildAttendanceRecordId(eventId, registration.personId, sessionId),
        eventId,
        personId: registration.personId,
        registrationId: registration.id,
        sessionId,
        checkInMethod: 'manual_search',
        checkInBy: userId,
      });
    } catch (error) {
      if (isDuplicateAttendanceError(error)) {
        return buildDuplicateResult(registration, personName, sessionId);
      }

      throw error;
    }

    revalidatePath(`/events/${eventId}/qr`);
  }

  return result;
}
