/**
 * Travel Cascade Handler Tests — Req 6A-1
 *
 * Verifies that travel cascade handlers call the real sendNotification
 * service (not the stub) with correct parameters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Build chainable query mock
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
import { clearCascadeHandlers, emitCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTravelCascadeHandlers } from './travel-cascade';

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerTravelCascadeHandlers();
});

describe('Travel cascade → real notification', () => {
  const eventId = 'evt-100';
  const personId = 'person-200';
  const travelRecordId = 'tr-300';
  const actor = { type: 'user' as const, id: 'user_1' };

  it('sends notification on travel update with resolved person contact', async () => {
    // First select: accommodation records
    const accomSelect = createChainableSelect([]);
    // Second select: transport passenger assignments
    const transportSelect = createChainableSelect([]);
    // Third select: people contact lookup
    const personSelect = createChainableSelect([
      { email: 'dr@example.com', phoneE164: '+919876543210', fullName: 'Dr. Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(accomSelect)
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { departureAtUtc: { from: '2026-04-10', to: '2026-04-11' } },
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.eventId).toBe(eventId);
    expect(call.personId).toBe(personId);
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('travel_update');
    expect(call.triggerType).toBe('travel.updated');
    expect(call.triggerEntityType).toBe('travel_record');
    expect(call.triggerEntityId).toBe(travelRecordId);
    expect(call.sendMode).toBe('automatic');
    expect(call.variables.recipientEmail).toBe('dr@example.com');
    expect(call.variables.recipientPhoneE164).toBe('+919876543210');
    expect(call.variables.recipientName).toBe('Dr. Test');
    expect(call.variables.changeSummary).toEqual({
      departureAtUtc: { from: '2026-04-10', to: '2026-04-11' },
    });
    expect(call.idempotencyKey).toMatch(
      new RegExp(`^notify:travel-updated:${eventId}:${personId}:${travelRecordId}:[\\w-]+:email$`),
    );
  });

  it('sends notification on travel cancellation', async () => {
    const accomSelect = createChainableSelect([]);
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'delegate@test.com', phoneE164: null, fullName: 'Jane Doe' },
    ]);

    mockDb.select
      .mockReturnValueOnce(accomSelect)
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: 'Flight changed',
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.templateKey).toBe('travel_cancelled');
    expect(call.triggerType).toBe('travel.cancelled');
    expect(call.variables.cancelledAt).toBe('2026-04-09T10:00:00Z');
    expect(call.variables.reason).toBe('Flight changed');
    expect(call.variables.recipientEmail).toBe('delegate@test.com');
  });

  it('cascade continues when notification send throws', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Provider down'));

    const accomSelect = createChainableSelect([{ id: 'accom-1' }]);
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'test@test.com', phoneE164: null, fullName: 'Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(accomSelect)
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should NOT throw — cascade must survive notification failures
    const result = await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'Mumbai', to: 'Delhi' } },
    });

    expect(result.errors).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[cascade:travel]'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('skips email notification when person has no email (Codex fix #1)', async () => {
    const accomSelect = createChainableSelect([]);
    const transportSelect = createChainableSelect([]);
    // Person exists but has NO email
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919999999999', fullName: 'No Email Person' },
    ]);

    mockDb.select
      .mockReturnValueOnce(accomSelect)
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    // sendNotification should NOT be called — no email to send to
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipping email notification'),
      expect.objectContaining({ personId }),
    );
    warnSpy.mockRestore();
  });

  it('skips notification when person not found in DB (Codex fix #1)', async () => {
    const accomSelect = createChainableSelect([]);
    const transportSelect = createChainableSelect([]);
    // Person NOT found — empty result
    const personSelect = createChainableSelect([]);

    mockDb.select
      .mockReturnValueOnce(accomSelect)
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      cancelledAt: '2026-04-09T10:00:00Z',
      reason: null,
    });

    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('generates unique idempotency keys for successive updates (Codex fix #4)', async () => {
    const makeSelects = () => {
      const accomSelect = createChainableSelect([]);
      const transportSelect = createChainableSelect([]);
      const personSelect = createChainableSelect([
        { email: 'test@test.com', phoneE164: null, fullName: 'Test' },
      ]);
      return [accomSelect, transportSelect, personSelect];
    };

    // First update
    const [a1, t1, p1] = makeSelects();
    mockDb.select.mockReturnValueOnce(a1).mockReturnValueOnce(t1).mockReturnValueOnce(p1);

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });

    const key1 = mockSendNotification.mock.calls[0][0].idempotencyKey;

    // Second update (same record, different change)
    const [a2, t2, p2] = makeSelects();
    mockDb.select.mockReturnValueOnce(a2).mockReturnValueOnce(t2).mockReturnValueOnce(p2);

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId,
      personId,
      registrationId: null,
      previous: {},
      current: {},
      changeSummary: { toCity: { from: 'B', to: 'C' } },
    });

    const key2 = mockSendNotification.mock.calls[1][0].idempotencyKey;

    // Keys must be different to allow both notifications through
    expect(key1).not.toBe(key2);
  });
});
