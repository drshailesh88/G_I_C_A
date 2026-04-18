import { db } from '@/lib/db';
import { accommodationRecords, transportPassengerAssignments, travelRecords } from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { upsertRedFlag } from '../red-flags';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { RegistrationCreatedPayload, RegistrationCancelledPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

export async function handleRegistrationCreated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as RegistrationCreatedPayload;
  const ts = Date.now();

  try {
    const result = await sendNotification({
      eventId,
      personId: data.personId,
      channel: 'email',
      templateKey: 'registration_confirmation',
      triggerType: 'registration.created',
      triggerEntityType: 'registration',
      triggerEntityId: data.registrationId,
      sendMode: 'automatic',
      idempotencyKey: `notify:registration-confirmation:${eventId}:${data.personId}:${data.registrationId}:${ts}:email`,
      variables: { registrationId: data.registrationId },
    });
    await handleCascadeNotificationResult({
      eventId,
      cascadeEvent: 'conference/registration.created',
      payload,
      channel: 'email',
      triggerId: data.registrationId,
      targetEntityType: 'notification_log',
      targetEntityId: data.registrationId,
      result,
    });
  } catch (error) {
    if (error instanceof CascadeNotificationRetryError) {
      throw error;
    }

    console.error('[cascade:registration] confirmation notification failed:', error);
    captureCascadeError(error, {
      handler: 'registration-cascade',
      eventId,
      cascadeEvent: 'registration:confirmation',
    });
  }
}

export async function handleRegistrationCancelled(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as RegistrationCancelledPayload;

  // 1. Flag active travel records for this person
  const activeTravelRecords = await db
    .select({ id: travelRecords.id })
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        eq(travelRecords.personId, data.personId),
        ne(travelRecords.recordStatus, 'cancelled'),
      ),
    );

  for (const travelRecord of activeTravelRecords) {
    await upsertRedFlag({
      eventId,
      flagType: 'registration_cancelled',
      flagDetail: `Registration ${data.registrationId} cancelled — review travel record`,
      targetEntityType: 'travel_record',
      targetEntityId: travelRecord.id,
      sourceEntityType: 'registration',
      sourceEntityId: data.registrationId,
    });
  }

  // 2. Flag active accommodation records for this person
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
      flagType: 'registration_cancelled',
      flagDetail: `Registration ${data.registrationId} cancelled — review accommodation booking`,
      targetEntityType: 'accommodation_record',
      targetEntityId: accom.id,
      sourceEntityType: 'registration',
      sourceEntityId: data.registrationId,
    });
  }

  // 3. Flag active transport passenger assignments for this person
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
      flagType: 'registration_cancelled',
      flagDetail: `Registration ${data.registrationId} cancelled — review transport assignment`,
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: pa.id,
      sourceEntityType: 'registration',
      sourceEntityId: data.registrationId,
    });
  }
}

export function registerRegistrationCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.REGISTRATION_CREATED, handleRegistrationCreated);
  onCascadeEvent(CASCADE_EVENTS.REGISTRATION_CANCELLED, handleRegistrationCancelled);
}
