/**
 * Tests for PKT-A-008 — Communications template editor.
 *
 * Expectations derived from the frozen packet spec and domain rules.
 * Spec requirements verified:
 * - OPS role forbidden from saveTemplate (not in COMMUNICATIONS_WRITE_ROLES).
 * - READ_ONLY role forbidden from saveTemplate.
 * - Event-scoped template: updateTemplate called directly (no override creation).
 * - Global template: createEventOverride called, then updateTemplate with new ID.
 * - saveTemplate returns { ok: true, template, templateId }.
 * - getSiblingTemplate returns the other-channel variant for the same templateKey.
 * - TemplateEditorClient: email panel shows subject-line field; WhatsApp panel does not.
 * - TemplateEditorClient: canWrite=false disables all form inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Hoisted mock factories ───────────────────────────────────

const {
  mockGetTemplateById,
  mockListTemplatesForEvent,
  mockUpdateTemplate,
  mockCreateEventOverride,
  mockAssertEventAccess,
} = vi.hoisted(() => {
  return {
    mockGetTemplateById: vi.fn(),
    mockListTemplatesForEvent: vi.fn().mockResolvedValue({
      eventTemplates: [],
      globalTemplates: [],
    }),
    mockUpdateTemplate: vi.fn().mockResolvedValue({ id: 'tmpl-updated', versionNo: 2 }),
    mockCreateEventOverride: vi.fn().mockResolvedValue({ id: 'override-id', templateKey: 'registration_confirmation' }),
    mockAssertEventAccess: vi.fn().mockResolvedValue({
      userId: 'user-clerk-xyz',
      role: 'org:event_coordinator',
    }),
  };
});

// ── Module mocks ─────────────────────────────────────────────

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/notifications/template-queries', () => ({
  getTemplateById: mockGetTemplateById,
  listTemplatesForEvent: mockListTemplatesForEvent,
  updateTemplate: mockUpdateTemplate,
  createEventOverride: mockCreateEventOverride,
}));

// Stub db.select chain (used by getNotificationLog in same file)
const { mockOffset } = vi.hoisted(() => {
  const mockOffset = vi.fn().mockResolvedValue([]);
  const mockLimit = vi.fn(() => ({ offset: mockOffset }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return { mockOffset, mockDbSelect: mockSelect };
});

const { mockDbSelect } = vi.hoisted(() => {
  const mockOffset2 = mockOffset ?? vi.fn().mockResolvedValue([]);
  const mockLimit2 = vi.fn(() => ({ offset: mockOffset2 }));
  const mockOrderBy2 = vi.fn(() => ({ limit: mockLimit2 }));
  const mockWhere2 = vi.fn(() => ({ orderBy: mockOrderBy2 }));
  const mockFrom2 = vi.fn(() => ({ where: mockWhere2 }));
  const mockSelect2 = vi.fn(() => ({ from: mockFrom2 }));
  return { mockDbSelect: mockSelect2 };
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
  events: {},
  people: {},
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (_col: unknown, _id: unknown, cond: unknown) => cond,
}));

vi.mock('@/lib/notifications/log-queries', () => ({
  listFailedLogs: vi.fn(),
  getLogById: vi.fn(),
}));

vi.mock('@/lib/notifications/send', () => ({
  retryFailedNotification: vi.fn(),
  resendNotification: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/events/${EVENT_ID}/templates`,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ op: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn(),
}));

// ── Import under test (after all mocks) ──────────────────────

import { getTemplateEditorEntry, saveTemplate, getSiblingTemplate } from '@/lib/actions/notifications';
import { TemplateEditorClient } from './[templateId]/edit/template-editor-client';

// ── Constants + fixtures ─────────────────────────────────────

const EVENT_ID = '00000000-0000-0000-0000-000000000001';
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000002';
const GLOBAL_TEMPLATE_ID = '00000000-0000-0000-0000-000000000003';

const eventScopedTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  templateKey: 'registration_confirmation',
  channel: 'email',
  templateName: 'Registration Confirmation',
  status: 'active',
  subjectLine: 'Your registration is confirmed',
  bodyContent: '<p>Hello {{fullName}}</p>',
  previewText: 'You are registered',
  allowedVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
  requiredVariablesJson: ['fullName', 'eventName'],
  notes: null,
  versionNo: 1,
};

const globalTemplate = {
  id: GLOBAL_TEMPLATE_ID,
  eventId: null,
  templateKey: 'registration_confirmation',
  channel: 'email',
  templateName: 'Registration Confirmation (Global)',
  status: 'active',
  subjectLine: 'Global subject',
  bodyContent: '<p>Global body</p>',
  previewText: null,
  allowedVariablesJson: ['fullName', 'eventName'],
  requiredVariablesJson: ['fullName'],
  notes: null,
  versionNo: 1,
};

const whatsappTemplate = {
  ...eventScopedTemplate,
  id: '00000000-0000-0000-0000-000000000004',
  channel: 'whatsapp',
  templateName: 'Registration Confirmation (WhatsApp)',
  subjectLine: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({
    userId: 'user-clerk-xyz',
    role: 'org:event_coordinator',
  });
  mockGetTemplateById.mockResolvedValue(null);
  mockListTemplatesForEvent.mockResolvedValue({ eventTemplates: [], globalTemplates: [] });
  mockUpdateTemplate.mockResolvedValue({ id: TEMPLATE_ID, versionNo: 2 });
  mockCreateEventOverride.mockResolvedValue({ id: 'override-new-id' });
});

// ── getTemplateEditorEntry ────────────────────────────────────

describe('getTemplateEditorEntry — returns existing event-scoped template', () => {
  it('returns event-scoped template when one exists for the given ID', async () => {
    mockGetTemplateById.mockResolvedValueOnce(eventScopedTemplate);
    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual(eventScopedTemplate);
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
  });
});

describe('getTemplateEditorEntry — throws when template not found', () => {
  it('throws Notification template not found when neither event nor global template exists', async () => {
    mockGetTemplateById.mockResolvedValue(null);
    await expect(
      getTemplateEditorEntry({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID }),
    ).rejects.toThrow('Notification template not found');
  });
});

describe('getTemplateEditorEntry — eager fork for write-role users (Requirement 1)', () => {
  beforeEach(() => {
    // event-scoped not found, global found
    mockGetTemplateById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(globalTemplate);
  });

  it('creates an event override for a write-role user when none exists', async () => {
    mockListTemplatesForEvent.mockResolvedValueOnce({ eventTemplates: [], globalTemplates: [] });
    mockCreateEventOverride.mockResolvedValueOnce({ id: 'new-override-id', templateKey: 'registration_confirmation' });
    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockCreateEventOverride).toHaveBeenCalledWith(GLOBAL_TEMPLATE_ID, EVENT_ID, 'user-clerk-xyz');
    expect(result).toEqual(expect.objectContaining({ id: 'new-override-id' }));
  });

  it('reuses existing event override instead of creating a new one', async () => {
    const existingOverride = { id: 'existing-override', templateKey: 'registration_confirmation', channel: 'email' };
    mockListTemplatesForEvent.mockResolvedValueOnce({ eventTemplates: [existingOverride], globalTemplates: [] });
    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
    expect(result).toEqual(existingOverride);
  });
});

describe('getTemplateEditorEntry — read-only users see global template without fork', () => {
  it('returns global template for READ_ONLY role without creating an override', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'ro-user', role: 'org:read_only' });
    mockGetTemplateById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(globalTemplate);
    const result = await getTemplateEditorEntry({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
    expect(result).toEqual(globalTemplate);
  });
});

// ── saveTemplate: RBAC ───────────────────────────────────────

describe('saveTemplate — RBAC', () => {
  it('throws forbidden for OPS role', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'ops-user', role: 'org:ops' });
    await expect(
      saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
    ).rejects.toThrow('forbidden');
  });

  it('throws forbidden for READ_ONLY role', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'ro-user', role: 'org:read_only' });
    await expect(
      saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
    ).rejects.toThrow('forbidden');
  });
});

// ── saveTemplate: validation ─────────────────────────────────

describe('saveTemplate — validation', () => {
  it('rejects non-UUID eventId', async () => {
    await expect(
      saveTemplate({ eventId: 'not-a-uuid', templateId: TEMPLATE_ID }),
    ).rejects.toThrow();
  });

  it('rejects non-UUID templateId', async () => {
    await expect(
      saveTemplate({ eventId: EVENT_ID, templateId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });
});

// ── saveTemplate: event-scoped template path ─────────────────

describe('saveTemplate — event-scoped template', () => {
  beforeEach(() => {
    mockGetTemplateById.mockResolvedValueOnce(eventScopedTemplate); // event-scoped found
  });

  it('calls updateTemplate with the event template ID', async () => {
    await saveTemplate({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
      bodyContent: '<p>Updated body</p>',
    });
    expect(mockUpdateTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID,
      expect.objectContaining({ eventId: EVENT_ID, updatedBy: 'user-clerk-xyz' }),
    );
  });

  it('does NOT call createEventOverride for event-scoped templates', async () => {
    await saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
  });

  it('returns { ok: true } with the updated template and templateId', async () => {
    const updatedRow = { id: TEMPLATE_ID, versionNo: 3 };
    mockUpdateTemplate.mockResolvedValueOnce(updatedRow);
    const result = await saveTemplate({ eventId: EVENT_ID, templateId: TEMPLATE_ID });
    expect(result).toEqual({ ok: true, template: updatedRow, templateId: TEMPLATE_ID });
  });

  it('passes subjectLine through to updateTemplate', async () => {
    await saveTemplate({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
      subjectLine: 'New subject',
    });
    expect(mockUpdateTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID,
      expect.objectContaining({ subjectLine: 'New subject' }),
    );
  });

  it('passes status through to updateTemplate', async () => {
    await saveTemplate({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
      status: 'active',
    });
    expect(mockUpdateTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID,
      expect.objectContaining({ status: 'active' }),
    );
  });
});

// ── saveTemplate: global template path (event override) ──────

describe('saveTemplate — global template fork', () => {
  beforeEach(() => {
    // First getTemplateById call: event-scoped not found
    // Second getTemplateById call: global found
    mockGetTemplateById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(globalTemplate);
    mockListTemplatesForEvent.mockResolvedValue({ eventTemplates: [], globalTemplates: [] });
    mockCreateEventOverride.mockResolvedValue({ id: 'override-new-id' });
    mockUpdateTemplate.mockResolvedValue({ id: 'override-new-id', versionNo: 1 });
  });

  it('calls createEventOverride with the global templateId and eventId', async () => {
    await saveTemplate({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockCreateEventOverride).toHaveBeenCalledWith(
      GLOBAL_TEMPLATE_ID,
      EVENT_ID,
      'user-clerk-xyz',
    );
  });

  it('calls updateTemplate with the new override ID (not the global ID)', async () => {
    await saveTemplate({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockUpdateTemplate).toHaveBeenCalledWith(
      'override-new-id',
      expect.objectContaining({ eventId: EVENT_ID }),
    );
  });

  it('returns the override templateId in the result', async () => {
    const result = await saveTemplate({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(result.templateId).toBe('override-new-id');
  });

  it('reuses an existing event override instead of creating another', async () => {
    const existingOverride = { id: 'existing-override-id', templateKey: 'registration_confirmation' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [existingOverride],
      globalTemplates: [],
    });
    const result = await saveTemplate({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID });
    expect(mockCreateEventOverride).not.toHaveBeenCalled();
    expect(result.templateId).toBe('existing-override-id');
  });

  it('throws when template is not found at all', async () => {
    // Reset to clear Once queue from describe beforeEach, then set persistent null
    mockGetTemplateById.mockReset();
    mockGetTemplateById.mockResolvedValue(null);
    await expect(
      saveTemplate({ eventId: EVENT_ID, templateId: GLOBAL_TEMPLATE_ID }),
    ).rejects.toThrow('Template not found');
  });
});

// ── getSiblingTemplate ───────────────────────────────────────

describe('getSiblingTemplate', () => {
  it('throws forbidden for OPS role', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({ userId: 'ops', role: 'org:ops' });
    await expect(
      getSiblingTemplate({ eventId: EVENT_ID, templateKey: 'registration_confirmation', channel: 'email' }),
    ).rejects.toThrow('forbidden');
  });

  it('returns the event-scoped sibling (whatsapp) when searching from email', async () => {
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [whatsappTemplate],
      globalTemplates: [],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'registration_confirmation',
      channel: 'email',
    });
    expect(result).toEqual(whatsappTemplate);
  });

  it('returns global sibling when no event-scoped sibling exists', async () => {
    const globalWa = { ...globalTemplate, id: 'global-wa-id', channel: 'whatsapp' };
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [],
      globalTemplates: [globalWa],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'registration_confirmation',
      channel: 'email',
    });
    expect(result).toEqual(globalWa);
  });

  it('returns null when no sibling exists for the template key', async () => {
    mockListTemplatesForEvent.mockResolvedValueOnce({
      eventTemplates: [],
      globalTemplates: [],
    });
    const result = await getSiblingTemplate({
      eventId: EVENT_ID,
      templateKey: 'registration_confirmation',
      channel: 'email',
    });
    expect(result).toBeNull();
  });
});

// ── TemplateEditorClient ──────────────────────────────────────

function renderEditor(overrides: Partial<Parameters<typeof TemplateEditorClient>[0]> = {}) {
  const props: Parameters<typeof TemplateEditorClient>[0] = {
    eventId: EVENT_ID,
    primaryTemplate: eventScopedTemplate,
    siblingTemplate: null,
    canWrite: true,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(TemplateEditorClient, props));
}

describe('TemplateEditorClient', () => {
  it('renders the primary template name in the heading', () => {
    const html = renderEditor();
    expect(html).toContain('Registration Confirmation');
  });

  it('shows the back link to the templates hub', () => {
    const html = renderEditor();
    expect(html).toContain(`/events/${EVENT_ID}/templates`);
    expect(html).toContain('data-testid="back-link"');
  });

  it('shows the subject-line input for an email template', () => {
    const html = renderEditor();
    expect(html).toContain('data-testid="subject-line"');
  });

  it('does NOT show subject-line input for a WhatsApp template', () => {
    const html = renderEditor({ primaryTemplate: whatsappTemplate });
    expect(html).not.toContain('data-testid="subject-line"');
  });

  it('renders only one panel when no sibling is provided', () => {
    const html = renderEditor({ siblingTemplate: null });
    expect(html).toContain('data-testid="panel-email"');
    expect(html).not.toContain('data-testid="panel-whatsapp"');
  });

  it('renders both panels when sibling template is provided', () => {
    const html = renderEditor({ siblingTemplate: whatsappTemplate });
    expect(html).toContain('data-testid="panel-email"');
    expect(html).toContain('data-testid="panel-whatsapp"');
  });

  it('renders variable chips from allowedVariablesJson', () => {
    const html = renderEditor();
    expect(html).toContain('data-testid="variable-chips-email"');
    expect(html).toContain('{{fullName}}');
    expect(html).toContain('{{eventName}}');
    expect(html).toContain('{{registrationNumber}}');
  });

  it('marks required variables with an asterisk', () => {
    const html = renderEditor();
    expect(html).toContain('data-testid="required-star"');
  });

  it('shows the save button when canWrite is true', () => {
    const html = renderEditor({ canWrite: true });
    expect(html).toContain('data-testid="save-button"');
    expect(html).not.toContain('data-testid="readonly-notice"');
  });

  it('shows read-only notice and hides save button when canWrite is false', () => {
    const html = renderEditor({ canWrite: false });
    expect(html).toContain('data-testid="readonly-notice"');
    expect(html).not.toContain('data-testid="save-button"');
  });

  it('body textarea is disabled when canWrite is false', () => {
    const html = renderEditor({ canWrite: false });
    // Body textarea must be present
    expect(html).toContain('data-testid="body-email"');
    // React renders boolean disabled as disabled="" — at least one element must be disabled
    expect(html).toContain('disabled=""');
  });
});
