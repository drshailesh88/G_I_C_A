import { describe, expect, it } from 'vitest';
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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral on error messages in UUID schemas
// ══════════════════════════════════════════════════════════════
describe('UUID schema exact error messages', () => {
  it('batchIdSchema error message is exactly "Invalid batch ID"', () => {
    expect(() => batchIdSchema.parse('bad')).toThrow('Invalid batch ID');
  });

  it('vehicleIdSchema error message is exactly "Invalid vehicle assignment ID"', () => {
    expect(() => vehicleIdSchema.parse('bad')).toThrow('Invalid vehicle assignment ID');
  });

  it('passengerIdSchema error message is exactly "Invalid passenger assignment ID"', () => {
    expect(() => passengerIdSchema.parse('bad')).toThrow('Invalid passenger assignment ID');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral on createBatchSchema error messages
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — exact error messages', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Hotel Leela',
  };

  it('serviceDate error message is "Service date is required"', () => {
    try {
      createBatchSchema.parse({ ...base, serviceDate: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('serviceDate'))?.message;
      expect(msg).toBe('Service date is required');
    }
  });

  it('timeWindowStart error message is "Start time is required"', () => {
    try {
      createBatchSchema.parse({ ...base, timeWindowStart: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('timeWindowStart'))?.message;
      expect(msg).toBe('Start time is required');
    }
  });

  it('timeWindowEnd error message is "End time is required"', () => {
    try {
      createBatchSchema.parse({ ...base, timeWindowEnd: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('timeWindowEnd'))?.message;
      expect(msg).toBe('End time is required');
    }
  });

  it('sourceCity error message is "Source city is required" for empty', () => {
    try {
      createBatchSchema.parse({ ...base, sourceCity: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('sourceCity'))?.message;
      expect(msg).toBe('Source city is required');
    }
  });

  it('pickupHub error message is "Pickup hub is required" for empty', () => {
    try {
      createBatchSchema.parse({ ...base, pickupHub: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('pickupHub'))?.message;
      expect(msg).toBe('Pickup hub is required');
    }
  });

  it('dropHub error message is "Drop hub is required" for empty', () => {
    try {
      createBatchSchema.parse({ ...base, dropHub: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('dropHub'))?.message;
      expect(msg).toBe('Drop hub is required');
    }
  });

  it('refine error message is "End time must be after start time"', () => {
    try {
      createBatchSchema.parse({
        ...base,
        timeWindowStart: '2026-05-01T10:00:00Z',
        timeWindowEnd: '2026-05-01T10:00:00Z', // equal, not after
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('timeWindowEnd'))?.message;
      expect(msg).toBe('End time must be after start time');
    }
  });

  it('refine path is ["timeWindowEnd"]', () => {
    try {
      createBatchSchema.parse({
        ...base,
        timeWindowStart: '2026-05-01T10:00:00Z',
        timeWindowEnd: '2026-05-01T08:00:00Z',
      });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const refinement = issues.find((i: any) => i.message === 'End time must be after start time');
      expect(refinement.path).toContain('timeWindowEnd');
    }
  });
});

// ══════════════════════════════════════════════════════════════
// KILL MethodExpression on .trim() — whitespace-padded values
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — .trim()', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Hotel Leela',
  };

  it('trims sourceCity whitespace', () => {
    const result = createBatchSchema.parse({ ...base, sourceCity: '  Mumbai  ' });
    expect(result.sourceCity).toBe('Mumbai');
  });

  it('trims pickupHub whitespace', () => {
    const result = createBatchSchema.parse({ ...base, pickupHub: '  BOM T2  ' });
    expect(result.pickupHub).toBe('BOM T2');
  });

  it('trims dropHub whitespace', () => {
    const result = createBatchSchema.parse({ ...base, dropHub: '  Hotel  ' });
    expect(result.dropHub).toBe('Hotel');
  });

  it('trims notes whitespace', () => {
    const result = createBatchSchema.parse({ ...base, notes: '  some note  ' });
    expect(result.notes).toBe('some note');
  });

  it('rejects sourceCity that is only whitespace (trims to empty)', () => {
    expect(() => createBatchSchema.parse({ ...base, sourceCity: '   ' })).toThrow();
  });

  it('rejects pickupHub that is only whitespace', () => {
    expect(() => createBatchSchema.parse({ ...base, pickupHub: '   ' })).toThrow();
  });

  it('rejects dropHub that is only whitespace', () => {
    expect(() => createBatchSchema.parse({ ...base, dropHub: '   ' })).toThrow();
  });
});

// ══════════════════════════════════════════════════════════════
// KILL MethodExpression on .max() — boundary tests
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — .max() boundaries', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Hotel Leela',
  };

  it('accepts sourceCity at exactly 200 chars', () => {
    const result = createBatchSchema.parse({ ...base, sourceCity: 'X'.repeat(200) });
    expect(result.sourceCity).toHaveLength(200);
  });

  it('rejects sourceCity at 201 chars', () => {
    expect(() => createBatchSchema.parse({ ...base, sourceCity: 'X'.repeat(201) })).toThrow();
  });

  it('accepts pickupHub at exactly 300 chars', () => {
    const result = createBatchSchema.parse({ ...base, pickupHub: 'Y'.repeat(300) });
    expect(result.pickupHub).toHaveLength(300);
  });

  it('rejects pickupHub at 301 chars', () => {
    expect(() => createBatchSchema.parse({ ...base, pickupHub: 'Y'.repeat(301) })).toThrow();
  });

  it('accepts dropHub at exactly 300 chars', () => {
    const result = createBatchSchema.parse({ ...base, dropHub: 'Z'.repeat(300) });
    expect(result.dropHub).toHaveLength(300);
  });

  it('rejects dropHub at 301 chars', () => {
    expect(() => createBatchSchema.parse({ ...base, dropHub: 'Z'.repeat(301) })).toThrow();
  });

  it('accepts notes at exactly 2000 chars', () => {
    const result = createBatchSchema.parse({ ...base, notes: 'N'.repeat(2000) });
    expect(result.notes).toHaveLength(2000);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL MethodExpression on .optional() and .or(z.literal(''))
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — optional and empty string', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Hotel Leela',
  };

  it('accepts notes as empty string', () => {
    const result = createBatchSchema.parse({ ...base, notes: '' });
    expect(result.notes).toBe('');
  });

  it('accepts notes as undefined (omitted)', () => {
    const result = createBatchSchema.parse(base);
    expect(result.notes).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// KILL EqualityOperator on refine: > vs >=
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — refine equality operator', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Hotel Leela',
  };

  it('rejects when end time equals start time (> not >=)', () => {
    expect(() =>
      createBatchSchema.parse({
        ...base,
        timeWindowStart: '2026-05-01T10:00:00Z',
        timeWindowEnd: '2026-05-01T10:00:00Z',
      }),
    ).toThrow('End time must be after start time');
  });

  it('accepts when end time is 1ms after start time', () => {
    const result = createBatchSchema.parse({
      ...base,
      timeWindowStart: '2026-05-01T10:00:00.000Z',
      timeWindowEnd: '2026-05-01T10:00:00.001Z',
    });
    expect(result.timeWindowEnd).toBe('2026-05-01T10:00:00.001Z');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral on updateBatchSchema error messages
// ══════════════════════════════════════════════════════════════
describe('updateBatchSchema — exact error messages', () => {
  it('batchId error message is "Invalid batch ID" for non-UUID', () => {
    expect(() => updateBatchSchema.parse({ batchId: 'not-a-uuid' })).toThrow('Invalid batch ID');
  });

  it('accepts empty notes string', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, notes: '' });
    expect(result.notes).toBe('');
  });

  it('trims sourceCity in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, sourceCity: '  Delhi  ' });
    expect(result.sourceCity).toBe('Delhi');
  });

  it('rejects sourceCity that is whitespace-only in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, sourceCity: '   ' })).toThrow();
  });

  it('accepts sourceCity up to 200 chars in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, sourceCity: 'A'.repeat(200) });
    expect(result.sourceCity).toHaveLength(200);
  });

  it('rejects sourceCity over 200 chars in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, sourceCity: 'A'.repeat(201) })).toThrow();
  });

  it('accepts pickupHub up to 300 chars in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, pickupHub: 'B'.repeat(300) });
    expect(result.pickupHub).toHaveLength(300);
  });

  it('rejects pickupHub over 300 chars in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, pickupHub: 'B'.repeat(301) })).toThrow();
  });

  it('trims pickupHub in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, pickupHub: ' Hub ' });
    expect(result.pickupHub).toBe('Hub');
  });

  it('rejects pickupHub that is whitespace-only in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, pickupHub: '   ' })).toThrow();
  });

  it('accepts dropHub up to 300 chars in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, dropHub: 'C'.repeat(300) });
    expect(result.dropHub).toHaveLength(300);
  });

  it('rejects dropHub over 300 chars in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, dropHub: 'C'.repeat(301) })).toThrow();
  });

  it('trims dropHub in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, dropHub: ' Drop ' });
    expect(result.dropHub).toBe('Drop');
  });

  it('rejects dropHub whitespace-only in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, dropHub: '   ' })).toThrow();
  });

  it('accepts notes up to 2000 chars in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, notes: 'N'.repeat(2000) });
    expect(result.notes).toHaveLength(2000);
  });

  it('rejects notes over 2000 chars in update', () => {
    expect(() => updateBatchSchema.parse({ batchId: VALID_UUID, notes: 'N'.repeat(2001) })).toThrow();
  });

  it('trims notes in update', () => {
    const result = updateBatchSchema.parse({ batchId: VALID_UUID, notes: ' note ' });
    expect(result.notes).toBe('note');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL MethodExpression + StringLiteral on createVehicleSchema
// ══════════════════════════════════════════════════════════════
describe('createVehicleSchema — exact error messages and boundaries', () => {
  const base = {
    batchId: VALID_UUID,
    vehicleLabel: 'Van-1',
    vehicleType: 'van' as const,
    capacity: 10,
  };

  it('batchId error is "Invalid batch ID"', () => {
    expect(() => createVehicleSchema.parse({ ...base, batchId: 'bad' })).toThrow('Invalid batch ID');
  });

  it('vehicleLabel error is "Vehicle label is required" for empty', () => {
    try {
      createVehicleSchema.parse({ ...base, vehicleLabel: '' });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('vehicleLabel'))?.message;
      expect(msg).toBe('Vehicle label is required');
    }
  });

  it('capacity error is "Capacity must be at least 1" for 0', () => {
    try {
      createVehicleSchema.parse({ ...base, capacity: 0 });
      expect.unreachable('should have thrown');
    } catch (e: any) {
      const issues = e.issues || e.errors;
      const msg = issues.find((i: any) => i.path.includes('capacity'))?.message;
      expect(msg).toBe('Capacity must be at least 1');
    }
  });

  it('trims vehicleLabel', () => {
    const result = createVehicleSchema.parse({ ...base, vehicleLabel: '  Van-1  ' });
    expect(result.vehicleLabel).toBe('Van-1');
  });

  it('rejects vehicleLabel that is whitespace-only', () => {
    expect(() => createVehicleSchema.parse({ ...base, vehicleLabel: '   ' })).toThrow();
  });

  it('accepts vehicleLabel at exactly 100 chars', () => {
    const result = createVehicleSchema.parse({ ...base, vehicleLabel: 'V'.repeat(100) });
    expect(result.vehicleLabel).toHaveLength(100);
  });

  it('rejects vehicleLabel at 101 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, vehicleLabel: 'V'.repeat(101) })).toThrow();
  });

  it('accepts capacity of exactly 1 (min boundary)', () => {
    const result = createVehicleSchema.parse({ ...base, capacity: 1 });
    expect(result.capacity).toBe(1);
  });

  it('accepts capacity of exactly 100 (max boundary)', () => {
    const result = createVehicleSchema.parse({ ...base, capacity: 100 });
    expect(result.capacity).toBe(100);
  });

  it('rejects capacity of 101', () => {
    expect(() => createVehicleSchema.parse({ ...base, capacity: 101 })).toThrow();
  });

  it('rejects negative capacity', () => {
    expect(() => createVehicleSchema.parse({ ...base, capacity: -1 })).toThrow();
  });

  // Optional fields: trim, max, .or(z.literal(''))
  it('trims plateNumber', () => {
    const result = createVehicleSchema.parse({ ...base, plateNumber: '  MH12  ' });
    expect(result.plateNumber).toBe('MH12');
  });

  it('accepts plateNumber at exactly 20 chars', () => {
    const result = createVehicleSchema.parse({ ...base, plateNumber: 'P'.repeat(20) });
    expect(result.plateNumber).toHaveLength(20);
  });

  it('rejects plateNumber at 21 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, plateNumber: 'P'.repeat(21) })).toThrow();
  });

  it('accepts plateNumber as empty string', () => {
    const result = createVehicleSchema.parse({ ...base, plateNumber: '' });
    expect(result.plateNumber).toBe('');
  });

  it('accepts plateNumber as undefined', () => {
    const result = createVehicleSchema.parse(base);
    expect(result.plateNumber).toBeUndefined();
  });

  it('trims vendorName', () => {
    const result = createVehicleSchema.parse({ ...base, vendorName: '  Fast  ' });
    expect(result.vendorName).toBe('Fast');
  });

  it('accepts vendorName at exactly 200 chars', () => {
    const result = createVehicleSchema.parse({ ...base, vendorName: 'V'.repeat(200) });
    expect(result.vendorName).toHaveLength(200);
  });

  it('rejects vendorName at 201 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, vendorName: 'V'.repeat(201) })).toThrow();
  });

  it('trims vendorContactE164', () => {
    const result = createVehicleSchema.parse({ ...base, vendorContactE164: ' +91 98765 43210 ' });
    expect(result.vendorContactE164).toBe('+919876543210');
  });

  it('rejects malformed vendorContactE164 values even under the length limit', () => {
    expect(() => createVehicleSchema.parse({ ...base, vendorContactE164: 'C'.repeat(20) })).toThrow(
      'Invalid vendor contact number',
    );
  });

  it('rejects vendorContactE164 at 21 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, vendorContactE164: 'C'.repeat(21) })).toThrow();
  });

  it('trims driverName', () => {
    const result = createVehicleSchema.parse({ ...base, driverName: '  Ram  ' });
    expect(result.driverName).toBe('Ram');
  });

  it('accepts driverName at 200 chars', () => {
    const result = createVehicleSchema.parse({ ...base, driverName: 'D'.repeat(200) });
    expect(result.driverName).toHaveLength(200);
  });

  it('rejects driverName at 201 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, driverName: 'D'.repeat(201) })).toThrow();
  });

  it('trims driverMobileE164', () => {
    const result = createVehicleSchema.parse({ ...base, driverMobileE164: ' 9876543210 ' });
    expect(result.driverMobileE164).toBe('+919876543210');
  });

  it('rejects malformed driverMobileE164 values even under the length limit', () => {
    expect(() => createVehicleSchema.parse({ ...base, driverMobileE164: 'M'.repeat(20) })).toThrow(
      'Invalid driver mobile number',
    );
  });

  it('rejects driverMobileE164 at 21 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, driverMobileE164: 'M'.repeat(21) })).toThrow();
  });

  it('accepts scheduledPickupAtUtc as empty string', () => {
    const result = createVehicleSchema.parse({ ...base, scheduledPickupAtUtc: '' });
    expect(result.scheduledPickupAtUtc).toBe('');
  });

  it('accepts scheduledDropAtUtc as empty string', () => {
    const result = createVehicleSchema.parse({ ...base, scheduledDropAtUtc: '' });
    expect(result.scheduledDropAtUtc).toBe('');
  });

  it('accepts notes as empty string', () => {
    const result = createVehicleSchema.parse({ ...base, notes: '' });
    expect(result.notes).toBe('');
  });

  it('accepts notes at exactly 2000 chars', () => {
    const result = createVehicleSchema.parse({ ...base, notes: 'N'.repeat(2000) });
    expect(result.notes).toHaveLength(2000);
  });

  it('rejects notes at 2001 chars', () => {
    expect(() => createVehicleSchema.parse({ ...base, notes: 'N'.repeat(2001) })).toThrow();
  });

  it('trims notes', () => {
    const result = createVehicleSchema.parse({ ...base, notes: '  note  ' });
    expect(result.notes).toBe('note');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ObjectLiteral + MethodExpression + StringLiteral on updateVehicleSchema
// ══════════════════════════════════════════════════════════════
describe('updateVehicleSchema — exact validation', () => {
  it('requires vehicleAssignmentId', () => {
    expect(() => updateVehicleSchema.parse({})).toThrow();
  });

  it('vehicleAssignmentId error is "Invalid vehicle assignment ID"', () => {
    expect(() => updateVehicleSchema.parse({ vehicleAssignmentId: 'bad' })).toThrow(
      'Invalid vehicle assignment ID',
    );
  });

  it('allows all fields optional except vehicleAssignmentId', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID });
    expect(result.vehicleAssignmentId).toBe(VALID_UUID);
    expect(result.vehicleLabel).toBeUndefined();
    expect(result.vehicleType).toBeUndefined();
    expect(result.capacity).toBeUndefined();
  });

  it('trims vehicleLabel in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vehicleLabel: '  Bus  ' });
    expect(result.vehicleLabel).toBe('Bus');
  });

  it('rejects vehicleLabel whitespace-only in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vehicleLabel: '   ' }),
    ).toThrow();
  });

  it('accepts vehicleLabel at 100 chars in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vehicleLabel: 'L'.repeat(100) });
    expect(result.vehicleLabel).toHaveLength(100);
  });

  it('rejects vehicleLabel at 101 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vehicleLabel: 'L'.repeat(101) }),
    ).toThrow();
  });

  it('trims plateNumber in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, plateNumber: ' AB12 ' });
    expect(result.plateNumber).toBe('AB12');
  });

  it('accepts plateNumber at 20 chars in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, plateNumber: 'P'.repeat(20) });
    expect(result.plateNumber).toHaveLength(20);
  });

  it('rejects plateNumber at 21 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, plateNumber: 'P'.repeat(21) }),
    ).toThrow();
  });

  it('accepts plateNumber as empty string in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, plateNumber: '' });
    expect(result.plateNumber).toBe('');
  });

  it('trims vendorName in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vendorName: ' Cabs ' });
    expect(result.vendorName).toBe('Cabs');
  });

  it('accepts vendorName at 200 chars in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vendorName: 'V'.repeat(200) });
    expect(result.vendorName).toHaveLength(200);
  });

  it('rejects vendorName at 201 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vendorName: 'V'.repeat(201) }),
    ).toThrow();
  });

  it('trims vendorContactE164 in update', () => {
    const result = updateVehicleSchema.parse({
      vehicleAssignmentId: VALID_UUID,
      vendorContactE164: ' +91 98765 43210 ',
    });
    expect(result.vendorContactE164).toBe('+919876543210');
  });

  it('rejects malformed vendorContactE164 values in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vendorContactE164: 'C'.repeat(20) }),
    ).toThrow('Invalid vendor contact number');
  });

  it('rejects vendorContactE164 at 21 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, vendorContactE164: 'C'.repeat(21) }),
    ).toThrow();
  });

  it('trims driverName in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, driverName: ' Name ' });
    expect(result.driverName).toBe('Name');
  });

  it('accepts driverName at 200 chars in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, driverName: 'D'.repeat(200) });
    expect(result.driverName).toHaveLength(200);
  });

  it('rejects driverName at 201 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, driverName: 'D'.repeat(201) }),
    ).toThrow();
  });

  it('trims driverMobileE164 in update', () => {
    const result = updateVehicleSchema.parse({
      vehicleAssignmentId: VALID_UUID,
      driverMobileE164: ' 9876543210 ',
    });
    expect(result.driverMobileE164).toBe('+919876543210');
  });

  it('rejects malformed driverMobileE164 values in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, driverMobileE164: 'M'.repeat(20) }),
    ).toThrow('Invalid driver mobile number');
  });

  it('rejects driverMobileE164 at 21 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, driverMobileE164: 'M'.repeat(21) }),
    ).toThrow();
  });

  it('coerces capacity from string in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, capacity: '50' as any });
    expect(result.capacity).toBe(50);
  });

  it('accepts capacity min 1 in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, capacity: 1 });
    expect(result.capacity).toBe(1);
  });

  it('rejects capacity 0 in update', () => {
    expect(() => updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, capacity: 0 })).toThrow();
  });

  it('accepts capacity max 100 in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, capacity: 100 });
    expect(result.capacity).toBe(100);
  });

  it('rejects capacity 101 in update', () => {
    expect(() => updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, capacity: 101 })).toThrow();
  });

  it('accepts scheduledPickupAtUtc as empty string in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, scheduledPickupAtUtc: '' });
    expect(result.scheduledPickupAtUtc).toBe('');
  });

  it('accepts scheduledDropAtUtc as empty string in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, scheduledDropAtUtc: '' });
    expect(result.scheduledDropAtUtc).toBe('');
  });

  it('accepts notes at 2000 chars in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, notes: 'N'.repeat(2000) });
    expect(result.notes).toHaveLength(2000);
  });

  it('rejects notes at 2001 chars in update', () => {
    expect(() =>
      updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, notes: 'N'.repeat(2001) }),
    ).toThrow();
  });

  it('trims notes in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, notes: ' note ' });
    expect(result.notes).toBe('note');
  });

  it('accepts notes as empty string in update', () => {
    const result = updateVehicleSchema.parse({ vehicleAssignmentId: VALID_UUID, notes: '' });
    expect(result.notes).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral + MethodExpression on assignPassengerSchema
// ══════════════════════════════════════════════════════════════
describe('assignPassengerSchema — exact error messages and boundaries', () => {
  it('batchId error is "Invalid batch ID"', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: 'bad',
        personId: VALID_UUID,
        travelRecordId: VALID_UUID,
      }),
    ).toThrow('Invalid batch ID');
  });

  it('vehicleAssignmentId error is "Invalid vehicle ID" for invalid UUID', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: VALID_UUID,
        vehicleAssignmentId: 'bad-uuid',
        personId: VALID_UUID,
        travelRecordId: VALID_UUID,
      }),
    ).toThrow('Invalid vehicle ID');
  });

  it('personId error is "Invalid person ID"', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: VALID_UUID,
        personId: 'bad',
        travelRecordId: VALID_UUID,
      }),
    ).toThrow('Invalid person ID');
  });

  it('travelRecordId error is "Invalid travel record ID"', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: VALID_UUID,
        personId: VALID_UUID,
        travelRecordId: 'bad',
      }),
    ).toThrow('Invalid travel record ID');
  });

  it('trims pickupNote', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      pickupNote: '  Gate 3  ',
    });
    expect(result.pickupNote).toBe('Gate 3');
  });

  it('accepts pickupNote at 500 chars', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      pickupNote: 'P'.repeat(500),
    });
    expect(result.pickupNote).toHaveLength(500);
  });

  it('rejects pickupNote at 501 chars', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: VALID_UUID,
        personId: VALID_UUID,
        travelRecordId: VALID_UUID,
        pickupNote: 'P'.repeat(501),
      }),
    ).toThrow();
  });

  it('accepts pickupNote as empty string', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      pickupNote: '',
    });
    expect(result.pickupNote).toBe('');
  });

  it('trims dropNote', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      dropNote: '  Lobby  ',
    });
    expect(result.dropNote).toBe('Lobby');
  });

  it('accepts dropNote at 500 chars', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      dropNote: 'D'.repeat(500),
    });
    expect(result.dropNote).toHaveLength(500);
  });

  it('rejects dropNote at 501 chars', () => {
    expect(() =>
      assignPassengerSchema.parse({
        batchId: VALID_UUID,
        personId: VALID_UUID,
        travelRecordId: VALID_UUID,
        dropNote: 'D'.repeat(501),
      }),
    ).toThrow();
  });

  it('accepts dropNote as empty string', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
      dropNote: '',
    });
    expect(result.dropNote).toBe('');
  });

  it('accepts vehicleAssignmentId as empty string', () => {
    const result = assignPassengerSchema.parse({
      batchId: VALID_UUID,
      vehicleAssignmentId: '',
      personId: VALID_UUID,
      travelRecordId: VALID_UUID,
    });
    expect(result.vehicleAssignmentId).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL StringLiteral on movePassengerSchema
// ══════════════════════════════════════════════════════════════
describe('movePassengerSchema — exact error messages', () => {
  it('passengerAssignmentId error is "Invalid passenger assignment ID"', () => {
    expect(() =>
      movePassengerSchema.parse({
        passengerAssignmentId: 'bad',
        targetVehicleAssignmentId: VALID_UUID,
      }),
    ).toThrow('Invalid passenger assignment ID');
  });

  it('targetVehicleAssignmentId error is "Invalid target vehicle ID"', () => {
    expect(() =>
      movePassengerSchema.parse({
        passengerAssignmentId: VALID_UUID,
        targetVehicleAssignmentId: 'bad-uuid',
      }),
    ).toThrow('Invalid target vehicle ID');
  });

  it('accepts targetVehicleAssignmentId as undefined (omitted)', () => {
    const result = movePassengerSchema.parse({
      passengerAssignmentId: VALID_UUID,
    });
    expect(result.targetVehicleAssignmentId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// KILL ArrayDeclaration on BATCH_TRANSITIONS terminal states
// Verify exact array contents, not just length
// ══════════════════════════════════════════════════════════════
describe('State machine transitions — exact arrays', () => {
  it('BATCH_TRANSITIONS.planned is exactly ["ready", "cancelled"]', () => {
    expect(BATCH_TRANSITIONS.planned).toStrictEqual(['ready', 'cancelled']);
  });

  it('BATCH_TRANSITIONS.ready is exactly ["in_progress", "cancelled"]', () => {
    expect(BATCH_TRANSITIONS.ready).toStrictEqual(['in_progress', 'cancelled']);
  });

  it('BATCH_TRANSITIONS.in_progress is exactly ["completed", "cancelled"]', () => {
    expect(BATCH_TRANSITIONS.in_progress).toStrictEqual(['completed', 'cancelled']);
  });

  it('BATCH_TRANSITIONS.completed is exactly []', () => {
    expect(BATCH_TRANSITIONS.completed).toStrictEqual([]);
  });

  it('BATCH_TRANSITIONS.cancelled is exactly []', () => {
    expect(BATCH_TRANSITIONS.cancelled).toStrictEqual([]);
  });

  it('VEHICLE_TRANSITIONS.assigned is exactly ["dispatched", "cancelled"]', () => {
    expect(VEHICLE_TRANSITIONS.assigned).toStrictEqual(['dispatched', 'cancelled']);
  });

  it('PASSENGER_TRANSITIONS.pending is exactly ["assigned", "boarded", "cancelled"]', () => {
    expect(PASSENGER_TRANSITIONS.pending).toStrictEqual(['assigned', 'boarded', 'cancelled']);
  });

  it('PASSENGER_TRANSITIONS.assigned is exactly ["boarded", "no_show", "cancelled"]', () => {
    expect(PASSENGER_TRANSITIONS.assigned).toStrictEqual(['boarded', 'no_show', 'cancelled']);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL remaining exact constants
// ══════════════════════════════════════════════════════════════
describe('Exact constant values', () => {
  it('BATCH_STATUSES contains exact values in order', () => {
    expect(BATCH_STATUSES).toStrictEqual(['planned', 'ready', 'in_progress', 'completed', 'cancelled']);
  });

  it('VEHICLE_STATUSES contains exact values in order', () => {
    expect(VEHICLE_STATUSES).toStrictEqual(['assigned', 'dispatched', 'completed', 'cancelled']);
  });

  it('PASSENGER_STATUSES contains exact values in order', () => {
    expect(PASSENGER_STATUSES).toStrictEqual(['pending', 'assigned', 'boarded', 'completed', 'no_show', 'cancelled']);
  });

  it('MOVEMENT_TYPES is exactly ["arrival", "departure"]', () => {
    expect(MOVEMENT_TYPES).toStrictEqual(['arrival', 'departure']);
  });

  it('HUB_TYPES is exactly ["airport", "railway_station", "hotel", "venue", "other"]', () => {
    expect(HUB_TYPES).toStrictEqual(['airport', 'railway_station', 'hotel', 'venue', 'other']);
  });

  it('VEHICLE_TYPES is exactly ["sedan", "suv", "van", "tempo_traveller", "bus", "other"]', () => {
    expect(VEHICLE_TYPES).toStrictEqual(['sedan', 'suv', 'van', 'tempo_traveller', 'bus', 'other']);
  });

  it('BATCH_SOURCES is exactly ["auto", "manual"]', () => {
    expect(BATCH_SOURCES).toStrictEqual(['auto', 'manual']);
  });
});

// ══════════════════════════════════════════════════════════════
// KILL: departure movement type (not just arrival)
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — departure movement type', () => {
  it('accepts departure as movement type', () => {
    const result = createBatchSchema.parse({
      movementType: 'departure',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'Hotel',
      dropHub: 'BOM T2',
    });
    expect(result.movementType).toBe('departure');
  });
});

// ══════════════════════════════════════════════════════════════
// KILL: all vehicle types accepted
// ══════════════════════════════════════════════════════════════
describe('createVehicleSchema — all vehicle types', () => {
  const base = { batchId: VALID_UUID, vehicleLabel: 'V1', capacity: 4 };

  for (const vt of VEHICLE_TYPES) {
    it(`accepts vehicle type "${vt}"`, () => {
      const result = createVehicleSchema.parse({ ...base, vehicleType: vt });
      expect(result.vehicleType).toBe(vt);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// KILL: all hub types accepted
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — all hub types', () => {
  const base = {
    movementType: 'arrival' as const,
    serviceDate: '2026-05-01T00:00:00Z',
    timeWindowStart: '2026-05-01T08:00:00Z',
    timeWindowEnd: '2026-05-01T10:00:00Z',
    sourceCity: 'Mumbai',
    pickupHub: 'Hub',
    dropHub: 'Drop',
  };

  for (const ht of HUB_TYPES) {
    it(`accepts pickupHubType "${ht}"`, () => {
      const result = createBatchSchema.parse({ ...base, pickupHubType: ht });
      expect(result.pickupHubType).toBe(ht);
    });

    it(`accepts dropHubType "${ht}"`, () => {
      const result = createBatchSchema.parse({ ...base, dropHubType: ht });
      expect(result.dropHubType).toBe(ht);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// KILL: batch source "auto"
// ══════════════════════════════════════════════════════════════
describe('createBatchSchema — batch source auto', () => {
  it('accepts batchSource "auto"', () => {
    const result = createBatchSchema.parse({
      movementType: 'arrival',
      batchSource: 'auto',
      serviceDate: '2026-05-01T00:00:00Z',
      timeWindowStart: '2026-05-01T08:00:00Z',
      timeWindowEnd: '2026-05-01T10:00:00Z',
      sourceCity: 'Mumbai',
      pickupHub: 'Hub',
      dropHub: 'Drop',
    });
    expect(result.batchSource).toBe('auto');
  });
});
