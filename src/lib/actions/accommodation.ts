'use server';

import { db } from '@/lib/db';
import {
  accommodationRecords,
  travelRecords,
  people,
  eventPeople,
  eventRegistrations,
} from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { writeAudit } from '@/lib/audit/write';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { CASCADE_EVENTS } from '@/lib/cascade/events';
import {
  createAccommodationRecordSchema,
  updateAccommodationRecordSchema,
  cancelAccommodationRecordSchema,
  accommodationRecordIdSchema,
  ACCOMMODATION_RECORD_TRANSITIONS,
  type AccommodationRecordStatus,
  buildAccommodationChangeSummary,
  hasAccomCascadeTriggerChanges,
} from '@/lib/validations/accommodation';

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

async function assertPersonHasActiveTravelRecord(eventId: string, personId: string) {
  const [travelRecord] = await db
    .select({ id: travelRecords.id })
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        eq(travelRecords.personId, personId),
        ne(travelRecords.recordStatus, 'cancelled'),
      ),
    )
    .limit(1);

  if (!travelRecord) {
    throw new Error('Person must have an active travel record before accommodation can be created');
  }
}

// ── Create accommodation record ───────────────────────────────
export async function createAccommodationRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = createAccommodationRecordSchema.parse(input);

  // Verify person exists
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, validated.personId))
    .limit(1);

  if (!person) throw new Error('Person not found');

  await assertRegistrationBelongsToEventPerson(
    eventId,
    validated.personId,
    validated.registrationId || null,
  );
  await assertPersonHasActiveTravelRecord(eventId, validated.personId);

  const [record] = await db
    .insert(accommodationRecords)
    .values({
      eventId,
      personId: validated.personId,
      registrationId: validated.registrationId || null,
      hotelName: validated.hotelName,
      hotelAddress: validated.hotelAddress || null,
      hotelCity: validated.hotelCity || null,
      googleMapsUrl: validated.googleMapsUrl || null,
      roomType: validated.roomType || null,
      roomNumber: validated.roomNumber || null,
      sharedRoomGroup: validated.sharedRoomGroup || null,
      checkInDate: new Date(validated.checkInDate),
      checkOutDate: new Date(validated.checkOutDate),
      bookingReference: validated.bookingReference || null,
      attachmentUrl: validated.attachmentUrl || null,
      specialRequests: validated.specialRequests || null,
      notes: validated.notes || null,
      recordStatus: 'draft',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  // Auto-upsert event_people junction
  await db
    .insert(eventPeople)
    .values({ eventId, personId: validated.personId, source: 'accommodation' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  await writeAudit({
    actorUserId: userId,
    eventId,
    action: 'create',
    resource: 'accommodation',
    resourceId: record.id,
    meta: {
      personId: record.personId,
      registrationId: record.registrationId,
      hotelName: record.hotelName,
      recordStatus: record.recordStatus,
    },
  });

  await emitCascadeEvent(
    CASCADE_EVENTS.ACCOMMODATION_CREATED,
    eventId,
    { type: 'user', id: userId },
      {
        accommodationRecordId: record.id,
        personId: record.personId,
        registrationId: record.registrationId,
        hotelName: record.hotelName,
        checkInDate: new Date(record.checkInDate ?? validated.checkInDate).toISOString(),
        checkOutDate: new Date(record.checkOutDate ?? validated.checkOutDate).toISOString(),
        googleMapsUrl: record.googleMapsUrl,
      },
    );

  revalidatePath(`/events/${eventId}/accommodation`);
  return record;
}

// ── Update accommodation record ───────────────────────────────
export async function updateAccommodationRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = updateAccommodationRecordSchema.parse(input);
  const { accommodationRecordId, ...fields } = validated;

  const [existing] = await db
    .select()
    .from(accommodationRecords)
    .where(withEventScope(accommodationRecords.eventId, eventId, eq(accommodationRecords.id, accommodationRecordId)))
    .limit(1);

  if (!existing) throw new Error('Accommodation record not found');
  if (existing.recordStatus === 'cancelled') throw new Error('Cannot update a cancelled accommodation record');

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fields.hotelName !== undefined) updateData.hotelName = fields.hotelName;
  if (fields.hotelAddress !== undefined) updateData.hotelAddress = fields.hotelAddress || null;
  if (fields.hotelCity !== undefined) updateData.hotelCity = fields.hotelCity || null;
  if (fields.googleMapsUrl !== undefined) updateData.googleMapsUrl = fields.googleMapsUrl || null;
  if (fields.roomType !== undefined) updateData.roomType = fields.roomType || null;
  if (fields.roomNumber !== undefined) updateData.roomNumber = fields.roomNumber || null;
  if (fields.sharedRoomGroup !== undefined) updateData.sharedRoomGroup = fields.sharedRoomGroup || null;
  if (fields.checkInDate !== undefined) updateData.checkInDate = new Date(fields.checkInDate);
  if (fields.checkOutDate !== undefined) updateData.checkOutDate = new Date(fields.checkOutDate);
  if (fields.bookingReference !== undefined) updateData.bookingReference = fields.bookingReference || null;
  if (fields.attachmentUrl !== undefined) updateData.attachmentUrl = fields.attachmentUrl || null;
  if (fields.specialRequests !== undefined) updateData.specialRequests = fields.specialRequests || null;
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  // Mark as changed if previously confirmed/sent
  if (existing.recordStatus === 'confirmed' || existing.recordStatus === 'sent') {
    updateData.recordStatus = 'changed';
  }

  const updateFilters = [
    eq(accommodationRecords.id, accommodationRecordId),
    eq(accommodationRecords.eventId, eventId),
    ne(accommodationRecords.recordStatus, 'cancelled'),
  ];

  if (existing.updatedAt) {
    updateFilters.push(eq(accommodationRecords.updatedAt, existing.updatedAt));
  }

  const [updated] = await db
    .update(accommodationRecords)
    .set(updateData)
    .where(and(...updateFilters))
    .returning();

  if (!updated) {
    throw new Error('Accommodation record changed. Refresh and try again.');
  }

  const changeSummary = buildAccommodationChangeSummary(existing, updated);

  await writeAudit({
    actorUserId: userId,
    eventId,
    action: 'update',
    resource: 'accommodation',
    resourceId: updated.id,
    meta: {
      personId: updated.personId,
      previousStatus: existing.recordStatus,
      currentStatus: updated.recordStatus,
      changeSummary,
    },
  });

  if (hasAccomCascadeTriggerChanges(existing, updated)) {
    await emitCascadeEvent(
      CASCADE_EVENTS.ACCOMMODATION_UPDATED,
      eventId,
      { type: 'user', id: userId },
      {
        accommodationRecordId: updated.id,
        personId: updated.personId,
        previous: existing,
        current: updated,
        changeSummary,
        sharedRoomGroup: updated.sharedRoomGroup,
      },
    );
  }

  revalidatePath(`/events/${eventId}/accommodation`);

  return { record: updated, previous: existing };
}

// ── Cancel accommodation record (soft cancel) ─────────────────
export async function cancelAccommodationRecord(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = cancelAccommodationRecordSchema.parse(input);

  const [existing] = await db
    .select()
    .from(accommodationRecords)
    .where(withEventScope(accommodationRecords.eventId, eventId, eq(accommodationRecords.id, validated.accommodationRecordId)))
    .limit(1);

  if (!existing) throw new Error('Accommodation record not found');

  const currentStatus = existing.recordStatus as AccommodationRecordStatus;
  const allowed = ACCOMMODATION_RECORD_TRANSITIONS[currentStatus];

  if (!allowed.includes('cancelled')) {
    throw new Error(`Cannot cancel an accommodation record in "${currentStatus}" status`);
  }

  const cancelFilters = [
    eq(accommodationRecords.id, validated.accommodationRecordId),
    eq(accommodationRecords.eventId, eventId),
    ne(accommodationRecords.recordStatus, 'cancelled'),
  ];

  if (existing.updatedAt) {
    cancelFilters.push(eq(accommodationRecords.updatedAt, existing.updatedAt));
  }

  const [cancelled] = await db
    .update(accommodationRecords)
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
    throw new Error('Accommodation record changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId,
    action: 'delete',
    resource: 'accommodation',
    resourceId: cancelled.id,
    meta: {
      personId: cancelled.personId,
      previousStatus: existing.recordStatus,
      currentStatus: cancelled.recordStatus,
      reason: validated.reason || null,
    },
  });

  await emitCascadeEvent(
    CASCADE_EVENTS.ACCOMMODATION_CANCELLED,
    eventId,
    { type: 'user', id: userId },
    {
      accommodationRecordId: cancelled.id,
      personId: cancelled.personId,
      cancelledAt: cancelled.cancelledAt?.toISOString() ?? new Date().toISOString(),
      reason: validated.reason || null,
    },
  );

  revalidatePath(`/events/${eventId}/accommodation`);
  return cancelled;
}

// ── List accommodation records for an event ───────────────────
export async function getEventAccommodationRecords(eventId: string) {
  await assertEventAccess(eventId);

  const rows = await db
    .select({
      id: accommodationRecords.id,
      eventId: accommodationRecords.eventId,
      personId: accommodationRecords.personId,
      hotelName: accommodationRecords.hotelName,
      hotelCity: accommodationRecords.hotelCity,
      roomType: accommodationRecords.roomType,
      roomNumber: accommodationRecords.roomNumber,
      sharedRoomGroup: accommodationRecords.sharedRoomGroup,
      checkInDate: accommodationRecords.checkInDate,
      checkOutDate: accommodationRecords.checkOutDate,
      recordStatus: accommodationRecords.recordStatus,
      cancelledAt: accommodationRecords.cancelledAt,
      createdAt: accommodationRecords.createdAt,
      personName: people.fullName,
      personEmail: people.email,
      personPhone: people.phoneE164,
    })
    .from(accommodationRecords)
    .innerJoin(people, eq(accommodationRecords.personId, people.id))
    .where(eq(accommodationRecords.eventId, eventId))
    .orderBy(desc(accommodationRecords.createdAt));

  return rows;
}

// ── Get single accommodation record ───────────────────────────
export async function getAccommodationRecord(eventId: string, accommodationRecordId: string) {
  await assertEventAccess(eventId);
  accommodationRecordIdSchema.parse(accommodationRecordId);

  const [record] = await db
    .select()
    .from(accommodationRecords)
    .where(withEventScope(accommodationRecords.eventId, eventId, eq(accommodationRecords.id, accommodationRecordId)))
    .limit(1);

  if (!record) throw new Error('Accommodation record not found');
  return record;
}

// ── Get people with travel records (for accommodation form picker) ─
export async function getPeopleWithTravelRecords(eventId: string) {
  await assertEventAccess(eventId);

  // Get distinct person IDs that have non-cancelled travel records for this event
  const rows = await db
    .selectDistinctOn([travelRecords.personId], {
      personId: travelRecords.personId,
      personName: people.fullName,
      personEmail: people.email,
      personPhone: people.phoneE164,
    })
    .from(travelRecords)
    .innerJoin(people, eq(travelRecords.personId, people.id))
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        ne(travelRecords.recordStatus, 'cancelled'),
      ),
    )
    .orderBy(travelRecords.personId, people.fullName);

  return rows;
}

// ── Get shared room group members ─────────────────────────────
export async function getSharedRoomGroupMembers(eventId: string, sharedRoomGroup: string) {
  await assertEventAccess(eventId);

  if (!sharedRoomGroup) return [];

  const rows = await db
    .select({
      id: accommodationRecords.id,
      personId: accommodationRecords.personId,
      hotelName: accommodationRecords.hotelName,
      roomNumber: accommodationRecords.roomNumber,
      recordStatus: accommodationRecords.recordStatus,
      personName: people.fullName,
    })
    .from(accommodationRecords)
    .innerJoin(people, eq(accommodationRecords.personId, people.id))
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        eq(accommodationRecords.sharedRoomGroup, sharedRoomGroup),
        ne(accommodationRecords.recordStatus, 'cancelled'),
      ),
    );

  return rows;
}
