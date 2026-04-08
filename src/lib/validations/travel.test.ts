import { describe, expect, it } from 'vitest';
import {
  createTravelRecordSchema,
  updateTravelRecordSchema,
  cancelTravelRecordSchema,
  travelCsvRowSchema,
  TRAVEL_DIRECTIONS,
  TRAVEL_MODES,
  TRAVEL_RECORD_STATUSES,
  TRAVEL_RECORD_TRANSITIONS,
  buildTravelChangeSummary,
  hasCascadeTriggerChanges,
} from './travel';

// ── Constants ─────────────────────────────────────────────────
describe('Travel constants', () => {
  it('defines 4 travel directions', () => {
    expect(TRAVEL_DIRECTIONS).toHaveLength(4);
    expect(TRAVEL_DIRECTIONS).toContain('inbound');
    expect(TRAVEL_DIRECTIONS).toContain('outbound');
  });

  it('defines 6 travel modes', () => {
    expect(TRAVEL_MODES).toHaveLength(6);
    expect(TRAVEL_MODES).toContain('flight');
    expect(TRAVEL_MODES).toContain('train');
    expect(TRAVEL_MODES).toContain('self_arranged');
  });

  it('defines 5 record statuses', () => {
    expect(TRAVEL_RECORD_STATUSES).toHaveLength(5);
  });

  it('cancelled is terminal (no outgoing transitions)', () => {
    expect(TRAVEL_RECORD_TRANSITIONS.cancelled).toEqual([]);
  });

  it('draft can transition to confirmed or cancelled', () => {
    expect(TRAVEL_RECORD_TRANSITIONS.draft).toContain('confirmed');
    expect(TRAVEL_RECORD_TRANSITIONS.draft).toContain('cancelled');
  });

  it('confirmed can transition to sent, changed, or cancelled', () => {
    expect(TRAVEL_RECORD_TRANSITIONS.confirmed).toEqual(['sent', 'changed', 'cancelled']);
  });
});

// ── createTravelRecordSchema ──────────────────────────────────
describe('createTravelRecordSchema', () => {
  const validInput = {
    personId: '550e8400-e29b-41d4-a716-446655440000',
    direction: 'inbound' as const,
    travelMode: 'flight' as const,
    fromCity: 'Mumbai',
    toCity: 'Delhi',
  };

  it('accepts valid minimal input', () => {
    const result = createTravelRecordSchema.parse(validInput);
    expect(result.personId).toBe(validInput.personId);
    expect(result.direction).toBe('inbound');
    expect(result.travelMode).toBe('flight');
    expect(result.fromCity).toBe('Mumbai');
    expect(result.toCity).toBe('Delhi');
  });

  it('accepts full input with all optional fields', () => {
    const full = {
      ...validInput,
      registrationId: '550e8400-e29b-41d4-a716-446655440001',
      fromLocation: 'BOM Terminal 2',
      toLocation: 'DEL Terminal 3',
      departureAtUtc: '2026-05-01T08:00:00Z',
      arrivalAtUtc: '2026-05-01T10:30:00Z',
      carrierName: 'Air India',
      serviceNumber: 'AI-302',
      pnrOrBookingRef: 'ABC123',
      seatOrCoach: '12A',
      terminalOrGate: 'T2 Gate 15',
      attachmentUrl: 'https://storage.example.com/ticket.pdf',
      notes: 'Vegetarian meal requested',
    };
    const result = createTravelRecordSchema.parse(full);
    expect(result.carrierName).toBe('Air India');
    expect(result.notes).toBe('Vegetarian meal requested');
  });

  it('rejects missing personId', () => {
    const { personId, ...rest } = validInput;
    expect(() => createTravelRecordSchema.parse(rest)).toThrow();
  });

  it('rejects invalid direction', () => {
    expect(() =>
      createTravelRecordSchema.parse({ ...validInput, direction: 'sideways' }),
    ).toThrow();
  });

  it('rejects invalid travel mode', () => {
    expect(() =>
      createTravelRecordSchema.parse({ ...validInput, travelMode: 'teleport' }),
    ).toThrow();
  });

  it('rejects empty fromCity', () => {
    expect(() =>
      createTravelRecordSchema.parse({ ...validInput, fromCity: '' }),
    ).toThrow();
  });

  it('rejects empty toCity', () => {
    expect(() =>
      createTravelRecordSchema.parse({ ...validInput, toCity: '' }),
    ).toThrow();
  });

  it('rejects arrival before departure', () => {
    expect(() =>
      createTravelRecordSchema.parse({
        ...validInput,
        departureAtUtc: '2026-05-01T10:00:00Z',
        arrivalAtUtc: '2026-05-01T08:00:00Z',
      }),
    ).toThrow('Arrival must be after departure');
  });

  it('allows departure without arrival', () => {
    const result = createTravelRecordSchema.parse({
      ...validInput,
      departureAtUtc: '2026-05-01T10:00:00Z',
    });
    expect(result.departureAtUtc).toBe('2026-05-01T10:00:00Z');
  });

  it('trims whitespace from city names', () => {
    const result = createTravelRecordSchema.parse({
      ...validInput,
      fromCity: '  Mumbai  ',
      toCity: '  Delhi  ',
    });
    expect(result.fromCity).toBe('Mumbai');
    expect(result.toCity).toBe('Delhi');
  });

  it('accepts empty string for optional fields', () => {
    const result = createTravelRecordSchema.parse({
      ...validInput,
      registrationId: '',
      fromLocation: '',
      carrierName: '',
    });
    expect(result.registrationId).toBe('');
    expect(result.fromLocation).toBe('');
  });
});

// ── updateTravelRecordSchema ──────────────────────────────────
describe('updateTravelRecordSchema', () => {
  it('requires travelRecordId', () => {
    expect(() => updateTravelRecordSchema.parse({})).toThrow();
  });

  it('accepts partial updates', () => {
    const result = updateTravelRecordSchema.parse({
      travelRecordId: '550e8400-e29b-41d4-a716-446655440000',
      fromCity: 'Pune',
    });
    expect(result.fromCity).toBe('Pune');
    expect(result.toCity).toBeUndefined();
  });

  it('rejects invalid UUID for travelRecordId', () => {
    expect(() =>
      updateTravelRecordSchema.parse({ travelRecordId: 'not-a-uuid' }),
    ).toThrow();
  });
});

// ── cancelTravelRecordSchema ──────────────────────────────────
describe('cancelTravelRecordSchema', () => {
  it('requires travelRecordId', () => {
    expect(() => cancelTravelRecordSchema.parse({})).toThrow();
  });

  it('accepts optional reason', () => {
    const result = cancelTravelRecordSchema.parse({
      travelRecordId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Flight rescheduled',
    });
    expect(result.reason).toBe('Flight rescheduled');
  });

  it('accepts without reason', () => {
    const result = cancelTravelRecordSchema.parse({
      travelRecordId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.reason).toBeUndefined();
  });
});

// ── travelCsvRowSchema ────────────────────────────────────────
describe('travelCsvRowSchema', () => {
  it('accepts valid CSV row', () => {
    const result = travelCsvRowSchema.parse({
      personEmail: 'test@example.com',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });
    expect(result.personEmail).toBe('test@example.com');
  });

  it('rejects missing direction', () => {
    expect(() =>
      travelCsvRowSchema.parse({
        fromCity: 'Mumbai',
        toCity: 'Delhi',
        travelMode: 'flight',
      }),
    ).toThrow();
  });

  it('rejects missing fromCity', () => {
    expect(() =>
      travelCsvRowSchema.parse({
        direction: 'inbound',
        travelMode: 'flight',
        toCity: 'Delhi',
        fromCity: '',
      }),
    ).toThrow();
  });
});

// ── Change detection ──────────────────────────────────────────
describe('buildTravelChangeSummary', () => {
  it('detects changes in cascade trigger fields', () => {
    const prev = { arrivalAtUtc: '2026-05-01T10:00:00Z', fromCity: 'Mumbai' };
    const curr = { arrivalAtUtc: '2026-05-01T12:00:00Z', fromCity: 'Mumbai' };
    const summary = buildTravelChangeSummary(prev, curr);
    expect(summary).toHaveProperty('arrivalAtUtc');
    expect(summary.arrivalAtUtc.from).toBe('2026-05-01T10:00:00Z');
    expect(summary.arrivalAtUtc.to).toBe('2026-05-01T12:00:00Z');
    expect(summary).not.toHaveProperty('fromCity');
  });

  it('returns empty object when no cascade fields changed', () => {
    const prev = { fromCity: 'Mumbai', toCity: 'Delhi' };
    const curr = { fromCity: 'Mumbai', toCity: 'Delhi' };
    expect(buildTravelChangeSummary(prev, curr)).toEqual({});
  });

  it('treats null and undefined as equal', () => {
    const prev = { arrivalAtUtc: null };
    const curr = { arrivalAtUtc: undefined };
    expect(buildTravelChangeSummary(prev, curr)).toEqual({});
  });
});

describe('hasCascadeTriggerChanges', () => {
  it('returns true when cascade fields changed', () => {
    expect(hasCascadeTriggerChanges(
      { toCity: 'Mumbai' },
      { toCity: 'Pune' },
    )).toBe(true);
  });

  it('returns false when no cascade fields changed', () => {
    expect(hasCascadeTriggerChanges(
      { carrierName: 'Air India' },
      { carrierName: 'IndiGo' },
    )).toBe(false);
  });
});
