import { db } from '@/lib/db';
import { people, programVersions } from '@/lib/db/schema';
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

type SnapshotAssignment = { personId: string; sessionId: string };
type Snapshot = { assignments?: SnapshotAssignment[] };

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

  const currentSnap = currentVersion.snapshotJson as Snapshot;
  const prevSnap = prevVersion.snapshotJson as Snapshot;

  if (!data.affectedPersonIds || data.affectedPersonIds.length === 0) return;

  const peopleRows = await db
    .select({ id: people.id, email: people.email, fullName: people.fullName })
    .from(people)
    .where(inArray(people.id, data.affectedPersonIds));

  for (const person of peopleRows) {
    try {
      const currentSessionIds = new Set(
        (currentSnap.assignments ?? [])
          .filter(a => a.personId === person.id)
          .map(a => a.sessionId),
      );
      const prevSessionIds = new Set(
        (prevSnap.assignments ?? [])
          .filter(a => a.personId === person.id)
          .map(a => a.sessionId),
      );

      const addedSessions = [...currentSessionIds].filter(id => !prevSessionIds.has(id));
      const removedSessions = [...prevSessionIds].filter(id => !currentSessionIds.has(id));

      // Skip faculty with zero net changes
      if (addedSessions.length === 0 && removedSessions.length === 0) continue;

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
          versionId: data.versionId,
          versionNo: data.versionNo,
          addedSessions,
          removedSessions,
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
