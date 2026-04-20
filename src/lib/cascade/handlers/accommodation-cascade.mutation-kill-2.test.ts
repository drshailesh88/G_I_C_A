/**
 * Mutation-kill-2 for accommodation-cascade.ts
 *
 * Targets survivors concentrated in:
 *   - handleAccommodationSaved: templateKey="accommodation_confirmation",
 *     triggerType="accommodation.saved", cascadeEvent, idempotency key prefix,
 *     channel gating via recipient email/phone.
 *   - handleAccommodationCancelled: templateKey="accommodation_cancelled",
 *     triggerType="accommodation.cancelled", red flag type, detail with
 *     optional reason suffix, cascade events for both email + whatsapp.
 *   - asRecord / getOptionalString helpers exercised via snapshotVars fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
  accommodationRecords: {
    id: 'accom.id', eventId: 'accom.event_id', personId: 'accom.person_id',
    recordStatus: 'accom.record_status', sharedRoomGroup: 'accom.shared_room_group',
  },
  transportPassengerAssignments: {
    id: 'tpa.id', eventId: 'tpa.event_id', personId: 'tpa.person_id',
    assignmentStatus: 'tpa.assignment_status',
  },
  events: { id: 'events.id', name: 'events.name' },
}));
vi.mock('@/lib/db/schema/people', () => ({
  people: {
    id: 'people.id', email: 'people.email', phoneE164: 'people.phone_e164',
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

vi.mock('@/lib/sentry', () => ({ captureCascadeError: vi.fn() }));

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

const eventId = 'evt-mk2';
const personId = 'person-mk2';
const accommodationRecordId = 'accom-mk2';
const actor = { type: 'user' as const, id: 'user_mk2' };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => createChainableSelect([]));
  clearCascadeHandlers();
  registerAccommodationCascadeHandlers();
});

// ──────────────────────────────────────────────────────────
// handleAccommodationSaved
// ──────────────────────────────────────────────────────────
describe('saved handler: notification exact values', () => {
  it('email notification: templateKey, triggerType, triggerEntityType, channel exact', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      hotelName: 'Taj', checkInDate: '2026-05-01', checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://maps/x',
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('accommodation_confirmation');
    expect(call.triggerType).toBe('accommodation.saved');
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.triggerEntityId).toBe(accommodationRecordId);
    expect(call.sendMode).toBe('automatic');
    expect(call.idempotencyKey).toMatch(/^notify:accommodation-confirmation:/);
    expect(call.idempotencyKey).toContain(':email');
  });

  it('whatsapp notification: templateKey and channel exact', async () => {
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      hotelName: 'Taj', checkInDate: '2026-05-01', checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://maps/x',
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('whatsapp');
    expect(call.templateKey).toBe('accommodation_confirmation');
    expect(call.triggerType).toBe('accommodation.saved');
    expect(call.idempotencyKey).toContain(':whatsapp');
  });

  it('skips email channel when recipientEmail is null', async () => {
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      hotelName: 'Taj', checkInDate: '2026-05-01', checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://maps/x',
    });

    const channels = mockSendNotification.mock.calls.map((c) => c[0].channel);
    expect(channels).not.toContain('email');
  });

  it('skips whatsapp channel when recipientPhoneE164 is null', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      hotelName: 'Taj', checkInDate: '2026-05-01', checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://maps/x',
    });

    const channels = mockSendNotification.mock.calls.map((c) => c[0].channel);
    expect(channels).not.toContain('whatsapp');
  });

  it('domain variables (hotelName / checkInDate / checkOutDate / googleMapsUrl) forwarded', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      hotelName: 'Taj',
      checkInDate: '2026-05-01',
      checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://maps/x',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.hotelName).toBe('Taj');
    expect(vars.checkInDate).toBe('2026-05-01');
    expect(vars.checkOutDate).toBe('2026-05-03');
    expect(vars.googleMapsUrl).toBe('https://maps/x');
    expect(vars.recipientEmail).toBe('a@b.co');
  });
});

// ──────────────────────────────────────────────────────────
// handleAccommodationCancelled
// ──────────────────────────────────────────────────────────
describe('cancelled handler: red flag + notification exact values', () => {
  it('red flag: flagType="accommodation_cancelled", detail has reason suffix', async () => {
    const tpaSelect = createChainableSelect([{ id: 'tpa-99' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01',
      reason: 'Travel cancellation',
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagType).toBe('accommodation_cancelled');
    expect(flagCall.flagDetail).toContain('Accommodation cancelled');
    expect(flagCall.flagDetail).toContain('Travel cancellation');
    expect(flagCall.flagDetail).toContain('review transport');
    expect(flagCall.targetEntityType).toBe('transport_passenger_assignment');
    expect(flagCall.targetEntityId).toBe('tpa-99');
    expect(flagCall.sourceEntityType).toBe('accommodation_record');
    expect(flagCall.sourceEntityId).toBe(accommodationRecordId);
  });

  it('red flag detail omits ": reason" suffix when reason is falsy', async () => {
    const tpaSelect = createChainableSelect([{ id: 'tpa-99' }]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01',
      reason: null,
    });

    const flagCall = mockUpsertRedFlag.mock.calls[0][0];
    expect(flagCall.flagDetail).not.toContain(':');
    expect(flagCall.flagDetail).toBe('Accommodation cancelled — review transport');
  });

  it('email notification: templateKey="accommodation_cancelled" + triggerType="accommodation.cancelled"', async () => {
    const tpaSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01',
      reason: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('accommodation_cancelled');
    expect(call.triggerType).toBe('accommodation.cancelled');
    expect(call.triggerEntityType).toBe('accommodation_record');
    expect(call.idempotencyKey).toMatch(/^notify:accom-cancelled:/);
    expect(call.idempotencyKey).toContain(':email');
  });

  it('whatsapp notification: templateKey="accommodation_cancelled" + idempotency suffix :whatsapp', async () => {
    const tpaSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01',
      reason: null,
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.channel).toBe('whatsapp');
    expect(call.templateKey).toBe('accommodation_cancelled');
    expect(call.idempotencyKey).toMatch(/^notify:accom-cancelled:/);
    expect(call.idempotencyKey).toContain(':whatsapp');
  });

  it('forwards domain variables (cancelledAt + reason) to notification vars', async () => {
    const tpaSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01T09:00:00Z',
      reason: 'Flight delay',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.cancelledAt).toBe('2026-05-01T09:00:00Z');
    expect(vars.reason).toBe('Flight delay');
  });

  it('skips email notification when no recipientEmail', async () => {
    const tpaSelect = createChainableSelect([]);
    const personSelect = createChainableSelect([
      { email: null, phoneE164: '+919000000001', fullName: 'Guest' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(tpaSelect).mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_CANCELLED, eventId, actor, {
      accommodationRecordId,
      personId,
      cancelledAt: '2026-05-01',
      reason: null,
    });

    const channels = mockSendNotification.mock.calls.map((c) => c[0].channel);
    expect(channels).not.toContain('email');
    expect(channels).toContain('whatsapp');
  });
});

// ──────────────────────────────────────────────────────────
// asRecord / getOptionalString helpers via buildNotificationVariables
// ──────────────────────────────────────────────────────────
describe('snapshotVars fallback (asRecord + getOptionalString)', () => {
  it('coerces non-object snapshotVars to {} (no unused snapshot keys leak)', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Real Name' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    // Emit with a non-object "variables" — should fall back to {}.
    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      variables: 'not-an-object',
      hotelName: 'Taj', checkInDate: '2026-05-01', checkOutDate: '2026-05-03',
      googleMapsUrl: 'https://m',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    // Domain vars overrode everything.
    expect(vars.hotelName).toBe('Taj');
    expect(vars.fullName).toBe('Real Name');
  });

  it('snapshot fullName is used only when person.fullName is null', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: null },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      variables: { fullName: '  Snapshot Name  ' },
      hotelName: 'H', checkInDate: 'd1', checkOutDate: 'd2', googleMapsUrl: 'u',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.fullName).toBe('Snapshot Name'); // trimmed
  });

  it('snapshot fullName is ignored when only whitespace (empty after trim)', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: null },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      variables: { fullName: '   ' },
      hotelName: 'H', checkInDate: 'd1', checkOutDate: 'd2', googleMapsUrl: 'u',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.fullName).toBeNull();
  });

  it('snapshot fullName is ignored when not a string', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: null },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      variables: { fullName: 42 },
      hotelName: 'H', checkInDate: 'd1', checkOutDate: 'd2', googleMapsUrl: 'u',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.fullName).toBeNull();
  });

  it('coerces an array snapshotVars to {} (Array.isArray guard)', async () => {
    const personSelect = createChainableSelect([
      { email: 'a@b.co', phoneE164: null, fullName: 'Real Name' },
    ]);
    const eventSelect = createChainableSelect([{ name: 'Conf' }]);
    mockDb.select.mockReturnValueOnce(personSelect).mockReturnValueOnce(eventSelect);

    await emitCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_SAVED, eventId, actor, {
      accommodationRecordId,
      personId,
      variables: ['a', 'b', 'c'],
      hotelName: 'H', checkInDate: 'd1', checkOutDate: 'd2', googleMapsUrl: 'u',
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    // We shouldn't accidentally have numeric "0" / "1" keys from the array.
    expect(vars['0']).toBeUndefined();
    expect(vars['1']).toBeUndefined();
  });
});
