/**
 * Accommodation Cascade Handler — Mutation Kill Tests
 *
 * Targets 42 surviving mutations in accommodation-cascade.ts:
 *   - StringLiteral: exact flag types, template keys, channels, trigger types,
 *     entity types, idempotency key prefixes, console.error messages, handler string
 *   - ObjectLiteral: exact shapes for red flag upsert, notification variables,
 *     captureCascadeError context, resolvePersonContact fallback
 *   - OptionalChaining: person?.email, person?.phoneE164, person?.fullName
 *   - LogicalOperator: ?? null fallbacks
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
  events: {
    id: 'events.id',
    name: 'events.name',
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

const mockCaptureCascadeError = vi.fn();
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

import { db } from '@/lib/db';
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';

enableTestMode();

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });

const eventId = 'evt-mk';
const personId = 'person-mk';
const accommodationRecordId = 'accom-mk';
const actor = { type: 'user' as const, id: 'user_mk' };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => createChainableSelect([]));
  clearCascadeHandlers();
  registerAccommodationCascadeHandlers();
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationUpdated — red flag exact strings
// ══════════════════════════════════════════════════════════════
describe('updated handler: exact red flag string values', () => {
  it('flagType is exactly "accommodation_change"', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagType).toBe('accommodation_change');
  });

  it('flagDetail contains changed field names and "review transport"', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' }, checkInDate: { from: '01', to: '02' } },
      sharedRoomGroup: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagDetail).toContain('Accommodation updated:');
    expect(flagCall.flagDetail).toContain('hotelName');
    expect(flagCall.flagDetail).toContain('checkInDate');
    expect(flagCall.flagDetail).toContain('review transport');
  });

  it('targetEntityType is "transport_passenger_assignment"', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.targetEntityType).toBe('transport_passenger_assignment');
    expect(flagCall.sourceEntityType).toBe('accommodation_record');
    expect(flagCall.sourceEntityId).toBe(accommodationRecordId);
    expect(flagCall.sourceChangeSummaryJson).toEqual({ hotelName: { from: 'A', to: 'B' } });
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationUpdated — shared room group flagging
// ══════════════════════════════════════════════════════════════
describe('updated handler: shared room group exact strings', () => {
  it('shared_room_affected flag has correct flagType and detail', async () => {
    const transportSelect = createChainableSelect([]);
    const coOccupantSelect = createChainableSelect([
      { id: 'accom-other', personId: 'person-other' },
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

    const sharedFlagCalls = mockUpsertRedFlag.mock.calls.filter(
      (c) => (c[0] as Record<string, unknown>).flagType === 'shared_room_affected',
    );
    expect(sharedFlagCalls).toHaveLength(1);
    const flagArg = sharedFlagCalls[0][0] as Record<string, unknown>;
    expect(flagArg.flagType).toBe('shared_room_affected');
    expect(flagArg.flagDetail).toContain('Room group "G2" changed');
    expect(flagArg.flagDetail).toContain("co-occupant's accommodation was modified");
    expect(flagArg.targetEntityType).toBe('accommodation_record');
    expect(flagArg.targetEntityId).toBe('accom-other');
    expect(flagArg.sourceEntityType).toBe('accommodation_record');
    expect(flagArg.sourceEntityId).toBe(accommodationRecordId);
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationUpdated — notification exact strings
// ══════════════════════════════════════════════════════════════
describe('updated handler: notification exact values', () => {
  it('email notification has exact templateKey, triggerType, triggerEntityType, channel', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'guest@hotel.com', phoneE164: null, fullName: 'Dr. Guest' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('accommodation_update');
    expect(call.triggerType).toBe('accommodation.updated');
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.triggerEntityId).toBe(accommodationRecordId);
    expect(call.sendMode).toBe('automatic');
    expect(call.eventId).toBe(eventId);
    expect(call.personId).toBe(personId);
  });

  it('whatsapp notification has exact channel and templateKey', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Dr. Mobile' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('whatsapp');
    expect(call.templateKey).toBe('accommodation_update');
    expect(call.triggerType).toBe('accommodation.updated');
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.sendMode).toBe('automatic');
  });

  it('notification variables include recipientEmail, recipientPhoneE164, recipientName, changeSummary', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'guest@hotel.com', phoneE164: '+919000000001', fullName: 'Dr. Guest' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // Check email notification variables
    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.variables.recipientEmail).toBe('guest@hotel.com');
    expect(emailCall.variables.recipientPhoneE164).toBe('+919000000001');
    expect(emailCall.variables.recipientName).toBe('Dr. Guest');
    expect(emailCall.variables.changeSummary).toEqual({ hotelName: { from: 'A', to: 'B' } });
  });

  it('idempotency key contains "notify:accom-updated" prefix', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'guest@hotel.com', phoneE164: null, fullName: 'Dr. Guest' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.idempotencyKey).toMatch(/^notify:accom-updated:/);
    expect(call.idempotencyKey).toContain(eventId);
    expect(call.idempotencyKey).toContain(personId);
    expect(call.idempotencyKey).toContain(accommodationRecordId);
    expect(call.idempotencyKey).toContain(':email');
  });

  it('whatsapp idempotency key contains ":whatsapp"', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Dr. Guest' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.idempotencyKey).toContain(':whatsapp');
    expect(call.idempotencyKey).toMatch(/^notify:accom-updated:/);
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationUpdated — null contact fallbacks
// ══════════════════════════════════════════════════════════════
describe('updated handler: null person contact fallbacks', () => {
  it('sets null for email, phone, name when person not found', async () => {
    const transportSelect = createChainableSelect([]);
    // Person resolves to null (person not found)
    const personSelect = createChainableSelect([]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // No notifications should be sent since person has no email/phone
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not send whatsapp when person has no phone', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'has@email.com', phoneE164: null, fullName: 'No Phone' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('email');
    expect(mockSendNotification.mock.calls[0][0].variables.recipientPhoneE164).toBeNull();
    expect(mockSendNotification.mock.calls[0][0].variables.recipientName).toBe('No Phone');
  });

  it('does not send email when person has no email', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'No Email' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('whatsapp');
    expect(mockSendNotification.mock.calls[0][0].variables.recipientEmail).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationCancelled — exact string values
// ══════════════════════════════════════════════════════════════
describe('cancelled handler: exact red flag string values', () => {
  it('flagType is exactly "accommodation_cancelled"', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-c1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: 'Hotel overbooked',
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagType).toBe('accommodation_cancelled');
  });

  it('flagDetail contains reason and "review transport"', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-c1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: 'Hotel overbooked',
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagDetail).toContain('Accommodation cancelled');
    expect(flagCall.flagDetail).toContain('Hotel overbooked');
    expect(flagCall.flagDetail).toContain('review transport');
  });

  it('flagDetail omits reason part when no reason', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-c1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagDetail).toBe('Accommodation cancelled — review transport');
  });

  it('flag entity types are correct', async () => {
    const transportSelect = createChainableSelect([{ id: 'tpa-c1' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.targetEntityType).toBe('transport_passenger_assignment');
    expect(flagCall.sourceEntityType).toBe('accommodation_record');
    expect(flagCall.sourceEntityId).toBe(accommodationRecordId);
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationCancelled — notification exact strings
// ══════════════════════════════════════════════════════════════
describe('cancelled handler: notification exact values', () => {
  it('email notification has exact templateKey and triggerType', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'cancel@test.com', phoneE164: null, fullName: 'Cancel Person' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: 'Overbooked',
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('accommodation_cancelled');
    expect(call.triggerType).toBe('accommodation.cancelled');
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.triggerEntityId).toBe(accommodationRecordId);
    expect(call.sendMode).toBe('automatic');
  });

  it('cancelled notification variables include cancelledAt and reason', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'cancel@test.com', phoneE164: '+919000000001', fullName: 'Both Channels' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: 'Hotel overbooked',
    });

    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.variables.cancelledAt).toBe('2026-04-09T15:00:00Z');
    expect(emailCall.variables.reason).toBe('Hotel overbooked');
    expect(emailCall.variables.recipientEmail).toBe('cancel@test.com');
    expect(emailCall.variables.recipientPhoneE164).toBe('+919000000001');
    expect(emailCall.variables.recipientName).toBe('Both Channels');
  });

  it('cancelled idempotency key has "notify:accom-cancelled" prefix', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'cancel@test.com', phoneE164: null, fullName: 'Cancel Person' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.idempotencyKey).toMatch(/^notify:accom-cancelled:/);
    expect(call.idempotencyKey).toContain(':email');
  });

  it('cancelled whatsapp notification has correct idempotency key', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'WA Person' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('whatsapp');
    expect(call.templateKey).toBe('accommodation_cancelled');
    expect(call.triggerType).toBe('accommodation.cancelled');
    expect(call.idempotencyKey).toContain(':whatsapp');
    expect(call.idempotencyKey).toMatch(/^notify:accom-cancelled:/);
  });
});

// ══════════════════════════════════════════════════════════════
// handleAccommodationCancelled — null person fallbacks
// ══════════════════════════════════════════════════════════════
describe('cancelled handler: null person contact fallbacks', () => {
  it('does not send notifications when person not found', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends only whatsapp when person has no email', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'No Email' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('whatsapp');
    expect(mockSendNotification.mock.calls[0][0].variables.recipientEmail).toBeNull();
  });

  it('sends only email when person has no phone', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'has@email.com', phoneE164: null, fullName: 'No Phone' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('email');
    expect(mockSendNotification.mock.calls[0][0].variables.recipientPhoneE164).toBeNull();
    expect(mockSendNotification.mock.calls[0][0].variables.recipientName).toBe('No Phone');
  });
});

// ══════════════════════════════════════════════════════════════
// safeSendNotification — error handling
// ══════════════════════════════════════════════════════════════
describe('safeSendNotification: error handling', () => {
  it('logs error message and calls captureCascadeError when notification fails', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Provider down'));

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'fail@test.com', phoneE164: null, fullName: 'Fail' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // Console.error was called with specific cascade prefix
    expect(consoleSpy).toHaveBeenCalled();
    const errorMsg = consoleSpy.mock.calls[0][0];
    expect(errorMsg).toContain('[cascade:accommodation]');
    expect(errorMsg).toContain('Notification send failed');
    expect(errorMsg).toContain('email');

    // captureCascadeError was called with error and context
    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        handler: 'accommodation-cascade',
        eventId,
      }),
    );

    consoleSpy.mockRestore();
  });

  it('console.error includes error.message for Error instances', async () => {
    const testError = new Error('Specific error message');
    mockSendNotification.mockRejectedValueOnce(testError);

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'fail@test.com', phoneE164: null, fullName: 'Fail' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // The second argument to console.error is error.message
    expect(consoleSpy.mock.calls[0][1]).toBe('Specific error message');

    consoleSpy.mockRestore();
  });

  it('console.error passes raw error for non-Error instances', async () => {
    mockSendNotification.mockRejectedValueOnce('string error');

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'fail@test.com', phoneE164: null, fullName: 'Fail' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(consoleSpy.mock.calls[0][1]).toBe('string error');

    consoleSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════
// resolvePersonContact — returns null when person not found
// Kill OptionalChaining: person?.email → person.email would throw
// ══════════════════════════════════════════════════════════════
describe('resolvePersonContact: null fallback (kill OptionalChaining)', () => {
  it('updated: does not throw when person not found (person is null)', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const result = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    // CRITICAL: errors must be empty — if person?.email becomes person.email,
    // a TypeError is thrown and caught, making errors non-empty
    expect(result.errors).toHaveLength(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('cancelled: does not throw when person not found (person is null)', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const result = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(result.errors).toHaveLength(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// safeSendNotification — captureCascadeError exact context shape
// Kill ObjectLiteral L76 and StringLiteral L79
// ══════════════════════════════════════════════════════════════
describe('safeSendNotification: captureCascadeError exact context', () => {
  it('passes exact handler and cascadeEvent to captureCascadeError', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Fail'));

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'test@test.com', phoneE164: null, fullName: 'Fail Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: { hotelName: { from: 'A', to: 'B' } },
      sharedRoomGroup: null,
    });

    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        handler: 'accommodation-cascade',
        eventId,
        cascadeEvent: 'accommodation:accommodation_update',
      },
    );

    consoleSpy.mockRestore();
  });

  it('cascadeEvent format is accommodation:{templateKey} for cancelled', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Fail'));

    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'test@test.com', phoneE164: null, fullName: 'Fail Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        cascadeEvent: 'accommodation:accommodation_cancelled',
      }),
    );

    consoleSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════
// cancelled handler — whatsapp triggerEntityType check
// Kill StringLiteral L256
// ══════════════════════════════════════════════════════════════
describe('cancelled handler: whatsapp notification triggerEntityType', () => {
  it('whatsapp notification for cancel has triggerEntityType "accommodation_record"', async () => {
    const transportSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'WA Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect).mockReturnValueOnce(personSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.triggerEntityId).toBe(accommodationRecordId);
  });
});

// ══════════════════════════════════════════════════════════════
// registerAccommodationCascadeHandlers
// ══════════════════════════════════════════════════════════════
describe('registerAccommodationCascadeHandlers', () => {
  it('registers handlers for both ACCOMMODATION_UPDATED and ACCOMMODATION_CANCELLED', async () => {
    // Both events should be handled — test by emitting each
    const transportSelect1 = createChainableSelect([]);
    const personSelect1 = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect1).mockReturnValueOnce(personSelect1);

    const result1 = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, eventId, actor, {
      accommodationRecordId,
      personId,
      previous: {},
      current: {},
      changeSummary: {},
      sharedRoomGroup: null,
    });
    expect(result1.errors).toHaveLength(0);

    const transportSelect2 = createChainableSelect([]);
    const personSelect2 = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Test' },
    ]);
    mockDb.select.mockReturnValueOnce(transportSelect2).mockReturnValueOnce(personSelect2);

    const result2 = await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-04-09T15:00:00Z',
      reason: null,
    });
    expect(result2.errors).toHaveLength(0);
  });
});
