/**
 * Travel Cascade Handler Tests — Req 6A-1
 *
 * Verifies that travel cascade handlers call the real sendNotification
 * service (not the stub) with correct parameters, dual-channel (email + WhatsApp).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Inngest client (not used in test mode, but imported transitively)
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

// Mock dependencies
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
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
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode, disableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTravelCascadeHandlers } from './travel-cascade';

// Use in-memory mode for these unit tests
enableTestMode();

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });

const personWithBoth = [{ email: 'dr@example.com', phoneE164: '+919876543210', fullName: 'Dr. Test' }];
const personEmailOnly = [{ email: 'delegate@test.com', phoneE164: null, fullName: 'Jane Doe' }];
const personPhoneOnly = [{ email: null, phoneE164: '+919999999999', fullName: 'Phone Only' }];
const personNotFound = [{ email: null, phoneE164: null, fullName: null }];

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerTravelCascadeHandlers();
});

// Helper: mock selects for a handler call (2 red-flag queries + 2 person lookups)
function mockSelectsForHandler(person: Record<string, unknown>[]) {
  mockDb.select
    .mockReturnValueOnce(createChainableSelect([])) // accom records
    .mockReturnValueOnce(createChainableSelect([])) // transport assignments
    .mockReturnValueOnce(createChainableSelect(person)) // person lookup (email path)
    .mockReturnValueOnce(createChainableSelect(person)); // person lookup (whatsapp path)
}

describe('Travel cascade → real notification', () => {
  const eventId = 'evt-100';
  const personId = 'person-200';
  const travelRecordId = 'tr-300';
  const actor = { type: 'user' as const, id: 'user_1' };

  it('sends email + WhatsApp on travel update when person has both', async () => {
    mockSelectsForHandler(personWithBoth);

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

    const waCall = mockSendNotification.mock.calls[1][0];
    expect(waCall.channel).toBe('whatsapp');
    expect(waCall.variables.recipientPhoneE164).toBe('+919876543210');
  });

  it('sends only email on travel cancellation when person has no phone', async () => {
    mockSelectsForHandler(personEmailOnly);

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
    mockSelectsForHandler(personEmailOnly);

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
    mockSelectsForHandler(personPhoneOnly);

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('whatsapp');
  });

  it('skips ALL notifications when person not found (Codex fix)', async () => {
    mockSelectsForHandler(personNotFound);
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
    mockSelectsForHandler(personEmailOnly);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    const key1 = mockSendNotification.mock.calls[0][0].idempotencyKey;

    await new Promise(r => setTimeout(r, 2));

    mockSelectsForHandler(personEmailOnly);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'B', to: 'C' } },
    });
    const key2 = mockSendNotification.mock.calls[1][0].idempotencyKey;

    expect(key1).not.toBe(key2);
  });
});
