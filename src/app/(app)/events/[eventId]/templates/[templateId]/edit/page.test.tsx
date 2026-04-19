import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  mockGetTemplateEditorEntry,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetTemplateEditorEntry: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@/lib/actions/notifications', () => ({
  getTemplateEditorEntry: mockGetTemplateEditorEntry,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

import TemplateEditEntryPage from './page';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('TemplateEditEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the event-scoped editor handoff for a template card', async () => {
    mockGetTemplateEditorEntry.mockResolvedValue({
      id: TEMPLATE_ID,
      eventId: EVENT_ID,
      templateKey: 'registration_confirmation',
      channel: 'email',
      templateName: 'Registration Confirmation',
      status: 'active',
    });

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
});
