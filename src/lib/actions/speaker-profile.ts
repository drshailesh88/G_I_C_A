'use server';

import { db } from '@/lib/db';
import { sessions, sessionAssignments, people, halls } from '@/lib/db/schema';
import { eq, asc, ne } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { z } from 'zod';

const eventIdSchema = z.string().uuid('Invalid event ID');

function validateEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

export type PublicSpeakerSession = {
  sessionId: string;
  title: string;
  sessionDate: Date | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  hallName: string | null;
  role: string;
};

export type PublicSpeaker = {
  personId: string;
  fullName: string;
  designation: string | null;
  organization: string | null;
  bio: string | null;
  photoStorageKey: string | null;
  sessions: PublicSpeakerSession[];
};

/**
 * Returns unique speakers for public, non-cancelled sessions of an event.
 * No auth required — public endpoint.
 */
export async function getPublicSpeakers(eventId: string): Promise<PublicSpeaker[]> {
  const scopedEventId = validateEventId(eventId);

  const sessionRows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      sessionDate: sessions.sessionDate,
      startAtUtc: sessions.startAtUtc,
      endAtUtc: sessions.endAtUtc,
      hallId: sessions.hallId,
    })
    .from(sessions)
    .where(
      withEventScope(
        sessions.eventId,
        scopedEventId,
        eq(sessions.isPublic, true),
        ne(sessions.status, 'cancelled'),
      ),
    )
    .orderBy(asc(sessions.sessionDate), asc(sessions.startAtUtc));

  if (sessionRows.length === 0) return [];

  const allHalls = await db
    .select({ id: halls.id, name: halls.name })
    .from(halls)
    .where(eq(halls.eventId, scopedEventId));

  const hallMap = new Map(allHalls.map(h => [h.id, h.name]));
  const sessionIdSet = new Set(sessionRows.map(s => s.id));
  const sessionMap = new Map(sessionRows.map(s => [s.id, s]));

  const assignments = await db
    .select({
      personId: sessionAssignments.personId,
      sessionId: sessionAssignments.sessionId,
      role: sessionAssignments.role,
      fullName: people.fullName,
      designation: people.designation,
      organization: people.organization,
      bio: people.bio,
      photoStorageKey: people.photoStorageKey,
    })
    .from(sessionAssignments)
    .innerJoin(people, eq(sessionAssignments.personId, people.id))
    .where(eq(sessionAssignments.eventId, scopedEventId))
    .orderBy(asc(sessionAssignments.sortOrder));

  const speakerMap = new Map<string, PublicSpeaker>();

  for (const a of assignments) {
    if (!sessionIdSet.has(a.sessionId)) continue;

    if (!speakerMap.has(a.personId)) {
      speakerMap.set(a.personId, {
        personId: a.personId,
        fullName: a.fullName,
        designation: a.designation,
        organization: a.organization,
        bio: a.bio,
        photoStorageKey: a.photoStorageKey,
        sessions: [],
      });
    }

    const session = sessionMap.get(a.sessionId)!;
    speakerMap.get(a.personId)!.sessions.push({
      sessionId: a.sessionId,
      title: session.title,
      sessionDate: session.sessionDate,
      startAtUtc: session.startAtUtc,
      endAtUtc: session.endAtUtc,
      hallName: session.hallId ? hallMap.get(session.hallId) ?? null : null,
      role: a.role,
    });
  }

  return Array.from(speakerMap.values());
}
