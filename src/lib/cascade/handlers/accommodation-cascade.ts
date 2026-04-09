/**
 * Accommodation Cascade Handlers
 *
 * When accommodation records are updated or cancelled:
 *   1. Create/update red flags on transport passenger assignments
 *   2. If shared room group changed, flag all linked occupants
 *   3. Send notification to delegate (stubbed in Phase 3)
 *
 * Cascade direction: Accommodation → Transport
 */

import { db } from '@/lib/db';
import { accommodationRecords, transportPassengerAssignments } from '@/lib/db/schema';
import { eq, ne, and } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { upsertRedFlag } from '../red-flags';
import { sendNotification } from '@/lib/notifications/send';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { AccommodationUpdatedPayload, AccommodationCancelledPayload } from '../events';
import { people } from '@/lib/db/schema';
import type { NotificationTriggerType } from '@/lib/notifications/types';

/** Resolve person email and phone for notification variables */
async function resolvePersonContact(personId: string): Promise<{
  email: string | null;
  phoneE164: string | null;
  fullName: string | null;
}> {
  const [person] = await db
    .select({ email: people.email, phoneE164: people.phoneE164, fullName: people.fullName })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  return person ?? { email: null, phoneE164: null, fullName: null };
}

/** Send notification from cascade handler — never throws (cascade must not fail on notification) */
async function sendCascadeNotification(params: {
  eventId: string;
  personId: string;
  channel: 'email' | 'whatsapp';
  templateKey: string;
  triggerType: NotificationTriggerType;
  triggerEntityType: string;
  triggerEntityId: string;
  variables: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<void> {
  try {
    const contact = await resolvePersonContact(params.personId);
    await sendNotification({
      eventId: params.eventId,
      personId: params.personId,
      channel: params.channel,
      templateKey: params.templateKey,
      triggerType: params.triggerType,
      triggerEntityType: params.triggerEntityType,
      triggerEntityId: params.triggerEntityId,
      sendMode: 'automatic',
      idempotencyKey: params.idempotencyKey,
      variables: {
        ...params.variables,
        recipientEmail: contact.email,
        recipientPhoneE164: contact.phoneE164,
        recipientName: contact.fullName,
      },
    });
  } catch (error) {
    // Cascade must never fail due to notification failure
    console.error('[cascade:accommodation] notification send failed:', error);
  }
}

// ── Accommodation Updated Handler ─────────────────────────────
async function handleAccommodationUpdated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as AccommodationUpdatedPayload;

  // 1. Flag transport passenger assignments for this person
  const passengerAssignments = await db
    .select({ id: transportPassengerAssignments.id })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
        eq(transportPassengerAssignments.personId, data.personId),
        ne(transportPassengerAssignments.assignmentStatus, 'cancelled'),
      ),
    );

  const changedFields = Object.keys(data.changeSummary).join(', ');
  for (const pa of passengerAssignments) {
    await upsertRedFlag({
      eventId,
      flagType: 'accommodation_change',
      flagDetail: `Accommodation updated: ${changedFields} changed — review transport`,
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: pa.id,
      sourceEntityType: 'accommodation_record',
      sourceEntityId: data.accommodationRecordId,
      sourceChangeSummaryJson: data.changeSummary,
    });
  }

  // 2. If shared room group changed, flag all linked occupants' accommodation records
  if (data.changeSummary.sharedRoomGroup && data.sharedRoomGroup) {
    const linkedOccupants = await db
      .select({ id: accommodationRecords.id, personId: accommodationRecords.personId })
      .from(accommodationRecords)
      .where(
        withEventScope(
          accommodationRecords.eventId,
          eventId,
          eq(accommodationRecords.sharedRoomGroup, data.sharedRoomGroup),
          ne(accommodationRecords.id, data.accommodationRecordId),
          ne(accommodationRecords.recordStatus, 'cancelled'),
        ),
      );

    for (const occupant of linkedOccupants) {
      await upsertRedFlag({
        eventId,
        flagType: 'shared_room_affected',
        flagDetail: `Room group "${data.sharedRoomGroup}" changed — co-occupant's accommodation was modified`,
        targetEntityType: 'accommodation_record',
        targetEntityId: occupant.id,
        sourceEntityType: 'accommodation_record',
        sourceEntityId: data.accommodationRecordId,
      });
    }
  }

  // 3. Notify delegate of accommodation update
  await sendCascadeNotification({
    eventId,
    personId: data.personId,
    channel: 'email',
    templateKey: 'accommodation_update',
    triggerType: 'accommodation.updated',
    triggerEntityType: 'accommodation_record',
    triggerEntityId: data.accommodationRecordId,
    variables: { changeSummary: data.changeSummary },
    idempotencyKey: `notify:accom-updated:${eventId}:${data.personId}:${data.accommodationRecordId}:email`,
  });
}

// ── Accommodation Cancelled Handler ───────────────────────────
async function handleAccommodationCancelled(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as AccommodationCancelledPayload;

  // Flag transport passenger assignments for this person
  const passengerAssignments = await db
    .select({ id: transportPassengerAssignments.id })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
        eq(transportPassengerAssignments.personId, data.personId),
        ne(transportPassengerAssignments.assignmentStatus, 'cancelled'),
      ),
    );

  for (const pa of passengerAssignments) {
    await upsertRedFlag({
      eventId,
      flagType: 'accommodation_cancelled',
      flagDetail: `Accommodation cancelled${data.reason ? ': ' + data.reason : ''} — review transport`,
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: pa.id,
      sourceEntityType: 'accommodation_record',
      sourceEntityId: data.accommodationRecordId,
    });
  }

  // Notify delegate of accommodation cancellation
  await sendCascadeNotification({
    eventId,
    personId: data.personId,
    channel: 'email',
    templateKey: 'accommodation_cancelled',
    triggerType: 'accommodation.cancelled',
    triggerEntityType: 'accommodation_record',
    triggerEntityId: data.accommodationRecordId,
    variables: { cancelledAt: data.cancelledAt, reason: data.reason },
    idempotencyKey: `notify:accom-cancelled:${eventId}:${data.personId}:${data.accommodationRecordId}:email`,
  });
}

// ── Register handlers ─────────────────────────────────────────
export function registerAccommodationCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, handleAccommodationUpdated);
  onCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, handleAccommodationCancelled);
}
