/**
 * Accommodation Cascade Handler Tests — Req 6A-1
 *
 * Verifies that accommodation cascade handlers call the real sendNotification
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
    sharedRoomGroup: 'accom.shared_room_group',
  },
  transportPassengerAssignments: {
    id: 'tpa.id',
    eventId: 'tpa.event_id',
    personId: 'tpa.person_id',
    assignmentStatus: 'tpa.assignment_status',
  },
}));
vi.mock('@/lib/db/schema/people', () => ({
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
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';

// Use in-memory mode for these unit tests
enableTestMode();

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerAccommodationCascadeHandlers();
});

describe('Accommodation cascade → real notification', () => {
  const eventId = 'evt-100';
  const personId = 'person-200';
  const accommodationRecordId = 'accom-300';
  const actor = { type: 'user' as const, id: 'user_1' };

  it('sends email + WhatsApp on accommodation update when person has both', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'guest@hotel.com', phoneE164: '+919000000001', fullName: 'Dr. Guest' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { checkInDate: { from: '2026-04-10', to: '2026-04-12' } },
      sharedRoomGroup: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.channel).toBe('email');
    expect(emailCall.templateKey).toBe('accommodation_update');
    expect(emailCall.triggerType).toBe('accommodation.updated');
    expect(emailCall.sendMode).toBe('automatic');
    expect(emailCall.variables.recipientEmail).toBe('guest@hotel.com');

    const waCall = mockSendNotification.mock.calls[1][0];
    expect(waCall.channel).toBe('whatsapp');
  });

  it('sends only email on accommodation cancellation when no phone', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'cancel@test.com', phoneE164: null, fullName: 'Cancel Person' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: 'Hotel overbooked',
    });

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.templateKey).toBe('accommodation_cancelled');
    expect(call.triggerType).toBe('accommodation.cancelled');
    expect(call.variables.cancelledAt).toBe('2026-04-09T15:00:00Z');
    expect(call.variables.reason).toBe('Hotel overbooked');
  });

  it('cascade continues when notification throws', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('WhatsApp down'));

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'ok@test.com', phoneE164: null, fullName: 'Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(result.errors).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
