/**
 * Mutation-kill-2 tests for actions/transport.ts
 *
 * Targets survivors left by transport.mutation-kill.test.ts and
 * transport-suggestions.test.ts. Focus:
 *   - audit meta payloads (ObjectLiteral + StringLiteral)
 *   - parseTransportInput ZodError fallback
 *   - assertTransportRole read / write / null role
 *   - assertBatchExistsForAssignment / assertVehicleBelongsToBatch status guards
 *   - buildBatchWriteFilters / buildVehicleWriteFilters / buildPassengerWriteFilters
 *     optional updatedAt push (ConditionalExpression)
 *   - acceptSuggestion / discardSuggestion / mergeSuggestions / splitSuggestion
 *     full success paths + audit meta + revalidatePath
 *   - generateTransportSuggestions internals (filter shape + key composition)
 *   - getSuggestedBatches full shape (passengers grouped per batch)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess, mockWriteAudit } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockWriteAudit: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user_123' }) }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ op: 'withEventScope', args })),
}));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));

import {
  createTransportBatch,
  updateTransportBatch,
  updateBatchStatus,
  createVehicleAssignment,
  updateVehicleStatus,
  assignPassenger,
  movePassenger,
  updatePassengerStatus,
  acceptSuggestion,
  discardSuggestion,
  mergeSuggestions,
  splitSuggestion,
  getSuggestedBatches,
  generateTransportSuggestions,
  refreshTransportSuggestions,
} from './transport';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_BATCH_ID = '550e8400-e29b-41d4-a716-446655440002';
const VEHICLE_ID = '550e8400-e29b-41d4-a716-446655440003';
const PASSENGER_ID = '550e8400-e29b-41d4-a716-446655440004';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440005';
const TRAVEL_ID = '550e8400-e29b-41d4-a716-446655440006';
const ASSIGNMENT_ID = '550e8400-e29b-41d4-a716-446655440007';
const OTHER_ASSIGNMENT_ID = '550e8400-e29b-41d4-a716-446655440008';
const NEW_BATCH_ID = '550e8400-e29b-41d4-a716-446655440009';

/** Classic chain that resolves on .limit / .returning. */
function chainedSelect(rows: unknown[]) {
  const chain: Record<string, any> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValueOnce(chain);
  return chain;
}

/** Chain that resolves when awaited after .where (no .limit) — used for generate/getSuggested. */
function chainedSelectAwaitable(rows: unknown[]) {
  const terminal = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  });
  const joinChain = { where: vi.fn().mockReturnValue(terminal) };
  const chain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      innerJoin: vi.fn().mockReturnValue(joinChain),
      orderBy: vi.fn().mockResolvedValue(rows),
    }),
  };
  mockDb.select.mockReturnValueOnce(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const valuesResult = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  const chain = { values: vi.fn().mockReturnValue(valuesResult) };
  mockDb.insert.mockReturnValueOnce(chain);
  return chain;
}

function chainedUpdate(rows: unknown[] = [{}]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  const inner = { where: vi.fn().mockReturnValue(whereResult) };
  const chain = { set: vi.fn().mockReturnValue(inner) };
  mockDb.update.mockReturnValueOnce(chain);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
});

// ──────────────────────────────────────────────────────────────
// parseTransportInput — ZodError fallback path
// ──────────────────────────────────────────────────────────────
describe('parseTransportInput ZodError fallback', () => {
  it('unwraps a Zod issue message into the thrown Error', async () => {
    await expect(
      createTransportBatch(EVENT_ID, { movementType: 'arrival' } as never),
    ).rejects.toThrow(/./); // any meaningful error, not empty
  });

  it('throws a non-empty message (not the placeholder StringLiteral mutation)', async () => {
    try {
      await createTransportBatch(EVENT_ID, { movementType: 'arrival' } as never);
      throw new Error('expected validation failure');
    } catch (e) {
      expect((e as Error).message.length).toBeGreaterThan(3);
      // Must not be the empty-string mutation value.
      expect((e as Error).message).not.toBe('');
    }
  });
});

// ──────────────────────────────────────────────────────────────
// assertTransportRole — read / write / missing role
// ──────────────────────────────────────────────────────────────
describe('assertTransportRole', () => {
  it('allows Ops role to perform writes', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);
    await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');
  });

  it('rejects Read-only role on a write path', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).rejects.toThrow(/Forbidden/);
  });

  it('rejects Event Coordinator role on a write path (not in write set)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).rejects.toThrow(/Forbidden/);
  });

  it('rejects Event Coordinator on a read path too (read set excludes coordinator)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    chainedSelect([]);
    await expect(getSuggestedBatches(EVENT_ID)).rejects.toThrow(/Forbidden/);
  });

  it('allows Read-only role on a read path', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    chainedSelect([]);
    await expect(getSuggestedBatches(EVENT_ID)).resolves.toEqual([]);
  });

  it('treats a null role as an early return (no forbidden error, no throw)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: null });
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);
    // Must not throw Forbidden.
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).resolves.toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────
// assertBatchExistsForAssignment / assertVehicleBelongsToBatch guards
// ──────────────────────────────────────────────────────────────
describe('assertBatchExistsForAssignment status guards', () => {
  const vehicleInput = {
    batchId: BATCH_ID,
    vehicleLabel: 'Van',
    vehicleType: 'van' as const,
    capacity: 8,
  };

  it('rejects when batch status is "completed"', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'completed', updatedAt: new Date() }]);
    await expect(createVehicleAssignment(EVENT_ID, vehicleInput)).rejects.toThrow(
      /"completed" status/,
    );
  });

  it('rejects when batch status is "cancelled"', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'cancelled', updatedAt: new Date() }]);
    await expect(createVehicleAssignment(EVENT_ID, vehicleInput)).rejects.toThrow(
      /"cancelled" status/,
    );
  });

  it('allows when batch status is "planned"', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    await expect(createVehicleAssignment(EVENT_ID, vehicleInput)).resolves.toBeDefined();
  });

  it('rejects when batch is missing', async () => {
    chainedSelect([]);
    await expect(createVehicleAssignment(EVENT_ID, vehicleInput)).rejects.toThrow(
      /Transport batch not found/,
    );
  });
});

describe('assertVehicleBelongsToBatch guards', () => {
  const input = {
    batchId: BATCH_ID,
    personId: PERSON_ID,
    travelRecordId: TRAVEL_ID,
    vehicleAssignmentId: VEHICLE_ID,
  };

  function stubPrimaryGuards() {
    // batch exists
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    // travel record belongs
    chainedSelect([{ id: TRAVEL_ID }]);
  }

  it('rejects when the vehicle record is missing', async () => {
    stubPrimaryGuards();
    chainedSelect([]);
    await expect(assignPassenger(EVENT_ID, input)).rejects.toThrow(/Vehicle assignment not found/);
  });

  it('rejects when the vehicle belongs to a different batch', async () => {
    stubPrimaryGuards();
    chainedSelect([
      { id: VEHICLE_ID, batchId: OTHER_BATCH_ID, assignmentStatus: 'assigned' },
    ]);
    await expect(assignPassenger(EVENT_ID, input)).rejects.toThrow(
      /does not belong to this batch/,
    );
  });

  it('rejects when the vehicle is "completed"', async () => {
    stubPrimaryGuards();
    chainedSelect([
      { id: VEHICLE_ID, batchId: BATCH_ID, assignmentStatus: 'completed' },
    ]);
    await expect(assignPassenger(EVENT_ID, input)).rejects.toThrow(/"completed"/);
  });

  it('rejects when the vehicle is "cancelled"', async () => {
    stubPrimaryGuards();
    chainedSelect([
      { id: VEHICLE_ID, batchId: BATCH_ID, assignmentStatus: 'cancelled' },
    ]);
    await expect(assignPassenger(EVENT_ID, input)).rejects.toThrow(/"cancelled"/);
  });

  it('allows when the vehicle is assigned to this batch and in-progress status', async () => {
    stubPrimaryGuards();
    chainedSelect([
      { id: VEHICLE_ID, batchId: BATCH_ID, assignmentStatus: 'assigned' },
    ]);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    await expect(assignPassenger(EVENT_ID, input)).resolves.toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────
// Optimistic concurrency: the update still happens when updatedAt
// is absent (buildBatchWriteFilters / buildVehicleWriteFilters /
// buildPassengerWriteFilters skip the extra filter instead of
// pushing `eq(..., null)`, which would never match).
// ──────────────────────────────────────────────────────────────
describe('write filters handle null updatedAt without breaking the update', () => {
  it('updateBatchStatus succeeds when existing.updatedAt is null', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: null }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).resolves.toMatchObject({
      batchStatus: 'ready',
    });
  });

  it('updateVehicleStatus succeeds when existing.updatedAt is null', async () => {
    chainedSelect([{
      id: VEHICLE_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      assignmentStatus: 'assigned', updatedAt: null,
    }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);
    await expect(
      updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched'),
    ).resolves.toMatchObject({ assignmentStatus: 'dispatched' });
  });

  it('updatePassengerStatus succeeds when existing.updatedAt is null', async () => {
    chainedSelect([{
      id: PASSENGER_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      personId: PERSON_ID, assignmentStatus: 'pending', updatedAt: null,
    }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    await expect(
      updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned'),
    ).resolves.toMatchObject({ assignmentStatus: 'assigned' });
  });
});

// ──────────────────────────────────────────────────────────────
// Audit meta payloads — each write emits a specific meta object
// ──────────────────────────────────────────────────────────────
describe('audit meta payloads', () => {
  it('createTransportBatch audit includes movementType, batchSource, batchStatus', async () => {
    chainedInsert([{
      id: BATCH_ID, movementType: 'arrival', batchSource: 'manual', batchStatus: 'planned',
    }]);

    await createTransportBatch(EVENT_ID, {
      movementType: 'arrival',
      batchSource: 'manual',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'BOM',
      pickupHubType: 'airport',
      dropHub: 'Hotel',
      dropHubType: 'hotel',
    });

    const auditCall = mockWriteAudit.mock.calls[0][0];
    expect(auditCall.action).toBe('create');
    expect(auditCall.resource).toBe('transport_batch');
    expect(auditCall.meta).toMatchObject({
      movementType: 'arrival',
      batchSource: 'manual',
      batchStatus: 'planned',
    });
  });

  it('updateTransportBatch audit lists previousStatus, currentStatus, updatedFields', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'planned' }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      sourceCity: 'Delhi',
      notes: 'x',
    });

    const meta = mockWriteAudit.mock.calls[0][0].meta;
    expect(meta.previousStatus).toBe('planned');
    expect(meta.currentStatus).toBe('planned');
    expect(meta.updatedFields).toEqual(expect.arrayContaining(['sourceCity', 'notes']));
  });

  it('updateBatchStatus audit includes previousStatus / currentStatus', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);

    await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');

    expect(mockWriteAudit.mock.calls[0][0].meta).toEqual({
      previousStatus: 'planned',
      currentStatus: 'ready',
    });
  });

  it('createVehicleAssignment audit includes batchId / vehicleType / capacity / assignmentStatus', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedInsert([{
      id: VEHICLE_ID, vehicleType: 'van', assignmentStatus: 'assigned', capacity: 10,
    }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van',
      vehicleType: 'van',
      capacity: 10,
    });

    expect(mockWriteAudit.mock.calls[0][0].meta).toMatchObject({
      batchId: BATCH_ID,
      vehicleType: 'van',
      assignmentStatus: 'assigned',
      capacity: 10,
    });
  });

  it('updateVehicleStatus audit includes batchId + previous/currentStatus', async () => {
    chainedSelect([{
      id: VEHICLE_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      assignmentStatus: 'assigned', updatedAt: new Date(),
    }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);

    await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched');

    expect(mockWriteAudit.mock.calls[0][0].meta).toEqual({
      batchId: BATCH_ID,
      previousStatus: 'assigned',
      currentStatus: 'dispatched',
    });
  });

  it('assignPassenger audit includes batchId, vehicleId, personId, travelRecordId, status', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned', updatedAt: new Date() }]);
    chainedSelect([{ id: TRAVEL_ID }]);
    chainedSelect([{ id: VEHICLE_ID, batchId: BATCH_ID, assignmentStatus: 'assigned' }]);
    chainedInsert([{
      id: PASSENGER_ID,
      batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
      assignmentStatus: 'assigned',
    }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
      vehicleAssignmentId: VEHICLE_ID,
    });

    expect(mockWriteAudit.mock.calls[0][0].meta).toMatchObject({
      batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
      assignmentStatus: 'assigned',
    });
  });

  it('movePassenger audit includes previous+current vehicleIds and statuses', async () => {
    chainedSelect([{
      id: PASSENGER_ID,
      eventId: EVENT_ID,
      batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID,
      assignmentStatus: 'pending',
      updatedAt: new Date(),
    }]);
    // assertVehicleBelongsToBatch lookup for new vehicle
    chainedSelect([{
      id: OTHER_ASSIGNMENT_ID,
      batchId: BATCH_ID,
      assignmentStatus: 'assigned',
    }]);
    chainedUpdate([{
      id: PASSENGER_ID,
      vehicleAssignmentId: OTHER_ASSIGNMENT_ID,
      assignmentStatus: 'assigned',
    }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: OTHER_ASSIGNMENT_ID,
    });

    expect(mockWriteAudit.mock.calls[0][0].meta).toMatchObject({
      batchId: BATCH_ID,
      previousVehicleAssignmentId: VEHICLE_ID,
      currentVehicleAssignmentId: OTHER_ASSIGNMENT_ID,
      previousStatus: 'pending',
      currentStatus: 'assigned',
    });
  });

  it('updatePassengerStatus audit includes personId + previous/currentStatus', async () => {
    chainedSelect([{
      id: PASSENGER_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      personId: PERSON_ID, assignmentStatus: 'pending', updatedAt: new Date(),
    }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);

    await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned');

    expect(mockWriteAudit.mock.calls[0][0].meta).toMatchObject({
      batchId: BATCH_ID,
      personId: PERSON_ID,
      previousStatus: 'pending',
      currentStatus: 'assigned',
    });
  });
});

// ──────────────────────────────────────────────────────────────
// acceptSuggestion / discardSuggestion success paths
// ──────────────────────────────────────────────────────────────
describe('acceptSuggestion success path', () => {
  it('flips batchSource to "manual" and audits accept_suggestion', async () => {
    chainedSelect([{ id: BATCH_ID, eventId: EVENT_ID, batchSource: 'auto', batchStatus: 'planned' }]);
    const upd = chainedUpdate([{ id: BATCH_ID, batchSource: 'manual' }]);

    const result = await acceptSuggestion(EVENT_ID, BATCH_ID);

    expect(result).toMatchObject({ id: BATCH_ID, batchSource: 'manual' });
    const setArg = upd.set.mock.calls[0][0];
    expect(setArg.batchSource).toBe('manual');
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    const audit = mockWriteAudit.mock.calls[0][0];
    expect(audit.action).toBe('update');
    expect(audit.resource).toBe('transport_batch');
    expect(audit.meta).toEqual({
      previousSource: 'auto',
      currentSource: 'manual',
      action: 'accept_suggestion',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws "Suggestion changed. Refresh and try again." when the update races', async () => {
    chainedSelect([{ id: BATCH_ID, eventId: EVENT_ID, batchSource: 'auto', batchStatus: 'planned' }]);
    chainedUpdate([]);

    await expect(acceptSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow(
      /Suggestion changed/,
    );
  });
});

describe('discardSuggestion success path', () => {
  it('cancels passengers, cancels batch, and emits discard_suggestion audit', async () => {
    chainedSelect([{ id: BATCH_ID, eventId: EVENT_ID, batchSource: 'auto', batchStatus: 'planned' }]);
    const passengerCancel = chainedUpdate([{ ok: true }]);
    const batchCancel = chainedUpdate([{ ok: true }]);

    const result = await discardSuggestion(EVENT_ID, BATCH_ID);

    expect(result).toEqual({ ok: true });
    // Passenger UPDATE set.assignmentStatus = 'cancelled'
    expect(passengerCancel.set.mock.calls[0][0].assignmentStatus).toBe('cancelled');
    expect(passengerCancel.set.mock.calls[0][0].updatedAt).toBeInstanceOf(Date);
    // Batch UPDATE set.batchStatus = 'cancelled'
    expect(batchCancel.set.mock.calls[0][0].batchStatus).toBe('cancelled');
    expect(batchCancel.set.mock.calls[0][0].updatedBy).toBe('user_123');

    const audit = mockWriteAudit.mock.calls[0][0];
    expect(audit.meta).toEqual({ action: 'discard_suggestion' });
    expect(audit.resourceId).toBe(BATCH_ID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('rejects when batch is already cancelled (before issuing the update)', async () => {
    chainedSelect([
      { id: BATCH_ID, eventId: EVENT_ID, batchSource: 'auto', batchStatus: 'cancelled' },
    ]);
    await expect(discardSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow(/already cancelled/);
  });

  it('rejects when batch source is manual', async () => {
    chainedSelect([
      { id: BATCH_ID, eventId: EVENT_ID, batchSource: 'manual', batchStatus: 'planned' },
    ]);
    await expect(discardSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow(/not a suggestion/);
  });
});

// ──────────────────────────────────────────────────────────────
// mergeSuggestions success + edge cases
// ──────────────────────────────────────────────────────────────
describe('mergeSuggestions', () => {
  it('moves passengers, cancels discard batch, and audits merge_suggestions', async () => {
    // batches select returns both keep and discard as valid auto/planned.
    chainedSelectAwaitable([
      { id: BATCH_ID },
      { id: OTHER_BATCH_ID },
    ]);
    const movePassengers = chainedUpdate([{ ok: true }]);
    const cancelDiscard = chainedUpdate([{ ok: true }]);

    const result = await mergeSuggestions(EVENT_ID, BATCH_ID, OTHER_BATCH_ID);
    expect(result).toEqual({ ok: true });

    expect(movePassengers.set.mock.calls[0][0].batchId).toBe(BATCH_ID);
    expect(movePassengers.set.mock.calls[0][0].updatedAt).toBeInstanceOf(Date);
    expect(cancelDiscard.set.mock.calls[0][0].batchStatus).toBe('cancelled');

    const audit = mockWriteAudit.mock.calls[0][0];
    expect(audit.action).toBe('update');
    expect(audit.resource).toBe('transport_batch');
    expect(audit.resourceId).toBe(BATCH_ID);
    expect(audit.meta).toMatchObject({
      action: 'merge_suggestions',
      discardBatchId: OTHER_BATCH_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws "Discard batch not found..." when the discard id is missing from the result', async () => {
    chainedSelectAwaitable([{ id: BATCH_ID }]);
    await expect(mergeSuggestions(EVENT_ID, BATCH_ID, OTHER_BATCH_ID)).rejects.toThrow(
      /Discard batch not found/,
    );
  });
});

// ──────────────────────────────────────────────────────────────
// splitSuggestion success + edge cases
// ──────────────────────────────────────────────────────────────
describe('splitSuggestion', () => {
  it('throws when passengerAssignmentIds is not an array', async () => {
    await expect(
      splitSuggestion(EVENT_ID, BATCH_ID, 'not-array' as unknown as string[]),
    ).rejects.toThrow(/At least one passenger/);
  });

  it('rejects when the batch is not an auto suggestion', async () => {
    chainedSelect([{
      id: BATCH_ID, batchSource: 'manual', batchStatus: 'planned',
      movementType: 'arrival', serviceDate: new Date(), timeWindowStart: new Date(),
      timeWindowEnd: new Date(), sourceCity: 'X', pickupHub: 'A', pickupHubType: 'airport',
      dropHub: 'B', dropHubType: 'hotel', notes: null,
    }]);
    await expect(
      splitSuggestion(EVENT_ID, BATCH_ID, [ASSIGNMENT_ID]),
    ).rejects.toThrow(/not a suggestion/);
  });

  it('rejects when the batch is already cancelled', async () => {
    chainedSelect([{
      id: BATCH_ID, batchSource: 'auto', batchStatus: 'cancelled',
      movementType: 'arrival', serviceDate: new Date(), timeWindowStart: new Date(),
      timeWindowEnd: new Date(), sourceCity: 'X', pickupHub: 'A', pickupHubType: 'airport',
      dropHub: 'B', dropHubType: 'hotel', notes: null,
    }]);
    await expect(
      splitSuggestion(EVENT_ID, BATCH_ID, [ASSIGNMENT_ID]),
    ).rejects.toThrow(/already cancelled/);
  });

  it('rejects when a supplied passenger id does not belong to this batch', async () => {
    chainedSelect([{
      id: BATCH_ID, batchSource: 'auto', batchStatus: 'planned',
      movementType: 'arrival', serviceDate: new Date(), timeWindowStart: new Date(),
      timeWindowEnd: new Date(), sourceCity: 'X', pickupHub: 'A', pickupHubType: 'airport',
      dropHub: 'B', dropHubType: 'hotel', notes: null,
    }]);
    chainedSelectAwaitable([
      { id: ASSIGNMENT_ID },
      { id: OTHER_ASSIGNMENT_ID },
    ]);
    await expect(
      splitSuggestion(EVENT_ID, BATCH_ID, ['other-id']),
    ).rejects.toThrow(/does not belong to this suggestion/);
  });

  it('rejects when all passengers would be split (leaving the original empty)', async () => {
    chainedSelect([{
      id: BATCH_ID, batchSource: 'auto', batchStatus: 'planned',
      movementType: 'arrival', serviceDate: new Date(), timeWindowStart: new Date(),
      timeWindowEnd: new Date(), sourceCity: 'X', pickupHub: 'A', pickupHubType: 'airport',
      dropHub: 'B', dropHubType: 'hotel', notes: null,
    }]);
    chainedSelectAwaitable([
      { id: ASSIGNMENT_ID },
      { id: OTHER_ASSIGNMENT_ID },
    ]);
    await expect(
      splitSuggestion(EVENT_ID, BATCH_ID, [ASSIGNMENT_ID, OTHER_ASSIGNMENT_ID]),
    ).rejects.toThrow(/at least one must remain/);
  });

  it('creates a new batch, moves passengers, audits split_suggestion, and returns the new id', async () => {
    const original = {
      id: BATCH_ID,
      eventId: EVENT_ID,
      batchSource: 'auto',
      batchStatus: 'planned',
      movementType: 'arrival',
      serviceDate: new Date('2026-05-01T00:00:00Z'),
      timeWindowStart: new Date('2026-05-01T08:00:00Z'),
      timeWindowEnd: new Date('2026-05-01T10:00:00Z'),
      sourceCity: 'Mumbai',
      pickupHub: 'BOM',
      pickupHubType: 'airport',
      dropHub: 'Hotel',
      dropHubType: 'hotel',
      notes: 'note',
    };
    chainedSelect([original]);
    chainedSelectAwaitable([
      { id: ASSIGNMENT_ID },
      { id: OTHER_ASSIGNMENT_ID },
    ]);
    const newBatchInsert = chainedInsert([{ id: NEW_BATCH_ID }]);
    const movePassengers = chainedUpdate([{ ok: true }]);

    const result = await splitSuggestion(EVENT_ID, BATCH_ID, [ASSIGNMENT_ID]);

    expect(result).toEqual({ newBatchId: NEW_BATCH_ID });
    const v = newBatchInsert.values.mock.calls[0][0];
    expect(v.eventId).toBe(EVENT_ID);
    expect(v.batchSource).toBe('auto');
    expect(v.batchStatus).toBe('planned');
    expect(v.movementType).toBe('arrival');
    expect(v.sourceCity).toBe('Mumbai');
    expect(v.pickupHub).toBe('BOM');
    expect(v.dropHub).toBe('Hotel');
    expect(v.notes).toBe('note');
    expect(v.createdBy).toBe('user_123');
    expect(v.updatedBy).toBe('user_123');

    expect(movePassengers.set.mock.calls[0][0].batchId).toBe(NEW_BATCH_ID);

    const audit = mockWriteAudit.mock.calls[0][0];
    expect(audit.action).toBe('create');
    expect(audit.resource).toBe('transport_batch');
    expect(audit.resourceId).toBe(NEW_BATCH_ID);
    expect(audit.meta).toEqual({
      action: 'split_suggestion',
      originalBatchId: BATCH_ID,
      splitCount: 1,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });
});

// ──────────────────────────────────────────────────────────────
// getSuggestedBatches full return shape with grouped passengers
// ──────────────────────────────────────────────────────────────
describe('getSuggestedBatches passenger grouping', () => {
  it('returns batches with passengers grouped by batchId (including empty groups)', async () => {
    const batch1 = {
      id: BATCH_ID,
      eventId: EVENT_ID,
      movementType: 'arrival',
      serviceDate: new Date('2026-05-01T00:00:00Z'),
      timeWindowStart: new Date('2026-05-01T06:00:00Z'),
      timeWindowEnd: new Date('2026-05-01T09:00:00Z'),
      sourceCity: 'Mumbai',
      pickupHub: 'BOM',
      dropHub: 'Hotel',
      batchStatus: 'planned',
      batchSource: 'auto',
    };
    const batch2 = { ...batch1, id: OTHER_BATCH_ID };

    // batches query
    chainedSelectAwaitable([batch1, batch2]);
    // passenger rows joined to people – returns one for batch1, none for batch2
    chainedSelectAwaitable([
      {
        id: ASSIGNMENT_ID,
        batchId: BATCH_ID,
        personId: PERSON_ID,
        travelRecordId: TRAVEL_ID,
        personName: 'Alice',
      },
    ]);

    const result = await getSuggestedBatches(EVENT_ID);

    expect(result).toHaveLength(2);
    const first = result.find((b) => b.id === BATCH_ID)!;
    expect(first.passengers).toEqual([
      { id: ASSIGNMENT_ID, personId: PERSON_ID, travelRecordId: TRAVEL_ID, personName: 'Alice' },
    ]);
    const second = result.find((b) => b.id === OTHER_BATCH_ID)!;
    expect(second.passengers).toEqual([]);
    // Ensure the projected shape includes all documented fields.
    expect(first).toMatchObject({
      id: BATCH_ID,
      eventId: EVENT_ID,
      movementType: 'arrival',
      batchStatus: 'planned',
      batchSource: 'auto',
      sourceCity: 'Mumbai',
    });
  });

  it('returns [] when no auto batches exist', async () => {
    chainedSelectAwaitable([]);
    const result = await getSuggestedBatches(EVENT_ID);
    expect(result).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────
// refreshTransportSuggestions goes through the write gate
// ──────────────────────────────────────────────────────────────
describe('refreshTransportSuggestions', () => {
  it('requires write access (delegates to the write gate)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(refreshTransportSuggestions(EVENT_ID)).rejects.toThrow(/Forbidden/);
  });

  it('calls generateTransportSuggestions and returns its result', async () => {
    chainedSelectAwaitable([]); // assigned rows
    chainedSelectAwaitable([]); // travel rows
    chainedSelectAwaitable([]); // existing auto batches

    const result = await refreshTransportSuggestions(EVENT_ID);
    expect(result).toEqual({ created: 0, skipped: 0 });
  });
});

// ──────────────────────────────────────────────────────────────
// generateTransportSuggestions — skip + insert branches
// ──────────────────────────────────────────────────────────────
describe('generateTransportSuggestions insert branch', () => {
  function travelRow(arrival: string, overrides: Record<string, unknown> = {}) {
    return {
      id: TRAVEL_ID,
      personId: PERSON_ID,
      direction: 'inbound',
      toCity: 'Mumbai',
      toLocation: 'BOM',
      fromCity: 'Delhi',
      fromLocation: 'DEL',
      arrivalAtUtc: new Date(arrival),
      departureAtUtc: null,
      ...overrides,
    };
  }

  it('inserts passenger assignments with assignmentStatus="pending" when creating a new batch', async () => {
    chainedSelectAwaitable([]); // assigned rows
    chainedSelectAwaitable([travelRow('2026-05-01T08:15:00Z')]);
    chainedSelectAwaitable([]); // no existing auto batches
    const batchInsert = chainedInsert([{ id: BATCH_ID }]);
    const passengerInsert = chainedInsert([]);

    const result = await generateTransportSuggestions(EVENT_ID);

    expect(result).toEqual({ created: 1, skipped: 0 });
    // batch insert shape
    const bv = batchInsert.values.mock.calls[0][0];
    expect(bv.batchSource).toBe('auto');
    expect(bv.batchStatus).toBe('planned');
    expect(bv.pickupHubType).toBe('other');
    expect(bv.dropHubType).toBe('other');
    expect(bv.createdBy).toBe('system');
    expect(bv.updatedBy).toBe('system');
    // passenger insert shape
    const pv = passengerInsert.values.mock.calls[0][0];
    expect(Array.isArray(pv)).toBe(true);
    expect(pv[0].assignmentStatus).toBe('pending');
    expect(pv[0].batchId).toBe(BATCH_ID);
    expect(pv[0].vehicleAssignmentId).toBeNull();
    expect(pv[0].eventId).toBe(EVENT_ID);
  });

  it('adds passengers to an existing batch and counts as skipped when key matches', async () => {
    chainedSelectAwaitable([]); // assigned rows
    chainedSelectAwaitable([travelRow('2026-05-01T08:15:00Z')]);
    // Existing auto batch matches movementType|sourceCity|timeWindowStart.
    chainedSelectAwaitable([{
      id: BATCH_ID,
      movementType: 'arrival',
      sourceCity: 'Mumbai',
      timeWindowStart: new Date('2026-05-01T06:00:00.000Z'),
    }]);
    const passengerInsert = chainedInsert([]);

    const result = await generateTransportSuggestions(EVENT_ID);

    expect(result).toEqual({ created: 0, skipped: 1 });
    // Only passenger insert should have been called, not batch insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const pv = passengerInsert.values.mock.calls[0][0];
    expect(pv[0].batchId).toBe(BATCH_ID);
    expect(pv[0].assignmentStatus).toBe('pending');
    expect(pv[0].vehicleAssignmentId).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// updatePassengerStatus / movePassenger status guards
// ──────────────────────────────────────────────────────────────
describe('movePassenger status guards rejects terminal states', () => {
  it('rejects when status is no_show', async () => {
    chainedSelect([{
      id: PASSENGER_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID, assignmentStatus: 'no_show', updatedAt: new Date(),
    }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: OTHER_ASSIGNMENT_ID,
    })).rejects.toThrow(/"no_show"/);
  });

  it('rejects when status is completed', async () => {
    chainedSelect([{
      id: PASSENGER_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID, assignmentStatus: 'completed', updatedAt: new Date(),
    }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: '',
    })).rejects.toThrow(/"completed"/);
  });

  it('rejects when status is cancelled', async () => {
    chainedSelect([{
      id: PASSENGER_ID, eventId: EVENT_ID, batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID, assignmentStatus: 'cancelled', updatedAt: new Date(),
    }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: '',
    })).rejects.toThrow(/"cancelled"/);
  });
});
