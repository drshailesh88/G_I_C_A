/**
 * Mutation-kill-2 tests for validations/transport.ts
 *
 * Targets survivors left by transport.mutation-kill.test.ts:
 *   - isValidDateOnly: regex anchors, invalid calendar combinations
 *   - parseUtcTimestamp: per-component range guards (month / day / hour /
 *     minute / second), invalid calendar combinations (Feb 30, leap year),
 *     trim behavior
 *   - superRefine: end > start for batch schema and vehicle schemas
 *   - required vs optional schema distinctions (missing vs empty)
 */

import { describe, it, expect } from 'vitest';
import {
  createBatchSchema,
  updateBatchSchema,
  createVehicleSchema,
  updateVehicleSchema,
} from './transport';

const validCreateBatch = {
  movementType: 'arrival',
  batchSource: 'manual',
  serviceDate: '2026-05-01',
  timeWindowStart: '2026-05-01T08:00:00Z',
  timeWindowEnd: '2026-05-01T10:00:00Z',
  sourceCity: 'Mumbai',
  pickupHub: 'BOM T2',
  pickupHubType: 'airport',
  dropHub: 'Hotel',
  dropHubType: 'hotel',
  notes: '',
};

// ─────────────────────────────────────────────────────────
// isValidDateOnly — regex anchors & calendar legality
// ─────────────────────────────────────────────────────────
describe('serviceDate (isValidDateOnly)', () => {
  it('accepts a valid YYYY-MM-DD', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-05-01' });
    expect(r.success).toBe(true);
  });

  it('accepts a valid UTC timestamp (falls through to parseUtcTimestamp)', () => {
    const r = createBatchSchema.safeParse({
      ...validCreateBatch,
      serviceDate: '2026-05-01T00:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a calendar-invalid date like 2026-02-30', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-02-30' });
    expect(r.success).toBe(false);
  });

  it('rejects month=00', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-00-15' });
    expect(r.success).toBe(false);
  });

  it('rejects month=13', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-13-15' });
    expect(r.success).toBe(false);
  });

  it('rejects day=00', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-05-00' });
    expect(r.success).toBe(false);
  });

  it('rejects day=32', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-05-32' });
    expect(r.success).toBe(false);
  });

  it('rejects non-leap-year Feb 29', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2025-02-29' });
    expect(r.success).toBe(false);
  });

  it('accepts leap-year Feb 29', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2024-02-29' });
    expect(r.success).toBe(true);
  });

  it('rejects a trailing "T" that turns it into a partial timestamp', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '2026-05-01T' });
    expect(r.success).toBe(false);
  });

  it('rejects a leading zero-padding slip like "26-05-01"', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '26-05-01' });
    expect(r.success).toBe(false);
  });

  it('trims whitespace before validating', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '  2026-05-01  ' });
    expect(r.success).toBe(true);
  });

  it('rejects empty string', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, serviceDate: '' });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// parseUtcTimestamp — per-component bounds
// ─────────────────────────────────────────────────────────
describe('UTC timestamp (parseUtcTimestamp)', () => {
  function runForStart(ts: string) {
    return createBatchSchema.safeParse({ ...validCreateBatch, timeWindowStart: ts });
  }

  it('accepts 2026-05-01T08:00:00Z', () => {
    expect(runForStart('2026-05-01T08:00:00Z').success).toBe(true);
  });

  it('accepts a sub-second form 2026-05-01T08:00:00.123Z', () => {
    expect(runForStart('2026-05-01T08:00:00.123Z').success).toBe(true);
  });

  it('rejects missing trailing Z', () => {
    expect(runForStart('2026-05-01T08:00:00').success).toBe(false);
  });

  it('rejects a leading space/character (anchor guard)', () => {
    expect(runForStart('X2026-05-01T08:00:00Z').success).toBe(false);
  });

  it('rejects a trailing suffix after Z', () => {
    expect(runForStart('2026-05-01T08:00:00Zabc').success).toBe(false);
  });

  it('rejects month=00', () => {
    expect(runForStart('2026-00-15T08:00:00Z').success).toBe(false);
  });

  it('rejects month=13', () => {
    expect(runForStart('2026-13-15T08:00:00Z').success).toBe(false);
  });

  it('rejects day=00', () => {
    expect(runForStart('2026-05-00T08:00:00Z').success).toBe(false);
  });

  it('rejects day=32', () => {
    expect(runForStart('2026-05-32T08:00:00Z').success).toBe(false);
  });

  it('rejects hour=24', () => {
    expect(runForStart('2026-05-01T24:00:00Z').success).toBe(false);
  });

  it('rejects hour=25', () => {
    expect(runForStart('2026-05-01T25:00:00Z').success).toBe(false);
  });

  it('rejects minute=60', () => {
    expect(runForStart('2026-05-01T08:60:00Z').success).toBe(false);
  });

  it('rejects second=60', () => {
    expect(runForStart('2026-05-01T08:00:60Z').success).toBe(false);
  });

  it('rejects calendar-invalid 2026-02-30T00:00:00Z', () => {
    expect(runForStart('2026-02-30T00:00:00Z').success).toBe(false);
  });

  it('rejects non-leap 2025-02-29T00:00:00Z', () => {
    expect(runForStart('2025-02-29T00:00:00Z').success).toBe(false);
  });

  it('trims whitespace before parsing a timestamp', () => {
    expect(runForStart('  2026-05-01T08:00:00Z  ').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// superRefine: end must be strictly after start
// ─────────────────────────────────────────────────────────
describe('createBatchSchema superRefine: end > start', () => {
  it('rejects when end === start', () => {
    const r = createBatchSchema.safeParse({
      ...validCreateBatch,
      timeWindowStart: '2026-05-01T09:00:00Z',
      timeWindowEnd: '2026-05-01T09:00:00Z',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'timeWindowEnd')).toBe(true);
    }
  });

  it('rejects when end < start', () => {
    const r = createBatchSchema.safeParse({
      ...validCreateBatch,
      timeWindowStart: '2026-05-01T09:00:00Z',
      timeWindowEnd: '2026-05-01T08:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('accepts even a 1-millisecond difference', () => {
    const r = createBatchSchema.safeParse({
      ...validCreateBatch,
      timeWindowStart: '2026-05-01T09:00:00.000Z',
      timeWindowEnd: '2026-05-01T09:00:00.001Z',
    });
    expect(r.success).toBe(true);
  });
});

describe('updateBatchSchema superRefine: skips when either timestamp is missing', () => {
  const batchId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts partial update with only start timestamp', () => {
    const r = updateBatchSchema.safeParse({
      batchId,
      timeWindowStart: '2026-05-01T09:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('accepts partial update with only end timestamp', () => {
    const r = updateBatchSchema.safeParse({
      batchId,
      timeWindowEnd: '2026-05-01T09:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('still rejects when both timestamps are provided and end <= start', () => {
    const r = updateBatchSchema.safeParse({
      batchId,
      timeWindowStart: '2026-05-01T10:00:00Z',
      timeWindowEnd: '2026-05-01T09:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('treats empty-string timestamps as missing (skips comparison)', () => {
    const r = updateBatchSchema.safeParse({
      batchId,
      timeWindowStart: '',
      timeWindowEnd: '',
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// createVehicleSchema + updateVehicleSchema superRefine
// ─────────────────────────────────────────────────────────
describe('createVehicleSchema superRefine: drop must be after pickup', () => {
  const base = {
    batchId: '550e8400-e29b-41d4-a716-446655440001',
    vehicleLabel: 'Van-1',
    vehicleType: 'van',
    capacity: 8,
  };

  it('rejects when scheduledDropAtUtc <= scheduledPickupAtUtc', () => {
    const r = createVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '2026-05-01T10:00:00Z',
      scheduledDropAtUtc: '2026-05-01T10:00:00Z',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'scheduledDropAtUtc')).toBe(true);
    }
  });

  it('accepts when scheduledDropAtUtc > scheduledPickupAtUtc', () => {
    const r = createVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '2026-05-01T10:00:00Z',
      scheduledDropAtUtc: '2026-05-01T11:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('skips comparison when pickup is empty', () => {
    const r = createVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '',
      scheduledDropAtUtc: '2026-05-01T11:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('skips comparison when drop is empty', () => {
    const r = createVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '2026-05-01T10:00:00Z',
      scheduledDropAtUtc: '',
    });
    expect(r.success).toBe(true);
  });

  it('rejects capacity < 1', () => {
    const r = createVehicleSchema.safeParse({ ...base, capacity: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects capacity > 100', () => {
    const r = createVehicleSchema.safeParse({ ...base, capacity: 101 });
    expect(r.success).toBe(false);
  });

  it('coerces capacity from string "5"', () => {
    const r = createVehicleSchema.safeParse({ ...base, capacity: '5' });
    expect(r.success).toBe(true);
  });
});

describe('updateVehicleSchema superRefine: same comparison', () => {
  const base = {
    vehicleAssignmentId: '550e8400-e29b-41d4-a716-446655440002',
  };

  it('rejects when scheduledDropAtUtc === scheduledPickupAtUtc', () => {
    const r = updateVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '2026-05-01T10:00:00Z',
      scheduledDropAtUtc: '2026-05-01T10:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('accepts when scheduledDropAtUtc > scheduledPickupAtUtc', () => {
    const r = updateVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '2026-05-01T10:00:00Z',
      scheduledDropAtUtc: '2026-05-01T11:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('accepts partial update with neither timestamp', () => {
    const r = updateVehicleSchema.safeParse({
      ...base,
      vehicleLabel: 'Van-2',
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty-string on either timestamp', () => {
    const r = updateVehicleSchema.safeParse({
      ...base,
      scheduledPickupAtUtc: '',
      scheduledDropAtUtc: '',
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Error messages carry the field label ("Start time", "End time",
// "Scheduled pickup time", "Scheduled drop time")
// ─────────────────────────────────────────────────────────
describe('timestamp error messages include the labeled field', () => {
  it('createBatchSchema surfaces "Start time" in validation error', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, timeWindowStart: 'nope' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /Start time/.test(i.message))).toBe(true);
    }
  });

  it('createBatchSchema surfaces "End time" in validation error', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, timeWindowEnd: 'nope' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /End time/.test(i.message))).toBe(true);
    }
  });

  it('createVehicleSchema surfaces "Scheduled pickup time" in validation error', () => {
    const r = createVehicleSchema.safeParse({
      batchId: '550e8400-e29b-41d4-a716-446655440001',
      vehicleLabel: 'V', vehicleType: 'van', capacity: 1,
      scheduledPickupAtUtc: 'bad',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /Scheduled pickup time/.test(i.message))).toBe(true);
    }
  });

  it('createVehicleSchema surfaces "Scheduled drop time" in validation error', () => {
    const r = createVehicleSchema.safeParse({
      batchId: '550e8400-e29b-41d4-a716-446655440001',
      vehicleLabel: 'V', vehicleType: 'van', capacity: 1,
      scheduledDropAtUtc: 'bad',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /Scheduled drop time/.test(i.message))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────
// Required-schema distinction: empty string is rejected on
// required timestamp/service-date but accepted on optional.
// ─────────────────────────────────────────────────────────
describe('required vs optional schema distinction', () => {
  it('createBatchSchema (required) rejects empty timeWindowStart', () => {
    const r = createBatchSchema.safeParse({ ...validCreateBatch, timeWindowStart: '' });
    expect(r.success).toBe(false);
  });

  it('updateBatchSchema (optional) accepts empty timeWindowStart', () => {
    const r = updateBatchSchema.safeParse({
      batchId: '550e8400-e29b-41d4-a716-446655440003',
      timeWindowStart: '',
    });
    expect(r.success).toBe(true);
  });
});
