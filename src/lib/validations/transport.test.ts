import { describe, expect, it } from 'vitest';
import {
  createBatchSchema,
  createVehicleSchema,
  assignPassengerSchema,
  movePassengerSchema,
  updateBatchSchema,
  batchIdSchema,
  vehicleIdSchema,
  passengerIdSchema,
  BATCH_STATUSES,
  BATCH_TRANSITIONS,
  BATCH_SOURCES,
  VEHICLE_STATUSES,
  VEHICLE_TRANSITIONS,
  PASSENGER_STATUSES,
  PASSENGER_TRANSITIONS,
  MOVEMENT_TYPES,
  HUB_TYPES,
  VEHICLE_TYPES,
} from './transport';

// ── Constants ─────────────────────────────────────────────────
describe('Transport constants', () => {
  it('defines 2 movement types', () => {
    expect(MOVEMENT_TYPES).toEqual(['arrival', 'departure']);
  });

  it('defines 5 hub types', () => {
    expect(HUB_TYPES).toHaveLength(5);
    expect(HUB_TYPES).toContain('airport');
  });

  it('defines 6 vehicle types', () => {
    expect(VEHICLE_TYPES).toHaveLength(6);
    expect(VEHICLE_TYPES).toContain('tempo_traveller');
  });
});

// ── Batch state machine ───────────────────────────────────────
describe('Batch state machine', () => {
  it('defines 5 statuses', () => {
    expect(BATCH_STATUSES).toHaveLength(5);
  });

  it('planned → ready or cancelled', () => {
    expect(BATCH_TRANSITIONS.planned).toEqual(['ready', 'cancelled']);
  });

  it('ready → in_progress or cancelled', () => {
    expect(BATCH_TRANSITIONS.ready).toEqual(['in_progress', 'cancelled']);
  });

  it('in_progress → completed or cancelled', () => {
    expect(BATCH_TRANSITIONS.in_progress).toEqual(['completed', 'cancelled']);
  });

  it('completed and cancelled are terminal', () => {
    expect(BATCH_TRANSITIONS.completed).toEqual([]);
    expect(BATCH_TRANSITIONS.cancelled).toEqual([]);
  });
});

// ── Vehicle state machine ─────────────────────────────────────
describe('Vehicle state machine', () => {
  it('defines 4 statuses', () => {
    expect(VEHICLE_STATUSES).toHaveLength(4);
  });

  it('assigned → dispatched or cancelled', () => {
    expect(VEHICLE_TRANSITIONS.assigned).toEqual(['dispatched', 'cancelled']);
  });

  it('dispatched → completed or cancelled', () => {
    expect(VEHICLE_TRANSITIONS.dispatched).toEqual(['completed', 'cancelled']);
  });

  it('completed and cancelled are terminal', () => {
    expect(VEHICLE_TRANSITIONS.completed).toEqual([]);
    expect(VEHICLE_TRANSITIONS.cancelled).toEqual([]);
  });
});

// ── Passenger state machine ───────────────────────────────────
describe('Passenger state machine', () => {
  it('defines 6 statuses', () => {
    expect(PASSENGER_STATUSES).toHaveLength(6);
  });

  it('pending → assigned, boarded (ops override), or cancelled', () => {
    expect(PASSENGER_TRANSITIONS.pending).toContain('assigned');
    expect(PASSENGER_TRANSITIONS.pending).toContain('boarded');  // ops override
    expect(PASSENGER_TRANSITIONS.pending).toContain('cancelled');
  });

  it('assigned → boarded, no_show, or cancelled', () => {
    expect(PASSENGER_TRANSITIONS.assigned).toEqual(['boarded', 'no_show', 'cancelled']);
  });

  it('boarded → completed or cancelled', () => {
    expect(PASSENGER_TRANSITIONS.boarded).toEqual(['completed', 'cancelled']);
  });

  it('completed, no_show, and cancelled are terminal', () => {
    expect(PASSENGER_TRANSITIONS.completed).toEqual([]);
    expect(PASSENGER_TRANSITIONS.no_show).toEqual([]);
    expect(PASSENGER_TRANSITIONS.cancelled).toEqual([]);
  });
});

// ── createBatchSchema ─────────────────────────────────────────
describe('createBatchSchema', () => {
  const validInput = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM Terminal 2',
    dropHub: 'Hotel Leela',
  };

  it('accepts valid input', () => {
    const result = createBatchSchema.parse(validInput);
    expect(result.movementType).toBe('arrival');
    expect(result.batchSource).toBe('manual');
  });

  it('rejects end time before start time', () => {
    expect(() =>
      createBatchSchema.parse({
        ...validInput,
        timeWindowStart: '2026-05-01T10:00:00Z',
        timeWindowEnd: '2026-05-01T08:00:00Z',
      }),
    ).toThrow('End time must be after start time');
  });

  it('rejects invalid movement type', () => {
    expect(() =>
      createBatchSchema.parse({ ...validInput, movementType: 'transfer' }),
    ).toThrow();
  });

  it('rejects empty pickup hub', () => {
    expect(() =>
      createBatchSchema.parse({ ...validInput, pickupHub: '' }),
    ).toThrow();
  });
});

// ── createVehicleSchema ───────────────────────────────────────
describe('createVehicleSchema', () => {
  it('accepts valid input', () => {
    const result = createVehicleSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: 12,
    });
    expect(result.vehicleLabel).toBe('Van-1');
    expect(result.capacity).toBe(12);
  });

  it('rejects capacity of 0', () => {
    expect(() =>
      createVehicleSchema.parse({
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        vehicleLabel: 'Van-1',
        vehicleType: 'van',
        capacity: 0,
      }),
    ).toThrow();
  });

  it('rejects invalid vehicle type', () => {
    expect(() =>
      createVehicleSchema.parse({
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        vehicleLabel: 'X',
        vehicleType: 'helicopter',
        capacity: 4,
      }),
    ).toThrow();
  });
});

// ── assignPassengerSchema ─────────────────────────────────────
describe('assignPassengerSchema', () => {
  it('accepts valid input', () => {
    const result = assignPassengerSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      personId: '550e8400-e29b-41d4-a716-446655440001',
      travelRecordId: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.batchId).toBeDefined();
    expect(result.vehicleAssignmentId).toBeUndefined();
  });

  it('accepts optional vehicle assignment', () => {
    const result = assignPassengerSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      vehicleAssignmentId: '550e8400-e29b-41d4-a716-446655440003',
      personId: '550e8400-e29b-41d4-a716-446655440001',
      travelRecordId: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.vehicleAssignmentId).toBe('550e8400-e29b-41d4-a716-446655440003');
  });
});

// ── movePassengerSchema ───────────────────────────────────────
describe('movePassengerSchema', () => {
  it('accepts move to a vehicle', () => {
    const result = movePassengerSchema.parse({
      passengerAssignmentId: '550e8400-e29b-41d4-a716-446655440000',
      targetVehicleAssignmentId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.targetVehicleAssignmentId).toBeDefined();
  });

  it('accepts move to unassigned (empty string)', () => {
    const result = movePassengerSchema.parse({
      passengerAssignmentId: '550e8400-e29b-41d4-a716-446655440000',
      targetVehicleAssignmentId: '',
    });
    expect(result.targetVehicleAssignmentId).toBe('');
  });
});

// ── Hardening: schema defaults ───────────────────────────────
describe('Schema defaults', () => {
  it('createBatchSchema defaults pickupHubType and dropHubType to "other"', () => {
    const result = createBatchSchema.parse({
      movementType: 'arrival',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'BOM T2',
      dropHub: 'Hotel Leela',
    });
    expect(result.pickupHubType).toBe('other');
    expect(result.dropHubType).toBe('other');
  });

  it('createBatchSchema rejects notes longer than 2000 chars', () => {
    expect(() =>
      createBatchSchema.parse({
        movementType: 'arrival',
        serviceDate: '2026-05-01T00:00:00Z',
        timeWindowStart: '2026-05-01T08:00:00Z',
        timeWindowEnd: '2026-05-01T10:00:00Z',
        sourceCity: 'Mumbai',
        pickupHub: 'BOM T2',
        dropHub: 'Hotel Leela',
        notes: 'x'.repeat(2001),
      }),
    ).toThrow();
  });

  it('createVehicleSchema coerces string capacity to number', () => {
    const result = createVehicleSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      vehicleLabel: 'Van-1',
      vehicleType: 'van',
      capacity: '12',
    });
    expect(result.capacity).toBe(12);
    expect(typeof result.capacity).toBe('number');
  });

  it('createVehicleSchema rejects capacity over 100', () => {
    expect(() =>
      createVehicleSchema.parse({
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        vehicleLabel: 'Bus-1',
        vehicleType: 'bus',
        capacity: 101,
      }),
    ).toThrow();
  });
});

// ── Hardening: UUID validation ───────────────────────────────
describe('UUID validation', () => {
  it('batchIdSchema rejects non-UUID strings', () => {
    expect(() => batchIdSchema.parse('not-a-uuid')).toThrow('Invalid batch ID');
  });

  it('vehicleIdSchema rejects non-UUID strings', () => {
    expect(() => vehicleIdSchema.parse('abc123')).toThrow('Invalid vehicle assignment ID');
  });

  it('passengerIdSchema rejects non-UUID strings', () => {
    expect(() => passengerIdSchema.parse('')).toThrow('Invalid passenger assignment ID');
  });

  it('assignPassengerSchema rejects invalid personId UUID', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        personId: 'not-valid',
        travelRecordId: '550e8400-e29b-41d4-a716-446655440002',
      }),
    ).toThrow();
  });
});

// ── Hardening: updateBatchSchema ─────────────────────────────
describe('updateBatchSchema', () => {
  it('requires batchId', () => {
    expect(() => updateBatchSchema.parse({})).toThrow();
  });

  it('allows all fields optional except batchId', () => {
    const result = updateBatchSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.batchId).toBeDefined();
    expect(result.sourceCity).toBeUndefined();
    expect(result.pickupHub).toBeUndefined();
  });

  it('accepts partial updates', () => {
    const result = updateBatchSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      sourceCity: 'Delhi',
    });
    expect(result.sourceCity).toBe('Delhi');
    expect(result.pickupHub).toBeUndefined();
  });
});

// ── ANNEAL GAP: Spec-06-CP-04 — BATCH_SOURCES constant ─────
describe('BATCH_SOURCES', () => {
  it('contains exactly ["auto", "manual"]', () => {
    expect(BATCH_SOURCES).toEqual(['auto', 'manual']);
  });

  it('createBatchSchema defaults batchSource to "manual"', () => {
    const result = createBatchSchema.parse({
      movementType: 'arrival',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'BOM T2',
      dropHub: 'Hotel Leela',
    });
    expect(result.batchSource).toBe('manual');
  });
});

// ── ANNEAL GAP: Spec-03-CP-04 — travelRecordId UUID validation ─
describe('assignPassengerSchema — travelRecordId UUID', () => {
  it('rejects invalid travelRecordId UUID', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        personId: '550e8400-e29b-41d4-a716-446655440001',
        travelRecordId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});
