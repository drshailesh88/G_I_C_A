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

// ══════════════════════════════════════════════════════════════
// BATCHES
// ══════════════════════════════════════════════════════════════

export async function createTransportBatch(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = createBatchSchema.parse(input);

  const [batch] = await db
    .insert(transportBatches)
    .values({
      eventId,
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

  revalidatePath(`/events/${eventId}/transport`);
  return batch;
}

export async function updateTransportBatch(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = updateBatchSchema.parse(input);
  const { batchId, ...fields } = validated;

  const [existing] = await db
    .select()
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, batchId)))
    .limit(1);

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
    .where(eq(transportBatches.id, batchId))
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return updated;
}

export async function updateBatchStatus(eventId: string, batchId: string, newStatus: BatchStatus) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  batchIdSchema.parse(batchId);

  const [existing] = await db
    .select()
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, batchId)))
    .limit(1);

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
    .where(eq(transportBatches.id, batchId))
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return updated;
}

export async function getEventTransportBatches(eventId: string) {
  await assertEventAccess(eventId);

  return db
    .select()
    .from(transportBatches)
    .where(eq(transportBatches.eventId, eventId))
    .orderBy(desc(transportBatches.serviceDate));
}

export async function getTransportBatch(eventId: string, batchId: string) {
  await assertEventAccess(eventId);
  batchIdSchema.parse(batchId);

  const [batch] = await db
    .select()
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, batchId)))
    .limit(1);

  if (!batch) throw new Error('Transport batch not found');
  return batch;
}

// ══════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════

export async function createVehicleAssignment(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = createVehicleSchema.parse(input);

  // Verify batch exists and belongs to this event
  const [batch] = await db
    .select({ id: transportBatches.id })
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, validated.batchId)))
    .limit(1);

  if (!batch) throw new Error('Transport batch not found');

  const [vehicle] = await db
    .insert(vehicleAssignments)
    .values({
      eventId,
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

  revalidatePath(`/events/${eventId}/transport`);
  return vehicle;
}

export async function updateVehicleStatus(eventId: string, vehicleAssignmentId: string, newStatus: VehicleStatus) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  vehicleIdSchema.parse(vehicleAssignmentId);

  const [existing] = await db
    .select()
    .from(vehicleAssignments)
    .where(withEventScope(vehicleAssignments.eventId, eventId, eq(vehicleAssignments.id, vehicleAssignmentId)))
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
    .where(eq(vehicleAssignments.id, vehicleAssignmentId))
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return updated;
}

export async function getBatchVehicles(eventId: string, batchId: string) {
  await assertEventAccess(eventId);

  return db
    .select()
    .from(vehicleAssignments)
    .where(
      withEventScope(vehicleAssignments.eventId, eventId, eq(vehicleAssignments.batchId, batchId)),
    );
}

// ══════════════════════════════════════════════════════════════
// PASSENGERS
// ══════════════════════════════════════════════════════════════

export async function assignPassenger(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = assignPassengerSchema.parse(input);

  // Verify batch exists
  const [batch] = await db
    .select({ id: transportBatches.id })
    .from(transportBatches)
    .where(withEventScope(transportBatches.eventId, eventId, eq(transportBatches.id, validated.batchId)))
    .limit(1);

  if (!batch) throw new Error('Transport batch not found');

  const [assignment] = await db
    .insert(transportPassengerAssignments)
    .values({
      eventId,
      batchId: validated.batchId,
      vehicleAssignmentId: validated.vehicleAssignmentId || null,
      personId: validated.personId,
      travelRecordId: validated.travelRecordId,
      assignmentStatus: validated.vehicleAssignmentId ? 'assigned' : 'pending',
      pickupNote: validated.pickupNote || null,
      dropNote: validated.dropNote || null,
    })
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return assignment;
}

export async function movePassenger(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = movePassengerSchema.parse(input);

  const [existing] = await db
    .select()
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
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

  const [updated] = await db
    .update(transportPassengerAssignments)
    .set({
      vehicleAssignmentId: newVehicleId,
      assignmentStatus: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(transportPassengerAssignments.id, validated.passengerAssignmentId))
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return updated;
}

export async function updatePassengerStatus(eventId: string, passengerAssignmentId: string, newStatus: PassengerStatus) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  passengerIdSchema.parse(passengerAssignmentId);

  const [existing] = await db
    .select()
    .from(transportPassengerAssignments)
    .where(
      withEventScope(
        transportPassengerAssignments.eventId,
        eventId,
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
    .where(eq(transportPassengerAssignments.id, passengerAssignmentId))
    .returning();

  revalidatePath(`/events/${eventId}/transport`);
  return updated;
}

export async function getBatchPassengers(eventId: string, batchId: string) {
  await assertEventAccess(eventId);

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
        eventId,
        eq(transportPassengerAssignments.batchId, batchId),
      ),
    );
}
