import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

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
    assignmentStatus: 'tpa.assignment_status',
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
  upsertRedFlag: vi.fn().mockResolvedValue({ flag: { id: 'flag-1' }, action: 'created' }),
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn().mockResolvedValue({ notificationLogId: 'log-1', status: 'sent' }),
}));
vi.mock('../dead-letter', () => ({
  CascadeNotificationRetryError: class extends Error {},
  handleCascadeNotificationResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/sentry', () => ({
  captureCascadeError: vi.fn(),
}));

import { db } from '@/lib/db';
import { upsertRedFlag } from '../red-flags';
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode, disableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerRegistrationCascadeHandlers } from './registration-cascade';

enableTestMode();

const mockDb = vi.mocked(db as unknown as { select: ReturnType<typeof vi.fn> });

const EVENT_ID = 'event-aaa-111';
const PERSON_ID = 'person-bbb-222';
const REG_ID = 'reg-ccc-333';

function chainSelect(rows: Record<string, unknown>[]) {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

const basePayload = {
  registrationId: REG_ID,
  personId: PERSON_ID,
  eventId: EVENT_ID,
  cancelledAt: '2026-04-17T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  registerRegistrationCascadeHandlers();
});

describe('handleRegistrationCancelled — accommodation flags', () => {
  it('creates a registration_cancelled flag on each active accommodation record', async () => {
    chainSelect([{ id: 'accom-1' }, { id: 'accom-2' }]);
    chainSelect([]);

    await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const calls = vi.mocked(upsertRedFlag).mock.calls;
    const accomCalls = calls.filter(c => c[0].targetEntityType === 'accommodation_record');

    expect(accomCalls).toHaveLength(2);
    expect(accomCalls[0][0]).toMatchObject({
      eventId: EVENT_ID,
      flagType: 'registration_cancelled',
      targetEntityType: 'accommodation_record',
      targetEntityId: 'accom-1',
      sourceEntityType: 'registration',
      sourceEntityId: REG_ID,
    });
    expect(accomCalls[1][0].targetEntityId).toBe('accom-2');
  });

  it('does not error when person has no accommodation records', async () => {
    chainSelect([]);
    chainSelect([]);

    await expect(
      emitCascadeEvent(
        CASCADE_EVENTS.REGISTRATION_CANCELLED,
        EVENT_ID,
        { type: 'user', id: 'admin-1' },
        basePayload,
      ),
    ).resolves.not.toThrow();

    const calls = vi.mocked(upsertRedFlag).mock.calls;
    expect(calls.filter(c => c[0].targetEntityType === 'accommodation_record')).toHaveLength(0);
  });
});

describe('handleRegistrationCancelled — transport flags', () => {
  it('creates a registration_cancelled flag on each active transport passenger assignment', async () => {
    chainSelect([]);
    chainSelect([{ id: 'tpa-1' }, { id: 'tpa-2' }]);

    await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const calls = vi.mocked(upsertRedFlag).mock.calls;
    const tpaCalls = calls.filter(c => c[0].targetEntityType === 'transport_passenger_assignment');

    expect(tpaCalls).toHaveLength(2);
    expect(tpaCalls[0][0]).toMatchObject({
      eventId: EVENT_ID,
      flagType: 'registration_cancelled',
      targetEntityType: 'transport_passenger_assignment',
      targetEntityId: 'tpa-1',
      sourceEntityType: 'registration',
      sourceEntityId: REG_ID,
    });
  });

  it('does not error when person has no transport assignments', async () => {
    chainSelect([]);
    chainSelect([]);

    await expect(
      emitCascadeEvent(
        CASCADE_EVENTS.REGISTRATION_CANCELLED,
        EVENT_ID,
        { type: 'user', id: 'admin-1' },
        basePayload,
      ),
    ).resolves.not.toThrow();

    expect(vi.mocked(upsertRedFlag)).not.toHaveBeenCalled();
  });
});

describe('handleRegistrationCancelled — combined', () => {
  it('flags both accommodation and transport records when both exist', async () => {
    chainSelect([{ id: 'accom-1' }]);
    chainSelect([{ id: 'tpa-1' }]);

    await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const calls = vi.mocked(upsertRedFlag).mock.calls;
    expect(calls).toHaveLength(2);
    const types = calls.map(c => c[0].targetEntityType);
    expect(types).toContain('accommodation_record');
    expect(types).toContain('transport_passenger_assignment');
  });

  it('passes the correct eventId for event scoping', async () => {
    const { withEventScope } = await import('@/lib/db/with-event-scope');
    chainSelect([{ id: 'accom-1' }]);
    chainSelect([]);

    await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const scopeCalls = vi.mocked(withEventScope).mock.calls;
    expect(scopeCalls.every(c => c[1] === EVENT_ID)).toBe(true);
  });
});

describe('handleRegistrationCancelled — no logistics records', () => {
  it('completes without flagging anything when no logistics records exist', async () => {
    chainSelect([]);
    chainSelect([]);

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(result.errors).toHaveLength(0);
    expect(vi.mocked(upsertRedFlag)).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  disableTestMode();
});
