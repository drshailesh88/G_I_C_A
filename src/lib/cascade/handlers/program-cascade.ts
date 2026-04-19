import { db } from '@/lib/db';
import { events, people, programVersions } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { ProgramVersionPublishedPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

type SnapshotSession = {
  id: string;
  title?: string;
  hallId?: string | null;
  startAtUtc?: string | Date | null;
  endAtUtc?: string | Date | null;
  sessionDate?: string | Date | null;
};

type SnapshotAssignment = {
  personId: string;
  sessionId: string;
  role?: string;
  presentationTitle?: string | null;
};

type SnapshotHall = { id: string; name: string };

type Snapshot = {
  sessions?: SnapshotSession[];
  assignments?: SnapshotAssignment[];
  halls?: SnapshotHall[];
};

type ResponsibilitySnapshot = {
  sessionId: string;
  title: string;
  role: string;
  hallId: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
};

function toIsoOrNull(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildResponsibilityMap(
  snap: Snapshot,
  personId: string,
): Map<string, ResponsibilitySnapshot> {
  const sessionsById = new Map(
    (snap.sessions ?? []).map(s => [s.id, s]),
  );
  const map = new Map<string, ResponsibilitySnapshot>();
  for (const a of snap.assignments ?? []) {
    if (a.personId !== personId) continue;
    const session = sessionsById.get(a.sessionId);
    map.set(a.sessionId, {
      sessionId: a.sessionId,
      title: session?.title ?? a.sessionId,
      role: a.role ?? 'speaker',
      hallId: session?.hallId ?? null,
      startAtUtc: toIsoOrNull(session?.startAtUtc),
      endAtUtc: toIsoOrNull(session?.endAtUtc),
    });
  }
  return map;
}

function formatTimeIST(iso: string | null): string {
  if (!iso) return 'TBA';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function describeResponsibility(
  r: ResponsibilitySnapshot,
  hallNames: Map<string, string>,
): string {
  const hall = r.hallId ? hallNames.get(r.hallId) ?? 'Unassigned hall' : 'No hall';
  return `${r.title} — ${r.role} at ${hall} (${formatTimeIST(r.startAtUtc)} IST)`;
}

function computeChangedFields(
  prev: ResponsibilitySnapshot,
  curr: ResponsibilitySnapshot,
): string[] {
  const changes: string[] = [];
  if (prev.role !== curr.role) changes.push(`role: ${prev.role} → ${curr.role}`);
  if (prev.hallId !== curr.hallId) changes.push('hall changed');
  if (prev.startAtUtc !== curr.startAtUtc || prev.endAtUtc !== curr.endAtUtc) {
    changes.push('time changed');
  }
  return changes;
}

export type FacultyChangeBuckets = {
  added: ResponsibilitySnapshot[];
  changed: Array<{ prev: ResponsibilitySnapshot; curr: ResponsibilitySnapshot; fields: string[] }>;
  removed: ResponsibilitySnapshot[];
};

export function diffFacultyResponsibilities(
  prev: Snapshot,
  curr: Snapshot,
  personId: string,
): FacultyChangeBuckets {
  const prevMap = buildResponsibilityMap(prev, personId);
  const currMap = buildResponsibilityMap(curr, personId);

  const added: ResponsibilitySnapshot[] = [];
  const removed: ResponsibilitySnapshot[] = [];
  const changed: FacultyChangeBuckets['changed'] = [];

  for (const [sid, currResp] of currMap.entries()) {
    const prevResp = prevMap.get(sid);
    if (!prevResp) {
      added.push(currResp);
      continue;
    }
    const fields = computeChangedFields(prevResp, currResp);
    if (fields.length > 0) {
      changed.push({ prev: prevResp, curr: currResp, fields });
    }
  }
  for (const [sid, prevResp] of prevMap.entries()) {
    if (!currMap.has(sid)) removed.push(prevResp);
  }

  return { added, changed, removed };
}

export function renderFacultyChangesSummary(
  buckets: FacultyChangeBuckets,
  hallNames: Map<string, string>,
): string {
  const sections: string[] = [];

  if (buckets.added.length > 0) {
    const lines = buckets.added.map(r => `  • ${describeResponsibility(r, hallNames)}`);
    sections.push(`Added (${buckets.added.length}):\n${lines.join('\n')}`);
  }
  if (buckets.changed.length > 0) {
    const lines = buckets.changed.map(({ curr, fields }) =>
      `  • ${describeResponsibility(curr, hallNames)} — ${fields.join('; ')}`,
    );
    sections.push(`Changed (${buckets.changed.length}):\n${lines.join('\n')}`);
  }
  if (buckets.removed.length > 0) {
    const lines = buckets.removed.map(r => `  • ${describeResponsibility(r, hallNames)}`);
    sections.push(`Removed (${buckets.removed.length}):\n${lines.join('\n')}`);
  }

  return sections.join('\n\n') || 'Your responsibilities are unchanged.';
}

export async function handleProgramVersionPublished(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as ProgramVersionPublishedPayload;

  // No previous version — nothing to diff
  if (!data.baseVersionId) return;

  const [currentVersion] = await db
    .select({ snapshotJson: programVersions.snapshotJson })
    .from(programVersions)
    .where(withEventScope(programVersions.eventId, eventId, eq(programVersions.id, data.versionId)))
    .limit(1);

  const [prevVersion] = await db
    .select({ snapshotJson: programVersions.snapshotJson })
    .from(programVersions)
    .where(withEventScope(programVersions.eventId, eventId, eq(programVersions.id, data.baseVersionId)))
    .limit(1);

  if (!currentVersion || !prevVersion) return;

  const currentSnap = (currentVersion.snapshotJson ?? {}) as Snapshot;
  const prevSnap = (prevVersion.snapshotJson ?? {}) as Snapshot;

  if (!data.affectedPersonIds || data.affectedPersonIds.length === 0) return;

  const peopleRows = await db
    .select({
      id: people.id,
      email: people.email,
      fullName: people.fullName,
      salutation: people.salutation,
    })
    .from(people)
    .where(inArray(people.id, data.affectedPersonIds));

  const [eventRow] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  const eventName = eventRow?.name ?? '';

  const hallNames = new Map<string, string>();
  for (const h of currentSnap.halls ?? []) hallNames.set(h.id, h.name);
  for (const h of prevSnap.halls ?? []) {
    if (!hallNames.has(h.id)) hallNames.set(h.id, h.name);
  }

  for (const person of peopleRows) {
    try {
      const buckets = diffFacultyResponsibilities(prevSnap, currentSnap, person.id);

      // Skip faculty with zero net changes across all three buckets.
      if (
        buckets.added.length === 0 &&
        buckets.changed.length === 0 &&
        buckets.removed.length === 0
      ) {
        continue;
      }

      const changesSummary = renderFacultyChangesSummary(buckets, hallNames);

      const result = await sendNotification({
        eventId,
        personId: person.id,
        channel: 'email',
        templateKey: 'program_update',
        triggerType: 'program.version_published',
        triggerEntityType: 'program_version',
        triggerEntityId: data.versionId,
        sendMode: 'automatic',
        idempotencyKey: `notify:program-version:${data.versionId}:${person.id}:email`,
        variables: {
          salutation: person.salutation ?? '',
          fullName: person.fullName,
          eventName,
          versionNo: String(data.versionNo),
          changesSummary,
          addedSessions: buckets.added.map(r => r.sessionId),
          changedSessions: buckets.changed.map(c => c.curr.sessionId),
          removedSessions: buckets.removed.map(r => r.sessionId),
        },
      });

      await handleCascadeNotificationResult({
        eventId,
        cascadeEvent: CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
        payload,
        channel: 'email',
        triggerId: data.versionId,
        targetEntityType: 'notification_log',
        targetEntityId: data.versionId,
        result,
      });
    } catch (error) {
      if (error instanceof CascadeNotificationRetryError) {
        throw error;
      }

      console.error('[cascade:program] faculty diff notification failed:', error);
      captureCascadeError(error, {
        handler: 'program-cascade',
        eventId,
        cascadeEvent: CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      });
    }
  }
}

export function registerProgramCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED, handleProgramVersionPublished);
}
