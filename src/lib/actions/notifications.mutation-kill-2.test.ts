/**
 * Mutation-kill-2 tests for actions/notifications.ts
 *
 * Targets survivors left by notifications.mutation-kill.test.ts:
 *   - requireWrite option literal on assertEventAccess calls
 *   - assertNotificationsRole behavior in getTemplateEditorEntry
 *     (existing event override vs createEventOverride branch)
 *   - getFailedNotifications + getNotificationLog default limit/offset
 *   - saveTemplate "Failed to save template" + revalidatePath
 *   - getSiblingTemplate channel inversion
 *   - createAutomationTrigger isEnabled=true literal
 *   - update/delete trigger not-found branches + revalidatePath
 *   - schema boundaries (listAllLogsSchema, saveTemplateSchema,
 *     createTriggerActionSchema, updateTriggerActionSchema)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertEventAccess,
  mockListFailedLogs,
  mockGetLogById,
  mockRetryFailedNotification,
  mockResendNotification,
  mockGetTemplateById,
  mockListTemplatesForEvent,
  mockUpdateTemplate,
  mockCreateEventOverride,
  mockListTriggersForEvent,
  mockCreateTrigger,
  mockUpdateTriggerRow,
  mockDeleteTriggerRow,
  mockRevalidatePath,
  mockDb,
} = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockListFailedLogs: vi.fn(),
  mockGetLogById: vi.fn(),
  mockRetryFailedNotification: vi.fn(),
  mockResendNotification: vi.fn(),
  mockGetTemplateById: vi.fn(),
  mockListTemplatesForEvent: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockCreateEventOverride: vi.fn(),
  mockListTriggersForEvent: vi.fn(),
  mockCreateTrigger: vi.fn(),
  mockUpdateTriggerRow: vi.fn(),
  mockDeleteTriggerRow: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDb: { select: vi.fn() },
}));

vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/notifications/log-queries', () => ({
  listFailedLogs: mockListFailedLogs,
  getLogById: mockGetLogById,
}));
vi.mock('@/lib/notifications/send', () => ({
  retryFailedNotification: mockRetryFailedNotification,
  resendNotification: mockResendNotification,
}));
vi.mock('@/lib/notifications/template-queries', () => ({
  getTemplateById: mockGetTemplateById,
  listTemplatesForEvent: mockListTemplatesForEvent,
  updateTemplate: mockUpdateTemplate,
  createEventOverride: mockCreateEventOverride,
}));
vi.mock('@/lib/notifications/trigger-queries', () => ({
  listTriggersForEvent: mockListTriggersForEvent,
  createTrigger: mockCreateTrigger,
  updateTrigger: mockUpdateTriggerRow,
  deleteTrigger: mockDeleteTriggerRow,
}));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    eventId: 'eventId',
    channel: 'channel',
    status: 'status',
    createdAt: 'createdAt',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _type: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
}));

import {
  retryNotification,
  manualResend,
  getTemplateEditorEntry,
  getTemplatesHub,
  getNotificationLog,
  saveTemplate,
  getSiblingTemplate,
  createAutomationTrigger,
  updateAutomationTrigger,
  deleteAutomationTrigger,
  getFailedNotifications,
  getTriggersForEvent,
} from './notifications';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TRIGGER_ID = '550e8400-e29b-41d4-a716-446655440003';
const OVERRIDE_ID = '550e8400-e29b-41d4-a716-446655440004';

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:event_coordinator' });
  mockListFailedLogs.mockResolvedValue([]);
  mockRetryFailedNotification.mockResolvedValue({ status: 'sent' });
  mockResendNotification.mockResolvedValue({ status: 'sent' });
  mockListTemplatesForEvent.mockResolvedValue({ eventTemplates: [], globalTemplates: [] });
  mockListTriggersForEvent.mockResolvedValue([]);
});

// ──────────────────────────────────────────────────────────
// requireWrite: true literal on assertEventAccess
// ──────────────────────────────────────────────────────────
describe('write-path actions pass requireWrite=true to assertEventAccess', () => {
  it('retryNotification calls assertEventAccess with { requireWrite: true } exactly', async () => {
    await retryNotification({ eventId: EVENT_ID, notificationLogId: LOG_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledTimes(1);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('manualResend calls assertEventAccess with { requireWrite: true } exactly', async () => {
    await manualResend({ eventId: EVENT_ID, notificationLogId: LOG_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('saveTemplate calls assertEventAccess with { requireWrite: true } exactly', async () => {
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, eventId: EVENT_ID, channel: 'email', templateKey: 'welcome',
    });
    mockUpdateTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID });
    await saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID, bodyContent: 'Hi' });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('createAutomationTrigger calls assertEventAccess with { requireWrite: true }', async () => {
    mockCreateTrigger.mockResolvedValueOnce({ id: TRIGGER_ID });
    await createAutomationTrigger({
      eventId: EVENT_ID,
      triggerEventType: 'registration.created',
      channel: 'email',
      templateId: TEMPLATE_ID,
      recipientResolution: 'trigger_person',
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('updateAutomationTrigger calls assertEventAccess with { requireWrite: true }', async () => {
    mockUpdateTriggerRow.mockResolvedValueOnce({ id: TRIGGER_ID });
    await updateAutomationTrigger({
      eventId: EVENT_ID,
      triggerId: TRIGGER_ID,
      isEnabled: false,
    });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('deleteAutomationTrigger calls assertEventAccess with { requireWrite: true }', async () => {
    mockDeleteTriggerRow.mockResolvedValueOnce({ id: TRIGGER_ID });
    await deleteAutomationTrigger({ eventId: EVENT_ID, triggerId: TRIGGER_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('read-path getTemplatesHub does NOT pass requireWrite', async () => {
    await getTemplatesHub({ eventId: EVENT_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('read-path getTriggersForEvent does NOT pass requireWrite', async () => {
    await getTriggersForEvent({ eventId: EVENT_ID });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });
});

// ──────────────────────────────────────────────────────────
// assertNotificationsRole rejects when role missing / unknown
// ──────────────────────────────────────────────────────────
describe('assertNotificationsRole', () => {
  it('throws "forbidden" on null role for a read action', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: null });
    await expect(getFailedNotifications({ eventId: EVENT_ID })).rejects.toThrow(/forbidden/);
  });

  it('allows Ops role on a write path that Ops should not have (fails)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    await expect(
      retryNotification({ eventId: EVENT_ID, notificationLogId: LOG_ID }),
    ).rejects.toThrow(/forbidden/);
  });

  it('rejects Read-only on a write path', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(
      retryNotification({ eventId: EVENT_ID, notificationLogId: LOG_ID }),
    ).rejects.toThrow(/forbidden/);
  });

  it('allows Read-only on a read path', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(getFailedNotifications({ eventId: EVENT_ID })).resolves.toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────
// getTemplateEditorEntry branching
// ──────────────────────────────────────────────────────────
describe('getTemplateEditorEntry', () => {
  it('returns the event-scoped template immediately when present', async () => {
    const evtTpl = { id: TEMPLATE_ID, eventId: EVENT_ID, channel: 'email', templateKey: 'welcome' };
    mockGetTemplateById.mockResolvedValueOnce(evtTpl);
    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual(evtTpl);
    expect(mockListTemplatesForEvent).not.toHaveBeenCalled();
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
  });

  it('throws "Notification template not found" when both lookups return null', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null); // event-scoped
    mockGetTemplateById.mockResolvedValueOnce(null); // global
    await expect(
      getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
    ).rejects.toThrow(/Notification template not found/);
  });

  it('write-role user gets an existing event override (no createEventOverride call)', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null); // no event-scoped
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, channel: 'email', templateKey: 'welcome',
    }); // global
    const existingOverride = { id: OVERRIDE_ID, templateKey: 'welcome' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [existingOverride],
      globalTemplates: [],
    });

    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual(existingOverride);
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
  });

  it('write-role user with no existing override gets a fresh createEventOverride', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null);
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, channel: 'whatsapp', templateKey: 'welcome',
    });
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [], globalTemplates: [],
    });
    const freshOverride = { id: OVERRIDE_ID, templateKey: 'welcome' };
    mockCreateEventOverride.mockResolvedValueOnce(freshOverride);

    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual(freshOverride);
    expect(mockCreateEventOverride).toHaveBeenCalledWith(TEMPLATE_ID, EVENT_ID, 'user-1');
  });

  it('listTemplatesForEvent call uses the GLOBAL template channel (not the user-supplied channel)', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null);
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, channel: 'whatsapp', templateKey: 'welcome',
    });
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [], globalTemplates: [],
    });
    mockCreateEventOverride.mockResolvedValueOnce({ id: OVERRIDE_ID });

    await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(mockListTemplatesForEvent).toHaveBeenCalledWith(EVENT_ID, { channel: 'whatsapp' });
  });

  it('read-only user falls through and returns the global template (no override created)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    mockGetTemplateById.mockResolvedValueOnce(null);
    const globalTpl = { id: TEMPLATE_ID, channel: 'email', templateKey: 'welcome' };
    mockGetTemplateById.mockResolvedValueOnce(globalTpl);

    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual(globalTpl);
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
    expect(mockListTemplatesForEvent).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────
// getNotificationLog default limit/offset + channel/status filters
// ──────────────────────────────────────────────────────────
describe('getNotificationLog default limit/offset', () => {
  function stubQueryChain() {
    const offset = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ offset });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    mockDb.select.mockReturnValueOnce({ from });
    return { limit, offset };
  }

  it('defaults limit to 50 when not supplied', async () => {
    const { limit } = stubQueryChain();
    await getNotificationLog({ eventId: EVENT_ID });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it('defaults offset to 0 when not supplied', async () => {
    const { offset } = stubQueryChain();
    await getNotificationLog({ eventId: EVENT_ID });
    expect(offset).toHaveBeenCalledWith(0);
  });

  it('uses supplied limit/offset when provided (not the defaults)', async () => {
    const { limit, offset } = stubQueryChain();
    await getNotificationLog({ eventId: EVENT_ID, limit: 17, offset: 33 });
    expect(limit).toHaveBeenCalledWith(17);
    expect(offset).toHaveBeenCalledWith(33);
  });

  it('rejects listAllLogsSchema limit > 200', async () => {
    await expect(
      getNotificationLog({ eventId: EVENT_ID, limit: 201 }),
    ).rejects.toThrow();
  });

  it('rejects listAllLogsSchema limit < 1', async () => {
    await expect(
      getNotificationLog({ eventId: EVENT_ID, limit: 0 }),
    ).rejects.toThrow();
  });

  it('rejects listAllLogsSchema negative offset', async () => {
    await expect(
      getNotificationLog({ eventId: EVENT_ID, offset: -1 }),
    ).rejects.toThrow();
  });

  it('rejects listAllLogsSchema unknown status', async () => {
    await expect(
      getNotificationLog({ eventId: EVENT_ID, status: 'unknown' as never }),
    ).rejects.toThrow();
  });

  it.each(['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'retrying'] as const)(
    'accepts status=%s',
    async (status) => {
      stubQueryChain();
      await expect(
        getNotificationLog({ eventId: EVENT_ID, status }),
      ).resolves.toBeDefined();
    },
  );
});

// ──────────────────────────────────────────────────────────
// saveTemplate
// ──────────────────────────────────────────────────────────
describe('saveTemplate', () => {
  it('throws "Failed to save template" when updateTemplate returns null', async () => {
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, eventId: EVENT_ID, channel: 'email', templateKey: 'welcome',
    });
    mockUpdateTemplate.mockResolvedValueOnce(null);
    await expect(
      saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID, bodyContent: 'x' }),
    ).rejects.toThrow(/Failed to save template/);
  });

  it('revalidatePath("/events/:id/templates") on success', async () => {
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, eventId: EVENT_ID, channel: 'email', templateKey: 'welcome',
    });
    mockUpdateTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID });
    await saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID, bodyContent: 'x' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/templates`);
  });

  it('creates a NEW event override when no event-scoped and no existing override', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null);
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, channel: 'email', templateKey: 'welcome',
    });
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [], globalTemplates: [],
    });
    const freshOverride = { id: OVERRIDE_ID };
    mockCreateEventOverride.mockResolvedValueOnce(freshOverride);
    mockUpdateTemplate.mockResolvedValueOnce({ id: OVERRIDE_ID });

    const result = await saveTemplate({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
      bodyContent: 'x',
    });

    expect(mockUpdateTemplate).toHaveBeenCalledWith(OVERRIDE_ID, expect.any(Object));
    expect(result.templateId).toBe(OVERRIDE_ID);
  });

  it('reuses existing event override when one already exists (no createEventOverride)', async () => {
    mockGetTemplateById.mockResolvedValueOnce(null);
    mockGetTemplateById.mockResolvedValueOnce({
      id: TEMPLATE_ID, channel: 'email', templateKey: 'welcome',
    });
    const existingOverride = { id: OVERRIDE_ID, templateKey: 'welcome' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [existingOverride], globalTemplates: [],
    });
    mockUpdateTemplate.mockResolvedValueOnce({ id: OVERRIDE_ID });

    await saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID, bodyContent: 'x' });
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
    expect(mockUpdateTemplate).toHaveBeenCalledWith(OVERRIDE_ID, expect.any(Object));
  });

  it('rejects saveTemplateSchema templateName > 200 chars', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        templateName: 'a'.repeat(201),
      }),
    ).rejects.toThrow();
  });

  it('rejects saveTemplateSchema bodyContent > 50000 chars', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        bodyContent: 'a'.repeat(50001),
      }),
    ).rejects.toThrow();
  });

  it('rejects saveTemplateSchema empty bodyContent', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        bodyContent: '',
      }),
    ).rejects.toThrow();
  });

  it('rejects saveTemplateSchema subjectLine > 500 chars', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        subjectLine: 'a'.repeat(501),
      }),
    ).rejects.toThrow();
  });

  it('rejects saveTemplateSchema notes > 2000 chars', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        notes: 'a'.repeat(2001),
      }),
    ).rejects.toThrow();
  });

  it('rejects saveTemplateSchema invalid status', async () => {
    await expect(
      saveTemplate({
        eventId: EVENT_ID,
        templateId: TEMPLATE_ID,
        status: 'bogus' as never,
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// getSiblingTemplate channel inversion
// ──────────────────────────────────────────────────────────
describe('getSiblingTemplate', () => {
  it('email → looks up whatsapp siblings', async () => {
    await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'welcome',
      channel: 'email',
    });
    expect(mockListTemplatesForEvent).toHaveBeenCalledWith(EVENT_ID, { channel: 'whatsapp' });
  });

  it('whatsapp → looks up email siblings', async () => {
    await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'welcome',
      channel: 'whatsapp',
    });
    expect(mockListTemplatesForEvent).toHaveBeenCalledWith(EVENT_ID, { channel: 'email' });
  });

  it('returns the matching event sibling if one exists', async () => {
    const sibling = { id: OVERRIDE_ID, templateKey: 'welcome' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [sibling, { id: 'x', templateKey: 'other' }],
      globalTemplates: [],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'welcome',
      channel: 'email',
    });
    expect(result).toEqual(sibling);
  });

  it('falls back to global sibling when no event sibling', async () => {
    const globalSibling = { id: TEMPLATE_ID, templateKey: 'welcome' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [{ id: 'x', templateKey: 'other' }],
      globalTemplates: [globalSibling, { id: 'y', templateKey: 'other2' }],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'welcome',
      channel: 'email',
    });
    expect(result).toEqual(globalSibling);
  });

  it('returns null when neither event nor global sibling exists', async () => {
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [], globalTemplates: [],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'missing',
      channel: 'email',
    });
    expect(result).toBeNull();
  });

  it('rejects getSiblingTemplateSchema empty templateKey', async () => {
    await expect(
      getSiblingTemplate({ eventId: EVENT_ID, templateKey: '', channel: 'email' }),
    ).rejects.toThrow();
  });

  it('rejects getSiblingTemplateSchema templateKey > 100 chars', async () => {
    await expect(
      getSiblingTemplate({
        eventId: EVENT_ID,
        templateKey: 'a'.repeat(101),
        channel: 'email',
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// createAutomationTrigger — isEnabled: true + forwarding
// ──────────────────────────────────────────────────────────
describe('createAutomationTrigger', () => {
  const baseInput = {
    eventId: EVENT_ID,
    triggerEventType: 'registration.created' as const,
    channel: 'email' as const,
    templateId: TEMPLATE_ID,
    recipientResolution: 'trigger_person' as const,
  };

  it('sets isEnabled: true when calling createTrigger', async () => {
    mockCreateTrigger.mockResolvedValueOnce({ id: TRIGGER_ID });
    await createAutomationTrigger(baseInput);
    expect(mockCreateTrigger).toHaveBeenCalledWith(expect.objectContaining({
      isEnabled: true,
    }));
  });

  it('forwards delaySeconds, priority, idempotencyScope, notes, guardConditionJson', async () => {
    mockCreateTrigger.mockResolvedValueOnce({ id: TRIGGER_ID });
    await createAutomationTrigger({
      ...baseInput,
      delaySeconds: 120,
      priority: 50,
      idempotencyScope: 'per_person_per_event_per_channel',
      notes: 'note',
      guardConditionJson: { a: 1 },
    });
    expect(mockCreateTrigger).toHaveBeenCalledWith(expect.objectContaining({
      delaySeconds: 120,
      priority: 50,
      idempotencyScope: 'per_person_per_event_per_channel',
      notes: 'note',
      guardConditionJson: { a: 1 },
      createdBy: 'user-1',
    }));
  });

  it('revalidates /events/:id/triggers', async () => {
    mockCreateTrigger.mockResolvedValueOnce({ id: TRIGGER_ID });
    await createAutomationTrigger(baseInput);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/triggers`);
  });

  it('rejects createTriggerActionSchema delaySeconds > 86400', async () => {
    await expect(
      createAutomationTrigger({ ...baseInput, delaySeconds: 86401 }),
    ).rejects.toThrow();
  });

  it('rejects createTriggerActionSchema negative delaySeconds', async () => {
    await expect(
      createAutomationTrigger({ ...baseInput, delaySeconds: -1 }),
    ).rejects.toThrow();
  });

  it('rejects createTriggerActionSchema priority > 100', async () => {
    await expect(
      createAutomationTrigger({ ...baseInput, priority: 101 }),
    ).rejects.toThrow();
  });

  it('rejects createTriggerActionSchema negative priority', async () => {
    await expect(
      createAutomationTrigger({ ...baseInput, priority: -1 }),
    ).rejects.toThrow();
  });

  it('rejects createTriggerActionSchema notes > 1000 chars', async () => {
    await expect(
      createAutomationTrigger({ ...baseInput, notes: 'a'.repeat(1001) }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// updateAutomationTrigger / deleteAutomationTrigger
// ──────────────────────────────────────────────────────────
describe('updateAutomationTrigger', () => {
  it('returns { ok: false, error: "Trigger not found" } when update returns null', async () => {
    mockUpdateTriggerRow.mockResolvedValueOnce(null);
    const result = await updateAutomationTrigger({
      eventId: EVENT_ID,
      triggerId: TRIGGER_ID,
      isEnabled: false,
    });
    expect(result).toEqual({ ok: false, error: 'Trigger not found' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns { ok: true, trigger } and revalidates on success', async () => {
    const trigger = { id: TRIGGER_ID, isEnabled: false };
    mockUpdateTriggerRow.mockResolvedValueOnce(trigger);
    const result = await updateAutomationTrigger({
      eventId: EVENT_ID, triggerId: TRIGGER_ID, isEnabled: false,
    });
    expect(result).toEqual({ ok: true, trigger });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/triggers`);
  });

  it('forwards updatedBy from assertEventAccess userId', async () => {
    mockUpdateTriggerRow.mockResolvedValueOnce({ id: TRIGGER_ID });
    await updateAutomationTrigger({
      eventId: EVENT_ID, triggerId: TRIGGER_ID, priority: 10,
    });
    expect(mockUpdateTriggerRow).toHaveBeenCalledWith(TRIGGER_ID, expect.objectContaining({
      priority: 10,
      eventId: EVENT_ID,
      updatedBy: 'user-1',
    }));
  });

  it('rejects updateTriggerActionSchema delaySeconds > 86400', async () => {
    await expect(
      updateAutomationTrigger({
        eventId: EVENT_ID, triggerId: TRIGGER_ID, delaySeconds: 86401,
      }),
    ).rejects.toThrow();
  });

  it('rejects updateTriggerActionSchema priority > 100', async () => {
    await expect(
      updateAutomationTrigger({
        eventId: EVENT_ID, triggerId: TRIGGER_ID, priority: 101,
      }),
    ).rejects.toThrow();
  });

  it('rejects updateTriggerActionSchema notes > 1000 chars', async () => {
    await expect(
      updateAutomationTrigger({
        eventId: EVENT_ID, triggerId: TRIGGER_ID, notes: 'a'.repeat(1001),
      }),
    ).rejects.toThrow();
  });
});

describe('deleteAutomationTrigger', () => {
  it('returns { ok: false, error: "Trigger not found" } when delete returns null', async () => {
    mockDeleteTriggerRow.mockResolvedValueOnce(null);
    const result = await deleteAutomationTrigger({
      eventId: EVENT_ID, triggerId: TRIGGER_ID,
    });
    expect(result).toEqual({ ok: false, error: 'Trigger not found' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns { ok: true, trigger } and revalidates on success', async () => {
    const trigger = { id: TRIGGER_ID };
    mockDeleteTriggerRow.mockResolvedValueOnce(trigger);
    const result = await deleteAutomationTrigger({
      eventId: EVENT_ID, triggerId: TRIGGER_ID,
    });
    expect(result).toEqual({ ok: true, trigger });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/triggers`);
  });
});

// ──────────────────────────────────────────────────────────
// getFailedNotifications default limit/offset pass-through
// ──────────────────────────────────────────────────────────
describe('getFailedNotifications default limit/offset', () => {
  it('forwards undefined limit so listFailedLogs applies its own default', async () => {
    await getFailedNotifications({ eventId: EVENT_ID });
    expect(mockListFailedLogs).toHaveBeenCalledWith(EVENT_ID, expect.objectContaining({
      limit: undefined,
      offset: undefined,
    }));
  });

  it('forwards supplied limit to listFailedLogs', async () => {
    await getFailedNotifications({ eventId: EVENT_ID, limit: 42 });
    expect(mockListFailedLogs).toHaveBeenCalledWith(EVENT_ID, expect.objectContaining({
      limit: 42,
    }));
  });

  it('rejects templateKey that is only whitespace (trim + min(1))', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, templateKey: '   ' }),
    ).rejects.toThrow();
  });
});
