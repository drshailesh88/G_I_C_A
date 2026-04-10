import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user_123' }) }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));

import {
  createTransportBatch,
  updateBatchStatus,
  createVehicleAssignment,
  updateVehicleStatus,
  assignPassenger,
  movePassenger,
  updatePassengerStatus,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
});

// ══════════════════════════════════════════════════════════════
// BATCHES
// ══════════════════════════════════════════════════════════════
describe('createTransportBatch', () => {
  it('creates a batch', async () => {
    chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);
    const result = await createTransportBatch(EVENT_ID, {
      movementType: 'arrival',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'BOM T2',
      dropHub: 'Hotel Leela',
    });
    expect(result.batchStatus).toBe('planned');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('rejects invalid input', async () => {
    await expect(createTransportBatch(EVENT_ID, { movementType: 'invalid' })).rejects.toThrow();
  });
});

describe('updateBatchStatus', () => {
  it('allows planned → ready', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'ready' }]);

    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'ready');
    expect(result.batchStatus).toBe('ready');
  });

  it('allows ready → in_progress', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'ready' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'in_progress' }]);

    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'in_progress');
    expect(result.batchStatus).toBe('in_progress');
  });

  it('rejects completed → planned (terminal)', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'completed' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'planned')).rejects.toThrow('Cannot transition');
  });

  it('rejects planned → in_progress (must go through ready)', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'in_progress')).rejects.toThrow('Cannot transition');
  });

  it('throws when batch not found', async () => {
    chainedSelect([]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'ready')).rejects.toThrow('Transport batch not found');
  });
});

// ══════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════
describe('createVehicleAssignment', () => {
  it('creates a vehicle within a batch', async () => {
    chainedSelect([{ id: BATCH_ID }]);  // batch exists
    chainedInsert([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);

    const result = await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 12,
    });
    expect(result.assignmentStatus).toBe('assigned');
  });

  it('throws when batch not found', async () => {
    chainedSelect([]);
    await expect(createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 12,
    })).rejects.toThrow('Transport batch not found');
  });
});

describe('updateVehicleStatus', () => {
  it('allows assigned → dispatched', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);
    const result = await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched');
    expect(result.assignmentStatus).toBe('dispatched');
  });

  it('rejects completed → assigned (terminal)', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'completed' }]);
    await expect(updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'assigned')).rejects.toThrow('Cannot transition');
  });
});

// ══════════════════════════════════════════════════════════════
// PASSENGERS
// ══════════════════════════════════════════════════════════════
describe('assignPassenger', () => {
  it('assigns a passenger to a batch (pending without vehicle)', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    const result = await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });
    expect(result.assignmentStatus).toBe('pending');
  });

  it('assigns as assigned when vehicle is specified', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);

    const result = await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleAssignmentId: VEHICLE_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });
    expect(result.assignmentStatus).toBe('assigned');
  });

  it('throws when batch not found', async () => {
    chainedSelect([]);
    await expect(assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    })).rejects.toThrow('Transport batch not found');
  });
});

describe('movePassenger', () => {
  it('moves passenger to a different vehicle', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned', vehicleAssignmentId: VEHICLE_ID }]);

    const result = await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    });
    expect(result.vehicleAssignmentId).toBe(VEHICLE_ID);
  });

  it('moves passenger to unassigned (pending)', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    const updateChain = chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);

    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.vehicleAssignmentId).toBeNull();
    expect(setCall.assignmentStatus).toBe('pending');
  });

  it('throws when moving completed passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    })).rejects.toThrow('Cannot move a passenger in "completed" status');
  });

  it('throws when moving no_show passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'no_show' }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    })).rejects.toThrow('Cannot move a passenger in "no_show" status');
  });
});

describe('updatePassengerStatus', () => {
  it('allows pending → assigned', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    const result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned');
    expect(result.assignmentStatus).toBe('assigned');
  });

  it('allows pending → boarded (ops override)', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'boarded' }]);
    const result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'boarded');
    expect(result.assignmentStatus).toBe('boarded');
  });

  it('allows assigned → no_show', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'no_show' }]);
    const result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'no_show');
    expect(result.assignmentStatus).toBe('no_show');
  });

  it('rejects no_show → assigned (terminal)', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'no_show' }]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned')).rejects.toThrow('Cannot transition');
  });

  it('throws when not found', async () => {
    chainedSelect([]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned')).rejects.toThrow('Passenger assignment not found');
  });
});

// ══════════════════════════════════════════════════════════════
// HARDENING: updateTransportBatch
// ══════════════════════════════════════════════════════════════
import { updateTransportBatch, getEventTransportBatches, getTransportBatch, getBatchVehicles, getBatchPassengers } from './transport';

describe('updateTransportBatch', () => {
  it('allows partial update on planned batch', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID, sourceCity: 'Delhi' }]);

    const result = await updateTransportBatch(EVENT_ID, {
      batchId: BATCH_ID,
      sourceCity: 'Delhi',
    });
    expect(result.sourceCity).toBe('Delhi');
  });

  it('blocks update on completed batch', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'completed' }]);
    await expect(
      updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'Delhi' }),
    ).rejects.toThrow('Cannot update a batch in "completed" status');
  });

  it('blocks update on cancelled batch', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    await expect(
      updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'Delhi' }),
    ).rejects.toThrow('Cannot update a batch in "cancelled" status');
  });

  it('throws when batch not found', async () => {
    chainedSelect([]);
    await expect(
      updateTransportBatch(EVENT_ID, { batchId: BATCH_ID, sourceCity: 'Delhi' }),
    ).rejects.toThrow('Transport batch not found');
  });
});

// ══════════════════════════════════════════════════════════════
// HARDENING: Batch status full lifecycle
// ══════════════════════════════════════════════════════════════
describe('updateBatchStatus — full lifecycle', () => {
  it('allows cancellation from planned', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'planned' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'cancelled');
    expect(result.batchStatus).toBe('cancelled');
  });

  it('allows cancellation from ready', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'ready' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'cancelled');
    expect(result.batchStatus).toBe('cancelled');
  });

  it('allows cancellation from in_progress', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'in_progress' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'cancelled');
    expect(result.batchStatus).toBe('cancelled');
  });

  it('allows in_progress -> completed', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'in_progress' }]);
    chainedUpdate([{ id: BATCH_ID, batchStatus: 'completed' }]);
    const result = await updateBatchStatus(EVENT_ID, BATCH_ID, 'completed');
    expect(result.batchStatus).toBe('completed');
  });

  it('rejects cancelled -> anything', async () => {
    chainedSelect([{ id: BATCH_ID, batchStatus: 'cancelled' }]);
    await expect(updateBatchStatus(EVENT_ID, BATCH_ID, 'planned')).rejects.toThrow('Cannot transition');
  });
});

// ══════════════════════════════════════════════════════════════
// HARDENING: Vehicle status not found
// ══════════════════════════════════════════════════════════════
describe('updateVehicleStatus — not found', () => {
  it('throws when vehicle assignment not found', async () => {
    chainedSelect([]);
    await expect(updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'dispatched')).rejects.toThrow('Vehicle assignment not found');
  });
});

// ══════════════════════════════════════════════════════════════
// HARDENING: Read actions call assertEventAccess
// ══════════════════════════════════════════════════════════════
describe('Read actions — auth', () => {
  it('getEventTransportBatches calls assertEventAccess without requireWrite', async () => {
    chainedSelect([]);
    await getEventTransportBatches(EVENT_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('getTransportBatch calls assertEventAccess without requireWrite', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    await getTransportBatch(EVENT_ID, BATCH_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('getBatchVehicles calls assertEventAccess without requireWrite', async () => {
    chainedSelect([]);
    await getBatchVehicles(EVENT_ID, BATCH_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('getBatchPassengers calls assertEventAccess without requireWrite', async () => {
    const innerJoinChain = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    mockDb.select.mockReturnValue(innerJoinChain);
    await getBatchPassengers(EVENT_ID, BATCH_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-01-CP-15 — getEventTransportBatches filters by eventId
// ══════════════════════════════════════════════════════════════
describe('getEventTransportBatches — event filtering', () => {
  it('returns only batches for the given eventId', async () => {
    const batches = [
      { id: BATCH_ID, eventId: EVENT_ID, batchStatus: 'planned' },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(batches),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getEventTransportBatches(EVENT_ID);
    expect(result).toEqual(batches);
    expect(chain.where).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-01-CP-16 — getEventTransportBatches sorts descending
// ══════════════════════════════════════════════════════════════
describe('getEventTransportBatches — sorting', () => {
  it('returns batches sorted by serviceDate descending', async () => {
    const batches = [
      { id: 'b2', serviceDate: '2026-05-02' },
      { id: 'b1', serviceDate: '2026-05-01' },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(batches),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getEventTransportBatches(EVENT_ID);
    expect(result).toEqual(batches);
    expect(chain.orderBy).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-02-CP-05 — optional fields stored on vehicle
// ══════════════════════════════════════════════════════════════
describe('createVehicleAssignment — optional fields', () => {
  it('stores optional fields (plateNumber, vendorName, driver, scheduled times)', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    const insertChain = chainedInsert([{
      id: VEHICLE_ID,
      assignmentStatus: 'assigned',
      plateNumber: 'MH12AB1234',
      vendorName: 'FastCabs',
      driverName: 'Ramesh',
      driverMobileE164: '+919876543210',
      scheduledPickupAtUtc: '2026-05-01T08:00:00Z',
    }]);

    const result = await createVehicleAssignment(EVENT_ID, {
      batchId: BATCH_ID,
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 12,
      plateNumber: 'MH12AB1234',
      vendorName: 'FastCabs',
      driverName: 'Ramesh',
      driverMobileE164: '+919876543210',
      scheduledPickupAtUtc: '2026-05-01T08:00:00Z',
    });

    expect(result.assignmentStatus).toBe('assigned');
    // Verify insert was called with optional fields
    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.plateNumber).toBe('MH12AB1234');
    expect(insertCall.vendorName).toBe('FastCabs');
    expect(insertCall.driverName).toBe('Ramesh');
    expect(insertCall.driverMobileE164).toBe('+919876543210');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-02-CP-07 — vehicle cancellation transitions
// ══════════════════════════════════════════════════════════════
describe('updateVehicleStatus — cancellation', () => {
  it('allows assigned → cancelled', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'cancelled' }]);
    const result = await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'cancelled');
    expect(result.assignmentStatus).toBe('cancelled');
  });

  it('allows dispatched → cancelled', async () => {
    chainedSelect([{ id: VEHICLE_ID, assignmentStatus: 'dispatched' }]);
    chainedUpdate([{ id: VEHICLE_ID, assignmentStatus: 'cancelled' }]);
    const result = await updateVehicleStatus(EVENT_ID, VEHICLE_ID, 'cancelled');
    expect(result.assignmentStatus).toBe('cancelled');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-03-CP-09 — movePassenger blocks cancelled
// ══════════════════════════════════════════════════════════════
describe('movePassenger — cancelled', () => {
  it('throws when moving cancelled passenger', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'cancelled' }]);
    await expect(movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    })).rejects.toThrow('Cannot move a passenger in "cancelled" status');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-03-CP-10 — full passenger lifecycle chain
// ══════════════════════════════════════════════════════════════
describe('updatePassengerStatus — full lifecycle', () => {
  it('allows pending → assigned → boarded → completed', async () => {
    // pending → assigned
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    let result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned');
    expect(result.assignmentStatus).toBe('assigned');

    // assigned → boarded
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'boarded' }]);
    result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'boarded');
    expect(result.assignmentStatus).toBe('boarded');

    // boarded → completed
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'boarded' }]);
    chainedUpdate([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);
    result = await updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'completed');
    expect(result.assignmentStatus).toBe('completed');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-03-CP-13 — completed terminal state
// ══════════════════════════════════════════════════════════════
describe('updatePassengerStatus — completed terminal', () => {
  it('rejects completed → assigned (terminal)', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'completed' }]);
    await expect(updatePassengerStatus(EVENT_ID, PASSENGER_ID, 'assigned')).rejects.toThrow('Cannot transition');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-03-CP-15 — getBatchPassengers joins person data
// ══════════════════════════════════════════════════════════════
describe('getBatchPassengers — person join', () => {
  it('returns passengers with person name and phone joined', async () => {
    const rows = [
      {
        id: PASSENGER_ID,
        batchId: BATCH_ID,
        personId: PERSON_ID,
        assignmentStatus: 'assigned',
        personName: 'Dr. Test',
        personPhone: '+919876543210',
      },
    ];
    const innerJoinChain = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      }),
    };
    mockDb.select.mockReturnValue(innerJoinChain);

    const result = await getBatchPassengers(EVENT_ID, BATCH_ID);
    expect(result[0].personName).toBe('Dr. Test');
    expect(result[0].personPhone).toBe('+919876543210');
  });
});

// ══════════════════════════════════════════════════════════════
// ANNEAL GAP: Spec-05-CP-02 — write actions use requireWrite
// ══════════════════════════════════════════════════════════════
describe('Write actions — requireWrite', () => {
  it('createTransportBatch calls assertEventAccess with requireWrite: true', async () => {
    chainedInsert([{ id: BATCH_ID, batchStatus: 'planned' }]);
    await createTransportBatch(EVENT_ID, {
      movementType: 'arrival',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'BOM T2',
      dropHub: 'Hotel',
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('assignPassenger calls assertEventAccess with requireWrite: true', async () => {
    chainedSelect([{ id: BATCH_ID }]);
    chainedInsert([{ id: PASSENGER_ID, assignmentStatus: 'pending' }]);
    await assignPassenger(EVENT_ID, {
      batchId: BATCH_ID,
      personId: PERSON_ID,
      travelRecordId: TRAVEL_ID,
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('movePassenger calls assertEventAccess with requireWrite: true', async () => {
    chainedSelect([{ id: PASSENGER_ID, assignmentStatus: 'assigned' }]);
    chainedUpdate([{ id: PASSENGER_ID }]);
    await movePassenger(EVENT_ID, {
      passengerAssignmentId: PASSENGER_ID,
      targetVehicleAssignmentId: VEHICLE_ID,
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});
