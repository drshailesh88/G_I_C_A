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
import { sendNotification } from '@/lib/notifications/stub';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { AccommodationUpdatedPayload, AccommodationCancelledPayload } from '../events';

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

  // 3. Stub notification
  await sendNotification({
    channel: 'email',
    templateKey: 'accommodation_update',
    recipientPersonId: data.personId,
    variables: { changeSummary: data.changeSummary },
    eventId,
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

  // Stub notification
  await sendNotification({
    channel: 'email',
    templateKey: 'accommodation_cancelled',
    recipientPersonId: data.personId,
    variables: { cancelledAt: data.cancelledAt, reason: data.reason },
    eventId,
    idempotencyKey: `notify:accom-cancelled:${eventId}:${data.personId}:${data.accommodationRecordId}:email`,
  });
}

// ── Register handlers ─────────────────────────────────────────
export function registerAccommodationCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, handleAccommodationUpdated);
  onCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, handleAccommodationCancelled);
}
