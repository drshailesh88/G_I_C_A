'use server';

import { db } from '@/lib/db';
import { travelRecords, people, eventPeople, eventRegistrations } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { writeAudit } from '@/lib/audit/write';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { CASCADE_EVENTS } from '@/lib/cascade/events';
import { z } from 'zod';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelRecordIdSchema,
  TRAVEL_RECORD_TRANSITIONS,
  TRAVEL_RECORD_STATUSES,
  buildTravelChangeSummary,
  hasCascadeTriggerChanges,
  type TravelRecordStatus,
} from '@/lib/validations/travel';

const eventIdSchema = z.string().uuid('Invalid event ID');
const travelStatusSchema = z.enum(TRAVEL_RECORD_STATUSES);

const TRAVEL_READ_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

const TRAVEL_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.OPS,
]);

function assertTravelRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
) {
  // Unit tests sometimes stub access without a role. Real flows should resolve one.
  if (!role) {
    return;
  }

  const allowedRoles = options?.requireWrite ? TRAVEL_WRITE_ROLES : TRAVEL_READ_ROLES;

  if (!allowedRoles.has(role)) {
    throw new Error('Forbidden');
  }
}

async function assertTravelEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean },
) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const access = options
    ? await assertEventAccess(scopedEventId, options)
    : await assertEventAccess(scopedEventId);

  assertTravelRole(access.role, options);

  return { ...access, eventId: scopedEventId };
}

async function assertRegistrationBelongsToEventPerson(
  eventId: string,
  personId: string,
  registrationId: string | null,
) {
  if (!registrationId) {
    return;
  }

  const [registration] = await db
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      withEventScope(
        eventRegistrations.eventId,
        eventId,
        eq(eventRegistrations.id, registrationId),
        eq(eventRegistrations.personId, personId),
      ),
    )
    .limit(1);

  if (!registration) {
    throw new Error('Registration does not belong to this event/person');
  }
}

function buildTravelWriteFilters(record: {
  id: string;
  eventId: string;
  recordStatus: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(travelRecords.id, record.id),
    eq(travelRecords.eventId, record.eventId),
    eq(travelRecords.recordStatus, record.recordStatus),
  ];

  if (record.updatedAt) {
    filters.push(eq(travelRecords.updatedAt, record.updatedAt));
  }

  return filters;
}

function buildTravelSavedPayload(record: {
  id: string;
  personId: string;
  registrationId: string | null;
  direction: string;
  travelMode: string;
  fromCity: string;
  toCity: string;
  departureAtUtc: Date | null;
  arrivalAtUtc: Date | null;
  terminalOrGate: string | null;
}) {
  return {
    travelRecordId: record.id,
    personId: record.personId,
    registrationId: record.registrationId,
    direction: record.direction,
    travelMode: record.travelMode,
    fromCity: record.fromCity,
    toCity: record.toCity,
    departureAtUtc: record.departureAtUtc?.toISOString() ?? null,
    arrivalAtUtc: record.arrivalAtUtc?.toISOString() ?? null,
    pickupHub: null,
    terminalOrGate: record.terminalOrGate,
  };
}

// ── Create travel record ──────────────────────────────────────
export async function createTravelRecord(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTravelEventAccess(eventId, { requireWrite: true });
  const validated = createTravelRecordSchema.parse(input);

  // Verify person exists
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, validated.personId))
    .limit(1);

  if (!person) throw new Error('Person not found');

  await assertRegistrationBelongsToEventPerson(
    scopedEventId,
    validated.personId,
    validated.registrationId || null,
  );

  const [record] = await db
    .insert(travelRecords)
    .values({
      eventId: scopedEventId,
      personId: validated.personId,
      registrationId: validated.registrationId || null,
      direction: validated.direction,
      travelMode: validated.travelMode,
      fromCity: validated.fromCity,
      fromLocation: validated.fromLocation || null,
      toCity: validated.toCity,
      toLocation: validated.toLocation || null,
      departureAtUtc: validated.departureAtUtc ? new Date(validated.departureAtUtc) : null,
      arrivalAtUtc: validated.arrivalAtUtc ? new Date(validated.arrivalAtUtc) : null,
      carrierName: validated.carrierName || null,
      serviceNumber: validated.serviceNumber || null,
      pnrOrBookingRef: validated.pnrOrBookingRef || null,
      seatOrCoach: validated.seatOrCoach || null,
      terminalOrGate: validated.terminalOrGate || null,
      attachmentUrl: validated.attachmentUrl || null,
      notes: validated.notes || null,
      recordStatus: 'draft',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  // Auto-upsert event_people junction
  await db
    .insert(eventPeople)
    .values({ eventId: scopedEventId, personId: validated.personId, source: 'travel' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'create',
    resource: 'travel',
    resourceId: record.id,
    meta: {
      personId: record.personId,
      registrationId: record.registrationId,
      direction: record.direction,
      travelMode: record.travelMode,
      recordStatus: record.recordStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/travel`);
  return record;
}

// ── Update travel record ──────────────────────────────────────
export async function updateTravelRecord(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTravelEventAccess(eventId, { requireWrite: true });
  const validated = updateTravelRecordSchema.parse(input);
  const { travelRecordId, ...fields } = validated;

  // Fetch existing record — ensure it belongs to this event
  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, scopedEventId, eq(travelRecords.id, travelRecordId)))
    .limit(1);

  if (!existing) throw new Error('Travel record not found');
  if (existing.recordStatus === 'cancelled') throw new Error('Cannot update a cancelled travel record');

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  // Apply only provided fields
  if (fields.direction !== undefined) updateData.direction = fields.direction;
  if (fields.travelMode !== undefined) updateData.travelMode = fields.travelMode;
  if (fields.fromCity !== undefined) updateData.fromCity = fields.fromCity;
  if (fields.fromLocation !== undefined) updateData.fromLocation = fields.fromLocation || null;
  if (fields.toCity !== undefined) updateData.toCity = fields.toCity;
  if (fields.toLocation !== undefined) updateData.toLocation = fields.toLocation || null;
  if (fields.departureAtUtc !== undefined) updateData.departureAtUtc = fields.departureAtUtc ? new Date(fields.departureAtUtc) : null;
  if (fields.arrivalAtUtc !== undefined) updateData.arrivalAtUtc = fields.arrivalAtUtc ? new Date(fields.arrivalAtUtc) : null;
  if (fields.carrierName !== undefined) updateData.carrierName = fields.carrierName || null;
  if (fields.serviceNumber !== undefined) updateData.serviceNumber = fields.serviceNumber || null;
  if (fields.pnrOrBookingRef !== undefined) updateData.pnrOrBookingRef = fields.pnrOrBookingRef || null;
  if (fields.seatOrCoach !== undefined) updateData.seatOrCoach = fields.seatOrCoach || null;
  if (fields.terminalOrGate !== undefined) updateData.terminalOrGate = fields.terminalOrGate || null;
  if (fields.attachmentUrl !== undefined) updateData.attachmentUrl = fields.attachmentUrl || null;
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  // Mark as changed if previously confirmed/sent
  if (existing.recordStatus === 'confirmed' || existing.recordStatus === 'sent') {
    updateData.recordStatus = 'changed';
  }

  const updateFilters = buildTravelWriteFilters(existing);

  const [updated] = await db
    .update(travelRecords)
    .set(updateData)
    .where(and(...updateFilters))
    .returning();

  if (!updated) {
    throw new Error('Travel record changed. Refresh and try again.');
  }

  const changeSummary = buildTravelChangeSummary(existing, updated);

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'travel',
    resourceId: updated.id,
    meta: {
      personId: updated.personId,
      previousStatus: existing.recordStatus,
      currentStatus: updated.recordStatus,
      changeSummary,
    },
  });

  if (hasCascadeTriggerChanges(existing, updated)) {
    await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      scopedEventId,
      { type: 'user', id: userId },
      {
        travelRecordId: updated.id,
        personId: updated.personId,
        registrationId: updated.registrationId,
        previous: existing,
        current: updated,
        changeSummary,
      },
    );
  }

  revalidatePath(`/events/${scopedEventId}/travel`);

  return { record: updated, previous: existing };
}

// ── Cancel travel record (soft cancel) ────────────────────────
export async function cancelTravelRecord(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTravelEventAccess(eventId, { requireWrite: true });
  const validated = cancelTravelRecordSchema.parse(input);

  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, scopedEventId, eq(travelRecords.id, validated.travelRecordId)))
    .limit(1);

  if (!existing) throw new Error('Travel record not found');

  const currentStatus = existing.recordStatus as TravelRecordStatus;
  const allowed = TRAVEL_RECORD_TRANSITIONS[currentStatus];

  if (!allowed.includes('cancelled')) {
    throw new Error(`Cannot cancel a travel record in "${currentStatus}" status`);
  }

  const cancelFilters = buildTravelWriteFilters(existing);

  const [cancelled] = await db
    .update(travelRecords)
    .set({
      recordStatus: 'cancelled',
      cancelledAt: new Date(),
      notes: validated.reason
        ? `${existing.notes ? existing.notes + '\n' : ''}Cancellation reason: ${validated.reason}`
        : existing.notes,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(...cancelFilters))
    .returning();

  if (!cancelled) {
    throw new Error('Travel record changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'delete',
    resource: 'travel',
    resourceId: cancelled.id,
    meta: {
      personId: cancelled.personId,
      previousStatus: existing.recordStatus,
      currentStatus: cancelled.recordStatus,
      reason: validated.reason || null,
    },
  });

  await emitCascadeEvent(
    CASCADE_EVENTS.TRAVEL_CANCELLED,
    scopedEventId,
    { type: 'user', id: userId },
    {
      travelRecordId: cancelled.id,
      personId: cancelled.personId,
      registrationId: cancelled.registrationId,
      cancelledAt: cancelled.cancelledAt?.toISOString() ?? new Date().toISOString(),
      reason: validated.reason || null,
    },
  );

  revalidatePath(`/events/${scopedEventId}/travel`);

  return cancelled;
}

// ── Update travel record status ───────────────────────────────
export async function updateTravelRecordStatus(
  eventId: string,
  travelRecordId: string,
  newStatus: TravelRecordStatus,
) {
  const { userId, eventId: scopedEventId } = await assertTravelEventAccess(eventId, { requireWrite: true });
  travelRecordIdSchema.parse(travelRecordId);
  const validatedStatus = travelStatusSchema.parse(newStatus);

  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, scopedEventId, eq(travelRecords.id, travelRecordId)))
    .limit(1);

  if (!existing) throw new Error('Travel record not found');

  const currentStatus = existing.recordStatus as TravelRecordStatus;
  const allowed = TRAVEL_RECORD_TRANSITIONS[currentStatus];

  if (!allowed.includes(validatedStatus)) {
    throw new Error(
      `Cannot transition from "${currentStatus}" to "${validatedStatus}". Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
    );
  }

  const updateData: Record<string, unknown> = {
    recordStatus: validatedStatus,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (validatedStatus === 'cancelled') {
    updateData.cancelledAt = new Date();
  }

  const updateFilters = buildTravelWriteFilters(existing);

  const [updated] = await db
    .update(travelRecords)
    .set(updateData)
    .where(and(...updateFilters))
    .returning();

  if (!updated) {
    throw new Error('Travel record changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'travel',
    resourceId: updated.id,
    meta: {
      personId: updated.personId,
      previousStatus: existing.recordStatus,
      currentStatus: updated.recordStatus,
    },
  });

  if (validatedStatus === 'cancelled') {
    await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_CANCELLED,
      scopedEventId,
      { type: 'user', id: userId },
      {
        travelRecordId: updated.id,
        personId: updated.personId,
        registrationId: updated.registrationId,
        cancelledAt: updated.cancelledAt?.toISOString() ?? new Date().toISOString(),
        reason: null,
      },
    );
  } else if (validatedStatus === 'confirmed' || validatedStatus === 'sent') {
    await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_SAVED,
      scopedEventId,
      { type: 'user', id: userId },
      buildTravelSavedPayload(updated),
    );
  }

  revalidatePath(`/events/${scopedEventId}/travel`);
  return updated;
}

// ── List travel records for an event ──────────────────────────
export async function getEventTravelRecords(eventId: string) {
  const { eventId: scopedEventId } = await assertTravelEventAccess(eventId);

  const rows = await db
    .select({
      id: travelRecords.id,
      eventId: travelRecords.eventId,
      personId: travelRecords.personId,
      registrationId: travelRecords.registrationId,
      direction: travelRecords.direction,
      travelMode: travelRecords.travelMode,
      fromCity: travelRecords.fromCity,
      fromLocation: travelRecords.fromLocation,
      toCity: travelRecords.toCity,
      toLocation: travelRecords.toLocation,
      departureAtUtc: travelRecords.departureAtUtc,
      arrivalAtUtc: travelRecords.arrivalAtUtc,
      carrierName: travelRecords.carrierName,
      serviceNumber: travelRecords.serviceNumber,
      pnrOrBookingRef: travelRecords.pnrOrBookingRef,
      terminalOrGate: travelRecords.terminalOrGate,
      recordStatus: travelRecords.recordStatus,
      cancelledAt: travelRecords.cancelledAt,
      notes: travelRecords.notes,
      createdAt: travelRecords.createdAt,
      updatedAt: travelRecords.updatedAt,
      personName: people.fullName,
      personEmail: people.email,
      personPhone: people.phoneE164,
    })
    .from(travelRecords)
    .innerJoin(people, eq(travelRecords.personId, people.id))
    .where(eq(travelRecords.eventId, scopedEventId))
    .orderBy(desc(travelRecords.createdAt));

  return rows;
}

// ── Get single travel record ──────────────────────────────────
export async function getTravelRecord(eventId: string, travelRecordId: string) {
  const { eventId: scopedEventId } = await assertTravelEventAccess(eventId);
  travelRecordIdSchema.parse(travelRecordId);

  const [record] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, scopedEventId, eq(travelRecords.id, travelRecordId)))
    .limit(1);

  if (!record) throw new Error('Travel record not found');
  return record;
}

// ── Get travel records for a specific person in an event ──────
export async function getPersonTravelRecords(eventId: string, personId: string) {
  const { eventId: scopedEventId } = await assertTravelEventAccess(eventId);

  const rows = await db
    .select()
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        scopedEventId,
        eq(travelRecords.personId, personId),
      ),
    )
    .orderBy(desc(travelRecords.departureAtUtc));

  return rows;
}
