import { describe, expect, it, vi, beforeEach } from 'vitest';
const { mockAuth, mockGetEvent, mockRedirect, mockNotFound } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetEvent: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock('@/lib/actions/event', () => ({
  getEvent: mockGetEvent,
}));

vi.mock('@/lib/auth/roles', () => ({
  ROLES: {
    READ_ONLY: 'org:read_only',
  },
}));

vi.mock('./event-settings-client', () => ({
  EventSettingsClient: vi.fn(() => null),
}));

import EventSettingsPage from './page';
import { EventSettingsClient } from './event-settings-client';

const EVENT = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'GEM India 2026',
  description: null,
  startDate: new Date('2026-05-15'),
  endDate: new Date('2026-05-18'),
  timezone: 'Asia/Kolkata',
  venueName: 'Pragati Maidan',
  venueAddress: null,
  venueCity: null,
  venueMapUrl: null,
  moduleToggles: {},
};

describe('EventSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders settings for an accessible event', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-1',
      sessionClaims: { metadata: { appRole: 'event_coordinator' } },
    });
    mockGetEvent.mockResolvedValue(EVENT);

    const result = await EventSettingsPage({
      params: Promise.resolve({ eventId: EVENT.id }),
    });

    expect(mockGetEvent).toHaveBeenCalledWith(EVENT.id);
    expect(result).toMatchObject({
      type: EventSettingsClient,
      props: expect.objectContaining({ event: EVENT, canWrite: true }),
    });
  });

  it('disables writes for read-only users', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-1',
      sessionClaims: { metadata: { appRole: 'read_only' } },
    });
    mockGetEvent.mockResolvedValue(EVENT);

    const result = await EventSettingsPage({
      params: Promise.resolve({ eventId: EVENT.id }),
    });

    expect(result).toMatchObject({
      type: EventSettingsClient,
      props: expect.objectContaining({ canWrite: false }),
    });
  });

  it('maps inaccessible events to notFound', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-1',
      sessionClaims: { metadata: { appRole: 'event_coordinator' } },
    });
    mockGetEvent.mockRejectedValue(new Error('Not found'));

    await expect(
      EventSettingsPage({
        params: Promise.resolve({ eventId: EVENT.id }),
      }),
    ).rejects.toThrow('notFound');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('redirects unauthenticated users to login', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(
      EventSettingsPage({
        params: Promise.resolve({ eventId: EVENT.id }),
      }),
    ).rejects.toThrow('redirect:/login');

    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
