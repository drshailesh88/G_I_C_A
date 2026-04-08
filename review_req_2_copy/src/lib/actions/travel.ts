'use server';

import { db } from '@/lib/db';
import { travelRecords, people, eventPeople } from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelRecordIdSchema,
  TRAVEL_RECORD_TRANSITIONS,
  type TravelRecordStatus,
} from '@/lib/validations/travel';

// ── Create travel record ──────────────────────────────────────
export async function createTravelRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = createTravelRecordSchema.parse(input);

  // Verify person exists
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, validated.personId))
    .limit(1);

  if (!person) throw new Error('Person not found');

  const [record] = await db
    .insert(travelRecords)
    .values({
      eventId,
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
    .values({ eventId, personId: validated.personId, source: 'travel' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  revalidatePath(`/events/${eventId}/travel`);
  return record;
}

// ── Update travel record ──────────────────────────────────────
export async function updateTravelRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = updateTravelRecordSchema.parse(input);
  const { travelRecordId, ...fields } = validated;

  // Fetch existing record — ensure it belongs to this event
  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, eventId, eq(travelRecords.id, travelRecordId)))
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

  const [updated] = await db
    .update(travelRecords)
    .set(updateData)
    .where(eq(travelRecords.id, travelRecordId))
    .returning();

  revalidatePath(`/events/${eventId}/travel`);

  return { record: updated, previous: existing };
}

// ── Cancel travel record (soft cancel) ────────────────────────
export async function cancelTravelRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = cancelTravelRecordSchema.parse(input);

  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, eventId, eq(travelRecords.id, validated.travelRecordId)))
    .limit(1);

  if (!existing) throw new Error('Travel record not found');

  const currentStatus = existing.recordStatus as TravelRecordStatus;
  const allowed = TRAVEL_RECORD_TRANSITIONS[currentStatus];

  if (!allowed.includes('cancelled')) {
    throw new Error(`Cannot cancel a travel record in "${currentStatus}" status`);
  }

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
    .where(eq(travelRecords.id, validated.travelRecordId))
    .returning();

  revalidatePath(`/events/${eventId}/travel`);

  return cancelled;
}

// ── Update travel record status ───────────────────────────────
export async function updateTravelRecordStatus(
  eventId: string,
  travelRecordId: string,
  newStatus: TravelRecordStatus,
) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  travelRecordIdSchema.parse(travelRecordId);

  const [existing] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, eventId, eq(travelRecords.id, travelRecordId)))
    .limit(1);

  if (!existing) throw new Error('Travel record not found');

  const currentStatus = existing.recordStatus as TravelRecordStatus;
  const allowed = TRAVEL_RECORD_TRANSITIONS[currentStatus];

  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
    );
  }

  const updateData: Record<string, unknown> = {
    recordStatus: newStatus,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (newStatus === 'cancelled') {
    updateData.cancelledAt = new Date();
  }

  const [updated] = await db
    .update(travelRecords)
    .set(updateData)
    .where(eq(travelRecords.id, travelRecordId))
    .returning();

  revalidatePath(`/events/${eventId}/travel`);
  return updated;
}

// ── List travel records for an event ──────────────────────────
export async function getEventTravelRecords(eventId: string) {
  const { userId } = await assertEventAccess(eventId);

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
    .where(eq(travelRecords.eventId, eventId))
    .orderBy(desc(travelRecords.createdAt));

  return rows;
}

// ── Get single travel record ──────────────────────────────────
export async function getTravelRecord(eventId: string, travelRecordId: string) {
  const { userId } = await assertEventAccess(eventId);
  travelRecordIdSchema.parse(travelRecordId);

  const [record] = await db
    .select()
    .from(travelRecords)
    .where(withEventScope(travelRecords.eventId, eventId, eq(travelRecords.id, travelRecordId)))
    .limit(1);

  if (!record) throw new Error('Travel record not found');
  return record;
}

// ── Get travel records for a specific person in an event ──────
export async function getPersonTravelRecords(eventId: string, personId: string) {
  const { userId } = await assertEventAccess(eventId);

  const rows = await db
    .select()
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        eq(travelRecords.personId, personId),
      ),
    )
    .orderBy(desc(travelRecords.departureAtUtc));

  return rows;
}
