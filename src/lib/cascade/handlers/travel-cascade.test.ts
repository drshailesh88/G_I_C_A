/**
 * Travel Cascade Handler Tests — Req 6A-1
 *
 * Verifies that travel cascade handlers call the real sendNotification
 * service (not the stub) with correct parameters, dual-channel (email + WhatsApp).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

// Mock Inngest client (not used in test mode, but imported transitively)
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
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
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  ne: vi.fn((...args: unknown[]) => ({ op: 'ne', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  relations: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ op: 'eventScope', args })),
}));
vi.mock('../red-flags', () => ({
  upsertRedFlag: vi.fn().mockResolvedValue({ id: 'flag-1' }),
}));

const mockSendNotification = vi.fn().mockResolvedValue({
  notificationLogId: 'log-1',
  provider: 'resend',
  providerMessageId: 'msg-1',
  status: 'sent',
});
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
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

import { db } from '@/lib/db';
import { upsertRedFlag } from '../red-flags';
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode, disableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTravelCascadeHandlers } from './travel-cascade';

// Use in-memory mode for these unit tests
enableTestMode();

const mockDb = vi.mocked(db as unknown as { select: ReturnType<typeof vi.fn> });

const personWithBoth = [{ email: 'dr@example.com', phoneE164: '+919876543210', fullName: 'Dr. Test' }];
const personEmailOnly = [{ email: 'delegate@test.com', phoneE164: null, fullName: 'Jane Doe' }];
const personPhoneOnly = [{ email: null, phoneE164: '+919999999999', fullName: 'Phone Only' }];
const personNotFound: Record<string, unknown>[] = [];
const defaultEvent = [{ name: 'GEM India 2026' }];

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerTravelCascadeHandlers();
});

function mockSavedSelects(params: {
  person: Record<string, unknown>[];
  trustedPersonId?: string;
  event?: Record<string, unknown>[];
}) {
  const {
    person,
    trustedPersonId = 'person-200',
    event = defaultEvent,
  } = params;

  mockDb.select
    .mockReturnValueOnce(createChainableSelect([{ personId: trustedPersonId }]))
    .mockReturnValueOnce(createChainableSelect(person))
    .mockReturnValueOnce(createChainableSelect(event));
}

// Helper: mock selects for update/cancel handlers
function mockScopedSelectsForHandler(params: {
  person: Record<string, unknown>[];
  accom?: Record<string, unknown>[];
  transport?: Record<string, unknown>[];
  trustedPersonId?: string;
  event?: Record<string, unknown>[];
}) {
  const {
    person,
    accom = [],
    transport = [],
    trustedPersonId = 'person-200',
    event = defaultEvent,
  } = params;

  mockDb.select
    .mockReturnValueOnce(createChainableSelect([{ personId: trustedPersonId }])) // scoped travel record
    .mockReturnValueOnce(createChainableSelect(person)) // person lookup
    .mockReturnValueOnce(createChainableSelect(event)) // event lookup
    .mockReturnValueOnce(createChainableSelect(accom)) // accom records
    .mockReturnValueOnce(createChainableSelect(transport)); // transport assignments
}

describe('Travel cascade → real notification', () => {
  const eventId = 'evt-100';
  const personId = 'person-200';
  const travelRecordId = 'tr-300';
  const actor = { type: 'user' as const, id: 'user_1' };

  it('sends email + WhatsApp on travel update when person has both', async () => {
    mockScopedSelectsForHandler({ person: personWithBoth });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { departureAtUtc: { from: '2026-04-10', to: '2026-04-11' } },
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.channel).toBe('email');
    expect(emailCall.templateKey).toBe('travel_update');
    expect(emailCall.triggerType).toBe('travel.updated');
    expect(emailCall.sendMode).toBe('automatic');
    expect(emailCall.variables.recipientEmail).toBe('dr@example.com');
    expect(emailCall.variables.recipientName).toBe('Dr. Test');
    expect(emailCall.variables.fullName).toBe('Dr. Test');
    expect(emailCall.variables.eventName).toBe('GEM India 2026');

    const waCall = mockSendNotification.mock.calls[1][0];
    expect(waCall.channel).toBe('whatsapp');
    expect(waCall.variables.recipientPhoneE164).toBe('+919876543210');
  });

  it('sends only email on travel cancellation when person has no phone', async () => {
    mockScopedSelectsForHandler({ person: personEmailOnly });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: 'Flight changed',
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('travel_cancelled');
    expect(call.variables.cancelledAt).toBe('2026-04-09T10:00:00Z');
  });

  it('cascade continues when notification send throws', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Provider down'));
    mockScopedSelectsForHandler({ person: personEmailOnly });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'Mumbai', to: 'Delhi' } },
    });

    expect(result.errors).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('sends only WhatsApp when person has no email (Codex fix)', async () => {
    mockScopedSelectsForHandler({ person: personPhoneOnly });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('whatsapp');
  });

  it('skips ALL notifications when person not found (Codex fix)', async () => {
    mockScopedSelectsForHandler({ person: personNotFound });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: null,
    });

    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('generates unique idempotency keys for successive updates (Codex fix)', async () => {
    mockScopedSelectsForHandler({ person: personEmailOnly });
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    const key1 = mockSendNotification.mock.calls[0][0].idempotencyKey;

    await new Promise(r => setTimeout(r, 2));

    mockScopedSelectsForHandler({ person: personEmailOnly });
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'B', to: 'C' } },
    });
    const key2 = mockSendNotification.mock.calls[1][0].idempotencyKey;

    expect(key1).not.toBe(key2);
  });

  it('ignores forged payload personId and snapshot recipients on travel update', async () => {
    mockScopedSelectsForHandler({
      person: [{ email: 'real@delegate.com', phoneE164: '+919000000099', fullName: 'Real Delegate' }],
      trustedPersonId: 'real-person-1',
      event: [{ name: 'Scoped Event' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId: 'forged-person',
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'Mumbai', to: 'Delhi' } },
      variables: {
        recipientEmail: 'attacker@example.com',
        recipientPhoneE164: '+15550000000',
        recipientName: 'Attacker',
        fullName: 'Attacker',
        eventName: 'Wrong Event',
      },
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    for (const [callArg] of mockSendNotification.mock.calls) {
      expect(callArg.personId).toBe('real-person-1');
      expect(callArg.variables).toEqual(expect.objectContaining({
        recipientEmail: 'real@delegate.com',
        recipientPhoneE164: '+919000000099',
        recipientName: 'Real Delegate',
        fullName: 'Real Delegate',
        eventName: 'Scoped Event',
      }));
    }
  });

  it('skips the saved cascade when the travel record is outside the active event scope', async () => {
    mockDb.select.mockReturnValueOnce(createChainableSelect([]));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_SAVED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      departureAtUtc: '2026-04-20T10:00:00Z',
      arrivalAtUtc: '2026-04-20T12:00:00Z',
    });

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[cascade:travel] skipping saved cascade — travel record not found in event scope',
      expect.objectContaining({ eventId, travelRecordId }),
    );
    warnSpy.mockRestore();
  });
});

describe('Travel cascade → red flag creation', () => {
  const eventId = 'evt-100';
  const personId = 'person-200';
  const travelRecordId = 'tr-300';
  const actor = { type: 'user' as const, id: 'user_1' };

  const mockedUpsertRedFlag = vi.mocked(upsertRedFlag);

  it('creates red flags on accommodation records when travel is updated', async () => {
    mockScopedSelectsForHandler({
      person: personWithBoth,
      accom: [{ id: 'accom-1' }, { id: 'accom-2' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { departureAtUtc: { from: '2026-04-10', to: '2026-04-11' }, toCity: { from: 'A', to: 'B' } },
    });

    expect(mockedUpsertRedFlag).toHaveBeenCalledTimes(2);

    expect(mockedUpsertRedFlag).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventId,
      flagType: 'travel_change',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'accom-1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    }));
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('Travel record updated');
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('departureAtUtc');
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('toCity');

    expect(mockedUpsertRedFlag).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventId,
      flagType: 'travel_change',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'accom-2',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    }));
  });

  it('creates red flags on transport assignments when travel is updated', async () => {
    mockScopedSelectsForHandler({
      person: personWithBoth,
      transport: [{ id: 'tpa-1' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { arrivalAtUtc: { from: '2026-04-10', to: '2026-04-12' } },
    });

    expect(mockedUpsertRedFlag).toHaveBeenCalledTimes(1);
    expect(mockedUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      eventId,
      flagType: 'travel_change',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 'tpa-1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    }));
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('review transport assignment');
  });

  it('creates red flags on accommodation records when travel is cancelled', async () => {
    mockScopedSelectsForHandler({
      person: personWithBoth,
      accom: [{ id: 'accom-10' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: null,
    });

    expect(mockedUpsertRedFlag).toHaveBeenCalledTimes(1);
    expect(mockedUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      eventId,
      flagType: 'travel_cancelled',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'accom-10',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    }));
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('review accommodation');
  });

  it('creates red flags on transport assignments when travel is cancelled', async () => {
    mockScopedSelectsForHandler({
      person: personWithBoth,
      transport: [{ id: 'tpa-20' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: null,
    });

    expect(mockedUpsertRedFlag).toHaveBeenCalledTimes(1);
    expect(mockedUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      eventId,
      flagType: 'travel_cancelled',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 'tpa-20',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    }));
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('review and reassign transport');
  });

  // ANNEAL GAP: Spec-04-CP-10 — cancelled transport assignments are not flagged
  it('does not flag cancelled transport passenger assignments', async () => {
    // The query uses ne(assignmentStatus, 'cancelled') to filter.
    // When no non-cancelled transport assignments match, no transport flags are created.
    mockScopedSelectsForHandler({
      person: personWithBoth,
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { departureAtUtc: { from: '2026-04-10', to: '2026-04-11' } },
    });

    // No red flags should be created (neither accom nor transport)
    expect(mockedUpsertRedFlag).not.toHaveBeenCalled();
  });

  it('includes cancellation reason in flag detail when reason is provided', async () => {
    mockScopedSelectsForHandler({
      person: personWithBoth,
      accom: [{ id: 'accom-30' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: 'Flight changed',
    });

    expect(mockedUpsertRedFlag).toHaveBeenCalledTimes(1);
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('Flight changed');
    expect(mockedUpsertRedFlag.mock.calls[0][0].flagDetail).toContain('review accommodation');
  });

  it('uses the trusted scoped travel person for accommodation flags when payload personId is forged', async () => {
    const eqMock = vi.mocked(eq);
    mockScopedSelectsForHandler({
      person: personWithBoth,
      trustedPersonId: 'real-person-1',
      accom: [{ id: 'accom-real' }],
    });

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId: 'forged-person',
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    expect(eqMock).toHaveBeenCalledWith('accom.person_id', 'real-person-1');
    expect(mockedUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      targetEntityId: 'accom-real',
    }));
  });
});
