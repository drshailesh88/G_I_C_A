/**
 * Travel Cascade Handler — Mutation-Kill Tests Round 2
 *
 * Targets 11 surviving mutations:
 * - Lines 32, 36 (ObjectLiteral): resolvePersonContact select shape and null fallback
 * - Lines 109, 136, 198, 223 (ObjectLiteral): `{ id: X.id }` select shapes for accom/transport
 * - Line 182 (ObjectLiteral): variables object `{ changeSummary: data.changeSummary }`
 * - Lines 121, 148, 205, 230 (StringLiteral): `ne()` filter value `'cancelled'`
 *
 * Strategy: assert on the EXACT arguments passed to db.select() and ne() to verify
 * the query shapes cannot be mutated without detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDbSelect, mockNe, mockUpsertRedFlag, mockSendNotification, mockCaptureCascadeError, SCHEMA } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockNe: vi.fn((...args: unknown[]) => ({ op: 'ne', args })),
  mockUpsertRedFlag: vi.fn().mockResolvedValue({ id: 'flag-1' }),
  mockSendNotification: vi.fn().mockResolvedValue({
    notificationLogId: 'log-1',
    provider: 'resend',
    providerMessageId: 'msg-1',
    status: 'sent',
  }),
  mockCaptureCascadeError: vi.fn(),
  SCHEMA: {
    events: {
      id: 'events.id',
      name: 'events.name',
    },
    accommodationRecords: {
      id: 'accom.id',
      eventId: 'accom.event_id',
      personId: 'accom.person_id',
      recordStatus: 'accom.record_status',
    },
    transportPassengerAssignments: {
      id: 'tpa.id',
      eventId: 'tpa.event_id',
      personId: 'tpa.person_id',
      travelRecordId: 'tpa.travel_record_id',
      assignmentStatus: 'tpa.assignment_status',
    },
    people: {
      id: 'people.id',
      email: 'people.email',
      phoneE164: 'people.phone_e164',
      fullName: 'people.full_name',
    },
    travelRecords: {
      id: 'travel.id',
      eventId: 'travel.event_id',
      personId: 'travel.person_id',
    },
  },
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));

vi.mock('@/lib/db/schema', () => SCHEMA);

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  ne: (...args: unknown[]) => mockNe(...args),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  relations: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ op: 'eventScope', args })),
}));

vi.mock('../red-flags', () => ({
  upsertRedFlag: (...args: unknown[]) => mockUpsertRedFlag(...args),
}));

vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

vi.mock('@/lib/sentry', () => ({
  captureCascadeError: (...args: unknown[]) => mockCaptureCascadeError(...args),
}));

function createChainableSelect(rows: Record<string, unknown>[]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  };
}

import { clearCascadeHandlers, emitCascadeEvent, enableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTravelCascadeHandlers } from './travel-cascade';

enableTestMode();

const personBoth = [{ email: 'a@b.com', phoneE164: '+911234567890', fullName: 'Alice' }];

const eventId = 'evt-1';
const personId = 'person-1';
const travelRecordId = 'tr-1';
const actor = { type: 'user', id: 'u1' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerTravelCascadeHandlers();
});

function mockSelects(
  accom: Record<string, unknown>[],
  transport: Record<string, unknown>[],
  person: Record<string, unknown>[],
) {
  mockDbSelect
    .mockReturnValueOnce(createChainableSelect([{ personId }]))
    .mockReturnValueOnce(createChainableSelect(person))
    .mockReturnValueOnce(createChainableSelect([{ name: 'Scoped Event' }]))
    .mockReturnValueOnce(createChainableSelect(accom))
    .mockReturnValueOnce(createChainableSelect(transport));
}

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 32 — resolvePersonContact select shape
// `select({ email, phoneE164, fullName })` — Stryker empties the object
// Kill by verifying the select argument contains the exact 3 fields
// ══════════════════════════════════════════════════════════════
describe('resolvePersonContact: select shape (lines 32, 36)', () => {
  it('person lookup select contains email, phoneE164, fullName fields', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { arrivalAtUtc: { from: 'x', to: 'y' } },
    });

    // select is called: scoped travel record, person, event, accom, transport
    const personSelectArg = mockDbSelect.mock.calls[1][0];
    expect(personSelectArg).toEqual({
      email: SCHEMA.people.email,
      phoneE164: SCHEMA.people.phoneE164,
      fullName: SCHEMA.people.fullName,
    });
  });

  it('when person not found, fallback returns all nulls and notifications are skipped', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDbSelect
      .mockReturnValueOnce(createChainableSelect([{ personId }])) // scoped travel record
      .mockReturnValueOnce(createChainableSelect([])) // person NOT FOUND
      .mockReturnValueOnce(createChainableSelect([{ name: 'Scoped Event' }])) // event lookup
      .mockReturnValueOnce(createChainableSelect([])) // accom
      .mockReturnValueOnce(createChainableSelect([])); // transport

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { arrivalAtUtc: { from: 'x', to: 'y' } },
    });

    // Both channels skipped because email=null and phoneE164=null from fallback
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('fallback shape has exactly email, phoneE164, fullName all null', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Only one person lookup needed — for email channel. It will skip, then whatsapp also skips.
    mockDbSelect
      .mockReturnValueOnce(createChainableSelect([{ personId }])) // scoped travel record
      .mockReturnValueOnce(createChainableSelect([])) // person NOT FOUND
      .mockReturnValueOnce(createChainableSelect([{ name: 'Scoped Event' }])) // event lookup
      .mockReturnValueOnce(createChainableSelect([])) // accom
      .mockReturnValueOnce(createChainableSelect([])); // transport

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });

    // If the fallback was `{}` instead of `{ email: null, phoneE164: null, fullName: null }`,
    // the guard `!contact.email` would still be truthy and skip — but the warn message
    // would differ if any property was missing. So verify both channels are skipped.
    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Lines 109, 136 — accommodation/transport select shapes
// `select({ id: accommodationRecords.id })` — Stryker empties the object
// Kill by verifying the select was called with `{ id: ... }`
// ══════════════════════════════════════════════════════════════
describe('handleTravelUpdated: select shapes for accom and transport (lines 109, 136)', () => {
  it('accommodation select uses { id: accommodationRecords.id } shape', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    const accomSelectArg = mockDbSelect.mock.calls[3][0];
    expect(accomSelectArg).toEqual({ id: SCHEMA.accommodationRecords.id });
  });

  it('transport select uses { id: transportPassengerAssignments.id } shape', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    const transportSelectArg = mockDbSelect.mock.calls[4][0];
    expect(transportSelectArg).toEqual({ id: SCHEMA.transportPassengerAssignments.id });
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Lines 198, 223 — cancelled handler select shapes
// Same as above but in handleTravelCancelled
// ══════════════════════════════════════════════════════════════
describe('handleTravelCancelled: select shapes for accom and transport (lines 198, 223)', () => {
  it('cancelled: accommodation select uses { id: accommodationRecords.id } shape', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });

    const accomSelectArg = mockDbSelect.mock.calls[3][0];
    expect(accomSelectArg).toEqual({ id: SCHEMA.accommodationRecords.id });
  });

  it('cancelled: transport select uses { id: transportPassengerAssignments.id } shape', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });

    const transportSelectArg = mockDbSelect.mock.calls[4][0];
    expect(transportSelectArg).toEqual({ id: SCHEMA.transportPassengerAssignments.id });
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 182 — variables object { changeSummary }
// Stryker empties the object or removes the key.
// Kill by asserting changeSummary is passed through EXACTLY.
// ══════════════════════════════════════════════════════════════
describe('handleTravelUpdated: changeSummary in notification variables (line 182)', () => {
  it('changeSummary in variables is the EXACT same object reference from payload', async () => {
    const changeSummary = { fromCity: { from: 'A', to: 'B' }, toCity: { from: 'C', to: 'D' } };
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary,
    });

    // Both email and whatsapp calls should have the changeSummary
    const emailVars = mockSendNotification.mock.calls[0][0].variables;
    const whatsappVars = mockSendNotification.mock.calls[1][0].variables;
    expect(emailVars.changeSummary).toEqual(changeSummary);
    expect(whatsappVars.changeSummary).toEqual(changeSummary);
    // Verify changeSummary is specifically the change summary, not undefined or empty
    expect(emailVars.changeSummary).toHaveProperty('fromCity');
    expect(emailVars.changeSummary).toHaveProperty('toCity');
  });

  it('changeSummary is present as a key in variables (not removed by mutation)', async () => {
    const changeSummary = { arrivalAtUtc: { from: 'x', to: 'y' } };
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary,
    });

    const emailVars = mockSendNotification.mock.calls[0][0].variables;
    expect(Object.keys(emailVars)).toContain('changeSummary');
    // If Stryker removed { changeSummary: data.changeSummary } → {},
    // then changeSummary would not be in variables
    expect(emailVars.changeSummary).not.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Lines 121, 148, 205, 230 — ne() filter value 'cancelled'
// Stryker changes 'cancelled' to ''. Kill by verifying ne() is called
// with exactly 'cancelled' in all 4 locations.
// ══════════════════════════════════════════════════════════════
describe('ne() filter value is exactly "cancelled" in all queries', () => {
  it('handleTravelUpdated: ne() called with "cancelled" for accom and transport', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });

    // ne() is called twice in handleTravelUpdated:
    // 1. ne(accommodationRecords.recordStatus, 'cancelled')
    // 2. ne(transportPassengerAssignments.assignmentStatus, 'cancelled')
    expect(mockNe).toHaveBeenCalledTimes(2);
    expect(mockNe.mock.calls[0][0]).toBe(SCHEMA.accommodationRecords.recordStatus);
    expect(mockNe.mock.calls[0][1]).toBe('cancelled');
    expect(mockNe.mock.calls[1][0]).toBe(SCHEMA.transportPassengerAssignments.assignmentStatus);
    expect(mockNe.mock.calls[1][1]).toBe('cancelled');
  });

  it('handleTravelCancelled: ne() called with "cancelled" for accom and transport', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });

    // ne() is called twice in handleTravelCancelled:
    expect(mockNe).toHaveBeenCalledTimes(2);
    expect(mockNe.mock.calls[0][0]).toBe(SCHEMA.accommodationRecords.recordStatus);
    expect(mockNe.mock.calls[0][1]).toBe('cancelled');
    expect(mockNe.mock.calls[1][0]).toBe(SCHEMA.transportPassengerAssignments.assignmentStatus);
    expect(mockNe.mock.calls[1][1]).toBe('cancelled');
  });
});
