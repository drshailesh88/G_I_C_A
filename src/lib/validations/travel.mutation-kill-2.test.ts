/**
 * Mutation-killing tests for travel validations — Round 2
 *
 * Targets:
 * - 24x MethodExpression: .trim(), .max(), .optional(), .min() chain methods
 * - 36x StringLiteral: schema error messages and field constraints
 * - 1x EqualityOperator: arrival > departure comparison
 *
 * ORACLE: The Zod schema SPECIFICATION defines these behaviors:
 *   - .trim() strips whitespace before validation
 *   - .max(N) rejects strings longer than N AFTER trimming
 *   - .optional().or(z.literal('')) accepts undefined or empty string
 *   - .min(1) rejects empty string after trimming
 */
import { describe, expect, it } from 'vitest';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelCsvRowSchema,
} from './travel';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';
const baseInput = {
  personId: VALID_UUID,
  direction: 'inbound' as const,
  travelMode: 'flight' as const,
  fromCity: 'Mumbai',
  toCity: 'Delhi',
};

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: .trim() — removing trim() would let whitespace pass
// ══════════════════════════════════════════════════════════════
describe('Schema: .trim() strips whitespace', () => {
  it('fromCity trims leading/trailing whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      fromCity: '  Mumbai  ',
    });
    expect(result.fromCity).toBe('Mumbai');
  });

  it('toCity trims leading/trailing whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      toCity: '  Delhi  ',
    });
    expect(result.toCity).toBe('Delhi');
  });

  it('fromLocation trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      fromLocation: '  IGI Airport  ',
    });
    expect(result.fromLocation).toBe('IGI Airport');
  });

  it('toLocation trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      toLocation: '  CSMT  ',
    });
    expect(result.toLocation).toBe('CSMT');
  });

  it('carrierName trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      carrierName: '  Air India  ',
    });
    expect(result.carrierName).toBe('Air India');
  });

  it('serviceNumber trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      serviceNumber: '  AI-302  ',
    });
    expect(result.serviceNumber).toBe('AI-302');
  });

  it('pnrOrBookingRef trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      pnrOrBookingRef: '  PNR123  ',
    });
    expect(result.pnrOrBookingRef).toBe('PNR123');
  });

  it('seatOrCoach trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      seatOrCoach: '  12A  ',
    });
    expect(result.seatOrCoach).toBe('12A');
  });

  it('terminalOrGate trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      terminalOrGate: '  Terminal 3  ',
    });
    expect(result.terminalOrGate).toBe('Terminal 3');
  });

  it('attachmentUrl trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      attachmentUrl: '  https://example.com  ',
    });
    expect(result.attachmentUrl).toBe('https://example.com');
  });

  it('notes trims whitespace', () => {
    const result = createTravelRecordSchema.parse({
      ...baseInput,
      notes: '  VIP guest  ',
    });
    expect(result.notes).toBe('VIP guest');
  });

  it('cancelTravelRecord reason trims whitespace', () => {
    const result = cancelTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      reason: '  Changed plans  ',
    });
    expect(result.reason).toBe('Changed plans');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: .max(N) — removing max() would accept oversized strings
// ══════════════════════════════════════════════════════════════
describe('Schema: .max(N) enforces upper bounds', () => {
  // Each field has a specific max length. Test at max+1 for each.
  const fieldMaxLengths: [string, number][] = [
    ['fromLocation', 300],
    ['toLocation', 300],
    ['carrierName', 200],
    ['serviceNumber', 50],
    ['pnrOrBookingRef', 50],
    ['seatOrCoach', 50],
    ['terminalOrGate', 100],
    ['attachmentUrl', 500],
    ['notes', 2000],
  ];

  for (const [field, maxLen] of fieldMaxLengths) {
    it(`${field} rejects strings longer than ${maxLen}`, () => {
      const result = createTravelRecordSchema.safeParse({
        ...baseInput,
        [field]: 'x'.repeat(maxLen + 1),
      });
      expect(result.success).toBe(false);
    });

    it(`${field} accepts strings at exactly ${maxLen}`, () => {
      const result = createTravelRecordSchema.safeParse({
        ...baseInput,
        [field]: 'x'.repeat(maxLen),
      });
      if (!result.success) {
        // Should not have an error on this specific field for max length
        const fieldErrors = result.error.issues.filter(
          (i) => i.path.includes(field) && i.code === 'too_big',
        );
        expect(fieldErrors).toHaveLength(0);
      }
    });
  }

  it('cancel reason rejects strings longer than 500 (non-whitespace)', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('cancel reason accepts strings at exactly 500', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      reason: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: .optional() — removing optional would make fields required
// ══════════════════════════════════════════════════════════════
describe('Schema: optional fields are truly optional', () => {
  it('create schema succeeds with only required fields', () => {
    const result = createTravelRecordSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('update schema succeeds with only travelRecordId', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('cancel schema succeeds without reason', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('update schema accepts all optional fields', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      direction: 'outbound',
      travelMode: 'train',
      fromCity: 'A',
      toCity: 'B',
      fromLocation: 'X',
      toLocation: 'Y',
      departureAtUtc: '2026-01-01T00:00:00Z',
      arrivalAtUtc: '2026-01-02T00:00:00Z',
      carrierName: 'C',
      serviceNumber: 'S',
      pnrOrBookingRef: 'P',
      seatOrCoach: 'SC',
      terminalOrGate: 'TG',
      attachmentUrl: 'http://example.com',
      notes: 'N',
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: .min(1) — removing min(1) would accept empty required fields
// ══════════════════════════════════════════════════════════════
describe('Schema: .min(1) on required fields', () => {
  it('fromCity rejects whitespace-only (trimmed to empty)', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      fromCity: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('toCity rejects whitespace-only (trimmed to empty)', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      toCity: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('update fromCity rejects whitespace-only', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      fromCity: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('update toCity rejects whitespace-only', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      toCity: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('CSV fromCity rejects empty', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: '',
      toCity: 'B',
    });
    expect(result.success).toBe(false);
  });

  it('CSV toCity rejects empty', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: '',
    });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: arrival > departure (EqualityOperator line 46)
// ══════════════════════════════════════════════════════════════
describe('Schema: arrival-departure boundary', () => {
  it('rejects arrival equal to departure (not strictly after)', () => {
    const time = '2026-05-01T10:00:00Z';
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      departureAtUtc: time,
      arrivalAtUtc: time,
    });
    expect(result.success).toBe(false);
  });

  it('accepts arrival 1 second after departure', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      departureAtUtc: '2026-05-01T10:00:00Z',
      arrivalAtUtc: '2026-05-01T10:00:01Z',
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: .uuid() validation messages
// ══════════════════════════════════════════════════════════════
describe('Schema: UUID validation', () => {
  it('create rejects non-UUID personId', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      personId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('create rejects non-UUID registrationId', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      registrationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('update rejects non-UUID travelRecordId', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('cancel rejects non-UUID travelRecordId', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('CSV rejects invalid email format', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
      personEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('CSV accepts valid email', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
      personEmail: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });
});
