'use server';

import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { people } from '@/lib/db/schema/people';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { sessions } from '@/lib/db/schema/program';
import { eq, and, sql, count, isNotNull } from 'drizzle-orm';
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

const eventIdSchema = attendanceQuerySchema.shape.eventId;

function validateRouteEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

function validateAttendanceQueryForEvent(eventId: string, input: unknown) {
  const scopedEventId = validateRouteEventId(eventId);
  const validated = attendanceQuerySchema.parse(input);

  if (validated.eventId.toLowerCase() !== scopedEventId.toLowerCase()) {
    throw new Error('Event ID mismatch');
  }

  return { scopedEventId, validated };
}

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
  const { scopedEventId, validated } = validateAttendanceQueryForEvent(eventId, input);
  await assertEventAccess(scopedEventId, { requireWrite: false });

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
    .leftJoin(
      eventRegistrations,
      and(
        eq(attendanceRecords.registrationId, eventRegistrations.id),
        eq(eventRegistrations.eventId, scopedEventId),
      )!,
    )
    .where(
      withEventScope(
        attendanceRecords.eventId,
        scopedEventId,
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
  const { scopedEventId, validated } = validateAttendanceQueryForEvent(eventId, input);
  await assertEventAccess(scopedEventId, { requireWrite: false });

  const conditions = buildFilterConditions(validated);

  return await db.transaction(async (tx) => {
    // Total count
    const [totalRow] = await tx
      .select({ count: count() })
      .from(attendanceRecords)
      .where(
        withEventScope(attendanceRecords.eventId, scopedEventId, ...conditions),
      );

    // By method
    const methodRows = await tx
      .select({
        method: attendanceRecords.checkInMethod,
        count: count(),
      })
      .from(attendanceRecords)
      .where(
        withEventScope(attendanceRecords.eventId, scopedEventId, ...conditions),
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
        withEventScope(attendanceRecords.eventId, scopedEventId, ...conditions),
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
  }, { isolationLevel: 'repeatable read' });
}

/**
 * Count confirmed registrations for an event (eligible for check-in).
 * Used by the QR scanner page to show total/remaining stats.
 */
export async function getConfirmedRegistrationCount(
  eventId: string,
): Promise<number> {
  const scopedEventId = validateRouteEventId(eventId);
  await assertEventAccess(scopedEventId, { requireWrite: false });

  const [row] = await db
    .select({ count: count() })
    .from(eventRegistrations)
    .where(
      withEventScope(
        eventRegistrations.eventId,
        scopedEventId,
        eq(eventRegistrations.status, 'confirmed'),
      ),
    );

  return row?.count ?? 0;
}

// ── Attendance report types ──────────────────────────────────────

export type AttendanceReportOverall = {
  totalRegistrations: number;
  totalCheckedIn: number;
  checkInRate: number;
  byMethod: { method: string; count: number }[];
  byCategory: { category: string; count: number }[];
};

export type AttendanceReportDay = {
  date: string;
  count: number;
  percentage: number;
};

export type AttendanceReportSession = {
  sessionId: string;
  title: string;
  sessionDate: string | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  count: number;
  percentage: number;
};

export type AttendanceReportData = {
  overall: AttendanceReportOverall;
  byDay: AttendanceReportDay[];
  bySession: AttendanceReportSession[];
};

export async function getAttendanceReportData(
  eventId: string,
): Promise<AttendanceReportData> {
  const scopedEventId = validateRouteEventId(eventId);
  await assertEventAccess(scopedEventId, { requireWrite: false });

  return db.transaction(async (tx) => {
    // Confirmed registrations (eligible attendees)
    const [regRow] = await tx
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          scopedEventId,
          eq(eventRegistrations.status, 'confirmed'),
        ),
      );
    const totalRegistrations = regRow?.count ?? 0;

    // Total check-in records (all methods, event-level + session-level)
    const [totalRow] = await tx
      .select({ count: count() })
      .from(attendanceRecords)
      .where(withEventScope(attendanceRecords.eventId, scopedEventId));
    const totalCheckedIn = totalRow?.count ?? 0;

    // Group by check-in method
    const methodRows = await tx
      .select({
        method: attendanceRecords.checkInMethod,
        count: count(),
      })
      .from(attendanceRecords)
      .where(withEventScope(attendanceRecords.eventId, scopedEventId))
      .groupBy(attendanceRecords.checkInMethod);

    // Group by registration category (left join — walk-ins may have no registration)
    const categoryRows = await tx
      .select({
        category: eventRegistrations.category,
        count: count(),
      })
      .from(attendanceRecords)
      .leftJoin(
        eventRegistrations,
        and(
          eq(attendanceRecords.registrationId, eventRegistrations.id),
          eq(eventRegistrations.eventId, scopedEventId),
        )!,
      )
      .where(withEventScope(attendanceRecords.eventId, scopedEventId))
      .groupBy(eventRegistrations.category);

    // Group by IST calendar date
    const dayRows = await tx
      .select({
        checkDate: sql<string>`(${attendanceRecords.checkInAt} AT TIME ZONE 'Asia/Kolkata')::date`,
        count: count(),
      })
      .from(attendanceRecords)
      .where(withEventScope(attendanceRecords.eventId, scopedEventId))
      .groupBy(sql`(${attendanceRecords.checkInAt} AT TIME ZONE 'Asia/Kolkata')::date`);

    // Session-level check-ins joined with session metadata
    const sessionRows = await tx
      .select({
        sessionId: attendanceRecords.sessionId,
        title: sessions.title,
        sessionDate: sessions.sessionDate,
        startAtUtc: sessions.startAtUtc,
        endAtUtc: sessions.endAtUtc,
        count: count(),
      })
      .from(attendanceRecords)
      .innerJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
      .where(
        withEventScope(
          attendanceRecords.eventId,
          scopedEventId,
          isNotNull(attendanceRecords.sessionId),
        ),
      )
      .groupBy(
        attendanceRecords.sessionId,
        sessions.title,
        sessions.sessionDate,
        sessions.startAtUtc,
        sessions.endAtUtc,
      );

    const checkInRate =
      totalRegistrations > 0
        ? Math.round((totalCheckedIn / totalRegistrations) * 100)
        : 0;

    const sortedDays = [...dayRows].sort((a, b) =>
      String(a.checkDate).localeCompare(String(b.checkDate)),
    );

    const sortedSessions = sessionRows
      .filter((r) => r.sessionId != null)
      .sort((a, b) => {
        const aDate = a.sessionDate ? a.sessionDate.getTime() : 0;
        const bDate = b.sessionDate ? b.sessionDate.getTime() : 0;
        if (aDate !== bDate) return aDate - bDate;
        const aStart = a.startAtUtc ? a.startAtUtc.getTime() : 0;
        const bStart = b.startAtUtc ? b.startAtUtc.getTime() : 0;
        return aStart - bStart;
      });

    return {
      overall: {
        totalRegistrations,
        totalCheckedIn,
        checkInRate,
        byMethod: methodRows.map((r) => ({ method: r.method, count: r.count })),
        byCategory: categoryRows
          .filter((r) => r.category != null)
          .map((r) => ({ category: r.category as string, count: r.count })),
      },
      byDay: sortedDays.map((r) => ({
        date: String(r.checkDate),
        count: r.count,
        percentage:
          totalCheckedIn > 0
            ? Math.round((r.count / totalCheckedIn) * 100)
            : 0,
      })),
      bySession: sortedSessions.map((r) => ({
        sessionId: r.sessionId as string,
        title: r.title,
        sessionDate: r.sessionDate ? r.sessionDate.toISOString() : null,
        startAtUtc: r.startAtUtc,
        endAtUtc: r.endAtUtc,
        count: r.count,
        percentage:
          totalCheckedIn > 0
            ? Math.round((r.count / totalCheckedIn) * 100)
            : 0,
      })),
    };
  }, { isolationLevel: 'repeatable read' });
}
