/**
 * Accommodation Cascade Census Tests — Spec 04, 05, 06 gap coverage
 *
 * Fills gaps from feature-census/accommodation/CENSUS.md:
 * - CP-44: Transport flagged on accommodation update
 * - CP-45: Shared room co-occupants flagged on group change
 * - CP-46: Transport flagged on accommodation cancel
 * - CP-53: No email when person has no email
 * - CP-54: No WhatsApp when person has no phone
 * - CP-81: No shared_room_affected when only non-group fields change
 * - CP-82: Multiple transport assignments all flagged
 * - CP-83: Cancel with no transport assignments produces no flags
 * - CP-56: Idempotency key includes all components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

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

const mockUpsertRedFlag = vi.fn().mockResolvedValue({ id: 'flag-1' });
vi.mock('../red-flags', () => ({
  upsertRedFlag: (...args: unknown[]) => mockUpsertRedFlag(...args),
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
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';

enableTestMode();

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });
const eventId = 'evt-census';
const personId = 'person-census';
const accommodationRecordId = 'accom-census';
const actor = { type: 'user' as const, id: 'user_census' };

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerAccommodationCascadeHandlers();
});

// ── CP-44: Transport flagged on accommodation update ─────────
describe('CP-44: accommodation update flags transport assignments', () => {
  it('creates red flag on transport_passenger_assignment', async () => {
    const transportSelect = createChainableSelect([
      { id: 'tpa-1' },
    ]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      eventId,
      flagType: 'accommodation_change',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 'tpa-1',
      sourceEntityType: 'accommodation_record',
      sourceEntityId: accommodationRecordId,
    }));
  });
});

// ── CP-82: Multiple transport assignments all flagged ─────────
describe('CP-82: multiple transport assignments all flagged', () => {
  it('flags all 3 active transport assignments', async () => {
    const transportSelect = createChainableSelect([
      { id: 'tpa-1' },
      { id: 'tpa-2' },
      { id: 'tpa-3' },
    ]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Multi-Transport Person' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { checkInDate: { from: '01', to: '02' } },
      sharedRoomGroup: null,
    });

    expect(mockUpsertRedFlag).toHaveBeenCalledTimes(3);
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({ targetEntityId: 'tpa-1' }));
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({ targetEntityId: 'tpa-2' }));
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({ targetEntityId: 'tpa-3' }));
  });
});

// ── CP-45: Shared room group change flags co-occupants ───────
describe('CP-45: shared room group change flags co-occupants', () => {
  it('flags co-occupant accommodation records', async () => {
    const transportSelect = createChainableSelect([]);
    const coOccupantSelect = createChainableSelect([
      { id: 'accom-other-1', personId: 'person-other-1' },
      { id: 'accom-other-2', personId: 'person-other-2' },
    ]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(coOccupantSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { sharedRoomGroup: { from: 'G1', to: 'G2' } },
      sharedRoomGroup: 'G2',
    });

    // Should flag both co-occupants
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      flagType: 'shared_room_affected',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'accom-other-1',
    }));
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      flagType: 'shared_room_affected',
      targetEntityId: 'accom-other-2',
    }));
  });
});

// ── CP-81: No shared_room_affected when only non-group fields change ──
describe('CP-81: no shared room flag when group unchanged', () => {
  it('does not flag co-occupants when only hotelName changes', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: 'GROUP-A', // group exists but didn't change
    });

    // No shared_room_affected flags
    const sharedFlags = mockUpsertRedFlag.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>).flagType === 'shared_room_affected',
    );
    expect(sharedFlags).toHaveLength(0);
  });
});

// ── CP-46: Transport flagged on accommodation cancel ─────────
describe('CP-46: accommodation cancel flags transport', () => {
  it('creates accommodation_cancelled flag on transport assignments', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-cancel' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Cancel Person' },
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

    expect(mockUpsertRedFlag).toHaveBeenCalledWith(expect.objectContaining({
      flagType: 'accommodation_cancelled',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 'tpa-cancel',
    }));
  });
});

// ── CP-83: Cancel with no transport produces no flags ────────
describe('CP-83: cancel with no transport assignments', () => {
  it('produces no flags and no errors', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'No Transport' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    const result = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(mockUpsertRedFlag).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(0);
  });
});

// ── CP-53: No email when person has no email ─────────────────
describe('CP-53: no email when person has no email', () => {
  it('skips email notification for person without email', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'No Email' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // Only WhatsApp sent, no email
    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('whatsapp');
  });
});

// ── CP-54: No WhatsApp when person has no phone ──────────────
describe('CP-54: no WhatsApp when person has no phone', () => {
  it('skips WhatsApp notification for person without phone', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'test@test.com', phoneE164: null, fullName: 'No Phone' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // Only email sent, no WhatsApp
    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('email');
  });
});

// ── CP-56: Idempotency key format ────────────────────────────
describe('CP-56: idempotency key includes all uniqueness components', () => {
  it('key contains eventId, personId, recordId, channel', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'test@test.com', phoneE164: '+919000000001', fullName: 'Both Channels' },
    ]);

    mockDb.select
      .mockReturnValueOnce(transportSelect)
      .mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const emailKey = mockSendNotification.mock.calls[0][0].idempotencyKey as string;
    expect(emailKey).toContain(eventId);
    expect(emailKey).toContain(personId);
    expect(emailKey).toContain(accommodationRecordId);
    expect(emailKey).toContain('email');

    const waKey = mockSendNotification.mock.calls[1][0].idempotencyKey as string;
    expect(waKey).toContain('whatsapp');
    // Keys must be different for different channels
    expect(emailKey).not.toBe(waKey);
  });
});
