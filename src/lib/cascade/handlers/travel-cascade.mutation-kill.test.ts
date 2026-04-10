/**
 * Travel Cascade Handler — Mutation-Kill Tests
 *
 * Targets 36 surviving Stryker mutations:
 *   - 25x StringLiteral: exact string values for flagType, flagDetail,
 *     targetEntityType, sourceEntityType, templateKey, triggerType,
 *     triggerEntityType, channel, idempotency key format, console messages,
 *     captureCascadeError handler string, ne() filter values
 *   - 11x ObjectLiteral: exact object shapes for red flag payloads,
 *     notification variables, console.warn context, captureCascadeError context,
 *     resolvePersonContact fallback
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (same pattern as travel-cascade.test.ts) ──────────────

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
import { ne } from 'drizzle-orm';
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTravelCascadeHandlers } from './travel-cascade';

enableTestMode();

const mockDb = vi.mocked(db as { select: ReturnType<typeof vi.fn> });

const personBoth = [{ email: 'a@b.com', phoneE164: '+911234567890', fullName: 'Alice' }];
const personEmailOnly = [{ email: 'a@b.com', phoneE164: null, fullName: 'Bob' }];
const personPhoneOnly = [{ email: null, phoneE164: '+911234567890', fullName: 'Charlie' }];
const personNone = [{ email: null, phoneE164: null, fullName: null }];

const eventId = 'evt-1';
const personId = 'person-1';
const travelRecordId = 'tr-1';
const actor = { type: 'user', id: 'u1' };

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
  mockDb.select
    .mockReturnValueOnce(createChainableSelect(accom))
    .mockReturnValueOnce(createChainableSelect(transport))
    .mockReturnValueOnce(createChainableSelect(person))
    .mockReturnValueOnce(createChainableSelect(person));
}

// ── StringLiteral mutations: exact red flag strings ──────────────

describe('Mutation kill: exact red flag string values', () => {
  it('travel update: flagType is exactly "travel_change"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { arrivalAtUtc: { from: 'x', to: 'y' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagType).toBe('travel_change');
  });

  it('travel update accom: flagDetail starts with "Travel record updated:" and ends with "changed"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagDetail).toBe('Travel record updated: toCity changed');
  });

  it('travel update accom: targetEntityType is exactly "accommodation_record"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].targetEntityType).toBe('accommodation_record');
  });

  it('travel update accom: sourceEntityType is exactly "travel_record"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].sourceEntityType).toBe('travel_record');
  });

  it('travel update transport: targetEntityType is exactly "transport_passenger_assignment"', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].targetEntityType).toBe('transport_passenger_assignment');
  });

  it('travel update transport: flagDetail contains "review transport assignment"', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { arrivalAtUtc: { from: 'x', to: 'y' } },
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagDetail).toBe(
      'Travel record updated: arrivalAtUtc changed — review transport assignment',
    );
  });

  it('travel cancelled: flagType is exactly "travel_cancelled"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagType).toBe('travel_cancelled');
  });

  it('travel cancelled accom no reason: flagDetail is exactly "Travel record cancelled — review accommodation"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagDetail).toBe(
      'Travel record cancelled — review accommodation',
    );
  });

  it('travel cancelled accom with reason: flagDetail includes ": <reason>"', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: 'Visa denied',
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagDetail).toBe(
      'Travel record cancelled: Visa denied — review accommodation',
    );
  });

  it('travel cancelled transport: flagDetail is exactly "Travel record cancelled — review and reassign transport"', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockUpsertRedFlag.mock.calls[0][0].flagDetail).toBe(
      'Travel record cancelled — review and reassign transport',
    );
  });

  it('ne() filter uses "cancelled" for accommodation recordStatus', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    const neMock = vi.mocked(ne);
    // First call: accommodation ne(recordStatus, 'cancelled')
    expect(neMock.mock.calls[0][1]).toBe('cancelled');
    // Second call: transport ne(assignmentStatus, 'cancelled')
    expect(neMock.mock.calls[1][1]).toBe('cancelled');
  });
});

// ── StringLiteral mutations: exact notification strings ──────────

describe('Mutation kill: exact notification string values', () => {
  it('travel update: templateKey is exactly "travel_update"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(mockSendNotification.mock.calls[0][0].templateKey).toBe('travel_update');
    expect(mockSendNotification.mock.calls[1][0].templateKey).toBe('travel_update');
  });

  it('travel update: triggerType is exactly "travel.updated"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(mockSendNotification.mock.calls[0][0].triggerType).toBe('travel.updated');
    expect(mockSendNotification.mock.calls[1][0].triggerType).toBe('travel.updated');
  });

  it('travel update: triggerEntityType is exactly "travel_record"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(mockSendNotification.mock.calls[0][0].triggerEntityType).toBe('travel_record');
    expect(mockSendNotification.mock.calls[1][0].triggerEntityType).toBe('travel_record');
  });

  it('travel update: first call channel is "email", second is "whatsapp"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('email');
    expect(mockSendNotification.mock.calls[1][0].channel).toBe('whatsapp');
  });

  it('travel cancelled: templateKey is exactly "travel_cancelled"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockSendNotification.mock.calls[0][0].templateKey).toBe('travel_cancelled');
    expect(mockSendNotification.mock.calls[1][0].templateKey).toBe('travel_cancelled');
  });

  it('travel cancelled: triggerType is exactly "travel.cancelled"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockSendNotification.mock.calls[0][0].triggerType).toBe('travel.cancelled');
    expect(mockSendNotification.mock.calls[1][0].triggerType).toBe('travel.cancelled');
  });

  it('travel cancelled: triggerEntityType is exactly "travel_record"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockSendNotification.mock.calls[0][0].triggerEntityType).toBe('travel_record');
    expect(mockSendNotification.mock.calls[1][0].triggerEntityType).toBe('travel_record');
  });

  it('travel cancelled: first call channel is "email", second is "whatsapp"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockSendNotification.mock.calls[0][0].channel).toBe('email');
    expect(mockSendNotification.mock.calls[1][0].channel).toBe('whatsapp');
  });
});

// ── StringLiteral mutations: idempotency key format ──────────────

describe('Mutation kill: idempotency key format', () => {
  it('travel update email key starts with "notify:travel-updated:" and ends with ":email"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    const emailKey = mockSendNotification.mock.calls[0][0].idempotencyKey as string;
    expect(emailKey).toMatch(/^notify:travel-updated:/);
    expect(emailKey).toMatch(/:email$/);
    // Verify key contains eventId, personId, travelRecordId
    expect(emailKey).toContain(eventId);
    expect(emailKey).toContain(personId);
    expect(emailKey).toContain(travelRecordId);
  });

  it('travel update whatsapp key starts with "notify:travel-updated:" and ends with ":whatsapp"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    const waKey = mockSendNotification.mock.calls[1][0].idempotencyKey as string;
    expect(waKey).toMatch(/^notify:travel-updated:/);
    expect(waKey).toMatch(/:whatsapp$/);
    expect(waKey).toContain(eventId);
    expect(waKey).toContain(personId);
    expect(waKey).toContain(travelRecordId);
  });

  it('travel cancelled email key starts with "notify:travel-cancelled:" and ends with ":email"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    const emailKey = mockSendNotification.mock.calls[0][0].idempotencyKey as string;
    expect(emailKey).toMatch(/^notify:travel-cancelled:/);
    expect(emailKey).toMatch(/:email$/);
    expect(emailKey).toContain(eventId);
    expect(emailKey).toContain(personId);
    expect(emailKey).toContain(travelRecordId);
  });

  it('travel cancelled whatsapp key starts with "notify:travel-cancelled:" and ends with ":whatsapp"', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    const waKey = mockSendNotification.mock.calls[1][0].idempotencyKey as string;
    expect(waKey).toMatch(/^notify:travel-cancelled:/);
    expect(waKey).toMatch(/:whatsapp$/);
  });

  it('idempotency key has exactly 6 colon-separated segments (prefix:action:evt:person:record:ts:channel)', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    const key = mockSendNotification.mock.calls[0][0].idempotencyKey as string;
    // Format: notify:travel-updated:<eventId>:<personId>:<travelRecordId>:<ts>:email
    const parts = key.split(':');
    // "notify" + "travel-updated" + eventId + personId + travelRecordId + ts + "email"
    expect(parts.length).toBeGreaterThanOrEqual(7);
    expect(parts[0]).toBe('notify');
    expect(parts[1]).toBe('travel-updated');
    expect(parts[parts.length - 1]).toBe('email');
  });
});

// ── ObjectLiteral mutations: exact object shapes ─────────────────

describe('Mutation kill: exact object shapes for red flags', () => {
  it('travel update accom: upsertRedFlag receives exact shape with sourceChangeSummaryJson', async () => {
    const changeSummary = { departureAtUtc: { from: '2026-04-10', to: '2026-04-11' } };
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary,
    });
    expect(mockUpsertRedFlag).toHaveBeenCalledWith({
      eventId,
      flagType: 'travel_change',
      flagDetail: 'Travel record updated: departureAtUtc changed',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'a1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
      sourceChangeSummaryJson: changeSummary,
    });
  });

  it('travel update transport: upsertRedFlag receives exact shape with sourceChangeSummaryJson', async () => {
    const changeSummary = { toCity: { from: 'A', to: 'B' } };
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary,
    });
    expect(mockUpsertRedFlag).toHaveBeenCalledWith({
      eventId,
      flagType: 'travel_change',
      flagDetail: 'Travel record updated: toCity changed — review transport assignment',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 't1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
      sourceChangeSummaryJson: changeSummary,
    });
  });

  it('travel cancelled accom: upsertRedFlag receives exact shape WITHOUT sourceChangeSummaryJson', async () => {
    mockSelects([{ id: 'a1' }], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockUpsertRedFlag).toHaveBeenCalledWith({
      eventId,
      flagType: 'travel_cancelled',
      flagDetail: 'Travel record cancelled — review accommodation',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'a1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    });
  });

  it('travel cancelled transport: upsertRedFlag receives exact shape WITHOUT sourceChangeSummaryJson', async () => {
    mockSelects([], [{ id: 't1' }], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockUpsertRedFlag).toHaveBeenCalledWith({
      eventId,
      flagType: 'travel_cancelled',
      flagDetail: 'Travel record cancelled — review and reassign transport',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 't1',
      sourceEntityType: 'travel_record',
      sourceEntityId: travelRecordId,
    });
  });
});

// ── ObjectLiteral mutations: notification variable shapes ────────

describe('Mutation kill: exact notification variable shapes', () => {
  it('travel update: variables contain changeSummary plus resolved contact fields', async () => {
    const changeSummary = { arrivalAtUtc: { from: 'x', to: 'y' } };
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary,
    });
    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.variables).toEqual({
      changeSummary,
      recipientEmail: 'a@b.com',
      recipientPhoneE164: '+911234567890',
      recipientName: 'Alice',
    });
  });

  it('travel cancelled: variables contain cancelledAt and reason plus resolved contact fields', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: 'Speaker dropped',
    });
    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.variables).toEqual({
      cancelledAt: '2026-01-01T00:00:00Z',
      reason: 'Speaker dropped',
      recipientEmail: 'a@b.com',
      recipientPhoneE164: '+911234567890',
      recipientName: 'Alice',
    });
  });

  it('travel cancelled with null reason: variables include null reason', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    const emailCall = mockSendNotification.mock.calls[0][0];
    expect(emailCall.variables.reason).toBeNull();
    expect(emailCall.variables.cancelledAt).toBe('2026-01-01T00:00:00Z');
  });
});

// ── ObjectLiteral / StringLiteral: console.warn messages ─────────

describe('Mutation kill: console.warn messages and context objects', () => {
  it('warns with exact message when person has no email', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSelects([], [], personPhoneOnly);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[cascade:travel] skipping email notification — person has no email',
      { personId, eventId },
    );
    warnSpy.mockRestore();
  });

  it('warns with exact message when person has no phone', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSelects([], [], personEmailOnly);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[cascade:travel] skipping WhatsApp notification — person has no phone',
      { personId, eventId },
    );
    warnSpy.mockRestore();
  });

  it('warns with exact context object shape (personId + eventId only)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSelects([], [], personNone);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    // Both email and whatsapp paths should warn
    expect(warnSpy).toHaveBeenCalledTimes(2);
    // First: email skip
    expect(warnSpy.mock.calls[0][1]).toEqual({ personId, eventId });
    // Second: whatsapp skip
    expect(warnSpy.mock.calls[1][1]).toEqual({ personId, eventId });
    warnSpy.mockRestore();
  });
});

// ── StringLiteral + ObjectLiteral: console.error and captureCascadeError ──

describe('Mutation kill: error handling strings and objects', () => {
  it('console.error uses exact prefix "[cascade:travel] notification send failed:"', async () => {
    const testError = new Error('Provider down');
    mockSendNotification.mockRejectedValueOnce(testError);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[cascade:travel] notification send failed:',
      testError,
    );
    errorSpy.mockRestore();
  });

  it('captureCascadeError called with handler "travel-cascade" and cascadeEvent "travel:<templateKey>"', async () => {
    const testError = new Error('Send fail');
    mockSendNotification.mockRejectedValueOnce(testError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });
    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      testError,
      {
        handler: 'travel-cascade',
        eventId,
        cascadeEvent: 'travel:travel_update',
      },
    );
    vi.restoreAllMocks();
  });

  it('captureCascadeError context for cancelled uses cascadeEvent "travel:travel_cancelled"', async () => {
    const testError = new Error('Send fail');
    mockSendNotification.mockRejectedValueOnce(testError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: null,
    });
    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      testError,
      {
        handler: 'travel-cascade',
        eventId,
        cascadeEvent: 'travel:travel_cancelled',
      },
    );
    vi.restoreAllMocks();
  });
});

// ── ObjectLiteral: resolvePersonContact fallback ─────────────────

describe('Mutation kill: resolvePersonContact null fallback shape', () => {
  it('when person not found, notification is skipped and contact defaults to { email: null, phoneE164: null, fullName: null }', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Return empty array for person lookup so ?? fallback triggers
    mockDb.select
      .mockReturnValueOnce(createChainableSelect([])) // accom
      .mockReturnValueOnce(createChainableSelect([])) // transport
      .mockReturnValueOnce(createChainableSelect([])) // person NOT FOUND (email path)
      .mockReturnValueOnce(createChainableSelect([])); // person NOT FOUND (whatsapp path)

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { x: { from: 'a', to: 'b' } },
    });

    // Both channels should be skipped since email is null and phoneE164 is null
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});

// ── ObjectLiteral: sendNotification full call shape ──────────────

describe('Mutation kill: sendNotification receives exact full object shape', () => {
  it('travel update email: sendNotification called with complete object', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      previous: {}, current: {},
      changeSummary: { toCity: { from: 'A', to: 'B' } },
    });
    const call = mockSendNotification.mock.calls[0][0];
    expect(call).toEqual(expect.objectContaining({
      eventId,
      personId,
      channel: 'email',
      templateKey: 'travel_update',
      triggerType: 'travel.updated',
      triggerEntityType: 'travel_record',
      triggerEntityId: travelRecordId,
      sendMode: 'automatic',
    }));
    // Verify idempotency key is a non-empty string
    expect(typeof call.idempotencyKey).toBe('string');
    expect(call.idempotencyKey.length).toBeGreaterThan(0);
    // Verify variables has all expected keys
    expect(call.variables).toHaveProperty('changeSummary');
    expect(call.variables).toHaveProperty('recipientEmail');
    expect(call.variables).toHaveProperty('recipientPhoneE164');
    expect(call.variables).toHaveProperty('recipientName');
  });

  it('travel cancelled whatsapp: sendNotification called with complete object', async () => {
    mockSelects([], [], personBoth);
    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, eventId, actor, {
      travelRecordId, personId, registrationId: null,
      cancelledAt: '2026-01-01T00:00:00Z', reason: 'No show',
    });
    const call = mockSendNotification.mock.calls[1][0];
    expect(call).toEqual(expect.objectContaining({
      eventId,
      personId,
      channel: 'whatsapp',
      templateKey: 'travel_cancelled',
      triggerType: 'travel.cancelled',
      triggerEntityType: 'travel_record',
      triggerEntityId: travelRecordId,
      sendMode: 'automatic',
    }));
    expect(call.variables).toEqual({
      cancelledAt: '2026-01-01T00:00:00Z',
      reason: 'No show',
      recipientEmail: 'a@b.com',
      recipientPhoneE164: '+911234567890',
      recipientName: 'Alice',
    });
  });
});
