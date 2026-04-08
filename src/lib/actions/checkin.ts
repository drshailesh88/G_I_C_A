'use server';

import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { people } from '@/lib/db/schema/people';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { qrScanSchema, manualCheckInSchema } from '@/lib/validations/attendance';
import { parseQrPayload, determineScanResult, type ScanLookupResult } from '@/lib/attendance/qr-utils';

// ── QR Scan Check-in ─────────────────────────────────────────

export async function processQrScan(eventId: string, input: unknown): Promise<ScanLookupResult> {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = qrScanSchema.parse(input);

  // Parse the QR payload
  const parsed = parseQrPayload(validated.qrPayload);
  if (!parsed.valid) {
    return { type: 'invalid', message: parsed.error };
  }

  // Verify the event ID matches
  if (parsed.eventId !== eventId) {
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
  const existingConditions = sessionId
    ? and(
        eq(attendanceRecords.personId, registration.personId),
        eq(attendanceRecords.sessionId, sessionId),
      )!
    : and(
        eq(attendanceRecords.personId, registration.personId),
        eq(attendanceRecords.sessionId, sessionId as unknown as string),
      )!;

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
    registration: {
      status: registration.status,
      cancelledAt: registration.cancelledAt,
      personName,
      registrationNumber: registration.registrationNumber,
      category: registration.category,
    },
    alreadyCheckedIn,
    sessionId,
  });

  // Only insert attendance record on success
  if (result.type === 'success') {
    await db.insert(attendanceRecords).values({
      eventId,
      personId: registration.personId,
      registrationId: registration.id,
      sessionId,
      checkInMethod: 'qr_scan',
      checkInBy: userId,
      offlineDeviceId: validated.deviceId ?? null,
    });

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
  const existingConditions = sessionId
    ? and(
        eq(attendanceRecords.personId, registration.personId),
        eq(attendanceRecords.sessionId, sessionId),
      )!
    : and(
        eq(attendanceRecords.personId, registration.personId),
        eq(attendanceRecords.sessionId, sessionId as unknown as string),
      )!;

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
    registration: {
      status: registration.status,
      cancelledAt: registration.cancelledAt,
      personName,
      registrationNumber: registration.registrationNumber,
      category: registration.category,
    },
    alreadyCheckedIn,
    sessionId,
  });

  if (result.type === 'success') {
    await db.insert(attendanceRecords).values({
      eventId,
      personId: registration.personId,
      registrationId: registration.id,
      sessionId,
      checkInMethod: 'manual_search',
      checkInBy: userId,
    });

    revalidatePath(`/events/${eventId}/qr`);
  }

  return result;
}
