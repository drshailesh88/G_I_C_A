'use server';

import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { people } from '@/lib/db/schema/people';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { eq, and, sql, count, notInArray } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { attendanceQuerySchema } from '@/lib/validations/attendance';
import type { SQL } from 'drizzle-orm';

export type AttendanceRecord = {
  id: string;
  personId: string;
  fullName: string;
  registrationNumber: string | null;
  category: string | null;
  sessionId: string | null;
  checkInMethod: string;
  checkInAt: Date;
  checkInBy: string | null;
  offlineDeviceId: string | null;
  syncedAt: Date | null;
};

export type AttendanceStats = {
  totalCheckedIn: number;
  byMethod: Record<string, number>;
  bySession: Record<string, number>;
};

function buildDateCondition(date: string): SQL {
  return sql`${attendanceRecords.checkInAt} AT TIME ZONE 'Asia/Kolkata' >= ${date}::date AND ${attendanceRecords.checkInAt} AT TIME ZONE 'Asia/Kolkata' < (${date}::date + interval '1 day')`;
}

function buildFilterConditions(validated: { sessionId?: string | null; date?: string }): SQL[] {
  const conditions: SQL[] = [];

  if (validated.sessionId !== undefined) {
    if (validated.sessionId === null) {
      conditions.push(sql`${attendanceRecords.sessionId} IS NULL`);
    } else {
      conditions.push(eq(attendanceRecords.sessionId, validated.sessionId));
    }
  }

  if (validated.date) {
    conditions.push(buildDateCondition(validated.date));
  }

  return conditions;
}

export async function listAttendanceRecords(
  eventId: string,
  input: unknown,
): Promise<AttendanceRecord[]> {
  await assertEventAccess(eventId, { requireWrite: false });
  const validated = attendanceQuerySchema.parse(input);

  const conditions = buildFilterConditions(validated);

  const rows = await db
    .select({
      id: attendanceRecords.id,
      personId: attendanceRecords.personId,
      fullName: people.fullName,
      registrationNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
      sessionId: attendanceRecords.sessionId,
      checkInMethod: attendanceRecords.checkInMethod,
      checkInAt: attendanceRecords.checkInAt,
      checkInBy: attendanceRecords.checkInBy,
      offlineDeviceId: attendanceRecords.offlineDeviceId,
      syncedAt: attendanceRecords.syncedAt,
    })
    .from(attendanceRecords)
    .innerJoin(people, eq(attendanceRecords.personId, people.id))
    .leftJoin(eventRegistrations, eq(attendanceRecords.registrationId, eventRegistrations.id))
    .where(
      withEventScope(
        attendanceRecords.eventId,
        eventId,
        ...conditions,
      ),
    )
    .orderBy(attendanceRecords.checkInAt)
    .limit(500);

  return rows;
}

export async function getAttendanceStats(
  eventId: string,
  input: unknown,
): Promise<AttendanceStats> {
  await assertEventAccess(eventId, { requireWrite: false });
  const validated = attendanceQuerySchema.parse(input);

  const conditions = buildFilterConditions(validated);

  return await db.transaction(async (tx) => {
    // Total count
    const [totalRow] = await tx
      .select({ count: count() })
      .from(attendanceRecords)
      .where(
        withEventScope(attendanceRecords.eventId, eventId, ...conditions),
      );

    // By method
    const methodRows = await tx
      .select({
        method: attendanceRecords.checkInMethod,
        count: count(),
      })
      .from(attendanceRecords)
      .where(
        withEventScope(attendanceRecords.eventId, eventId, ...conditions),
      )
      .groupBy(attendanceRecords.checkInMethod);

    // By session
    const sessionRows = await tx
      .select({
        sessionId: attendanceRecords.sessionId,
        count: count(),
      })
      .from(attendanceRecords)
      .where(
        withEventScope(attendanceRecords.eventId, eventId, ...conditions),
      )
      .groupBy(attendanceRecords.sessionId);

    const byMethod: Record<string, number> = {};
    for (const row of methodRows) {
      byMethod[row.method] = row.count;
    }

    const bySession: Record<string, number> = {};
    for (const row of sessionRows) {
      bySession[row.sessionId ?? 'event_level'] = row.count;
    }

    return {
      totalCheckedIn: totalRow?.count ?? 0,
      byMethod,
      bySession,
    };
  });
}

/**
 * Count confirmed registrations for an event (eligible for check-in).
 * Used by the QR scanner page to show total/remaining stats.
 */
export async function getConfirmedRegistrationCount(
  eventId: string,
): Promise<number> {
  await assertEventAccess(eventId, { requireWrite: false });

  const [row] = await db
    .select({ count: count() })
    .from(eventRegistrations)
    .where(
      withEventScope(
        eventRegistrations.eventId,
        eventId,
        eq(eventRegistrations.status, 'confirmed'),
      ),
    );

  return row?.count ?? 0;
}
