/**
 * Travel Cascade Handlers
 *
 * When travel records are updated or cancelled:
 *   1. Create/update red flags on accommodation records for the same person
 *   2. Create/update red flags on transport passenger assignments
 *   3. Send notification to delegate (stubbed in Phase 3)
 *
 * Cascade direction: Travel → Accommodation + Transport
 */

import { db } from '@/lib/db';
import { accommodationRecords, transportPassengerAssignments } from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { upsertRedFlag } from '../red-flags';
import { sendNotification } from '@/lib/notifications/send';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { TravelUpdatedPayload, TravelCancelledPayload } from '../events';
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
    console.error('[cascade:travel] notification send failed:', error);
  }
}

// ── Travel Updated Handler ────────────────────────────────────
async function handleTravelUpdated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, actor, payload } = params;
  const data = payload as unknown as TravelUpdatedPayload;

  // 1. Flag accommodation records for this person
  const accomRecords = await db
    .select({ id: accommodationRecords.id })
    .from(accommodationRecords)
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        eq(accommodationRecords.personId, data.personId),
        ne(accommodationRecords.recordStatus, 'cancelled'),
      ),
    );

  for (const accom of accomRecords) {
    const changedFields = Object.keys(data.changeSummary).join(', ');
    await upsertRedFlag({
      eventId,
      flagType: 'travel_change',
      flagDetail: `Travel record updated: ${changedFields} changed`,
      targetEntityType: 'accommodation_record',
      targetEntityId: accom.id,
      sourceEntityType: 'travel_record',
      sourceEntityId: data.travelRecordId,
      sourceChangeSummaryJson: data.changeSummary,
    });
  }

  // 2. Flag transport passenger assignments for this travel record
  const passengerAssignments = await db
    .select({ id: transportPassengerAssignments.id })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
        eq(transportPassengerAssignments.travelRecordId, data.travelRecordId),
        ne(transportPassengerAssignments.assignmentStatus, 'cancelled'),
      ),
    );

  for (const pa of passengerAssignments) {
    const changedFields = Object.keys(data.changeSummary).join(', ');
    await upsertRedFlag({
      eventId,
      flagType: 'travel_change',
      flagDetail: `Travel record updated: ${changedFields} changed — review transport assignment`,
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: pa.id,
      sourceEntityType: 'travel_record',
      sourceEntityId: data.travelRecordId,
      sourceChangeSummaryJson: data.changeSummary,
    });
  }

  // 3. Notify delegate of travel update
  await sendCascadeNotification({
    eventId,
    personId: data.personId,
    channel: 'email',
    templateKey: 'travel_update',
    triggerType: 'travel.updated',
    triggerEntityType: 'travel_record',
    triggerEntityId: data.travelRecordId,
    variables: { changeSummary: data.changeSummary },
    idempotencyKey: `notify:travel-updated:${eventId}:${data.personId}:${data.travelRecordId}:email`,
  });
}

// ── Travel Cancelled Handler ──────────────────────────────────
async function handleTravelCancelled(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, actor, payload } = params;
  const data = payload as unknown as TravelCancelledPayload;

  // 1. High-severity flag on accommodation records
  const accomRecords = await db
    .select({ id: accommodationRecords.id })
    .from(accommodationRecords)
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        eq(accommodationRecords.personId, data.personId),
        ne(accommodationRecords.recordStatus, 'cancelled'),
      ),
    );

  for (const accom of accomRecords) {
    await upsertRedFlag({
      eventId,
      flagType: 'travel_cancelled',
      flagDetail: `Travel record cancelled${data.reason ? ': ' + data.reason : ''} — review accommodation`,
      targetEntityType: 'accommodation_record',
      targetEntityId: accom.id,
      sourceEntityType: 'travel_record',
      sourceEntityId: data.travelRecordId,
    });
  }

  // 2. Flag transport passenger assignments
  const passengerAssignments = await db
    .select({ id: transportPassengerAssignments.id })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
        eq(transportPassengerAssignments.travelRecordId, data.travelRecordId),
        ne(transportPassengerAssignments.assignmentStatus, 'cancelled'),
      ),
    );

  for (const pa of passengerAssignments) {
    await upsertRedFlag({
      eventId,
      flagType: 'travel_cancelled',
      flagDetail: `Travel record cancelled — review and reassign transport`,
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: pa.id,
      sourceEntityType: 'travel_record',
      sourceEntityId: data.travelRecordId,
    });
  }

  // 3. Notify delegate of travel cancellation
  await sendCascadeNotification({
    eventId,
    personId: data.personId,
    channel: 'email',
    templateKey: 'travel_cancelled',
    triggerType: 'travel.cancelled',
    triggerEntityType: 'travel_record',
    triggerEntityId: data.travelRecordId,
    variables: { cancelledAt: data.cancelledAt, reason: data.reason },
    idempotencyKey: `notify:travel-cancelled:${eventId}:${data.personId}:${data.travelRecordId}:email`,
  });
}

// ── Register handlers ─────────────────────────────────────────
export function registerTravelCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, handleTravelUpdated);
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, handleTravelCancelled);
}
