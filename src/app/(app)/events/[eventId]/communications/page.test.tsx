import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { mockGetRecentNotifications } = vi.hoisted(() => ({
  mockGetRecentNotifications: vi.fn(),
}));

vi.mock('@/lib/actions/dashboard', () => ({
  getRecentNotifications: mockGetRecentNotifications,
}));

import CommunicationsPage from './page';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('CommunicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders recent notifications and the failed notifications shortcut', async () => {
    mockGetRecentNotifications.mockResolvedValue({
      unreadCount: 2,
      items: [
        {
          id: 'log-1',
          subject: 'Travel update',
          recipientName: 'Dr. Priya Sharma',
          recipientContact: 'priya@example.com',
          channel: 'email',
          status: 'sent',
          queuedAt: new Date('2026-04-18T03:00:00Z'),
          isUnread: true,
        },
      ],
    });

    const result = await CommunicationsPage({
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(mockGetRecentNotifications).toHaveBeenCalledWith(EVENT_ID);
    expect(result).toMatchObject({
      type: 'div',
      props: expect.objectContaining({
        className: expect.stringContaining('space-y-6'),
      }),
    });

    const content = renderToStaticMarkup(result);
    expect(content).toContain('Communications');
    expect(content).toContain('Recent notification activity for this event.');
    expect(content).toContain('Travel update');
    expect(content).toContain(`/events/${EVENT_ID}/communications/failed`);
  });

  it('renders an empty state when no notifications are present', async () => {
    mockGetRecentNotifications.mockResolvedValue({
      unreadCount: 0,
      items: [],
    });

    const result = await CommunicationsPage({
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(renderToStaticMarkup(result)).toContain(
      'No notifications have been logged for this event yet.',
    );
  });
});
