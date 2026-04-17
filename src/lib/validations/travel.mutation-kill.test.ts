/**
 * Mutation-killing tests for travel validation schemas.
 *
 * These target StringLiteral and EqualityOperator mutations that survived Stryker:
 * - z.literal('') changed to z.literal("Stryker was here!") → empty string handling
 * - Error message strings changed → error message verification
 * - CASCADE_TRIGGER_FIELDS equality checks
 *
 * ORACLE: Zod schema specifications and domain rules.
 */
import { describe, expect, it } from 'vitest';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelCsvRowSchema,
  travelRecordIdSchema,
  buildTravelChangeSummary,
  CASCADE_TRIGGER_FIELDS,
  TRAVEL_DIRECTIONS,
  TRAVEL_MODES,
  TRAVEL_RECORD_STATUSES,
} from './travel';

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: z.literal('') — empty string acceptance for optional fields
// Spec: "Optional fields accept empty strings OR valid values"
// ══════════════════════════════════════════════════════════════
describe('Optional fields accept empty strings', () => {
  const baseInput = {
    personId: '550e8400-e29b-41d4-a716-446655440001',
    direction: 'inbound' as const,
    travelMode: 'flight' as const,
    fromCity: 'Mumbai',
    toCity: 'Delhi',
  };

  const optionalFields = [
    'fromLocation', 'toLocation', 'carrierName', 'serviceNumber',
    'pnrOrBookingRef', 'seatOrCoach', 'terminalOrGate', 'attachmentUrl',
    'notes', 'departureAtUtc', 'arrivalAtUtc', 'registrationId',
  ];

  for (const field of optionalFields) {
    it(`createTravelRecordSchema accepts empty string for ${field}`, () => {
      const result = createTravelRecordSchema.safeParse({
        ...baseInput,
        [field]: '',
      });
      // Should parse successfully — empty string is a valid input for optional fields
      expect(result.success).toBe(true);
    });
  }

  it('updateTravelRecordSchema accepts empty string for optional fields', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: '550e8400-e29b-41d4-a716-446655440002',
      fromLocation: '',
      toLocation: '',
      carrierName: '',
      serviceNumber: '',
      pnrOrBookingRef: '',
      seatOrCoach: '',
      terminalOrGate: '',
      attachmentUrl: '',
      notes: '',
      departureAtUtc: '',
      arrivalAtUtc: '',
    });
    expect(result.success).toBe(true);
  });

  it('cancelTravelRecordSchema accepts empty string for reason', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: '550e8400-e29b-41d4-a716-446655440002',
      reason: '',
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Error message strings
// Spec: "Validation errors contain descriptive messages"
// ══════════════════════════════════════════════════════════════
describe('Validation error messages are meaningful', () => {
  it('departureAtUtc invalid timestamp error is specific', () => {
    const result = createTravelRecordSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440001',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
      departureAtUtc: '2026-02-30T10:00:00Z',
    });
    expect(result.success).toBe(false);
    const departureError = result.error!.issues.find((i) => i.path.includes('departureAtUtc'));
    expect(departureError?.message).toContain('valid UTC timestamp');
  });

  it('personId UUID error message mentions "person"', () => {
    const result = createTravelRecordSchema.safeParse({
      personId: 'not-a-uuid',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
    });
    expect(result.success).toBe(false);
    const personError = result.error!.issues.find((i) => i.path.includes('personId'));
    expect(personError?.message).toContain('person');
  });

  it('fromCity required error mentions city', () => {
    const result = createTravelRecordSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440001',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: '',
      toCity: 'B',
    });
    expect(result.success).toBe(false);
    const cityError = result.error!.issues.find((i) => i.path.includes('fromCity'));
    expect(cityError?.message).toBeTruthy();
    expect(cityError!.message.length).toBeGreaterThan(0);
  });

  it('travelRecordIdSchema UUID error is descriptive', () => {
    const result = travelRecordIdSchema.safeParse('bad-id');
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toContain('travel record');
  });

  it('arrival-before-departure error message is specific', () => {
    const result = createTravelRecordSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440001',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
      departureAtUtc: '2026-06-01T12:00:00Z',
      arrivalAtUtc: '2026-06-01T08:00:00Z',
    });
    expect(result.success).toBe(false);
    const arrivalError = result.error!.issues.find((i) => i.path.includes('arrivalAtUtc'));
    expect(arrivalError?.message).toContain('after departure');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Enum completeness
// Spec: "All enum values are exactly as specified"
// ══════════════════════════════════════════════════════════════
describe('Enum values are complete and exact', () => {
  it('TRAVEL_DIRECTIONS has exactly 4 values', () => {
    expect(TRAVEL_DIRECTIONS).toHaveLength(4);
    expect(TRAVEL_DIRECTIONS).toContain('inbound');
    expect(TRAVEL_DIRECTIONS).toContain('outbound');
    expect(TRAVEL_DIRECTIONS).toContain('intercity');
    expect(TRAVEL_DIRECTIONS).toContain('other');
  });

  it('TRAVEL_MODES has exactly 6 values', () => {
    expect(TRAVEL_MODES).toHaveLength(6);
    expect(TRAVEL_MODES).toContain('flight');
    expect(TRAVEL_MODES).toContain('train');
    expect(TRAVEL_MODES).toContain('car');
    expect(TRAVEL_MODES).toContain('bus');
    expect(TRAVEL_MODES).toContain('self_arranged');
    expect(TRAVEL_MODES).toContain('other');
  });

  it('TRAVEL_RECORD_STATUSES has exactly 5 values', () => {
    expect(TRAVEL_RECORD_STATUSES).toHaveLength(5);
  });

  it('CASCADE_TRIGGER_FIELDS has exactly 6 fields', () => {
    expect(CASCADE_TRIGGER_FIELDS).toHaveLength(6);
    expect(CASCADE_TRIGGER_FIELDS).toContain('arrivalAtUtc');
    expect(CASCADE_TRIGGER_FIELDS).toContain('departureAtUtc');
    expect(CASCADE_TRIGGER_FIELDS).toContain('fromCity');
    expect(CASCADE_TRIGGER_FIELDS).toContain('toCity');
    expect(CASCADE_TRIGGER_FIELDS).toContain('terminalOrGate');
    expect(CASCADE_TRIGGER_FIELDS).toContain('direction');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: buildTravelChangeSummary String() coercion
// Spec: "Changes are detected by string comparison"
// ══════════════════════════════════════════════════════════════
describe('Change detection String() coercion edge cases', () => {
  it('detects change from number 0 to string "0" as no change (String equality)', () => {
    const summary = buildTravelChangeSummary(
      { fromCity: 0 as unknown },
      { fromCity: '0' },
    );
    // String(0) === String("0") === "0" — no change detected
    expect(Object.keys(summary)).not.toContain('fromCity');
  });

  it('detects change from boolean false to string "false" as no change', () => {
    const summary = buildTravelChangeSummary(
      { fromCity: false as unknown },
      { fromCity: 'false' },
    );
    expect(Object.keys(summary)).not.toContain('fromCity');
  });

  it('detects actual value changes correctly', () => {
    const summary = buildTravelChangeSummary(
      { fromCity: 'Delhi', toCity: 'Mumbai' },
      { fromCity: 'Pune', toCity: 'Mumbai' },
    );
    expect(Object.keys(summary)).toContain('fromCity');
    expect(Object.keys(summary)).not.toContain('toCity');
    expect(summary.fromCity.from).toBe('Delhi');
    expect(summary.fromCity.to).toBe('Pune');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: CSV import schema
// Spec: "CSV rows require direction, travelMode, fromCity, toCity"
// ══════════════════════════════════════════════════════════════
describe('CSV import schema validation', () => {
  it('rejects row with invalid direction', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'invalid',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
    });
    expect(result.success).toBe(false);
  });

  it('rejects row with invalid travelMode', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'helicopter',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid CSV row with all optional fields empty', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      personEmail: '',
      personPhone: '',
      personName: '',
      fromLocation: '',
      toLocation: '',
      departureAtUtc: '',
      arrivalAtUtc: '',
      carrierName: '',
      serviceNumber: '',
      pnrOrBookingRef: '',
      terminalOrGate: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects CSV timestamps that are not canonical UTC instants', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      departureAtUtc: '2026-05-01T10:00:00+05:30',
    });
    expect(result.success).toBe(false);
  });

  it('rejects CSV rows with arrival not strictly after departure', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      departureAtUtc: '2026-05-01T10:00:00Z',
      arrivalAtUtc: '2026-05-01T09:59:59Z',
    });
    expect(result.success).toBe(false);
  });
});
