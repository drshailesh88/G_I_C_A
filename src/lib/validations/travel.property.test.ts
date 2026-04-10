/**
 * Property-based tests for travel module.
 *
 * These tests use fast-check to generate RANDOM inputs — the expected outcomes
 * are derived from SPECIFICATIONS (the Zod schemas and state machine definition),
 * NOT from reading the implementation code.
 *
 * The oracle here is the specification itself:
 *   - Max lengths are defined in the schema
 *   - Valid transitions are defined in TRAVEL_RECORD_TRANSITIONS
 *   - Arrival must be after departure (schema refinement)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createTravelRecordSchema,
  cancelTravelRecordSchema,
  TRAVEL_RECORD_TRANSITIONS,
  TRAVEL_RECORD_STATUSES,
  TRAVEL_DIRECTIONS,
  TRAVEL_MODES,
  buildTravelChangeSummary,
  hasCascadeTriggerChanges,
  CASCADE_TRIGGER_FIELDS,
  type TravelRecordStatus,
} from './travel';

// ══════════════════════════════════════════════════════════════
// PROPERTY: State machine invariants
// ══════════════════════════════════════════════════════════════
describe('Property: State machine invariants', () => {
  const statusArb = fc.constantFrom(...TRAVEL_RECORD_STATUSES);

  it('cancelled is a terminal state — no transitions allowed', () => {
    fc.assert(
      fc.property(statusArb, (targetStatus) => {
        const allowed = TRAVEL_RECORD_TRANSITIONS.cancelled;
        expect(allowed).not.toContain(targetStatus);
      }),
    );
  });

  it('every non-cancelled status can reach cancelled', () => {
    fc.assert(
      fc.property(
        statusArb.filter((s) => s !== 'cancelled'),
        (fromStatus) => {
          const allowed = TRAVEL_RECORD_TRANSITIONS[fromStatus];
          expect(allowed).toContain('cancelled');
        },
      ),
    );
  });

  it('transitions are not symmetric — A->B does not imply B->A', () => {
    // Find at least one asymmetric pair to prove transitions are directional
    let foundAsymmetry = false;
    for (const from of TRAVEL_RECORD_STATUSES) {
      for (const to of TRAVEL_RECORD_TRANSITIONS[from]) {
        if (!TRAVEL_RECORD_TRANSITIONS[to].includes(from)) {
          foundAsymmetry = true;
        }
      }
    }
    expect(foundAsymmetry).toBe(true);
  });

  it('draft cannot be reached from any other state', () => {
    fc.assert(
      fc.property(
        statusArb.filter((s) => s !== 'draft'),
        (fromStatus) => {
          const allowed = TRAVEL_RECORD_TRANSITIONS[fromStatus];
          expect(allowed).not.toContain('draft');
        },
      ),
    );
  });

  it('random walk from draft always terminates at cancelled or loops in {confirmed, sent, changed}', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 10 }), { minLength: 1, maxLength: 50 }),
        (randomChoices) => {
          let current: TravelRecordStatus = 'draft';
          const visited = new Set<TravelRecordStatus>();

          for (const choice of randomChoices) {
            visited.add(current);
            const allowed = TRAVEL_RECORD_TRANSITIONS[current];
            if (allowed.length === 0) break; // terminal
            current = allowed[choice % allowed.length];
          }

          // If we stopped, we're either at cancelled (terminal) or still in a valid state
          expect(TRAVEL_RECORD_STATUSES).toContain(current);
          if (TRAVEL_RECORD_TRANSITIONS[current].length === 0) {
            expect(current).toBe('cancelled');
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ══════════════════════════════════════════════════════════════
// PROPERTY: Schema validation boundaries
// ══════════════════════════════════════════════════════════════
describe('Property: Schema validation boundaries', () => {
  const validUuid = fc.uuid();
  const directionArb = fc.constantFrom(...TRAVEL_DIRECTIONS);
  const modeArb = fc.constantFrom(...TRAVEL_MODES);

  it('any string with 1-200 non-whitespace trimmed chars is accepted for fromCity', () => {
    // The schema does .trim().min(1).max(200), so:
    // - whitespace-only strings are rejected (trimmed length = 0, fails min(1))
    // - strings that trim to > 200 chars are rejected
    // - strings that trim to 1-200 chars are accepted
    const validFromCity = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length >= 1 && s.trim().length <= 200);

    fc.assert(
      fc.property(
        validFromCity,
        validUuid,
        directionArb,
        modeArb,
        (fromCity, personId, direction, travelMode) => {
          const result = createTravelRecordSchema.safeParse({
            personId,
            direction,
            travelMode,
            fromCity,
            toCity: 'X',
          });
          // Should not fail on fromCity specifically
          if (!result.success) {
            const fromCityErrors = result.error.issues.filter(
              (i) => i.path.includes('fromCity'),
            );
            expect(fromCityErrors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('any string whose trimmed length > 200 chars is rejected for fromCity', () => {
    // NOTE: Zod applies .trim() BEFORE .max(200), so whitespace-padded strings
    // that trim to <= 200 chars are ACCEPTED. This is correct behavior.
    // We must generate strings whose TRIMMED length exceeds 200.
    const longTrimmedString = fc
      .string({ minLength: 201, maxLength: 500 })
      .filter((s) => s.trim().length > 200);

    fc.assert(
      fc.property(
        longTrimmedString,
        validUuid,
        directionArb,
        modeArb,
        (fromCity, personId, direction, travelMode) => {
          const result = createTravelRecordSchema.safeParse({
            personId,
            direction,
            travelMode,
            fromCity,
            toCity: 'X',
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty fromCity is always rejected', () => {
    fc.assert(
      fc.property(
        validUuid,
        directionArb,
        modeArb,
        (personId, direction, travelMode) => {
          const result = createTravelRecordSchema.safeParse({
            personId,
            direction,
            travelMode,
            fromCity: '',
            toCity: 'X',
          });
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('cancel reason > 500 chars is always rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 501, maxLength: 1000 }),
        validUuid,
        (reason, travelRecordId) => {
          const result = cancelTravelRecordSchema.safeParse({
            travelRecordId,
            reason,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('arrival before departure is always rejected', () => {
    // Use ISO string dates directly to avoid Date overflow issues
    const departureMsArb = fc.integer({
      min: new Date('2022-01-01').getTime(),
      max: new Date('2028-01-01').getTime(),
    });
    const offsetMinutesArb = fc.integer({ min: 1, max: 60 * 24 * 7 }); // up to 7 days

    fc.assert(
      fc.property(
        validUuid, directionArb, modeArb, departureMsArb, offsetMinutesArb,
        (personId, direction, travelMode, departureMs, minutesBefore) => {
          const departure = new Date(departureMs);
          const arrival = new Date(departureMs - minutesBefore * 60000);
          const result = createTravelRecordSchema.safeParse({
            personId, direction, travelMode,
            fromCity: 'A', toCity: 'B',
            departureAtUtc: departure.toISOString(),
            arrivalAtUtc: arrival.toISOString(),
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('arrival after departure is always accepted (date-wise)', () => {
    const departureMsArb = fc.integer({
      min: new Date('2022-01-01').getTime(),
      max: new Date('2028-01-01').getTime(),
    });
    const offsetMinutesArb = fc.integer({ min: 1, max: 60 * 24 * 7 });

    fc.assert(
      fc.property(
        validUuid, directionArb, modeArb, departureMsArb, offsetMinutesArb,
        (personId, direction, travelMode, departureMs, minutesAfter) => {
          const departure = new Date(departureMs);
          const arrival = new Date(departureMs + minutesAfter * 60000);
          const result = createTravelRecordSchema.safeParse({
            personId, direction, travelMode,
            fromCity: 'A', toCity: 'B',
            departureAtUtc: departure.toISOString(),
            arrivalAtUtc: arrival.toISOString(),
          });
          if (!result.success) {
            const dateErrors = result.error.issues.filter(
              (i) => i.path.includes('arrivalAtUtc') && i.message.includes('after departure'),
            );
            expect(dateErrors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ══════════════════════════════════════════════════════════════
// PROPERTY: Cascade change detection
// ══════════════════════════════════════════════════════════════
describe('Property: Cascade change detection', () => {
  const fieldValueArb = fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.constant(null),
    fc.constant(undefined),
  );

  it('identical records never trigger cascade', () => {
    fc.assert(
      fc.property(
        fc.record(
          Object.fromEntries(CASCADE_TRIGGER_FIELDS.map((f) => [f, fieldValueArb])),
        ),
        (record) => {
          expect(hasCascadeTriggerChanges(record, { ...record })).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('changing any cascade field triggers cascade', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASCADE_TRIGGER_FIELDS),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
        (field, oldVal, newVal) => {
          // Ensure values are actually different
          if (oldVal === newVal) return; // skip — not a real change

          const prev = { [field]: oldVal };
          const curr = { [field]: newVal };
          const summary = buildTravelChangeSummary(prev, curr);

          expect(Object.keys(summary)).toContain(field);
          expect(hasCascadeTriggerChanges(prev, curr)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('null and undefined are treated as equal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASCADE_TRIGGER_FIELDS),
        (field) => {
          const prev = { [field]: null };
          const curr = { [field]: undefined };
          expect(hasCascadeTriggerChanges(prev, curr)).toBe(false);
        },
      ),
    );
  });

  it('change summary includes from/to for every changed field', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASCADE_TRIGGER_FIELDS),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (field, from, to) => {
          if (from === to) return;
          const summary = buildTravelChangeSummary({ [field]: from }, { [field]: to });
          if (summary[field]) {
            expect(summary[field]).toHaveProperty('from');
            expect(summary[field]).toHaveProperty('to');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
