import { db } from '@/lib/db';
import { people } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { SessionUpdatedPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

export async function handleSessionUpdated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as SessionUpdatedPayload;
  const ts = Date.now();

  if (!data.affectedFacultyIds || data.affectedFacultyIds.length === 0) return;

  const facultyRows = await db
    .select({ id: people.id, email: people.email, fullName: people.fullName })
    .from(people)
    .where(inArray(people.id, data.affectedFacultyIds));

  for (const faculty of facultyRows) {
    try {
      const result = await sendNotification({
        eventId,
        personId: faculty.id,
        channel: 'email',
        templateKey: 'session_update',
        triggerType: 'session.updated',
        triggerEntityType: 'session',
        triggerEntityId: data.sessionId,
        sendMode: 'automatic',
        idempotencyKey: `notify:session-updated:${eventId}:${faculty.id}:${data.sessionId}:${ts}:email`,
        variables: {
          changeSummary: data.changeSummary,
          sessionId: data.sessionId,
        },
      });
      await handleCascadeNotificationResult({
        eventId,
        cascadeEvent: 'conference/session.updated',
        payload,
        channel: 'email',
        triggerId: data.sessionId,
        targetEntityType: 'notification_log',
        targetEntityId: data.sessionId,
        result,
      });
    } catch (error) {
      if (error instanceof CascadeNotificationRetryError) {
        throw error;
      }

      console.error('[cascade:session] faculty notification failed:', error);
      captureCascadeError(error, {
        handler: 'session-cascade',
        eventId,
        cascadeEvent: 'session:update',
      });
    }
  }
}

export function registerSessionCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.SESSION_UPDATED, handleSessionUpdated);
}
