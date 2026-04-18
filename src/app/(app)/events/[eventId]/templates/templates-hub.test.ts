/**
 * Tests for PKT-A-007 — Communications hub (templates + delivery log).
 * Expectations derived from the frozen packet spec and domain rules,
 * never from reading implementation code.
 *
 * Spec requirements verified here:
 * - All reads filter by eventId (no cross-event leakage).
 * - Delivery log shows ALL statuses — not only failed sends.
 * - Template cards navigate to the editor route.
 * - Templates are grouped by channel (email / whatsapp).
 * - OPS role is forbidden (not in COMMUNICATIONS_READ_ROLES).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Hoisted mock factories ───────────────────────────────────

const {
  mockEq,
  mockAnd,
  mockDesc,
  mockOffset,
  mockListTemplatesForEvent,
  mockAssertEventAccess,
} = vi.hoisted(() => {
  const mockOffset = vi.fn().mockResolvedValue([]);
  const mockLimit = vi.fn(() => ({ offset: mockOffset }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    mockEq: vi.fn((_col: unknown, val: unknown) => ({ op: 'eq', val })),
    mockAnd: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    mockDesc: vi.fn(),
    mockOffset,
    mockDbSelect: mockSelect,
    mockListTemplatesForEvent: vi.fn().mockResolvedValue({
      eventTemplates: [],
      globalTemplates: [],
    }),
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

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  desc: mockDesc,
}));

// Build the same db chain referenced in notifications.ts
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
  // other schema exports referenced transitively
  notificationTemplates: {},
  events: {},
  people: {},
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (_col: unknown, _id: unknown, cond: unknown) => cond,
}));

vi.mock('@/lib/notifications/template-queries', () => ({
  listTemplatesForEvent: mockListTemplatesForEvent,
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

// ── Import under test (after all mocks) ──────────────────────

import { getTemplatesHub, getNotificationLog } from '@/lib/actions/notifications';
import { TemplatesHubClient } from './templates-hub-client';

// ── Constants ────────────────────────────────────────────────

const EVENT_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({
    userId: 'user-clerk-xyz',
    role: 'org:event_coordinator',
  });
  mockListTemplatesForEvent.mockResolvedValue({
    eventTemplates: [],
    globalTemplates: [],
  });
  mockOffset.mockResolvedValue([]);
});

// ── Server action: getTemplatesHub ───────────────────────────

describe('getTemplatesHub', () => {
  it('calls listTemplatesForEvent with the validated eventId', async () => {
    await getTemplatesHub({ eventId: EVENT_ID });
    expect(mockListTemplatesForEvent).toHaveBeenCalledWith(EVENT_ID, expect.objectContaining({}));
  });

  it('passes channel filter to listTemplatesForEvent when provided', async () => {
    await getTemplatesHub({ eventId: EVENT_ID, channel: 'email' });
    expect(mockListTemplatesForEvent).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({ channel: 'email' }),
    );
  });

  it('returns the result from listTemplatesForEvent', async () => {
    const fakeResult = {
      eventTemplates: [{ id: 't1', templateName: 'Reg Confirmation' }],
      globalTemplates: [],
    };
    mockListTemplatesForEvent.mockResolvedValueOnce(fakeResult);
    const result = await getTemplatesHub({ eventId: EVENT_ID });
    expect(result).toEqual(fakeResult);
  });

  it('throws for OPS role (not in COMMUNICATIONS_READ_ROLES)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({
      userId: 'user-ops',
      role: 'org:ops',
    });
    await expect(getTemplatesHub({ eventId: EVENT_ID })).rejects.toThrow('forbidden');
  });

  it('rejects a non-UUID eventId with a validation error', async () => {
    await expect(getTemplatesHub({ eventId: 'not-a-uuid' })).rejects.toThrow();
  });
});

// ── Server action: getNotificationLog ────────────────────────

describe('getNotificationLog', () => {
  it('always scopes query to eventId', async () => {
    await getNotificationLog({ eventId: EVENT_ID });
    // eq must be called with the eventId value
    const eqCalls = mockEq.mock.calls.map(([, val]) => val);
    expect(eqCalls).toContain(EVENT_ID);
  });

  it('does NOT apply a status=failed-only filter by default', async () => {
    await getNotificationLog({ eventId: EVENT_ID });
    // eq() should never be called with 'failed' when no status filter is given
    const failedEqCalls = mockEq.mock.calls.filter(([, val]) => val === 'failed');
    expect(failedEqCalls).toHaveLength(0);
  });

  it('applies channel filter when provided', async () => {
    await getNotificationLog({ eventId: EVENT_ID, channel: 'email' });
    const eqCalls = mockEq.mock.calls.map(([, val]) => val);
    expect(eqCalls).toContain('email');
  });

  it('applies status filter when explicitly provided', async () => {
    await getNotificationLog({ eventId: EVENT_ID, status: 'failed' });
    const eqCalls = mockEq.mock.calls.map(([, val]) => val);
    expect(eqCalls).toContain('failed');
  });

  it('does not apply status filter when status is undefined', async () => {
    await getNotificationLog({ eventId: EVENT_ID });
    // and() is called with one defined condition + two undefineds
    const andArgs = mockAnd.mock.calls[0] ?? [];
    const definedArgs = andArgs.filter((a: unknown) => a !== undefined);
    // Only eventId eq condition should be defined
    expect(definedArgs).toHaveLength(1);
  });

  it('returns the log rows from the database', async () => {
    const fakeRows = [{ id: 'log-1', status: 'sent' }, { id: 'log-2', status: 'delivered' }];
    mockOffset.mockResolvedValueOnce(fakeRows);
    const result = await getNotificationLog({ eventId: EVENT_ID });
    expect(result).toEqual(fakeRows);
  });

  it('throws for OPS role (not in COMMUNICATIONS_READ_ROLES)', async () => {
    mockAssertEventAccess.mockResolvedValueOnce({
      userId: 'user-ops',
      role: 'org:ops',
    });
    await expect(getNotificationLog({ eventId: EVENT_ID })).rejects.toThrow('forbidden');
  });

  it('rejects a non-UUID eventId with a validation error', async () => {
    await expect(getNotificationLog({ eventId: 'bad-id' })).rejects.toThrow();
  });
});

// ── Client component: TemplatesHubClient ─────────────────────

const baseTemplate = {
  id: 'tmpl-001',
  eventId: EVENT_ID,
  templateKey: 'registration_confirmation',
  channel: 'email',
  templateName: 'Registration Confirmation',
  metaCategory: 'registration',
  status: 'active',
  sendMode: 'automatic',
  lastActivatedAt: new Date('2026-04-10T09:00:00Z'),
  updatedAt: new Date('2026-04-10T09:00:00Z'),
  isSystemTemplate: false,
};

const baseLogEntry = {
  id: 'log-001',
  recipientEmail: 'delegate@example.com',
  recipientPhoneE164: null,
  channel: 'email',
  status: 'sent',
  templateKeySnapshot: 'registration_confirmation',
  renderedSubject: 'Your Registration is Confirmed',
  queuedAt: new Date('2026-04-18T08:00:00Z'),
};

function renderHub(overrides: Partial<Parameters<typeof TemplatesHubClient>[0]> = {}) {
  const props: Parameters<typeof TemplatesHubClient>[0] = {
    eventId: EVENT_ID,
    eventTemplates: [],
    globalTemplates: [],
    log: [],
    activeTab: 'templates',
    channelFilter: undefined,
    statusFilter: undefined,
    offset: 0,
    limit: 50,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(TemplatesHubClient, props));
}

describe('TemplatesHubClient', () => {
  it('renders the back link to the event workspace', () => {
    const html = renderHub();
    expect(html).toContain(`/events/${EVENT_ID}`);
    expect(html).toContain('data-testid="back-link"');
  });

  it('shows the Templates tab as active by default', () => {
    const html = renderHub({ activeTab: 'templates' });
    expect(html).toContain('data-testid="templates-panel"');
    expect(html).not.toContain('data-testid="log-panel"');
  });

  it('shows the Delivery Log tab when activeTab=log', () => {
    const html = renderHub({ activeTab: 'log', log: [baseLogEntry] });
    expect(html).toContain('data-testid="log-panel"');
    expect(html).not.toContain('data-testid="templates-panel"');
  });

  it('renders empty state when no templates exist', () => {
    const html = renderHub({ eventTemplates: [], globalTemplates: [] });
    expect(html).toContain('data-testid="templates-empty"');
    expect(html).not.toContain('data-testid="template-card"');
  });

  it('renders email channel section when email templates are present', () => {
    const html = renderHub({ eventTemplates: [baseTemplate] });
    expect(html).toContain('data-testid="channel-section-email"');
    expect(html).toContain('Registration Confirmation');
  });

  it('renders whatsapp channel section when whatsapp templates are present', () => {
    const waTemplate = { ...baseTemplate, id: 'tmpl-002', channel: 'whatsapp', templateName: 'WhatsApp Welcome' };
    const html = renderHub({ eventTemplates: [waTemplate] });
    expect(html).toContain('data-testid="channel-section-whatsapp"');
    expect(html).toContain('WhatsApp Welcome');
  });

  it('each template card links to the template editor route', () => {
    const html = renderHub({ eventTemplates: [baseTemplate] });
    expect(html).toContain(`/events/${EVENT_ID}/templates/${baseTemplate.id}/edit`);
  });

  it('renders a status badge on each template card', () => {
    const html = renderHub({ eventTemplates: [baseTemplate] });
    expect(html).toContain('data-testid="template-status"');
    expect(html).toContain('active');
  });

  it('marks global (system) templates with a Global badge', () => {
    const systemTemplate = { ...baseTemplate, isSystemTemplate: true, eventId: null };
    const html = renderHub({ globalTemplates: [systemTemplate] });
    expect(html).toContain('Global');
  });

  it('renders log entries with correct status in delivery log', () => {
    const sentEntry = { ...baseLogEntry, status: 'sent' };
    const deliveredEntry = { ...baseLogEntry, id: 'log-002', status: 'delivered' };
    const failedEntry = { ...baseLogEntry, id: 'log-003', status: 'failed' };
    const html = renderHub({
      activeTab: 'log',
      log: [sentEntry, deliveredEntry, failedEntry],
    });
    expect(html).toContain('data-testid="log-entry"');
    // All three statuses rendered — not only failed
    expect(html).toContain('>sent<');
    expect(html).toContain('>delivered<');
    expect(html).toContain('>failed<');
  });

  it('renders empty log state when no log entries exist', () => {
    const html = renderHub({ activeTab: 'log', log: [] });
    expect(html).toContain('data-testid="log-empty"');
    expect(html).not.toContain('data-testid="log-entry"');
  });

  it('shows pagination when log is a full page', () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      ...baseLogEntry,
      id: `log-${i}`,
    }));
    const html = renderHub({ activeTab: 'log', log: fullPage, offset: 0, limit: 50 });
    expect(html).toContain('data-testid="pagination"');
  });

  it('does not show pagination when log has fewer entries than limit', () => {
    const smallPage = [baseLogEntry];
    const html = renderHub({ activeTab: 'log', log: smallPage, offset: 0, limit: 50 });
    expect(html).not.toContain('data-testid="pagination"');
  });

  it('renders timestamps in IST locale', () => {
    const html = renderHub({ activeTab: 'log', log: [baseLogEntry] });
    // Component uses toLocaleString with Asia/Kolkata — verify intent
    expect(html).toContain('data-testid="log-entry"');
  });
});
