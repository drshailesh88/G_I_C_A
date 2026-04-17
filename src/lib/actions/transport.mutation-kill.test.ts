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
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));

import {
  createTransportBatch,
  updateTransportBatch,
  updateBatchStatus,
  getTransportBatch,
  createVehicleAssignment,
  updateVehicleStatus,
  assignPassenger,
  movePassenger,
  updatePassengerStatus,
  getBatchPassengers,
} from './transport';

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const VEHICLE_ID = '550e8400-e29b-41d4-a716-446655440002';
const PASSENGER_ID = '550e8400-e29b-41d4-a716-446655440003';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440004';
const TRAVEL_ID = '550e8400-e29b-41d4-a716-446655440005';
const VEHICLE_ID_2 = '550e8400-e29b-41d4-a716-446655440006';

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral + StringLiteral on createTransportBatch
// Verify exact shape of values passed to db.insert
// ══════════════════════════════════════════════════════════════
describe('createTransportBatch — exact insert values', () => {
  const validInput = {
    movementType: 'arrival' as const,
    batchSource: 'auto' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    pickupHubType: 'airport' as const,
    dropHub: 'Hotel Leela',
    dropHubType: 'hotel' as const,
    notes: 'VIP group',
  };

  it('passes all validated fields to db.insert().values()', async () => {
    const insertChain = chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);

    await createTransportBatch(EVENT_ID, validInput);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.eventId).toBe(EVENT_ID);
    expect(values.movementType).toBe('arrival');
    expect(values.batchSource).toBe('auto');
    expect(values.serviceDate).toEqual(new Date('2026-05-01T00:00:00Z'));
    expect(values.timeWindowStart).toEqual(new Date('2026-05-01T08:00:00Z'));
    expect(values.timeWindowEnd).toEqual(new Date('2026-05-01T10:00:00Z'));
    expect(values.sourceCity).toBe('Mumbai');
    expect(values.pickupHub).toBe('BOM T2');
    expect(values.pickupHubType).toBe('airport');
    expect(values.dropHub).toBe('Hotel Leela');
    expect(values.dropHubType).toBe('hotel');
    expect(values.notes).toBe('VIP group');
    expect(values.batchStatus).toBe('planned');
    expect(values.createdBy).toBe('user_123');
    expect(values.updatedBy).toBe('user_123');
  });

  it('coerces empty notes to null', async () => {
    const insertChain = chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);

    await createTransportBatch(EVENT_ID, { ...validInput, notes: '' });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.notes).toBeNull();
  });

  it('coerces undefined notes to null', async () => {
    const insertChain = chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const { notes, ...noNotes } = validInput;

    await createTransportBatch(EVENT_ID, noNotes);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.notes).toBeNull();
  });

  it('revalidates the correct path', async () => {
    chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);

    await createTransportBatch(EVENT_ID, validInput);

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ConditionalExpression + EqualityOperator on updateTransportBatch
// Lines 87-95: each if (fields.X !== undefined) must be tested
// ══════════════════════════════════════════════════════════════
describe('updateTransportBatch — conditional field updates', () => {
  it('updates only serviceDate when only serviceDate is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      serviceDate: '2026-06-01T00:00:00Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.serviceDate).toEqual(new Date('2026-06-01T00:00:00Z'));
    expect(setData.updatedBy).toBe('user_123');
    expect(setData.updatedAt).toBeInstanceOf(Date);
    // Fields NOT provided should NOT be in the update
    expect(setData).not.toHaveProperty('sourceCity');
    expect(setData).not.toHaveProperty('pickupHub');
    expect(setData).not.toHaveProperty('pickupHubType');
    expect(setData).not.toHaveProperty('dropHub');
    expect(setData).not.toHaveProperty('dropHubType');
    expect(setData).not.toHaveProperty('notes');
    expect(setData).not.toHaveProperty('timeWindowStart');
    expect(setData).not.toHaveProperty('timeWindowEnd');
  });

  it('updates only timeWindowStart when only timeWindowStart is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'ready' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      timeWindowStart: '2026-05-01T09:00:00Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.timeWindowStart).toEqual(new Date('2026-05-01T09:00:00Z'));
    expect(setData).not.toHaveProperty('serviceDate');
    expect(setData).not.toHaveProperty('timeWindowEnd');
  });

  it('updates only timeWindowEnd when only timeWindowEnd is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      timeWindowEnd: '2026-05-01T12:00:00Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.timeWindowEnd).toEqual(new Date('2026-05-01T12:00:00Z'));
    expect(setData).not.toHaveProperty('timeWindowStart');
  });

  it('updates only sourceCity when only sourceCity is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      sourceCity: 'Delhi',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.sourceCity).toBe('Delhi');
    expect(setData).not.toHaveProperty('pickupHub');
  });

  it('updates only pickupHub when only pickupHub is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      pickupHub: 'DEL T3',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.pickupHub).toBe('DEL T3');
    expect(setData).not.toHaveProperty('sourceCity');
  });

  it('updates only pickupHubType when only pickupHubType is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      pickupHubType: 'railway_station',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.pickupHubType).toBe('railway_station');
    expect(setData).not.toHaveProperty('dropHubType');
  });

  it('updates only dropHub when only dropHub is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      dropHub: 'Venue Hall',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.dropHub).toBe('Venue Hall');
    expect(setData).not.toHaveProperty('pickupHub');
  });

  it('updates only dropHubType when only dropHubType is provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      dropHubType: 'venue',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.dropHubType).toBe('venue');
    expect(setData).not.toHaveProperty('pickupHubType');
  });

  it('coerces empty notes to null in update', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      notes: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBeNull();
  });

  it('passes non-empty notes through in update', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      notes: 'Updated note',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('Updated note');
  });

  it('updates all fields simultaneously when all provided', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      serviceDate: '2026-06-01T00:00:00Z',
      timeWindowStart: '2026-06-01T08:00:00Z',
      timeWindowEnd: '2026-06-01T12:00:00Z',
      sourceCity: 'Chennai',
      pickupHub: 'MAA T1',
      pickupHubType: 'airport',
      dropHub: 'Convention Center',
      dropHubType: 'venue',
      notes: 'All fields',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.serviceDate).toEqual(new Date('2026-06-01T00:00:00Z'));
    expect(setData.timeWindowStart).toEqual(new Date('2026-06-01T08:00:00Z'));
    expect(setData.timeWindowEnd).toEqual(new Date('2026-06-01T12:00:00Z'));
    expect(setData.sourceCity).toBe('Chennai');
    expect(setData.pickupHub).toBe('MAA T1');
    expect(setData.pickupHubType).toBe('airport');
    expect(setData.dropHub).toBe('Convention Center');
    expect(setData.dropHubType).toBe('venue');
    expect(setData.notes).toBe('All fields');
  });

  it('revalidates the correct path after update', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      sourceCity: 'Delhi',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('includes exact error message for completed batch', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'completed' }]);
    await expect(
      updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'X' }),
    ).rejects.toThrow('Cannot update a batch in "completed" status');
  });

  it('includes exact error message for cancelled batch', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    await expect(
      updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'X' }),
    ).rejects.toThrow('Cannot update a batch in "cancelled" status');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral + ObjectLiteral on updateBatchStatus
// Verify exact error messages including "Allowed:" portion
// ══════════════════════════════════════════════════════════════
describe('updateBatchStatus — exact error messages', () => {
  it('error message includes from/to status names and allowed list', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'completed')).rejects.toThrow(
      'Cannot transition batch from "planned" to "completed". Allowed: ready, cancelled',
    );
  });

  it('error message for terminal state says none (terminal)', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'completed' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).rejects.toThrow(
      'Cannot transition batch from "completed" to "ready". Allowed: none (terminal)',
    );
  });

  it('revalidates correct path on success', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);

    await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('passes exact set object to db.update', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const updateChain = chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);

    await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.batchStatus).toBe('ready');
    expect(setData.updatedBy).toBe('user_123');
    expect(setData.updatedAt).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral on getTransportBatch
// ══════════════════════════════════════════════════════════════
describe('getTransportBatch — error message', () => {
  it('throws exact "Transport batch not found" message', async () => {
    chainedSelect([]);
    await expect(getTransportBatch(EVENT_ID, BATCH_ID)).rejects.toThrow('Transport batch not found');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral + LogicalOperator + StringLiteral on createVehicleAssignment
// Verify exact shape of values passed, including null coercions
// ══════════════════════════════════════════════════════════════
describe('createVehicleAssignment — exact insert values', () => {
  it('passes all fields to db.insert().values() with correct types', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Bus-1',
      vehicleType: 'bus',
      plateNumber: 'MH12AB1234',
      vendorName: 'FastCabs',
      vendorContactE164: '+919999999999',
      driverName: 'Ramesh',
      driverMobileE164: '+919876543210',
      capacity: 50,
      scheduledPickupAtUtc: '2026-05-01T08:00:00Z',
      scheduledDropAtUtc: '2026-05-01T10:00:00Z',
      notes: 'AC vehicle',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.eventId).toBe(EVENT_ID);
    expect(values.batchId).toBe(BATCH_ID);
    expect(values.vehicleLabel).toBe('Bus-1');
    expect(values.vehicleType).toBe('bus');
    expect(values.plateNumber).toBe('MH12AB1234');
    expect(values.vendorName).toBe('FastCabs');
    expect(values.vendorContactE164).toBe('+919999999999');
    expect(values.driverName).toBe('Ramesh');
    expect(values.driverMobileE164).toBe('+919876543210');
    expect(values.capacity).toBe(50);
    expect(values.scheduledPickupAtUtc).toEqual(new Date('2026-05-01T08:00:00Z'));
    expect(values.scheduledDropAtUtc).toEqual(new Date('2026-05-01T10:00:00Z'));
    expect(values.notes).toBe('AC vehicle');
    expect(values.assignmentStatus).toBe('assigned');
    expect(values.createdBy).toBe('user_123');
    expect(values.updatedBy).toBe('user_123');
  });

  it('coerces empty optional strings to null', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 8,
      plateNumber: '',
      vendorName: '',
      vendorContactE164: '',
      driverName: '',
      driverMobileE164: '',
      scheduledPickupAtUtc: '',
      scheduledDropAtUtc: '',
      notes: '',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.plateNumber).toBeNull();
    expect(values.vendorName).toBeNull();
    expect(values.vendorContactE164).toBeNull();
    expect(values.driverName).toBeNull();
    expect(values.driverMobileE164).toBeNull();
    expect(values.scheduledPickupAtUtc).toBeNull();
    expect(values.scheduledDropAtUtc).toBeNull();
    expect(values.notes).toBeNull();
  });

  it('coerces undefined optional strings to null', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-2',
      vehicleType: 'sedan',
      capacity: 4,
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.plateNumber).toBeNull();
    expect(values.vendorName).toBeNull();
    expect(values.vendorContactE164).toBeNull();
    expect(values.driverName).toBeNull();
    expect(values.driverMobileE164).toBeNull();
    expect(values.scheduledPickupAtUtc).toBeNull();
    expect(values.scheduledDropAtUtc).toBeNull();
    expect(values.notes).toBeNull();
  });

  it('revalidates the correct path', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 8,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws exact error when batch not found', async () => {
    chainedSelect([]);
    await expect(
      createVehicleAssignment(EVENT_ID, {
        batchId: BATCH_ID,
        vehicleLabel: 'Van-1',
        vehicleType: 'van',
        capacity: 8,
      }),
    ).rejects.toThrow('Transport batch not found');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral + ObjectLiteral on updateVehicleStatus
// Exact error messages and set object
// ══════════════════════════════════════════════════════════════
describe('updateVehicleStatus — exact error messages and values', () => {
  it('error message includes from/to and allowed list', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    await expect(updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'completed')).rejects.toThrow(
      'Cannot transition vehicle from "assigned" to "completed". Allowed: dispatched, cancelled',
    );
  });

  it('error message for terminal state says none (terminal)', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'cancelled' }]);
    await expect(updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'assigned')).rejects.toThrow(
      'Cannot transition vehicle from "cancelled" to "assigned". Allowed: none (terminal)',
    );
  });

  it('passes exact set object to db.update on success', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    const updateChain = chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);

    await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.assignmentStatus).toBe('dispatched');
    expect(setData.updatedBy).toBe('user_123');
    expect(setData.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates the correct path', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'completed' }]);

    await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'completed');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws exact error when vehicle not found', async () => {
    chainedSelect([]);
    await expect(updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched')).rejects.toThrow(
      'Vehicle assignment not found',
    );
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral + ConditionalExpression + LogicalOperator on assignPassenger
// Lines 265-270: status logic based on vehicleAssignmentId
// ══════════════════════════════════════════════════════════════
describe('assignPassenger — exact insert values', () => {
  it('sets assignmentStatus to "assigned" when vehicleAssignmentId is provided', async () => {
    const batchChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: BATCH_ID, batchStatus: 'planned' }]),
    };
    const travelChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: TRAVEL_ID }]),
    };
    const vehicleChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: VEHICLE_ID, batchId: BATCH_ID, assignmentStatus: 'assigned' }]),
    };
    mockDb.select
      .mockReturnValueOnce(batchChain)
      .mockReturnValueOnce(travelChain)
      .mockReturnValueOnce(vehicleChain);
    const insertChain = chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
      pickupNote: 'Gate 3',
      dropNote: 'Main lobby',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.eventId).toBe(EVENT_ID);
    expect(values.batchId).toBe(BATCH_ID);
    expect(values.vehicleAssignmentId).toBe(VEHICLE_ID);
    expect(values.personId).toBe(PERSON_ID);
    expect(values.travelRecordId).toBe(TRAVEL_ID);
    expect(values.assignmentStatus).toBe('assigned');
    expect(values.pickupNote).toBe('Gate 3');
    expect(values.dropNote).toBe('Main lobby');
  });

  it('sets assignmentStatus to "pending" when vehicleAssignmentId is absent', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.vehicleAssignmentId).toBeNull();
    expect(values.assignmentStatus).toBe('pending');
    expect(values.pickupNote).toBeNull();
    expect(values.dropNote).toBeNull();
  });

  it('sets vehicleAssignmentId to null when empty string is provided', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleAssignmentId: '',
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.vehicleAssignmentId).toBeNull();
    expect(values.assignmentStatus).toBe('pending');
  });

  it('coerces empty pickupNote and dropNote to null', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
      pickupNote: '',
      dropNote: '',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.pickupNote).toBeNull();
    expect(values.dropNote).toBeNull();
  });

  it('revalidates the correct path', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws exact error when batch not found', async () => {
    chainedSelect([]);
    await expect(
      assignPassenger(EVENT_ID, {
        batchId: BATCH_ID,
        personId: PERSON_ID,
        travelRecordId: TRAVEL_ID,
      }),
    ).rejects.toThrow('Transport batch not found');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ConditionalExpression + LogicalOperator + StringLiteral on movePassenger
// Lines 294-312
// ══════════════════════════════════════════════════════════════
describe('movePassenger — exact set values and error messages', () => {
  it('sets vehicleAssignmentId and status "assigned" when target is provided', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    const updateChain = chainedUpdate([{ id: PASSENGER_ID }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.vehicleAssignmentId).toBe(VEHICLE_ID);
    expect(setData.assignmentStatus).toBe('assigned');
    expect(setData.updatedAt).toBeInstanceOf(Date);
  });

  it('sets vehicleAssignmentId null and status "pending" when target is empty', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    const updateChain = chainedUpdate([{ id: PASSENGER_ID }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.vehicleAssignmentId).toBeNull();
    expect(setData.assignmentStatus).toBe('pending');
  });

  it('sets vehicleAssignmentId null and status "pending" when target is undefined', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    const updateChain = chainedUpdate([{ id: PASSENGER_ID }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.vehicleAssignmentId).toBeNull();
    expect(setData.assignmentStatus).toBe('pending');
  });

  it('throws exact error message for completed passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);
    await expect(
      movePassenger(EVENT_ID, { passengerAssignmentId: PASSENGER_ID, targetVehicleAssignmentId: VEHICLE_ID }),
    ).rejects.toThrow('Cannot move a passenger in "completed" status');
  });

  it('throws exact error message for cancelled passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'cancelled' }]);
    await expect(
      movePassenger(EVENT_ID, { passengerAssignmentId: PASSENGER_ID, targetVehicleAssignmentId: VEHICLE_ID }),
    ).rejects.toThrow('Cannot move a passenger in "cancelled" status');
  });

  it('throws exact error message for no_show passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'no_show' }]);
    await expect(
      movePassenger(EVENT_ID, { passengerAssignmentId: PASSENGER_ID, targetVehicleAssignmentId: VEHICLE_ID }),
    ).rejects.toThrow('Cannot move a passenger in "no_show" status');
  });

  it('throws exact error when passenger not found', async () => {
    chainedSelect([]);
    await expect(
      movePassenger(EVENT_ID, { passengerAssignmentId: PASSENGER_ID, targetVehicleAssignmentId: VEHICLE_ID }),
    ).rejects.toThrow('Passenger assignment not found');
  });

  it('revalidates the correct path', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    chainedUpdate([{ id: PASSENGER_ID }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral + ObjectLiteral on updatePassengerStatus
// Exact error messages and set values
// ══════════════════════════════════════════════════════════════
describe('updatePassengerStatus — exact error messages and values', () => {
  it('error message includes from/to and allowed list', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'completed')).rejects.toThrow(
      'Cannot transition passenger from "pending" to "completed". Allowed: assigned, boarded, cancelled',
    );
  });

  it('error message for terminal state says none (terminal)', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'pending')).rejects.toThrow(
      'Cannot transition passenger from "completed" to "pending". Allowed: none (terminal)',
    );
  });

  it('error message for cancelled terminal state', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'cancelled' }]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'pending')).rejects.toThrow(
      'Cannot transition passenger from "cancelled" to "pending". Allowed: none (terminal)',
    );
  });

  it('passes exact set object to db.update on success', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    const updateChain = chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'boarded' }]);

    await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'boarded');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.assignmentStatus).toBe('boarded');
    expect(setData.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates the correct path', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'boarded' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);

    await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'completed');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('throws exact error when passenger not found', async () => {
    chainedSelect([]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned')).rejects.toThrow(
      'Passenger assignment not found',
    );
  });
});

// ══════════════════════════════════════════════════════════════
// KILL BooleanLiteral on assertEventAccess requireWrite: true
// ══════════════════════════════════════════════════════════════
describe('Write actions pass requireWrite: true', () => {
  it('updateTransportBatch requires write access', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID }]);

    await updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'X' });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('updateBatchStatus requires write access', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);

    await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('createVehicleAssignment requires write access', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'V1',
      vehicleType: 'van',
      capacity: 8,
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('updateVehicleStatus requires write access', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);

    await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('updatePassengerStatus requires write access', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);

    await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral on transport batch projection in existence checks
// createVehicleAssignment / assignPassenger now need batch status for terminal-state blocking
// ══════════════════════════════════════════════════════════════
describe('Batch existence checks use select with id projection', () => {
  it('createVehicleAssignment selects the scoped batch fields it needs', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: BATCH_ID }]),
    };
    mockDb.select.mockReturnValueOnce(chain);
    chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 8,
    });

    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('eventId');
    expect(selectArg).toHaveProperty('batchStatus');
    expect(selectArg).toHaveProperty('updatedAt');
  });

  it('assignPassenger selects the scoped batch fields it needs before validating travel linkage', async () => {
    const batchChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: BATCH_ID }]),
    };
    const travelChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: TRAVEL_ID }]),
    };
    mockDb.select.mockReturnValueOnce(batchChain).mockReturnValueOnce(travelChain);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });

    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('eventId');
    expect(selectArg).toHaveProperty('batchStatus');
    expect(selectArg).toHaveProperty('updatedAt');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral on getBatchPassengers select shape
// ══════════════════════════════════════════════════════════════
describe('getBatchPassengers — select shape', () => {
  it('passes a select object with specific fields (not select-all)', async () => {
    const innerJoinChain = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    mockDb.select.mockReturnValue(innerJoinChain);

    await getBatchPassengers(EVENT_ID, BATCH_ID);

    // select() was called with an object (not empty), meaning specific columns
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(typeof selectArg).toBe('object');
    // The object should have keys for all projected columns
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('batchId');
    expect(selectArg).toHaveProperty('vehicleAssignmentId');
    expect(selectArg).toHaveProperty('personId');
    expect(selectArg).toHaveProperty('travelRecordId');
    expect(selectArg).toHaveProperty('assignmentStatus');
    expect(selectArg).toHaveProperty('pickupNote');
    expect(selectArg).toHaveProperty('dropNote');
    expect(selectArg).toHaveProperty('personName');
    expect(selectArg).toHaveProperty('personPhone');
  });
});
