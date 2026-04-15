import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAssertEventAccess, mockGetEventPeople, mockRedirect, mockNotFound, mockDb } = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockGetEventPeople: vi.fn(),
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/actions/person', () => ({
  getEventPeople: mockGetEventPeople,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/events', () => ({
  events: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('./event-people-client', () => ({
  EventPeopleClient: () => null,
}));

import EventPeoplePage from './page';

function mockEventQuery(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe('EventPeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('super admin accessing non-existent event gets notFound', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'super-1', role: 'org:super_admin' });
    mockEventQuery([]);

    await expect(
      EventPeoplePage({ params: Promise.resolve({ eventId: '00000000-0000-0000-0000-000000000000' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockAssertEventAccess).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockGetEventPeople).not.toHaveBeenCalled();
  });

  it('super admin accessing existing event gets people data', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'super-1', role: 'org:super_admin' });
    mockEventQuery([{ id: 'event-B' }]);
    mockGetEventPeople.mockResolvedValue([{ id: 'p1', fullName: 'Test' }]);

    await EventPeoplePage({ params: Promise.resolve({ eventId: 'event-B' }) });

    expect(mockAssertEventAccess).toHaveBeenCalledWith('event-B');
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockGetEventPeople).toHaveBeenCalledWith('event-B');
  });

  it('unauthorized user gets redirected to login', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Not found'));

    await expect(
      EventPeoplePage({ params: Promise.resolve({ eventId: 'event-A' }) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
