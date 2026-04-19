import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  mockGetTriggersForEvent,
  mockGetTemplatesHub,
  mockAssertEventAccess,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetTriggersForEvent: vi.fn().mockResolvedValue([]),
  mockGetTemplatesHub: vi.fn().mockResolvedValue({
    eventTemplates: [],
    globalTemplates: [],
  }),
  mockAssertEventAccess: vi.fn().mockResolvedValue({
    userId: 'user-xyz',
    role: 'org:event_coordinator',
  }),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('@/lib/actions/notifications', () => ({
  getTriggersForEvent: mockGetTriggersForEvent,
  getTemplatesHub: mockGetTemplatesHub,
  createAutomationTrigger: vi.fn(),
  updateAutomationTrigger: vi.fn(),
  deleteAutomationTrigger: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import TriggersPage from './page';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('TriggersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({
      userId: 'user-xyz',
      role: 'org:event_coordinator',
    });
    mockGetTriggersForEvent.mockResolvedValue([]);
    mockGetTemplatesHub.mockResolvedValue({
      eventTemplates: [],
      globalTemplates: [],
    });
  });

  it('renders the automation triggers page inside the event workspace route', async () => {
    const result = await TriggersPage({
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(mockGetTriggersForEvent).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(mockGetTemplatesHub).toHaveBeenCalledWith({ eventId: EVENT_ID });

    const html = renderToStaticMarkup(result);
    expect(html).toContain('Automation Triggers');
    expect(html).toContain(`/events/${EVENT_ID}`);
  });

  it('redirects to the event workspace when event access fails', async () => {
    mockAssertEventAccess.mockRejectedValueOnce(new Error('forbidden'));

    await expect(
      TriggersPage({
        params: Promise.resolve({ eventId: EVENT_ID }),
      }),
    ).rejects.toThrow(`redirect:/events/${EVENT_ID}`);
    expect(mockRedirect).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
  });
});
