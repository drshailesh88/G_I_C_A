/**
 * Travel Cascade Handlers
 *
 * When travel records are updated or cancelled:
 *   1. Create/update red flags on accommodation records for the same person
 *   2. Create/update red flags on transport passenger assignments
 *   3. Send notification to delegate via email + WhatsApp
 *
 * Cascade direction: Travel → Accommodation + Transport
 */

import { db } from '@/lib/db';
import {
  accommodationRecords,
  events,
  people,
  transportPassengerAssignments,
  travelRecords,
} from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { upsertRedFlag } from '../red-flags';
import { sendNotification } from '@/lib/notifications/send';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { TravelSavedPayload, TravelUpdatedPayload, TravelCancelledPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import type { NotificationTriggerType } from '@/lib/notifications/types';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

type TravelCascadeContext = {
  personId: string;
  eventName: string | null;
  contact: {
    email: string | null;
    phoneE164: string | null;
    fullName: string | null;
  } | null;
};

/** Resolve person email and phone for notification variables */
async function resolvePersonContact(personId: string): Promise<TravelCascadeContext['contact']> {
  const [person] = await db
    .select({ email: people.email, phoneE164: people.phoneE164, fullName: people.fullName })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  return person ?? null;
}

async function resolveEventName(eventId: string): Promise<string | null> {
  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return event?.name ?? null;
}

async function resolveTravelCascadeContext(
  eventId: string,
  travelRecordId: string,
): Promise<TravelCascadeContext | null> {
  const [travelRecord] = await db
    .select({ personId: travelRecords.personId })
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        eq(travelRecords.id, travelRecordId),
      ),
    )
    .limit(1);

  if (!travelRecord) {
    return null;
  }

  const [contact, eventName] = await Promise.all([
    resolvePersonContact(travelRecord.personId),
    resolveEventName(eventId),
  ]);

  return {
    personId: travelRecord.personId,
    eventName,
    contact,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function buildTravelNotificationVariables(params: {
  eventId: string;
  travelRecordId: string;
  snapshotVars?: unknown;
  domainVars: Record<string, unknown>;
}): Promise<(TravelCascadeContext & { variables: Record<string, unknown> }) | null> {
  const trustedContext = await resolveTravelCascadeContext(params.eventId, params.travelRecordId);

  if (!trustedContext) {
    return null;
  }

  const snapshotVars = asRecord(params.snapshotVars);
  const trustedFullName =
    trustedContext.contact?.fullName ??
    getOptionalString(snapshotVars.fullName) ??
    getOptionalString(snapshotVars.recipientName);

  return {
    ...trustedContext,
    variables: {
      ...snapshotVars,
      ...params.domainVars,
      recipientEmail: trustedContext.contact?.email ?? null,
      recipientPhoneE164: trustedContext.contact?.phoneE164 ?? null,
      recipientName: trustedFullName,
      fullName: trustedFullName,
      eventName: trustedContext.eventName,
    },
  };
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
  cascadeEvent: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    if (params.channel === 'email' && !params.variables.recipientEmail) {
      console.warn('[cascade:travel] skipping email notification — person has no email', {
        personId: params.personId,
        eventId: params.eventId,
      });
      return;
    }
    if (params.channel === 'whatsapp' && !params.variables.recipientPhoneE164) {
      console.warn('[cascade:travel] skipping WhatsApp notification — person has no phone', {
        personId: params.personId,
        eventId: params.eventId,
      });
      return;
    }

    const result = await sendNotification({
      eventId: params.eventId,
      personId: params.personId,
      channel: params.channel,
      templateKey: params.templateKey,
      triggerType: params.triggerType,
      triggerEntityType: params.triggerEntityType,
      triggerEntityId: params.triggerEntityId,
      sendMode: 'automatic',
      idempotencyKey: params.idempotencyKey,
      variables: params.variables,
    });
    await handleCascadeNotificationResult({
      eventId: params.eventId,
      cascadeEvent: params.cascadeEvent,
      payload: params.payload,
      channel: params.channel,
      triggerId: params.triggerEntityId,
      targetEntityType: 'notification_log',
      targetEntityId: params.triggerEntityId,
      result,
    });
  } catch (error) {
    if (error instanceof CascadeNotificationRetryError) {
      throw error;
    }

    console.error('[cascade:travel] notification send failed:', error);
    captureCascadeError(error, {
      handler: 'travel-cascade',
      eventId: params.eventId,
      cascadeEvent: `travel:${params.templateKey}`,
    });
  }
}

// ── Travel Saved (Created) Handler ───────────────────────────
export async function handleTravelSaved(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as TravelSavedPayload;
  const notificationContext = await buildTravelNotificationVariables({
    eventId,
    travelRecordId: data.travelRecordId,
    snapshotVars: payload.variables,
    domainVars: {
      direction: data.direction,
      travelMode: data.travelMode,
      fromCity: data.fromCity,
      toCity: data.toCity,
      departureAtUtc: data.departureAtUtc,
      arrivalAtUtc: data.arrivalAtUtc,
    },
  });

  if (!notificationContext) {
    console.warn('[cascade:travel] skipping saved cascade — travel record not found in event scope', {
      eventId,
      travelRecordId: data.travelRecordId,
    });
    return;
  }

  const ts = Date.now();

  for (const channel of ['email', 'whatsapp'] as const) {
    await sendCascadeNotification({
      eventId,
      personId: notificationContext.personId,
      channel,
      templateKey: 'travel_itinerary',
      triggerType: 'travel.saved',
      triggerEntityType: 'travel_record',
      triggerEntityId: data.travelRecordId,
      variables: notificationContext.variables,
      idempotencyKey: `notify:travel-itinerary:${eventId}:${notificationContext.personId}:${data.travelRecordId}:${ts}:${channel}`,
      cascadeEvent: 'conference/travel.saved',
      payload,
    });
  }
}

// ── Travel Updated Handler ────────────────────────────────────
export async function handleTravelUpdated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as TravelUpdatedPayload;
  const notificationContext = await buildTravelNotificationVariables({
    eventId,
    travelRecordId: data.travelRecordId,
    snapshotVars: payload.variables,
    domainVars: {
      changeSummary: data.changeSummary,
    },
  });

  if (!notificationContext) {
    console.warn('[cascade:travel] skipping update cascade — travel record not found in event scope', {
      eventId,
      travelRecordId: data.travelRecordId,
    });
    return;
  }

  // 1. Flag accommodation records for this person
  const accomRecords = await db
    .select({ id: accommodationRecords.id })
    .from(accommodationRecords)
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        eq(accommodationRecords.personId, notificationContext.personId),
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

  // 3. Notify delegate of travel update (email + WhatsApp)
  const ts = Date.now();
  for (const channel of ['email', 'whatsapp'] as const) {
    await sendCascadeNotification({
      eventId,
      personId: notificationContext.personId,
      channel,
      templateKey: 'travel_update',
      triggerType: 'travel.updated',
      triggerEntityType: 'travel_record',
      triggerEntityId: data.travelRecordId,
      variables: notificationContext.variables,
      idempotencyKey: `notify:travel-updated:${eventId}:${notificationContext.personId}:${data.travelRecordId}:${ts}:${channel}`,
      cascadeEvent: 'conference/travel.updated',
      payload,
    });
  }
}

// ── Travel Cancelled Handler ──────────────────────────────────
export async function handleTravelCancelled(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as TravelCancelledPayload;
  const notificationContext = await buildTravelNotificationVariables({
    eventId,
    travelRecordId: data.travelRecordId,
    snapshotVars: payload.variables,
    domainVars: {
      cancelledAt: data.cancelledAt,
      reason: data.reason,
    },
  });

  if (!notificationContext) {
    console.warn('[cascade:travel] skipping cancelled cascade — travel record not found in event scope', {
      eventId,
      travelRecordId: data.travelRecordId,
    });
    return;
  }

  // 1. High-severity flag on accommodation records
  const accomRecords = await db
    .select({ id: accommodationRecords.id })
    .from(accommodationRecords)
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        eq(accommodationRecords.personId, notificationContext.personId),
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

  // 3. Notify delegate of travel cancellation (email + WhatsApp)
  const ts = Date.now();
  for (const channel of ['email', 'whatsapp'] as const) {
    await sendCascadeNotification({
      eventId,
      personId: notificationContext.personId,
      channel,
      templateKey: 'travel_cancelled',
      triggerType: 'travel.cancelled',
      triggerEntityType: 'travel_record',
      triggerEntityId: data.travelRecordId,
      variables: notificationContext.variables,
      idempotencyKey: `notify:travel-cancelled:${eventId}:${notificationContext.personId}:${data.travelRecordId}:${ts}:${channel}`,
      cascadeEvent: 'conference/travel.cancelled',
      payload,
    });
  }
}

// ── Register handlers ─────────────────────────────────────────
export function registerTravelCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_SAVED, handleTravelSaved);
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, handleTravelUpdated);
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, handleTravelCancelled);
}
