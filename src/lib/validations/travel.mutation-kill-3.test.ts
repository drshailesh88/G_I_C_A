/**
 * Mutation-killing tests for travel validations — Round 3
 *
 * Targets 51 surviving mutations:
 * - 40x StringLiteral: error message strings changed to "" by Stryker.
 *   Kill by asserting the exact error message text for each field.
 * - 11x MethodExpression: .trim(), .max(), .optional() removed from Zod chains.
 *   Kill by testing boundary conditions that only fail when the method is present.
 *
 * Strategy for StringLiteral kills:
 *   - For `.uuid('Invalid X ID')`: pass non-UUID, assert message contains specific text
 *   - For `.min(1, 'X is required')`: pass empty, assert message contains specific text
 *   - For `.max(N)`: pass N+1 chars, verify failure; pass N chars, verify success
 *   - For `.email('Invalid email')`: pass bad email, assert message
 *
 * Strategy for MethodExpression kills:
 *   - For `.trim()`: pass padded string, assert parsed output is trimmed
 *   - For `.optional()`: omit the field, assert success
 *   - For `.max(N)`: pass N+1, assert failure on that specific field
 */
import { describe, expect, it } from 'vitest';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelCsvRowSchema,
  travelRecordIdSchema,
} from './travel';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';

const baseInput = {
  personId: VALID_UUID,
  direction: 'inbound' as const,
  travelMode: 'flight' as const,
  fromCity: 'Mumbai',
  toCity: 'Delhi',
};

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: EXACT error messages for UUID fields
// Stryker changes `.uuid('Invalid person ID')` to `.uuid('')`
// Kill by asserting the message is NOT empty and contains expected text
// ══════════════════════════════════════════════════════════════
describe('Exact error messages for UUID validation', () => {
  it('personId: error message is exactly "Invalid person ID"', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      personId: 'bad',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('personId'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Invalid person ID');
  });

  it('registrationId: error message is exactly "Invalid registration ID"', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      registrationId: 'bad-uuid',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('registrationId'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Invalid registration ID');
  });

  it('update travelRecordId: error message is exactly "Invalid travel record ID"', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: 'bad',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('travelRecordId'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Invalid travel record ID');
  });

  it('cancel travelRecordId: error message is exactly "Invalid travel record ID"', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: 'bad',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('travelRecordId'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Invalid travel record ID');
  });

  it('travelRecordIdSchema: error message is exactly "Invalid travel record ID"', () => {
    const result = travelRecordIdSchema.safeParse('bad');
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('Invalid travel record ID');
  });
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: EXACT error messages for .min(1, 'X is required')
// ══════════════════════════════════════════════════════════════
describe('Exact error messages for required field validation', () => {
  it('fromCity: error message is exactly "From city is required"', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      fromCity: '',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('fromCity'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('From city is required');
  });

  it('toCity: error message is exactly "To city is required"', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      toCity: '',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('toCity'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('To city is required');
  });

  it('CSV fromCity: error message is exactly "From city is required"', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: '',
      toCity: 'B',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('fromCity'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('From city is required');
  });

  it('CSV toCity: error message is exactly "To city is required"', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: '',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('toCity'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('To city is required');
  });
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: refine error message for arrival/departure
// ══════════════════════════════════════════════════════════════
describe('Exact error message for arrival-departure validation', () => {
  it('error message is exactly "Arrival must be after departure"', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      departureAtUtc: '2026-06-01T12:00:00Z',
      arrivalAtUtc: '2026-06-01T08:00:00Z',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('arrivalAtUtc'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Arrival must be after departure');
  });
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: CSV personEmail error message
// ══════════════════════════════════════════════════════════════
describe('Exact error message for CSV email validation', () => {
  it('personEmail: error message is exactly "Invalid email"', () => {
    const result = travelCsvRowSchema.safeParse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'A',
      toCity: 'B',
      personEmail: 'not-email',
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('personEmail'));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe('Invalid email');
  });
});

// ══════════════════════════════════════════════════════════════
// MethodExpression kills: .trim() on update and cancel schemas
// If .trim() is removed, the parsed output retains whitespace.
// ══════════════════════════════════════════════════════════════
describe('Update schema: .trim() strips whitespace', () => {
  it('update fromCity trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      fromCity: '  Pune  ',
    });
    expect(result.fromCity).toBe('Pune');
  });

  it('update toCity trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      toCity: '  Chennai  ',
    });
    expect(result.toCity).toBe('Chennai');
  });

  it('update fromLocation trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      fromLocation: '  Airport T2  ',
    });
    expect(result.fromLocation).toBe('Airport T2');
  });

  it('update toLocation trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      toLocation: '  Railway Station  ',
    });
    expect(result.toLocation).toBe('Railway Station');
  });

  it('update carrierName trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      carrierName: '  IndiGo  ',
    });
    expect(result.carrierName).toBe('IndiGo');
  });

  it('update serviceNumber trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      serviceNumber: '  6E-123  ',
    });
    expect(result.serviceNumber).toBe('6E-123');
  });

  it('update pnrOrBookingRef trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      pnrOrBookingRef: '  REF999  ',
    });
    expect(result.pnrOrBookingRef).toBe('REF999');
  });

  it('update seatOrCoach trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      seatOrCoach: '  B2-44  ',
    });
    expect(result.seatOrCoach).toBe('B2-44');
  });

  it('update terminalOrGate trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      terminalOrGate: '  Gate 7  ',
    });
    expect(result.terminalOrGate).toBe('Gate 7');
  });

  it('update attachmentUrl trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      attachmentUrl: '  https://cdn.example.com/doc.pdf  ',
    });
    expect(result.attachmentUrl).toBe('https://cdn.example.com/doc.pdf');
  });

  it('update notes trims whitespace', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      notes: '  Special dietary requirements  ',
    });
    expect(result.notes).toBe('Special dietary requirements');
  });

  it('cancel reason trims whitespace', () => {
    const result = cancelTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      reason: '  Travel plans changed  ',
    });
    expect(result.reason).toBe('Travel plans changed');
  });
});

// ══════════════════════════════════════════════════════════════
// MethodExpression kills: .max(N) on update schema
// If .max() is removed, oversized strings pass. Test at max+1.
// ══════════════════════════════════════════════════════════════
describe('Update schema: .max(N) enforces upper bounds', () => {
  const updateFieldMaxLengths: [string, number][] = [
    ['fromCity', 200],
    ['toCity', 200],
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

  for (const [field, maxLen] of updateFieldMaxLengths) {
    it(`update ${field} rejects strings longer than ${maxLen}`, () => {
      const result = updateTravelRecordSchema.safeParse({
        travelRecordId: VALID_UUID,
        [field]: 'x'.repeat(maxLen + 1),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fieldError = result.error.issues.find((i) => i.path.includes(field));
        expect(fieldError).toBeDefined();
      }
    });

    it(`update ${field} accepts strings at exactly ${maxLen}`, () => {
      const result = updateTravelRecordSchema.safeParse({
        travelRecordId: VALID_UUID,
        [field]: 'x'.repeat(maxLen),
      });
      if (!result.success) {
        const fieldErrors = result.error.issues.filter(
          (i) => i.path.includes(field) && i.code === 'too_big',
        );
        expect(fieldErrors).toHaveLength(0);
      }
    });
  }

  it('cancel reason rejects strings longer than 500', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// MethodExpression kills: .optional() on update schema fields
// If .optional() is removed, omitting the field causes failure.
// ══════════════════════════════════════════════════════════════
describe('Update schema: .optional() on each field', () => {
  const optionalFields = [
    'direction', 'travelMode', 'fromCity', 'toCity',
    'fromLocation', 'toLocation', 'departureAtUtc', 'arrivalAtUtc',
    'carrierName', 'serviceNumber', 'pnrOrBookingRef',
    'seatOrCoach', 'terminalOrGate', 'attachmentUrl', 'notes',
  ];

  for (const field of optionalFields) {
    it(`update schema succeeds without ${field}`, () => {
      const input: Record<string, unknown> = { travelRecordId: VALID_UUID };
      // Explicitly do NOT include the field
      const result = updateTravelRecordSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  }

  it('cancel schema succeeds without reason', () => {
    const result = cancelTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// MethodExpression kills: .min(1) on update schema required-when-provided
// If .min(1) is removed, empty strings would pass for fromCity/toCity.
// ══════════════════════════════════════════════════════════════
describe('Update schema: .min(1) rejects empty strings for city fields', () => {
  it('update fromCity rejects empty string', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      fromCity: '',
    });
    expect(result.success).toBe(false);
  });

  it('update toCity rejects empty string', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      toCity: '',
    });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: .or(z.literal('')) on update schema
// Stryker changes '' to something else. Kill by verifying
// empty string is accepted for each optional field.
// ══════════════════════════════════════════════════════════════
describe('Update schema: empty string acceptance via z.literal("")', () => {
  const fieldsAcceptingEmpty = [
    'fromLocation', 'toLocation', 'departureAtUtc', 'arrivalAtUtc',
    'carrierName', 'serviceNumber', 'pnrOrBookingRef',
    'seatOrCoach', 'terminalOrGate', 'attachmentUrl', 'notes',
  ];

  for (const field of fieldsAcceptingEmpty) {
    it(`update ${field} accepts empty string`, () => {
      const result = updateTravelRecordSchema.safeParse({
        travelRecordId: VALID_UUID,
        [field]: '',
      });
      expect(result.success).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: create schema .max(N) exact boundary
// Test fromCity and toCity max(200) boundaries specifically
// ══════════════════════════════════════════════════════════════
describe('Create schema: fromCity and toCity max(200) boundary', () => {
  it('fromCity rejects 201 characters', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      fromCity: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('fromCity'));
    expect(issue).toBeDefined();
  });

  it('fromCity accepts 200 characters', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      fromCity: 'x'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('toCity rejects 201 characters', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      toCity: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.includes('toCity'));
    expect(issue).toBeDefined();
  });

  it('toCity accepts 200 characters', () => {
    const result = createTravelRecordSchema.safeParse({
      ...baseInput,
      toCity: 'x'.repeat(200),
    });
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: CSV schema field-specific .or(z.literal(''))
// ══════════════════════════════════════════════════════════════
describe('CSV schema: empty string acceptance for each optional field', () => {
  const csvBase = {
    direction: 'inbound' as const,
    travelMode: 'flight' as const,
    fromCity: 'Delhi',
    toCity: 'Mumbai',
  };

  const csvOptionalFields = [
    'personEmail', 'personPhone', 'personName',
    'fromLocation', 'toLocation',
    'departureAtUtc', 'arrivalAtUtc',
    'carrierName', 'serviceNumber',
    'pnrOrBookingRef', 'terminalOrGate',
  ];

  for (const field of csvOptionalFields) {
    it(`CSV ${field} accepts empty string`, () => {
      const result = travelCsvRowSchema.safeParse({
        ...csvBase,
        [field]: '',
      });
      expect(result.success).toBe(true);
    });
  }

  for (const field of csvOptionalFields) {
    it(`CSV ${field} can be omitted`, () => {
      const result = travelCsvRowSchema.safeParse(csvBase);
      expect(result.success).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// StringLiteral kills: CSV fromCity trim behavior
// ══════════════════════════════════════════════════════════════
describe('CSV schema: trim behavior', () => {
  it('CSV fromCity trims whitespace', () => {
    const result = travelCsvRowSchema.parse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: '  Delhi  ',
      toCity: 'Mumbai',
    });
    expect(result.fromCity).toBe('Delhi');
  });

  it('CSV toCity trims whitespace', () => {
    const result = travelCsvRowSchema.parse({
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: '  Mumbai  ',
    });
    expect(result.toCity).toBe('Mumbai');
  });
});

// ══════════════════════════════════════════════════════════════
// MethodExpression kills: create schema z.literal('') acceptance
// Stryker removes the .or(z.literal('')) — verify empty string
// is accepted for each field in create schema specifically
// ══════════════════════════════════════════════════════════════
describe('Create schema: z.literal("") acceptance for each optional field', () => {
  const createOptionalFields = [
    'fromLocation', 'toLocation', 'departureAtUtc', 'arrivalAtUtc',
    'carrierName', 'serviceNumber', 'pnrOrBookingRef',
    'seatOrCoach', 'terminalOrGate', 'attachmentUrl', 'notes',
    'registrationId',
  ];

  for (const field of createOptionalFields) {
    it(`create ${field} accepts empty string`, () => {
      const result = createTravelRecordSchema.safeParse({
        ...baseInput,
        [field]: '',
      });
      expect(result.success).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Combined: verify parsed output for optional fields
// When a value is provided, ensure it passes through correctly
// ══════════════════════════════════════════════════════════════
describe('Update schema: parsed values match input', () => {
  it('direction enum value passes through', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      direction: 'outbound',
    });
    expect(result.direction).toBe('outbound');
  });

  it('travelMode enum value passes through', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: VALID_UUID,
      travelMode: 'train',
    });
    expect(result.travelMode).toBe('train');
  });

  it('invalid direction enum is rejected', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      direction: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('invalid travelMode enum is rejected', () => {
    const result = updateTravelRecordSchema.safeParse({
      travelRecordId: VALID_UUID,
      travelMode: 'helicopter',
    });
    expect(result.success).toBe(false);
  });
});
