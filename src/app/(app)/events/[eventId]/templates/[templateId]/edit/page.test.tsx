import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  mockGetTemplateEditorEntry,
  mockGetSiblingTemplate,
  mockAssertEventAccess,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetTemplateEditorEntry: vi.fn(),
  mockGetSiblingTemplate: vi.fn().mockResolvedValue(null),
  mockAssertEventAccess: vi.fn().mockResolvedValue({
    userId: 'user-xyz',
    role: 'org:event_coordinator',
  }),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@/lib/actions/notifications', () => ({
  getTemplateEditorEntry: mockGetTemplateEditorEntry,
  getSiblingTemplate: mockGetSiblingTemplate,
  saveTemplate: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import TemplateEditEntryPage from './page';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440010';

const baseTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  templateKey: 'registration_confirmation',
  channel: 'email',
  templateName: 'Registration Confirmation',
  status: 'active',
  subjectLine: 'Your registration',
  bodyContent: '<p>Hello</p>',
  previewText: null,
  allowedVariablesJson: [],
  requiredVariablesJson: [],
  notes: null,
  versionNo: 1,
};

describe('TemplateEditEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-xyz', role: 'org:event_coordinator' });
    mockGetSiblingTemplate.mockResolvedValue(null);
  });

  it('loads the event-scoped editor handoff for a template card', async () => {
    mockGetTemplateEditorEntry.mockResolvedValue(baseTemplate);

    const result = await TemplateEditEntryPage({
      params: Promise.resolve({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
    });

    expect(mockGetTemplateEditorEntry).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      templateId: TEMPLATE_ID,
    });

    const html = renderToStaticMarkup(result);
    expect(html).toContain('Template Editor');
    expect(html).toContain('Registration Confirmation');
    expect(html).toContain(`/events/${EVENT_ID}/templates`);
  });

  it('returns notFound when the template id is not valid for the active event or globals', async () => {
    mockGetTemplateEditorEntry.mockRejectedValue(
      new Error('Notification template not found'),
    );

    await expect(
      TemplateEditEntryPage({
        params: Promise.resolve({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
      }),
    ).rejects.toThrow('notFound');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('redirects back to the hub on access failures', async () => {
    mockGetTemplateEditorEntry.mockRejectedValue(new Error('forbidden'));

    await expect(
      TemplateEditEntryPage({
        params: Promise.resolve({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
      }),
    ).rejects.toThrow(`redirect:/events/${EVENT_ID}/templates`);
    expect(mockRedirect).toHaveBeenCalledWith(`/events/${EVENT_ID}/templates`);
  });

  it('redirects to the event override URL when the returned template has a different ID (URL normalization)', async () => {
    const OVERRIDE_ID = '550e8400-e29b-41d4-a716-446655440099';
    mockGetTemplateEditorEntry.mockResolvedValue({ ...baseTemplate, id: OVERRIDE_ID, eventId: EVENT_ID });

    await expect(
      TemplateEditEntryPage({
        params: Promise.resolve({ eventId: EVENT_ID, templateId: TEMPLATE_ID }),
      }),
    ).rejects.toThrow(`redirect:/events/${EVENT_ID}/templates/${OVERRIDE_ID}/edit`);
    expect(mockRedirect).toHaveBeenCalledWith(`/events/${EVENT_ID}/templates/${OVERRIDE_ID}/edit`);
  });
});
