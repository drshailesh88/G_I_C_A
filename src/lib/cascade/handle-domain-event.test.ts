/**
 * handleDomainEvent Tests — Req 6A-2
 *
 * Verifies that domain events resolve automation triggers
 * and dispatch real notifications.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────
const { mockGetActiveTriggers, mockSendNotification } = vi.hoisted(() => ({
  mockGetActiveTriggers: vi.fn(),
  mockSendNotification: vi.fn(),
}));

vi.mock('@/lib/notifications/trigger-queries', () => ({
  getActiveTriggersForEventType: mockGetActiveTriggers,
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

import { handleDomainEvent } from './automation';

// ── Helpers ──────────────────────────────────────────────────
function makeTrigger(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trigger-1',
    eventId: 'evt-1',
    triggerEventType: 'travel.saved',
    guardConditionJson: null,
    channel: 'email',
    templateId: 'tpl-1',
    recipientResolution: 'trigger_person',
    delaySeconds: 0,
    idempotencyScope: 'per_person_per_trigger_entity_per_channel',
    isEnabled: true,
    priority: 0,
    notes: null,
    createdBy: 'user_1',
    updatedBy: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    eventId: 'evt-1',
    templateKey: 'travel_saved',
    channel: 'email',
    status: 'active',
    subjectTemplate: 'Travel Saved',
    bodyTemplate: 'Your travel has been saved.',
    versionNo: 1,
    createdBy: 'user_1',
    updatedBy: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendNotification.mockResolvedValue({
    notificationLogId: 'log-1',
    provider: 'resend',
    providerMessageId: 'msg-1',
    status: 'sent',
  });
});

describe('handleDomainEvent — Req 6A-2', () => {
  const eventId = 'evt-1';
  const actor = { type: 'user', id: 'user_1' };

  it('dispatches notification when active trigger matches domain event', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger(), template: makeTemplate() },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      triggerEntityType: 'travel_record',
      triggerEntityId: 'tr-1',
      actor,
      payload: { personId: 'p-1', recipientEmail: 'test@example.com' },
    });

    expect(result.triggersMatched).toBe(1);
    expect(result.triggersDispatched).toBe(1);
    expect(result.triggersSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.eventId).toBe(eventId);
    expect(call.personId).toBe('p-1');
    expect(call.channel).toBe('email');
    expect(call.templateKey).toBe('travel_saved');
    expect(call.triggerType).toBe('travel.saved');
    expect(call.sendMode).toBe('automatic');
  });

  it('skips notification when trigger is disabled (inactive template)', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger(), template: makeTemplate({ status: 'draft' }) },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { personId: 'p-1' },
    });

    expect(result.triggersMatched).toBe(1);
    expect(result.triggersDispatched).toBe(0);
    expect(result.triggersSkipped).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('skips when guard condition does not match', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      {
        trigger: makeTrigger({
          guardConditionJson: { status: 'confirmed' },
        }),
        template: makeTemplate(),
      },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { personId: 'p-1', status: 'pending' },
    });

    expect(result.triggersSkipped).toBe(1);
    expect(result.triggersDispatched).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('dispatches when guard condition matches', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      {
        trigger: makeTrigger({
          guardConditionJson: { status: 'confirmed' },
        }),
        template: makeTemplate(),
      },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { personId: 'p-1', status: 'confirmed' },
    });

    expect(result.triggersDispatched).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it('returns immediately when source is automation (infinite-loop guard)', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger(), template: makeTemplate() },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { personId: 'p-1' },
      source: 'automation',
    });

    expect(result.triggersMatched).toBe(0);
    expect(result.triggersDispatched).toBe(0);
    expect(mockGetActiveTriggers).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('dispatches when source is manual (not blocked)', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger(), template: makeTemplate() },
    ]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { personId: 'p-1' },
      source: 'manual',
    });

    expect(result.triggersDispatched).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it('skips when no personId in payload', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger(), template: makeTemplate() },
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      actor,
      payload: { someOtherField: 'value' }, // no personId
    });

    expect(result.triggersSkipped).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('captures error when sendNotification throws, continues to next trigger', async () => {
    mockGetActiveTriggers.mockResolvedValue([
      { trigger: makeTrigger({ id: 'trigger-fail' }), template: makeTemplate() },
      { trigger: makeTrigger({ id: 'trigger-ok', channel: 'whatsapp' }), template: makeTemplate({ id: 'tpl-2', templateKey: 'travel_saved_wa' }) },
    ]);

    mockSendNotification
      .mockRejectedValueOnce(new Error('Provider error'))
      .mockResolvedValueOnce({
        notificationLogId: 'log-2',
        provider: 'evolution_api',
        status: 'sent',
      });

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'travel.saved',
      triggerEntityType: 'travel_record',
      triggerEntityId: 'tr-1',
      actor,
      payload: { personId: 'p-1' },
    });

    expect(result.triggersMatched).toBe(2);
    expect(result.triggersDispatched).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].triggerId).toBe('trigger-fail');
    expect(result.errors[0].error).toBe('Provider error');
  });

  it('returns empty result when no triggers match', async () => {
    mockGetActiveTriggers.mockResolvedValue([]);

    const result = await handleDomainEvent({
      eventId,
      triggerEventType: 'unknown.event',
      actor,
      payload: { personId: 'p-1' },
    });

    expect(result.triggersMatched).toBe(0);
    expect(result.triggersDispatched).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
