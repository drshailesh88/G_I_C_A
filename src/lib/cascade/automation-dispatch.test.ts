/**
 * Automation Dispatch Tests — Req 6A-2
 *
 * Verifies that handleDomainEvent actually calls sendNotification
 * for matching triggers, respects guards, and prevents infinite loops.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  automationTriggers: {},
  notificationTemplates: {},
  notificationLog: {},
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  relations: vi.fn(),
}));

const mockGetActiveTriggersForEventType = vi.fn();
vi.mock('@/lib/notifications/trigger-queries', () => ({
  getActiveTriggersForEventType: (...args: unknown[]) => mockGetActiveTriggersForEventType(...args),
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

vi.mock('./automation-utils', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    evaluateGuard: actual.evaluateGuard,
    buildIdempotencyKey: actual.buildIdempotencyKey,
  };
});

import { handleDomainEvent } from './automation';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveTriggersForEventType.mockResolvedValue([]);
});

describe('handleDomainEvent → real notification', () => {
  const eventId = 'evt-100';
  const actor = { type: 'user' as const, id: 'user_1' };

  const activeTrigger = {
    trigger: {
      id: 'trig-1',
      eventId,
      triggerEventType: 'conference/travel.saved',
      channel: 'email',
      recipientResolution: 'trigger_person',
      delaySeconds: 0,
      idempotencyScope: 'per_person_per_trigger_entity_per_channel',
      guardConditionJson: null,
      isEnabled: true,
      templateId: 'tpl-1',
    },
    template: {
      id: 'tpl-1',
      eventId,
      templateKey: 'travel_confirmation',
      channel: 'email',
      status: 'active',
    },
  };

  it('sends notification for matching active trigger', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      triggerEntityType: 'travel_record',
      triggerEntityId: 'tr-1',
      actor,
      payload: { personId: 'person-1', travelRecordId: 'tr-1' },
    });

    expect(result.triggersMatched).toBe(1);
    expect(result.triggersDispatched).toBe(1);
    expect(result.triggersSkipped).toBe(0);
    expect(mockSendNotification).toHaveBeenCalledOnce();

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.eventId).toBe(eventId);
    expect(call.personId).toBe('person-1');
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('travel_confirmation');
    expect(call.sendMode).toBe('automatic');
  });

  it('does NOT send when trigger is inactive (disabled)', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([]); // filtered out by query

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1' },
    });

    expect(result.triggersMatched).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('skips trigger when guard condition fails', async () => {
    const guardedTrigger = {
      ...activeTrigger,
      trigger: {
        ...activeTrigger.trigger,
        guardConditionJson: { direction: 'inbound' },
      },
    };
    mockGetActiveTriggersForEventType.mockResolvedValue([guardedTrigger]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1', direction: 'outbound' },
    });

    expect(result.triggersSkipped).toBe(1);
    expect(result.triggersDispatched).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sends when guard condition passes', async () => {
    const guardedTrigger = {
      ...activeTrigger,
      trigger: {
        ...activeTrigger.trigger,
        guardConditionJson: { direction: 'inbound' },
      },
    };
    mockGetActiveTriggersForEventType.mockResolvedValue([guardedTrigger]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1', direction: 'inbound' },
    });

    expect(result.triggersDispatched).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledOnce();
  });

  it('infinite-loop guard: source=automation skips all triggers', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1' },
      source: 'automation',
    });

    expect(result.triggersMatched).toBe(0);
    expect(result.triggersDispatched).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
    // Should NOT even query for triggers
    expect(mockGetActiveTriggersForEventType).not.toHaveBeenCalled();
  });

  it('skips trigger when template is not active', async () => {
    const inactiveTpl = {
      ...activeTrigger,
      template: { ...activeTrigger.template, status: 'draft' },
    };
    mockGetActiveTriggersForEventType.mockResolvedValue([inactiveTpl]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1' },
    });

    expect(result.triggersSkipped).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('records error when sendNotification throws', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);
    mockSendNotification.mockRejectedValueOnce(new Error('Provider down'));

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1' },
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].triggerId).toBe('trig-1');
    expect(result.errors[0].error).toBe('Provider down');
  });

  it('skips when personId is missing from payload', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { travelRecordId: 'tr-1' }, // no personId
    });

    expect(result.triggersSkipped).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('strips sensitive fields from payload variables (Codex fix)', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);

    await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: {
        personId: 'person-1',
        travelRecordId: 'tr-1',
        accessToken: 'super-secret',
        passwordResetToken: 'reset-secret',
        recipientEmail: 'test@test.com',
      },
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.personId).toBe('person-1');
    expect(vars.travelRecordId).toBe('tr-1');
    expect(vars.recipientEmail).toBe('test@test.com');
    expect(vars).not.toHaveProperty('accessToken');
    expect(vars).not.toHaveProperty('passwordResetToken');
  });

  it('strips nested sensitive fields before forwarding automation variables', async () => {
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger]);

    await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: {
        personId: 'person-1',
        recipientEmail: 'test@test.com',
        session: {
          user: 'alice',
          accessToken: 'nested-secret',
          profile: {
            apiKey: 'profile-secret',
            city: 'Mumbai',
          },
        },
        attendees: [
          { personId: 'person-2', token: 'row-secret' },
          { nested: { safe: 'ok', password: 'hidden' } },
        ],
      },
    });

    const vars = mockSendNotification.mock.calls[0][0].variables;
    expect(vars.session).toStrictEqual({
      user: 'alice',
      profile: {
        city: 'Mumbai',
      },
    });
    expect(vars.attendees).toStrictEqual([
      { personId: 'person-2' },
      { nested: { safe: 'ok' } },
    ]);
  });

  it('includes trigger ID in idempotency key to prevent collisions (Codex fix)', async () => {
    const trigger2 = {
      ...activeTrigger,
      trigger: { ...activeTrigger.trigger, id: 'trig-2', templateId: 'tpl-2' },
      template: { ...activeTrigger.template, id: 'tpl-2', templateKey: 'travel_update' },
    };
    mockGetActiveTriggersForEventType.mockResolvedValue([activeTrigger, trigger2]);

    await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      triggerEntityType: 'travel_record',
      triggerEntityId: 'tr-1',
      actor,
      payload: { personId: 'person-1' },
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    const key1 = mockSendNotification.mock.calls[0][0].idempotencyKey;
    const key2 = mockSendNotification.mock.calls[1][0].idempotencyKey;
    expect(key1).not.toBe(key2);
    expect(key1).toContain('trig-1');
    expect(key2).toContain('trig-2');
  });

  it('skips unsupported recipientResolution (Codex fix)', async () => {
    const opsTrigger = {
      ...activeTrigger,
      trigger: { ...activeTrigger.trigger, recipientResolution: 'ops_team' },
    };
    mockGetActiveTriggersForEventType.mockResolvedValue([opsTrigger]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'conference/travel.saved',
      actor,
      payload: { personId: 'person-1' },
    });

    expect(result.triggersSkipped).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
