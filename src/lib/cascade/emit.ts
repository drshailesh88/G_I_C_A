/**
 * Cascade Event Emitter
 *
 * Production: sends events through Inngest for durable, retried execution.
 * Test: runs handlers synchronously via in-memory registry (for unit tests).
 *
 * Usage: await emitCascadeEvent('conference/travel.updated', eventId, actor, payload)
 */

import type { CascadeActor, CascadeEventName } from './events';
import { CASCADE_EVENTS } from './events';
import { inngest } from '../inngest/client';
import { captureCascadeError } from '../sentry';
import { captureInngestEvent } from '../inngest/captured-events';
import { attachVariablesSnapshotIfNeeded } from './variables-snapshot';
import { z } from 'zod';

type CascadeHandler = (params: {
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
}) => Promise<void>;

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable().optional();
const recordSchema = z.record(z.unknown());
const actorSchema = z.object({
  type: z.enum(['user', 'system']),
  id: nonEmptyStringSchema,
});
const changeSummarySchema = z.record(z.unknown());
const payloadBaseSchema = z.object({
  variables: recordSchema.optional(),
}).passthrough();
const savedTravelPayloadSchema = payloadBaseSchema.extend({
  travelRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  direction: nonEmptyStringSchema,
  travelMode: nonEmptyStringSchema,
  fromCity: nonEmptyStringSchema,
  toCity: nonEmptyStringSchema,
  departureAtUtc: nullableStringSchema,
  arrivalAtUtc: nullableStringSchema,
});
const updatedTravelPayloadSchema = payloadBaseSchema.extend({
  travelRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  changeSummary: changeSummarySchema,
});
const cancelledTravelPayloadSchema = payloadBaseSchema.extend({
  travelRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  cancelledAt: z.string().optional(),
  reason: z.string().nullable().optional(),
});
const savedAccommodationPayloadSchema = payloadBaseSchema.extend({
  accommodationRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  hotelName: nonEmptyStringSchema,
  checkInDate: nonEmptyStringSchema,
  checkOutDate: nonEmptyStringSchema,
  googleMapsUrl: nullableStringSchema,
});
const updatedAccommodationPayloadSchema = payloadBaseSchema.extend({
  accommodationRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  changeSummary: changeSummarySchema,
  sharedRoomGroup: z.string().nullable().optional(),
});
const cancelledAccommodationPayloadSchema = payloadBaseSchema.extend({
  accommodationRecordId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  cancelledAt: z.string().optional(),
  reason: z.string().nullable().optional(),
});
const registrationCreatedPayloadSchema = payloadBaseSchema.extend({
  registrationId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  eventId: nonEmptyStringSchema,
});
const sessionUpdatedPayloadSchema = payloadBaseSchema.extend({
  sessionId: nonEmptyStringSchema,
  changeSummary: changeSummarySchema,
  affectedFacultyIds: z.array(nonEmptyStringSchema),
});
const certificateGeneratedPayloadSchema = payloadBaseSchema.extend({
  certificateId: nonEmptyStringSchema,
  personId: nonEmptyStringSchema,
  templateId: nonEmptyStringSchema,
});

const productionPayloadSchemas = {
  [CASCADE_EVENTS.TRAVEL_CREATED]: savedTravelPayloadSchema,
  [CASCADE_EVENTS.TRAVEL_SAVED]: savedTravelPayloadSchema,
  [CASCADE_EVENTS.TRAVEL_UPDATED]: updatedTravelPayloadSchema,
  [CASCADE_EVENTS.TRAVEL_CANCELLED]: cancelledTravelPayloadSchema,
  [CASCADE_EVENTS.ACCOMMODATION_CREATED]: savedAccommodationPayloadSchema,
  [CASCADE_EVENTS.ACCOMMODATION_SAVED]: savedAccommodationPayloadSchema,
  [CASCADE_EVENTS.ACCOMMODATION_UPDATED]: updatedAccommodationPayloadSchema,
  [CASCADE_EVENTS.ACCOMMODATION_CANCELLED]: cancelledAccommodationPayloadSchema,
  [CASCADE_EVENTS.REGISTRATION_CREATED]: registrationCreatedPayloadSchema,
  [CASCADE_EVENTS.SESSION_UPDATED]: sessionUpdatedPayloadSchema,
  [CASCADE_EVENTS.CERTIFICATE_GENERATED]: certificateGeneratedPayloadSchema,
} satisfies Record<CascadeEventName, z.ZodTypeAny>;

function validateProductionEmitInput(
  eventName: CascadeEventName,
  eventId: string,
  actor: CascadeActor,
  payload: Record<string, unknown>,
): {
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
} {
  const envelopeResult = z.object({
    eventId: nonEmptyStringSchema,
    actor: actorSchema,
    payload: recordSchema,
  }).safeParse({ eventId, actor, payload });

  if (!envelopeResult.success) {
    throw new Error(
      `Cascade payload validation failed for ${eventName}: ${envelopeResult.error.message}`,
    );
  }

  const payloadResult = productionPayloadSchemas[eventName].safeParse(envelopeResult.data.payload);
  if (!payloadResult.success) {
    throw new Error(
      `Cascade payload validation failed for ${eventName}: ${payloadResult.error.message}`,
    );
  }

  const envelope = envelopeResult.data;
  const parsedPayload = payloadResult.data as Record<string, unknown>;

  if (
    eventName === CASCADE_EVENTS.REGISTRATION_CREATED &&
    typeof parsedPayload.eventId === 'string' &&
    parsedPayload.eventId !== envelope.eventId
  ) {
    throw new Error(
      `Cascade payload validation failed for ${eventName}: payload.eventId must match the envelope eventId`,
    );
  }

  return {
    eventId: envelope.eventId,
    actor: envelope.actor,
    payload: parsedPayload,
  };
}

async function attachVariablesSnapshotSafely(
  eventName: CascadeEventName,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    return await attachVariablesSnapshotIfNeeded(eventName, payload);
  } catch (err) {
    console.error(`[cascade] Variables snapshot error for ${eventName}:`, err);
    captureCascadeError(err, {
      handler: 'cascade-emit-variables-snapshot',
      eventId,
      cascadeEvent: eventName,
    });
    return payload;
  }
}

// In-memory registry — used only in test mode
const handlerRegistry = new Map<string, CascadeHandler[]>();

/** Whether to use in-memory handlers (test mode) vs Inngest (production) */
let useInMemoryMode = false;

/** Enable in-memory mode for tests */
export function enableTestMode() {
  useInMemoryMode = true;
}

/** Disable in-memory mode (back to Inngest) */
export function disableTestMode() {
  useInMemoryMode = false;
}

/** Register a handler for a cascade event (test mode only — in production, Inngest functions handle events) */
export function onCascadeEvent(eventName: CascadeEventName, handler: CascadeHandler) {
  const existing = handlerRegistry.get(eventName) ?? [];
  existing.push(handler);
  handlerRegistry.set(eventName, existing);
}

/** Emit a cascade event — sends to Inngest in production, runs in-memory in tests */
export async function emitCascadeEvent(
  eventName: CascadeEventName,
  eventId: string,
  actor: CascadeActor,
  payload: Record<string, unknown>,
): Promise<{ handlersRun: number; errors: Error[] }> {
  // Test mode: run in-memory handlers synchronously (existing behavior)
  if (useInMemoryMode) {
    const handlers = handlerRegistry.get(eventName) ?? [];
    const errors: Error[] = [];

    for (const handler of handlers) {
      try {
        await handler({ eventId, actor, payload });
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        console.error(`[cascade] Handler error for ${eventName}:`, err);
      }
    }

    return { handlersRun: handlers.length, errors };
  }

  // Production mode: send event to Inngest
  try {
    const validated = validateProductionEmitInput(eventName, eventId, actor, payload);
    const inngestEventId = crypto.randomUUID();
    const eventData = {
      eventId: validated.eventId,
      actor: validated.actor,
      payload: await attachVariablesSnapshotSafely(
        eventName,
        validated.eventId,
        validated.payload,
      ),
    };
    await inngest.send({
      id: inngestEventId,
      name: eventName,
      data: eventData,
    });
    await captureInngestEvent({ id: inngestEventId, name: eventName, data: eventData as Record<string, unknown> }).catch(() => {});
    return { handlersRun: 1, errors: [] };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[cascade] Emit error for ${eventName}:`, err);
    captureCascadeError(err, {
      handler: 'inngest-emit',
      eventId,
      cascadeEvent: eventName,
    });
    return { handlersRun: 0, errors: [error] };
  }
}

/** Clear all registered handlers (for testing) */
export function clearCascadeHandlers() {
  handlerRegistry.clear();
}

/** Get registered handler count for an event (for testing) */
export function getHandlerCount(eventName: CascadeEventName): number {
  return (handlerRegistry.get(eventName) ?? []).length;
}
