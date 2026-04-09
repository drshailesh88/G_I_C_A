'use server';

import { db } from '@/lib/db';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { people } from '@/lib/db/schema/people';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { eq, and, or, ilike, isNull } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { checkInSearchSchema } from '@/lib/validations/attendance';

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

export async function searchRegistrationsForCheckIn(
  eventId: string,
  input: unknown,
  sessionId?: string | null,
): Promise<CheckInSearchResult[]> {
  await assertEventAccess(eventId, { requireWrite: true });
  const validated = checkInSearchSchema.parse(input);

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
        eventId,
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
    const resolvedSessionId = sessionId ?? null;
    const sessionCondition = resolvedSessionId
      ? eq(attendanceRecords.sessionId, resolvedSessionId)
      : isNull(attendanceRecords.sessionId);

    const attendanceRows = await db
      .select({ personId: attendanceRecords.personId })
      .from(attendanceRecords)
      .where(
        withEventScope(
          attendanceRecords.eventId,
          eventId,
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
