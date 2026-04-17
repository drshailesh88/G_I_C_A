'use server';

import { db } from '@/lib/db';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { people } from '@/lib/db/schema/people';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { sessions } from '@/lib/db/schema/program';
import { eq, and, or, ilike, isNull } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { attendanceQuerySchema, checkInSearchSchema } from '@/lib/validations/attendance';

export type CheckInSearchResult = {
  registrationId: string;
  personId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  registrationNumber: string;
  category: string;
  status: string;
  alreadyCheckedIn: boolean;
};

const eventIdSchema = checkInSearchSchema.shape.eventId;
const sessionIdSchema = attendanceQuerySchema.shape.sessionId;

function validateCheckInSearchRequest(eventId: string, input: unknown, sessionId?: string | null) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const validated = checkInSearchSchema.parse(input);
  const validatedSessionId = sessionIdSchema.parse(sessionId ?? null) ?? null;

  if (validated.eventId.toLowerCase() !== scopedEventId.toLowerCase()) {
    throw new Error('Event ID mismatch');
  }

  return {
    scopedEventId,
    validated,
    validatedSessionId,
  };
}

export async function searchRegistrationsForCheckIn(
  eventId: string,
  input: unknown,
  sessionId?: string | null,
): Promise<CheckInSearchResult[]> {
  const { scopedEventId, validated, validatedSessionId } = validateCheckInSearchRequest(
    eventId,
    input,
    sessionId,
  );

  await assertEventAccess(scopedEventId, { requireWrite: true });

  if (validatedSessionId) {
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        withEventScope(
          sessions.eventId,
          scopedEventId,
          eq(sessions.id, validatedSessionId),
        ),
      )
      .limit(1);

    if (!session) {
      throw new Error('Session not found for this event.');
    }
  }

  const escaped = validated.query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

  const rows = await db
    .select({
      registrationId: eventRegistrations.id,
      personId: eventRegistrations.personId,
      fullName: people.fullName,
      email: people.email,
      phoneE164: people.phoneE164,
      registrationNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
      status: eventRegistrations.status,
    })
    .from(eventRegistrations)
    .innerJoin(people, eq(eventRegistrations.personId, people.id))
    .where(
      withEventScope(
        eventRegistrations.eventId,
        scopedEventId,
        or(
          ilike(people.fullName, `%${escaped}%`),
          ilike(people.email, `%${escaped}%`),
          eq(people.phoneE164, validated.query),
          ilike(eventRegistrations.registrationNumber, `%${escaped}%`),
        ),
      ),
    )
    .orderBy(people.fullName)
    .limit(20);

  // Batch check attendance for all returned registrations
  const personIds = rows.map((r) => r.personId);
  const checkedInPersonIds = new Set<string>();

  if (personIds.length > 0) {
    // Build session-aware attendance condition
    const sessionCondition = validatedSessionId
      ? eq(attendanceRecords.sessionId, validatedSessionId)
      : isNull(attendanceRecords.sessionId);

    const attendanceRows = await db
      .select({ personId: attendanceRecords.personId })
      .from(attendanceRecords)
      .where(
        withEventScope(
          attendanceRecords.eventId,
          scopedEventId,
          and(
            sessionCondition,
            or(...personIds.map((pid) => eq(attendanceRecords.personId, pid))),
          ),
        ),
      );

    for (const row of attendanceRows) {
      checkedInPersonIds.add(row.personId);
    }
  }

  return rows.map((row) => ({
    ...row,
    alreadyCheckedIn: checkedInPersonIds.has(row.personId),
  }));
}
