'use server';

import { db } from '@/lib/db';
import {
  transportBatches,
  vehicleAssignments,
  transportPassengerAssignments,
  travelRecords,
  people,
} from '@/lib/db/schema';
import { eq, and, desc, ne, inArray } from 'drizzle-orm';
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

type CreateBatchInput = z.infer<typeof createBatchSchema>;
type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
type AssignPassengerInput = z.infer<typeof assignPassengerSchema>;
type MovePassengerInput = z.infer<typeof movePassengerSchema>;

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
  const validated = parseTransportInput(createBatchSchema, input) as CreateBatchInput;

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
  const validated = parseTransportInput(updateBatchSchema, input) as UpdateBatchInput;
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
    .where(
      and(
        eq(transportBatches.eventId, scopedEventId),
        eq(transportBatches.batchSource, 'manual'),
      ),
    )
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
  const validated = parseTransportInput(createVehicleSchema, input) as CreateVehicleInput;

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
  const validated = parseTransportInput(assignPassengerSchema, input) as AssignPassengerInput;

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
  const validated = parseTransportInput(movePassengerSchema, input) as MovePassengerInput;

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

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const SUGGESTION_ACTOR = 'system';

export function floorToThreeHourWindowUtc(date: Date): { start: Date; end: Date } {
  const bucket = Math.floor(date.getUTCHours() / 3) * 3;
  const start = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), bucket, 0, 0, 0,
  ));
  return { start, end: new Date(start.getTime() + THREE_HOURS_MS) };
}

type TravelRow = {
  id: string;
  personId: string;
  direction: string;
  toCity: string;
  toLocation: string | null;
  fromCity: string;
  fromLocation: string | null;
  arrivalAtUtc: Date | null;
  departureAtUtc: Date | null;
};

type TravelCluster = {
  movementType: 'arrival' | 'departure';
  serviceDate: Date;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  sourceCity: string;
  pickupHub: string;
  dropHub: string;
  records: Array<{ personId: string; travelRecordId: string }>;
};

export function buildClusters(records: TravelRow[]): TravelCluster[] {
  const map = new Map<string, TravelCluster>();
  for (const r of records) {
    const isInbound = r.direction === 'inbound' && r.arrivalAtUtc !== null;
    const isOutbound = r.direction === 'outbound' && r.departureAtUtc !== null;
    if (!isInbound && !isOutbound) continue;
    const movementType = isInbound ? 'arrival' : 'departure';
    const timestamp = isInbound ? r.arrivalAtUtc : r.departureAtUtc;
    if (timestamp === null) continue;
    const city = isInbound ? r.toCity : r.fromCity;
    const { start: winStart, end: winEnd } = floorToThreeHourWindowUtc(timestamp);
    const serviceDate = new Date(Date.UTC(
      timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate(),
    ));
    const key = movementType + '|' + city + '|' + winStart.toISOString();
    if (!map.has(key)) {
      map.set(key, {
        movementType, serviceDate, timeWindowStart: winStart, timeWindowEnd: winEnd,
        sourceCity: city,
        pickupHub: isInbound ? (r.toLocation || city) : 'Event Venue',
        dropHub: isInbound ? 'Event Venue' : (r.fromLocation || city),
        records: [],
      });
    }
    map.get(key)?.records.push({ personId: r.personId, travelRecordId: r.id });
  }
  return Array.from(map.values());
}

export type SuggestedBatch = {
  id: string;
  eventId: string;
  movementType: string;
  serviceDate: Date;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  sourceCity: string;
  pickupHub: string;
  dropHub: string;
  batchStatus: string;
  batchSource: string;
  passengers: Array<{ id: string; personId: string; travelRecordId: string; personName: string | null }>;
};

export async function generateTransportSuggestions(eventId: string): Promise<{ created: number; skipped: number }> {
  const scopedEventId = z.string().uuid('Invalid event ID').parse(eventId);

  const assignedRows = await db
    .select({ travelRecordId: transportPassengerAssignments.travelRecordId })
    .from(transportPassengerAssignments)
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), ne(transportPassengerAssignments.assignmentStatus, 'cancelled')));
  const assignedIds = new Set(assignedRows.map((r) => r.travelRecordId));

  const allRecords = await db
    .select({
      id: travelRecords.id, personId: travelRecords.personId, direction: travelRecords.direction,
      toCity: travelRecords.toCity, toLocation: travelRecords.toLocation,
      fromCity: travelRecords.fromCity, fromLocation: travelRecords.fromLocation,
      arrivalAtUtc: travelRecords.arrivalAtUtc, departureAtUtc: travelRecords.departureAtUtc,
    })
    .from(travelRecords)
    .where(and(eq(travelRecords.eventId, scopedEventId), inArray(travelRecords.recordStatus, ['confirmed', 'sent', 'changed'])));

  const unassigned = allRecords.filter((r) => !assignedIds.has(r.id));
  const clusters = buildClusters(unassigned);

  const existingAuto = await db
    .select({
      id: transportBatches.id,
      movementType: transportBatches.movementType,
      sourceCity: transportBatches.sourceCity,
      timeWindowStart: transportBatches.timeWindowStart,
    })
    .from(transportBatches)
    .where(and(eq(transportBatches.eventId, scopedEventId), eq(transportBatches.batchSource, 'auto'), ne(transportBatches.batchStatus, 'cancelled')));

  const existingByKey = new Map(
    existingAuto.map((b) => [b.movementType + '|' + b.sourceCity + '|' + b.timeWindowStart.toISOString(), b.id]),
  );

  let created = 0; let skipped = 0;
  let refreshed = false;
  for (const cluster of clusters) {
    const key = cluster.movementType + '|' + cluster.sourceCity + '|' + cluster.timeWindowStart.toISOString();
    const existingBatchId = existingByKey.get(key);
    if (existingBatchId) {
      if (cluster.records.length > 0) {
        await db.insert(transportPassengerAssignments).values(
          cluster.records.map((r) => ({
            eventId: scopedEventId,
            batchId: existingBatchId,
            vehicleAssignmentId: null,
            personId: r.personId,
            travelRecordId: r.travelRecordId,
            assignmentStatus: 'pending',
          })),
        );
        refreshed = true;
      }
      skipped++;
      continue;
    }
    const [batch] = await db.insert(transportBatches).values({
      eventId: scopedEventId, movementType: cluster.movementType, batchSource: 'auto',
      serviceDate: cluster.serviceDate, timeWindowStart: cluster.timeWindowStart, timeWindowEnd: cluster.timeWindowEnd,
      sourceCity: cluster.sourceCity, pickupHub: cluster.pickupHub, pickupHubType: 'other',
      dropHub: cluster.dropHub, dropHubType: 'other', batchStatus: 'planned',
      createdBy: SUGGESTION_ACTOR, updatedBy: SUGGESTION_ACTOR,
    }).returning();
    if (cluster.records.length > 0) {
      await db.insert(transportPassengerAssignments).values(
        cluster.records.map((r) => ({ eventId: scopedEventId, batchId: batch.id, vehicleAssignmentId: null, personId: r.personId, travelRecordId: r.travelRecordId, assignmentStatus: 'pending' })),
      );
    }
    created++;
    refreshed = true;
  }
  if (refreshed) revalidatePath('/events/' + scopedEventId + '/transport');
  return { created, skipped };
}

export async function refreshTransportSuggestions(eventId: string) {
  await assertTransportEventAccess(eventId, { requireWrite: true });
  return generateTransportSuggestions(eventId);
}

export async function getSuggestedBatches(eventId: string): Promise<SuggestedBatch[]> {
  const { eventId: scopedEventId } = await assertTransportEventAccess(eventId);
  const batches = await db.select().from(transportBatches)
    .where(and(eq(transportBatches.eventId, scopedEventId), eq(transportBatches.batchSource, 'auto'), ne(transportBatches.batchStatus, 'cancelled')))
    .orderBy(transportBatches.serviceDate);
  if (batches.length === 0) return [];
  const batchIds = batches.map((b) => b.id);
  const passengerRows = await db
    .select({ id: transportPassengerAssignments.id, batchId: transportPassengerAssignments.batchId, personId: transportPassengerAssignments.personId, travelRecordId: transportPassengerAssignments.travelRecordId, personName: people.fullName })
    .from(transportPassengerAssignments)
    .innerJoin(people, eq(transportPassengerAssignments.personId, people.id))
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), inArray(transportPassengerAssignments.batchId, batchIds), ne(transportPassengerAssignments.assignmentStatus, 'cancelled')));
  const byBatch = new Map<string, typeof passengerRows>();
  for (const p of passengerRows) { const list = byBatch.get(p.batchId) || []; list.push(p); byBatch.set(p.batchId, list); }
  return batches.map((b) => ({ id: b.id, eventId: b.eventId, movementType: b.movementType, serviceDate: b.serviceDate, timeWindowStart: b.timeWindowStart, timeWindowEnd: b.timeWindowEnd, sourceCity: b.sourceCity, pickupHub: b.pickupHub, dropHub: b.dropHub, batchStatus: b.batchStatus, batchSource: b.batchSource, passengers: (byBatch.get(b.id) || []).map((p) => ({ id: p.id, personId: p.personId, travelRecordId: p.travelRecordId, personName: p.personName })) }));
}

export async function acceptSuggestion(eventId: string, batchId: string) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(batchIdSchema, batchId);
  const [batch] = await db.select({ id: transportBatches.id, eventId: transportBatches.eventId, batchSource: transportBatches.batchSource, batchStatus: transportBatches.batchStatus })
    .from(transportBatches).where(withEventScope(transportBatches.eventId, scopedEventId, eq(transportBatches.id, batchId))).limit(1);
  if (!batch) throw new Error('Suggestion not found');
  if (batch.batchSource !== 'auto') throw new Error('Batch is not a suggestion');
  if (batch.batchStatus === 'cancelled') throw new Error('Suggestion is already cancelled');
  const [updated] = await db.update(transportBatches).set({ batchSource: 'manual', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(transportBatches.id, batch.id), eq(transportBatches.eventId, batch.eventId))).returning();
  if (!updated) throw new Error('Suggestion changed. Refresh and try again.');
  await writeAudit({ actorUserId: userId, eventId: scopedEventId, action: 'update', resource: 'transport_batch', resourceId: updated.id, meta: { previousSource: 'auto', currentSource: 'manual', action: 'accept_suggestion' } });
  revalidatePath('/events/' + scopedEventId + '/transport');
  return updated;
}

export async function discardSuggestion(eventId: string, batchId: string) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(batchIdSchema, batchId);
  const [batch] = await db.select({ id: transportBatches.id, eventId: transportBatches.eventId, batchSource: transportBatches.batchSource, batchStatus: transportBatches.batchStatus })
    .from(transportBatches).where(withEventScope(transportBatches.eventId, scopedEventId, eq(transportBatches.id, batchId))).limit(1);
  if (!batch) throw new Error('Suggestion not found');
  if (batch.batchSource !== 'auto') throw new Error('Batch is not a suggestion');
  if (batch.batchStatus === 'cancelled') throw new Error('Suggestion is already cancelled');
  await db.update(transportPassengerAssignments).set({ assignmentStatus: 'cancelled', updatedAt: new Date() })
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), eq(transportPassengerAssignments.batchId, batchId), ne(transportPassengerAssignments.assignmentStatus, 'cancelled')));
  await db.update(transportBatches).set({ batchStatus: 'cancelled', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(transportBatches.id, batch.id), eq(transportBatches.eventId, batch.eventId)));
  await writeAudit({ actorUserId: userId, eventId: scopedEventId, action: 'update', resource: 'transport_batch', resourceId: batchId, meta: { action: 'discard_suggestion' } });
  revalidatePath('/events/' + scopedEventId + '/transport');
  return { ok: true };
}

export async function mergeSuggestions(eventId: string, keepBatchId: string, discardBatchId: string) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(batchIdSchema, keepBatchId);
  parseTransportInput(batchIdSchema, discardBatchId);
  if (keepBatchId === discardBatchId) throw new Error('Cannot merge a suggestion with itself');
  const batches = await db.select({ id: transportBatches.id }).from(transportBatches)
    .where(and(eq(transportBatches.eventId, scopedEventId), inArray(transportBatches.id, [keepBatchId, discardBatchId]), eq(transportBatches.batchSource, 'auto'), ne(transportBatches.batchStatus, 'cancelled')));
  const keep = batches.find((b) => b.id === keepBatchId);
  const discard = batches.find((b) => b.id === discardBatchId);
  if (!keep) throw new Error('Keep batch not found or not a valid suggestion');
  if (!discard) throw new Error('Discard batch not found or not a valid suggestion');
  await db.update(transportPassengerAssignments).set({ batchId: keepBatchId, updatedAt: new Date() })
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), eq(transportPassengerAssignments.batchId, discardBatchId), ne(transportPassengerAssignments.assignmentStatus, 'cancelled')));
  await db.update(transportBatches).set({ batchStatus: 'cancelled', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(transportBatches.id, discardBatchId), eq(transportBatches.eventId, scopedEventId)));
  await writeAudit({ actorUserId: userId, eventId: scopedEventId, action: 'update', resource: 'transport_batch', resourceId: keepBatchId, meta: { action: 'merge_suggestions', discardBatchId } });
  revalidatePath('/events/' + scopedEventId + '/transport');
  return { ok: true };
}

export async function splitSuggestion(eventId: string, batchId: string, passengerAssignmentIds: string[]) {
  const { userId, eventId: scopedEventId } = await assertTransportEventAccess(eventId, { requireWrite: true });
  parseTransportInput(batchIdSchema, batchId);
  if (!Array.isArray(passengerAssignmentIds) || passengerAssignmentIds.length === 0) throw new Error('At least one passenger must be selected for split');
  const [original] = await db.select().from(transportBatches).where(withEventScope(transportBatches.eventId, scopedEventId, eq(transportBatches.id, batchId))).limit(1);
  if (!original) throw new Error('Suggestion not found');
  if (original.batchSource !== 'auto') throw new Error('Batch is not a suggestion');
  if (original.batchStatus === 'cancelled') throw new Error('Suggestion is already cancelled');
  const allPassengers = await db.select({ id: transportPassengerAssignments.id }).from(transportPassengerAssignments)
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), eq(transportPassengerAssignments.batchId, batchId), ne(transportPassengerAssignments.assignmentStatus, 'cancelled')));
  const allIds = new Set(allPassengers.map((p) => p.id));
  for (const pid of passengerAssignmentIds) { if (!allIds.has(pid)) throw new Error('Passenger ' + pid + ' does not belong to this suggestion'); }
  if (passengerAssignmentIds.length >= allPassengers.length) throw new Error('Cannot split all passengers — at least one must remain in the original suggestion');
  const [newBatch] = await db.insert(transportBatches).values({ eventId: scopedEventId, movementType: original.movementType, batchSource: 'auto', serviceDate: original.serviceDate, timeWindowStart: original.timeWindowStart, timeWindowEnd: original.timeWindowEnd, sourceCity: original.sourceCity, pickupHub: original.pickupHub, pickupHubType: original.pickupHubType, dropHub: original.dropHub, dropHubType: original.dropHubType, batchStatus: 'planned', notes: original.notes, createdBy: userId, updatedBy: userId }).returning();
  await db.update(transportPassengerAssignments).set({ batchId: newBatch.id, updatedAt: new Date() })
    .where(and(eq(transportPassengerAssignments.eventId, scopedEventId), inArray(transportPassengerAssignments.id, passengerAssignmentIds)));
  await writeAudit({ actorUserId: userId, eventId: scopedEventId, action: 'create', resource: 'transport_batch', resourceId: newBatch.id, meta: { action: 'split_suggestion', originalBatchId: batchId, splitCount: passengerAssignmentIds.length } });
  revalidatePath('/events/' + scopedEventId + '/transport');
  return { newBatchId: newBatch.id };
}
