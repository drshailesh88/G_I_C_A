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
