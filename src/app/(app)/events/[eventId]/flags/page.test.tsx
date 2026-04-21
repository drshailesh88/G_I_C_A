import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockAuth, mockRedirect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/roles', () => ({
  ROLES: {
    SUPER_ADMIN: 'org:super_admin',
  },
}));

vi.mock('./flags-dashboard', () => ({
  FlagsDashboard: vi.fn(({ eventId }: { eventId: string }) => ({
    type: 'div',
    props: { children: `flags:${eventId}` },
  })),
}));

import FlagsPage from './page';
import { FlagsDashboard } from './flags-dashboard';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('FlagsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      userId: 'super-1',
      sessionClaims: { metadata: { appRole: 'super_admin' } },
    });
  });

  it('renders the flags dashboard for super admins', async () => {
    const result = await FlagsPage({
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(result).toMatchObject({
      type: FlagsDashboard,
      props: { eventId: EVENT_ID },
    });
  });

  it('redirects unauthenticated users to login', async () => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null });

    await expect(
      FlagsPage({
        params: Promise.resolve({ eventId: EVENT_ID }),
      }),
    ).rejects.toThrow('redirect:/login');

    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('redirects non-super-admin users back to the event workspace', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      sessionClaims: { metadata: { appRole: 'event_coordinator' } },
    });

    await expect(
      FlagsPage({
        params: Promise.resolve({ eventId: EVENT_ID }),
      }),
    ).rejects.toThrow(`redirect:/events/${EVENT_ID}`);

    expect(mockRedirect).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
  });
});
