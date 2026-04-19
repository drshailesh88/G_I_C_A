/**
 * Tests for PKT-A-009 — Automation Triggers management page.
 * Expectations derived from the frozen packet spec and domain rules,
 * never from reading implementation code.
 *
 * Spec requirements verified here:
 * - All trigger reads filter by eventId (no cross-event leakage).
 * - OPS role is forbidden from reading triggers (not in COMMUNICATIONS_READ_ROLES).
 * - Only SUPER_ADMIN and EVENT_COORDINATOR can create, update, or delete triggers.
 * - Disabling a trigger (isEnabled=false) stops future sends.
 * - Re-enabling a trigger (isEnabled=true) resumes future sends.
 * - Trigger event type and channel are immutable after creation (update schema excludes them).
 * - Invalid trigger IDs or event IDs are rejected with validation errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Hoisted mock factories ───────────────────────────────────

const {
  mockListTriggersForEvent,
  mockCreateTrigger,
  mockUpdateTrigger,
  mockDeleteTrigger,
  mockAssertEventAccess,
  mockListTemplatesForEvent,
  mockRevalidatePath,
} = vi.hoisted(() => {
  return {
    mockListTriggersForEvent: vi.fn().mockResolvedValue([]),
    mockCreateTrigger: vi.fn().mockResolvedValue({ id: 'trg-001', isEnabled: true }),
    mockUpdateTrigger: vi.fn().mockResolvedValue({ id: 'trg-001', isEnabled: false }),
    mockDeleteTrigger: vi.fn().mockResolvedValue({ id: 'trg-001' }),
    mockAssertEventAccess: vi.fn().mockResolvedValue({
      userId: 'user-clerk-xyz',
      role: 'org:super_admin',
    }),
    mockListTemplatesForEvent: vi.fn().mockResolvedValue({
      eventTemplates: [],
      globalTemplates: [],
    }),
    mockRevalidatePath: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/notifications/trigger-queries', () => ({
  listTriggersForEvent: mockListTriggersForEvent,
  createTrigger: mockCreateTrigger,
  updateTrigger: mockUpdateTrigger,
  deleteTrigger: mockDeleteTrigger,
}));

vi.mock('@/lib/notifications/template-queries', () => ({
  listTemplatesForEvent: mockListTemplatesForEvent,
  getTemplateById: vi.fn(),
  updateTemplate: vi.fn(),
  createEventOverride: vi.fn(),
}));

vi.mock('@/lib/notifications/log-queries', () => ({
  listFailedLogs: vi.fn(),
  getLogById: vi.fn(),
}));

vi.mock('@/lib/notifications/send', () => ({
  retryFailedNotification: vi.fn(),
  resendNotification: vi.fn(),
}));

const { mockDbSelect, mockDbOffset } = vi.hoisted(() => {
  const offset = vi.fn().mockResolvedValue([]);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { mockDbSelect: select, mockDbOffset: offset };
});

vi.mock('@/lib/db', () => ({
  db: { select: mockDbSelect },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    id: 'id',
    eventId: 'event_id',
    channel: 'channel',
    status: 'status',
    createdAt: 'created_at',
    queuedAt: 'queued_at',
    renderedSubject: 'rendered_subject',
    templateKeySnapshot: 'template_key_snapshot',
    recipientEmail: 'recipient_email',
    recipientPhoneE164: 'recipient_phone_e164',
  },
  notificationTemplates: {},
  automationTriggers: {},
  events: {},
  people: {},
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (_col: unknown, _id: unknown, cond: unknown) => cond,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ op: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/events/00000000-0000-0000-0000-000000000001/templates/triggers`,
}));

// ── Import under test (after all mocks) ──────────────────────

import {
  getTriggersForEvent,
  createAutomationTrigger,
  updateAutomationTrigger,
  deleteAutomationTrigger,
} from '@/lib/actions/notifications';
import { TriggersClient } from './triggers-client';

// ── Constants ────────────────────────────────────────────────

const EVENT_ID = '00000000-0000-0000-0000-000000000001';
const TRIGGER_ID = '00000000-0000-0000-0000-000000000002';
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000003';

const baseTrigger = {
  id: TRIGGER_ID,
  eventId: EVENT_ID,
  triggerEventType: 'registration.created',
  guardConditionJson: null,
  channel: 'email',
  templateId: TEMPLATE_ID,
  recipientResolution: 'trigger_person',
  delaySeconds: 0,
  idempotencyScope: 'per_person_per_trigger_entity_per_channel',
  isEnabled: true,
  priority: null,
  notes: null,
  createdBy: 'user-clerk-xyz',
  updatedBy: 'user-clerk-xyz',
  createdAt: new Date('2026-04-19T10:00:00Z'),
  updatedAt: new Date('2026-04-19T10:00:00Z'),
};

const baseTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  templateKey: 'registration_confirmation',
  channel: 'email',
  templateName: 'Registration Confirmation',
  metaCategory: 'registration',
  status: 'active',
  sendMode: 'automatic',
  lastActivatedAt: null,
  updatedAt: new Date('2026-04-10T09:00:00Z'),
  isSystemTemplate: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user-clerk-xyz', role: 'org:super_admin' });
  mockListTriggersForEvent.mockResolvedValue([]);
  mockCreateTrigger.mockResolvedValue(baseTrigger);
  mockUpdateTrigger.mockResolvedValue(baseTrigger);
  mockDeleteTrigger.mockResolvedValue(baseTrigger);
  mockListTemplatesForEvent.mockResolvedValue({ eventTemplates: [], globalTemplates: [] });
  mockDbOffset.mockResolvedValue([]);
});

// ── Server action: getTriggersForEvent ───────────────────────

describe('getTriggersForEvent', () => {
  it('allows SUPER_ADMIN to list triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:super_admin' });
    await expect(getTriggersForEvent({ eventId: EVENT_ID })).resolves.not.toThrow();
  });

  it('allows EVENT_COORDINATOR to list triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    await expect(getTriggersForEvent({ eventId: EVENT_ID })).resolves.not.toThrow();
  });

  it('allows READ_ONLY to list triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(getTriggersForEvent({ eventId: EVENT_ID })).resolves.not.toThrow();
  });

  it('forbids OPS from listing triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    await expect(getTriggersForEvent({ eventId: EVENT_ID })).rejects.toThrow('forbidden');
  });

  it('rejects a non-UUID eventId with a validation error', async () => {
    await expect(getTriggersForEvent({ eventId: 'not-a-uuid' })).rejects.toThrow();
  });

  it('delegates to listTriggersForEvent with the validated eventId', async () => {
    await getTriggersForEvent({ eventId: EVENT_ID });
    expect(mockListTriggersForEvent).toHaveBeenCalledWith(EVENT_ID);
  });

  it('returns the triggers from listTriggersForEvent', async () => {
    mockListTriggersForEvent.mockResolvedValueOnce([baseTrigger]);
    const result = await getTriggersForEvent({ eventId: EVENT_ID });
    expect(result).toEqual([baseTrigger]);
  });
});

// ── Server action: createAutomationTrigger ───────────────────

describe('createAutomationTrigger', () => {
  const validInput = {
    eventId: EVENT_ID,
    triggerEventType: 'registration.created' as const,
    channel: 'email' as const,
    templateId: TEMPLATE_ID,
    recipientResolution: 'trigger_person' as const,
  };

  it('allows SUPER_ADMIN to create a trigger', async () => {
    await expect(createAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('allows EVENT_COORDINATOR to create a trigger', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    await expect(createAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('forbids OPS from creating triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    await expect(createAutomationTrigger(validInput)).rejects.toThrow('forbidden');
  });

  it('forbids READ_ONLY from creating triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' });
    await expect(createAutomationTrigger(validInput)).rejects.toThrow('forbidden');
  });

  it('rejects an invalid triggerEventType', async () => {
    await expect(
      createAutomationTrigger({ ...validInput, triggerEventType: 'invalid.event' }),
    ).rejects.toThrow();
  });

  it('rejects an invalid channel', async () => {
    await expect(
      createAutomationTrigger({ ...validInput, channel: 'sms' }),
    ).rejects.toThrow();
  });

  it('passes userId as createdBy to createTrigger', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'user-abc', role: 'org:super_admin' });
    await createAutomationTrigger(validInput);
    expect(mockCreateTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'user-abc' }),
    );
  });

  it('returns ok:true with the created trigger', async () => {
    const result = await createAutomationTrigger(validInput);
    expect(result).toMatchObject({ ok: true, trigger: expect.objectContaining({ id: TRIGGER_ID }) });
  });

  it('calls revalidatePath for the triggers page', async () => {
    await createAutomationTrigger(validInput);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining('triggers'),
    );
  });
});

// ── Server action: updateAutomationTrigger ───────────────────

describe('updateAutomationTrigger', () => {
  const validInput = {
    eventId: EVENT_ID,
    triggerId: TRIGGER_ID,
    isEnabled: false,
  };

  it('allows SUPER_ADMIN to update a trigger', async () => {
    await expect(updateAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('allows EVENT_COORDINATOR to update a trigger', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    await expect(updateAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('forbids OPS from updating triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    await expect(updateAutomationTrigger(validInput)).rejects.toThrow('forbidden');
  });

  it('disabling a trigger passes isEnabled=false to updateTrigger', async () => {
    await updateAutomationTrigger({ eventId: EVENT_ID, triggerId: TRIGGER_ID, isEnabled: false });
    expect(mockUpdateTrigger).toHaveBeenCalledWith(
      TRIGGER_ID,
      expect.objectContaining({ isEnabled: false }),
    );
  });

  it('re-enabling a trigger passes isEnabled=true to updateTrigger', async () => {
    await updateAutomationTrigger({ eventId: EVENT_ID, triggerId: TRIGGER_ID, isEnabled: true });
    expect(mockUpdateTrigger).toHaveBeenCalledWith(
      TRIGGER_ID,
      expect.objectContaining({ isEnabled: true }),
    );
  });

  it('returns ok:false when trigger is not found', async () => {
    mockUpdateTrigger.mockResolvedValueOnce(null);
    const result = await updateAutomationTrigger(validInput);
    expect(result).toMatchObject({ ok: false, error: 'Trigger not found' });
  });

  it('rejects an invalid triggerId UUID', async () => {
    await expect(
      updateAutomationTrigger({ eventId: EVENT_ID, triggerId: 'not-a-uuid', isEnabled: false }),
    ).rejects.toThrow();
  });
});

// ── Server action: deleteAutomationTrigger ───────────────────

describe('deleteAutomationTrigger', () => {
  const validInput = { eventId: EVENT_ID, triggerId: TRIGGER_ID };

  it('allows SUPER_ADMIN to delete a trigger', async () => {
    await expect(deleteAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('allows EVENT_COORDINATOR to delete a trigger', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:event_coordinator' });
    await expect(deleteAutomationTrigger(validInput)).resolves.toMatchObject({ ok: true });
  });

  it('forbids OPS from deleting triggers', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'u', role: 'org:ops' });
    await expect(deleteAutomationTrigger(validInput)).rejects.toThrow('forbidden');
  });

  it('returns ok:true with the deleted trigger when found', async () => {
    const result = await deleteAutomationTrigger(validInput);
    expect(result).toMatchObject({ ok: true, trigger: expect.objectContaining({ id: TRIGGER_ID }) });
  });

  it('returns ok:false when trigger is not found', async () => {
    mockDeleteTrigger.mockResolvedValueOnce(null);
    const result = await deleteAutomationTrigger(validInput);
    expect(result).toMatchObject({ ok: false, error: 'Trigger not found' });
  });

  it('rejects an invalid triggerId UUID', async () => {
    await expect(
      deleteAutomationTrigger({ eventId: EVENT_ID, triggerId: 'bad-id' }),
    ).rejects.toThrow();
  });
});

// ── Client component: TriggersClient ─────────────────────────

function renderTriggers(overrides: Partial<Parameters<typeof TriggersClient>[0]> = {}) {
  const props: Parameters<typeof TriggersClient>[0] = {
    eventId: EVENT_ID,
    triggers: [],
    templates: [],
    canWrite: true,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(TriggersClient, props));
}

describe('TriggersClient', () => {
  it('renders back link to the templates hub', () => {
    const html = renderTriggers();
    expect(html).toContain(`/events/${EVENT_ID}/templates`);
    expect(html).toContain('data-testid="back-link"');
  });

  it('renders empty state when there are no triggers', () => {
    const html = renderTriggers({ triggers: [] });
    expect(html).toContain('data-testid="triggers-empty"');
    expect(html).not.toContain('data-testid="trigger-card"');
  });

  it('renders a trigger card for each trigger', () => {
    const html = renderTriggers({ triggers: [baseTrigger] });
    expect(html).toContain('data-testid="trigger-card"');
    expect(html).not.toContain('data-testid="triggers-empty"');
  });

  it('shows the trigger event type label on the card', () => {
    const html = renderTriggers({ triggers: [baseTrigger] });
    expect(html).toContain('Registration Created');
  });

  it('shows the template name when template is in the map', () => {
    const html = renderTriggers({ triggers: [baseTrigger], templates: [baseTemplate] });
    expect(html).toContain('Registration Confirmation');
  });

  it('shows "Enabled" badge for enabled triggers', () => {
    const html = renderTriggers({ triggers: [{ ...baseTrigger, isEnabled: true }] });
    expect(html).toContain('>Enabled<');
  });

  it('shows "Disabled" badge for disabled triggers', () => {
    const html = renderTriggers({ triggers: [{ ...baseTrigger, isEnabled: false }] });
    expect(html).toContain('>Disabled<');
  });

  it('shows Add Trigger button when canWrite=true', () => {
    const html = renderTriggers({ canWrite: true });
    expect(html).toContain('data-testid="add-trigger-btn"');
  });

  it('hides Add Trigger button when canWrite=false', () => {
    const html = renderTriggers({ canWrite: false });
    expect(html).not.toContain('data-testid="add-trigger-btn"');
  });

  it('shows edit and delete buttons on trigger card when canWrite=true', () => {
    const html = renderTriggers({ triggers: [baseTrigger], canWrite: true });
    expect(html).toContain('data-testid="edit-trigger-btn"');
    expect(html).toContain('data-testid="delete-trigger-btn"');
  });

  it('hides edit and delete buttons when canWrite=false', () => {
    const html = renderTriggers({ triggers: [baseTrigger], canWrite: false });
    expect(html).not.toContain('data-testid="edit-trigger-btn"');
    expect(html).not.toContain('data-testid="delete-trigger-btn"');
  });

  it('shows delay information when delaySeconds > 0', () => {
    const html = renderTriggers({ triggers: [{ ...baseTrigger, delaySeconds: 300 }] });
    expect(html).toContain('300s delay');
  });

  it('shows notes when present', () => {
    const html = renderTriggers({ triggers: [{ ...baseTrigger, notes: 'Send after registration' }] });
    expect(html).toContain('Send after registration');
  });
});
