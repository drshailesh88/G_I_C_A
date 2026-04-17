'use server';

import { db } from '@/lib/db';
import {
  transportBatches,
  vehicleAssignments,
  transportPassengerAssignments,
  travelRecords,
  people,
} from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { writeAudit } from '@/lib/audit/write';
import { ZodError, type ZodType, z } from 'zod';
import {
  createBatchSchema,
  updateBatchSchema,
  createVehicleSchema,
  updateVehicleSchema,
  assignPassengerSchema,
  movePassengerSchema,
  batchIdSchema,
  vehicleIdSchema,
  passengerIdSchema,
  BATCH_TRANSITIONS,
  VEHICLE_TRANSITIONS,
  PASSENGER_TRANSITIONS,
  type BatchStatus,
  type VehicleStatus,
  type PassengerStatus,
} from '@/lib/validations/transport';

const eventIdSchema = z.string().uuid('Invalid event ID');

function parseTransportInput<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(error.issues[0]?.message ?? 'Invalid transport input');
    }
    throw error;
  }
}

async function assertTransportEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean },
) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const access = options
    ? await assertEventAccess(scopedEventId, options)
    : await assertEventAccess(scopedEventId);

  return { ...access, eventId: scopedEventId };
}

async function getScopedBatch(
  eventId: string,
  batchId: string,
) {
  const [batch] = await db
    .select({
      id: transportBatches.id,
      eventId: transportBatches.eventId,
      batchStatus: transportBatches.batchStatus,
      updatedAt: transportBatches.updatedAt,
    })
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, batchId)))
    .limit(1);

  return batch;
}

async function assertBatchExistsForAssignment(
  eventId: string,
  batchId: string,
) {
  const batch = await getScopedBatch(eventId, batchId);

  if (!batch) {
    throw new Error('Transport batch not found');
  }

  if (batch.batchStatus === 'completed' || batch.batchStatus === 'cancelled') {
    throw new Error(`Cannot modify a batch in "${batch.batchStatus}" status`);
  }

  return batch;
}

async function assertTravelRecordBelongsToEventPerson(
  eventId: string,
  personId: string,
  travelRecordId: string,
) {
  const [travelRecord] = await db
    .select({ id: travelRecords.id })
    .from(travelRecords)
    .where(
      withEventScope(
        travelRecords.eventId,
        eventId,
        eq(travelRecords.id, travelRecordId),
        eq(travelRecords.personId, personId),
        ne(travelRecords.recordStatus, 'cancelled'),
      ),
    )
    .limit(1);

  if (!travelRecord) {
    throw new Error('Travel record does not belong to this event/person');
  }
}

async function assertVehicleBelongsToBatch(
  eventId: string,
  batchId: string,
  vehicleAssignmentId: string | null,
) {
  if (!vehicleAssignmentId) {
    return null;
  }

  const [vehicle] = await db
    .select({
      id: vehicleAssignments.id,
      batchId: vehicleAssignments.batchId,
      assignmentStatus: vehicleAssignments.assignmentStatus,
    })
    .from(vehicleAssignments)
    .where(
      withEventScope(
        vehicleAssignments.eventId,
        eventId,
        eq(vehicleAssignments.id, vehicleAssignmentId),
      ),
    )
    .limit(1);

  if (!vehicle) {
    throw new Error('Vehicle assignment not found');
  }

  if (vehicle.batchId !== batchId) {
    throw new Error('Vehicle assignment does not belong to this batch');
  }

  if (vehicle.assignmentStatus === 'completed' || vehicle.assignmentStatus === 'cancelled') {
    throw new Error(`Cannot assign passengers to a vehicle in "${vehicle.assignmentStatus}" status`);
  }

  return vehicle;
}

function buildBatchWriteFilters(batch: {
  id: string;
  eventId: string;
  batchStatus: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(transportBatches.id, batch.id),
    eq(transportBatches.eventId, batch.eventId),
    eq(transportBatches.batchStatus, batch.batchStatus),
  ];

  if (batch.updatedAt) {
    filters.push(eq(transportBatches.updatedAt, batch.updatedAt));
  }

  return filters;
}

function buildVehicleWriteFilters(vehicle: {
  id: string;
  eventId: string;
  assignmentStatus: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(vehicleAssignments.id, vehicle.id),
    eq(vehicleAssignments.eventId, vehicle.eventId),
    eq(vehicleAssignments.assignmentStatus, vehicle.assignmentStatus),
  ];

  if (vehicle.updatedAt) {
    filters.push(eq(vehicleAssignments.updatedAt, vehicle.updatedAt));
  }

  return filters;
}

function buildPassengerWriteFilters(passenger: {
  id: string;
  eventId: string;
  assignmentStatus: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(transportPassengerAssignments.id, passenger.id),
    eq(transportPassengerAssignments.eventId, passenger.eventId),
    eq(transportPassengerAssignments.assignmentStatus, passenger.assignmentStatus),
  ];

  if (passenger.updatedAt) {
    filters.push(eq(transportPassengerAssignments.updatedAt, passenger.updatedAt));
  }

  return filters;
}

// ══════════════════════════════════════════════════════════════
// BATCHES
// ══════════════════════════════════════════════════════════════

export async function createTransportBatch(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  const validated = parseTransportInput(createBatchSchema, input);

  const [batch] = await db
    .insert(transportBatches)
    .values({
      eventId: scopedEventId,
      movementType: validated.movementType,
      batchSource: validated.batchSource,
      serviceDate: new Date(validated.serviceDate),
      timeWindowStart: new Date(validated.timeWindowStart),
      timeWindowEnd: new Date(validated.timeWindowEnd),
      sourceCity: validated.sourceCity,
      pickupHub: validated.pickupHub,
      pickupHubType: validated.pickupHubType,
      dropHub: validated.dropHub,
      dropHubType: validated.dropHubType,
      notes: validated.notes || null,
      batchStatus: 'planned',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'create',
    resource: 'transport_batch',
    resourceId: batch.id,
    meta: {
      movementType: batch.movementType,
      batchSource: batch.batchSource,
      batchStatus: batch.batchStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return batch;
}

export async function updateTransportBatch(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  const validated = parseTransportInput(updateBatchSchema, input);
  const { batchId, ...fields } = validated;

  const existing = await getScopedBatch(scopedEventId, batchId);

  if (!existing) throw new Error('Transport batch not found');
  if (existing.batchStatus === 'completed' || existing.batchStatus === 'cancelled') {
    throw new Error(`Cannot update a batch in "${existing.batchStatus}" status`);
  }

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fields.serviceDate !== undefined) updateData.serviceDate = new Date(fields.serviceDate);
  if (fields.timeWindowStart !== undefined) updateData.timeWindowStart = new Date(fields.timeWindowStart);
  if (fields.timeWindowEnd !== undefined) updateData.timeWindowEnd = new Date(fields.timeWindowEnd);
  if (fields.sourceCity !== undefined) updateData.sourceCity = fields.sourceCity;
  if (fields.pickupHub !== undefined) updateData.pickupHub = fields.pickupHub;
  if (fields.pickupHubType !== undefined) updateData.pickupHubType = fields.pickupHubType;
  if (fields.dropHub !== undefined) updateData.dropHub = fields.dropHub;
  if (fields.dropHubType !== undefined) updateData.dropHubType = fields.dropHubType;
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  const [updated] = await db
    .update(transportBatches)
    .set(updateData)
    .where(and(...buildBatchWriteFilters(existing)))
    .returning();

  if (!updated) {
    throw new Error('Transport batch changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'transport_batch',
    resourceId: updated.id,
    meta: {
      previousStatus: existing.batchStatus,
      currentStatus: updated.batchStatus,
      updatedFields: Object.keys(fields),
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return updated;
}

export async function updateBatchStatus(eventId: string, batchId: string, newStatus: BatchStatus) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(batchIdSchema, batchId);

  const existing = await getScopedBatch(scopedEventId, batchId);

  if (!existing) throw new Error('Transport batch not found');

  const currentStatus = existing.batchStatus as BatchStatus;
  if (!BATCH_TRANSITIONS[currentStatus].includes(newStatus)) {
    throw new Error(
      `Cannot transition batch from "${currentStatus}" to "${newStatus}". Allowed: ${BATCH_TRANSITIONS[currentStatus].join(', ') || 'none (terminal)'}`,
    );
  }

  const [updated] = await db
    .update(transportBatches)
    .set({ batchStatus: newStatus, updatedBy: userId, updatedAt: new Date() })
    .where(and(...buildBatchWriteFilters(existing)))
    .returning();

  if (!updated) {
    throw new Error('Transport batch changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'transport_batch',
    resourceId: updated.id,
    meta: {
      previousStatus: currentStatus,
      currentStatus: updated.batchStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return updated;
}

export async function getEventTransportBatches(eventId: string) {
  const { eventId: scopedEventId } = await assertTransportEventAccess(eventId);

  return db
    .select()
    .from(transportBatches)
    .where(eq(transportBatches.eventId, scopedEventId))
    .orderBy(desc(transportBatches.serviceDate));
}

export async function getTransportBatch(eventId: string, batchId: string) {
  const { eventId: scopedEventId } = await assertTransportEventAccess(eventId);
  parseTransportInput(batchIdSchema, batchId);

  const [batch] = await db
    .select()
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, scopedEventId, eq(transportBatches.id, batchId)))
    .limit(1);

  if (!batch) throw new Error('Transport batch not found');
  return batch;
}

// ══════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════

export async function createVehicleAssignment(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  const validated = parseTransportInput(createVehicleSchema, input);

  const batch = await assertBatchExistsForAssignment(scopedEventId, validated.batchId);

  const [vehicle] = await db
    .insert(vehicleAssignments)
    .values({
      eventId: scopedEventId,
      batchId: validated.batchId,
      vehicleLabel: validated.vehicleLabel,
      vehicleType: validated.vehicleType,
      plateNumber: validated.plateNumber || null,
      vendorName: validated.vendorName || null,
      vendorContactE164: validated.vendorContactE164 || null,
      driverName: validated.driverName || null,
      driverMobileE164: validated.driverMobileE164 || null,
      capacity: validated.capacity,
      scheduledPickupAtUtc: validated.scheduledPickupAtUtc ? new Date(validated.scheduledPickupAtUtc) : null,
      scheduledDropAtUtc: validated.scheduledDropAtUtc ? new Date(validated.scheduledDropAtUtc) : null,
      notes: validated.notes || null,
      assignmentStatus: 'assigned',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'create',
    resource: 'vehicle_assignment',
    resourceId: vehicle.id,
    meta: {
      batchId: batch.id,
      vehicleType: vehicle.vehicleType,
      assignmentStatus: vehicle.assignmentStatus,
      capacity: vehicle.capacity,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return vehicle;
}

export async function updateVehicleStatus(eventId: string, vehicleAssignmentId: string, newStatus: VehicleStatus) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(vehicleIdSchema, vehicleAssignmentId);

  const [existing] = await db
    .select({
      id: vehicleAssignments.id,
      eventId: vehicleAssignments.eventId,
      batchId: vehicleAssignments.batchId,
      assignmentStatus: vehicleAssignments.assignmentStatus,
      updatedAt: vehicleAssignments.updatedAt,
    })
    .from(vehicleAssignments)
    .where(withEventScope(vehicleAssignments.eventId, scopedEventId, eq(vehicleAssignments.id, vehicleAssignmentId)))
    .limit(1);

  if (!existing) throw new Error('Vehicle assignment not found');

  const currentStatus = existing.assignmentStatus as VehicleStatus;
  if (!VEHICLE_TRANSITIONS[currentStatus].includes(newStatus)) {
    throw new Error(
      `Cannot transition vehicle from "${currentStatus}" to "${newStatus}". Allowed: ${VEHICLE_TRANSITIONS[currentStatus].join(', ') || 'none (terminal)'}`,
    );
  }

  const [updated] = await db
    .update(vehicleAssignments)
    .set({ assignmentStatus: newStatus, updatedBy: userId, updatedAt: new Date() })
    .where(and(...buildVehicleWriteFilters(existing)))
    .returning();

  if (!updated) {
    throw new Error('Vehicle assignment changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'vehicle_assignment',
    resourceId: updated.id,
    meta: {
      batchId: existing.batchId,
      previousStatus: currentStatus,
      currentStatus: updated.assignmentStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return updated;
}

export async function getBatchVehicles(eventId: string, batchId: string) {
  const { eventId: scopedEventId } = await assertTransportEventAccess(eventId);
  parseTransportInput(batchIdSchema, batchId);

  return db
    .select()
    .from(vehicleAssignments)
    .where(
      withEventScope(vehicleAssignments.eventId, scopedEventId, eq(vehicleAssignments.batchId, batchId)),
    );
}

// ══════════════════════════════════════════════════════════════
// PASSENGERS
// ══════════════════════════════════════════════════════════════

export async function assignPassenger(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  const validated = parseTransportInput(assignPassengerSchema, input);

  const batch = await assertBatchExistsForAssignment(scopedEventId, validated.batchId);
  await assertTravelRecordBelongsToEventPerson(scopedEventId, validated.personId, validated.travelRecordId);
  await assertVehicleBelongsToBatch(
    scopedEventId,
    validated.batchId,
    validated.vehicleAssignmentId || null,
  );

  const [assignment] = await db
    .insert(transportPassengerAssignments)
    .values({
      eventId: scopedEventId,
      batchId: validated.batchId,
      vehicleAssignmentId: validated.vehicleAssignmentId || null,
      personId: validated.personId,
      travelRecordId: validated.travelRecordId,
      assignmentStatus: validated.vehicleAssignmentId ? 'assigned' : 'pending',
      pickupNote: validated.pickupNote || null,
      dropNote: validated.dropNote || null,
    })
    .returning();

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'create',
    resource: 'transport_passenger_assignment',
    resourceId: assignment.id,
    meta: {
      batchId: batch.id,
      vehicleAssignmentId: assignment.vehicleAssignmentId,
      personId: assignment.personId,
      travelRecordId: assignment.travelRecordId,
      assignmentStatus: assignment.assignmentStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return assignment;
}

export async function movePassenger(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  const validated = parseTransportInput(movePassengerSchema, input);

  const [existing] = await db
    .select({
      id: transportPassengerAssignments.id,
      eventId: transportPassengerAssignments.eventId,
      batchId: transportPassengerAssignments.batchId,
      vehicleAssignmentId: transportPassengerAssignments.vehicleAssignmentId,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
      updatedAt: transportPassengerAssignments.updatedAt,
    })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        scopedEventId,
        eq(transportPassengerAssignments.id, validated.passengerAssignmentId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error('Passenger assignment not found');
  if (existing.assignmentStatus === 'cancelled' || existing.assignmentStatus === 'completed' || existing.assignmentStatus === 'no_show') {
    throw new Error(`Cannot move a passenger in "${existing.assignmentStatus}" status`);
  }

  const newVehicleId = validated.targetVehicleAssignmentId || null;
  const newStatus: PassengerStatus = newVehicleId ? 'assigned' : 'pending';
  await assertVehicleBelongsToBatch(scopedEventId, existing.batchId, newVehicleId);

  const [updated] = await db
    .update(transportPassengerAssignments)
    .set({
      vehicleAssignmentId: newVehicleId,
      assignmentStatus: newStatus,
      updatedAt: new Date(),
    })
    .where(and(...buildPassengerWriteFilters(existing)))
    .returning();

  if (!updated) {
    throw new Error('Passenger assignment changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'transport_passenger_assignment',
    resourceId: updated.id,
    meta: {
      batchId: existing.batchId,
      previousVehicleAssignmentId: existing.vehicleAssignmentId,
      currentVehicleAssignmentId: updated.vehicleAssignmentId,
      previousStatus: existing.assignmentStatus,
      currentStatus: updated.assignmentStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return updated;
}

export async function updatePassengerStatus(eventId: string, passengerAssignmentId: string, newStatus: PassengerStatus) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(passengerIdSchema, passengerAssignmentId);

  const [existing] = await db
    .select({
      id: transportPassengerAssignments.id,
      eventId: transportPassengerAssignments.eventId,
      batchId: transportPassengerAssignments.batchId,
      personId: transportPassengerAssignments.personId,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
      updatedAt: transportPassengerAssignments.updatedAt,
    })
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        scopedEventId,
        eq(transportPassengerAssignments.id, passengerAssignmentId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error('Passenger assignment not found');

  const currentStatus = existing.assignmentStatus as PassengerStatus;
  if (!PASSENGER_TRANSITIONS[currentStatus].includes(newStatus)) {
    throw new Error(
      `Cannot transition passenger from "${currentStatus}" to "${newStatus}". Allowed: ${PASSENGER_TRANSITIONS[currentStatus].join(', ') || 'none (terminal)'}`,
    );
  }

  const [updated] = await db
    .update(transportPassengerAssignments)
    .set({ assignmentStatus: newStatus, updatedAt: new Date() })
    .where(and(...buildPassengerWriteFilters(existing)))
    .returning();

  if (!updated) {
    throw new Error('Passenger assignment changed. Refresh and try again.');
  }

  await writeAudit({
    actorUserId: userId,
    eventId: scopedEventId,
    action: 'update',
    resource: 'transport_passenger_assignment',
    resourceId: updated.id,
    meta: {
      batchId: existing.batchId,
      personId: existing.personId,
      previousStatus: currentStatus,
      currentStatus: updated.assignmentStatus,
    },
  });

  revalidatePath(`/events/${scopedEventId}/transport`);
  return updated;
}

export async function getBatchPassengers(eventId: string, batchId: string) {
  const { eventId: scopedEventId } = await assertTransportEventAccess(eventId);
  parseTransportInput(batchIdSchema, batchId);

  return db
    .select({
      id: transportPassengerAssignments.id,
      batchId: transportPassengerAssignments.batchId,
      vehicleAssignmentId: transportPassengerAssignments.vehicleAssignmentId,
      personId: transportPassengerAssignments.personId,
      travelRecordId: transportPassengerAssignments.travelRecordId,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
      pickupNote: transportPassengerAssignments.pickupNote,
      dropNote: transportPassengerAssignments.dropNote,
      personName: people.fullName,
      personPhone: people.phoneE164,
    })
    .from(transportPassengerAssignments)
    .innerJoin(people, eq(transportPassengerAssignments.personId, people.id))
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        scopedEventId,
        eq(transportPassengerAssignments.batchId, batchId),
      ),
    );
}
