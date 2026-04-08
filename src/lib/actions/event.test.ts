import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess, mockGetEventListContext } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockGetEventListContext: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  getEventListContext: mockGetEventListContext,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import { createEvent, getEvent, getEvents, updateEventStatus } from './event';

function buildFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = {
    name: 'GEM India Summit 2026',
    startDate: '2026-05-15',
    endDate: '2026-05-18',
    venueName: 'Pragati Maidan',
    moduleToggles: JSON.stringify({
      scientific_program: true,
      registration: true,
      travel_accommodation: true,
      certificates: true,
      qr_checkin: true,
      transport_planning: true,
      communications: true,
    }),
    ...overrides,
  };

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  return formData;
}

function mockSelectById(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where, limit }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe('event actions — existing adversarial tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
    mockGetEventListContext.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin', isSuperAdmin: true });
  });

  it('createEvent should reject malformed moduleToggles with Zod before parsing', async () => {
    const formData = buildFormData({ moduleToggles: '{' });

    await expect(createEvent(formData)).rejects.toBeInstanceOf(ZodError);
  });

  it('getEvent should reject invalid event ids with Zod before querying', async () => {
    mockSelectById([]);

    await expect(getEvent('not-a-uuid')).rejects.toBeInstanceOf(ZodError);
  });

  it('getEvent should deny access when assertEventAccess rejects', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden: you do not have access to this event'));
    mockSelectById([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Private Event',
        status: 'draft',
        createdBy: 'owner-7',
      },
    ]);

    await expect(getEvent('11111111-1111-1111-1111-111111111111')).rejects.toThrow(/unauthorized|forbidden/i);
  });

  it('updateEventStatus should deny status changes when assertEventAccess rejects', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden: you do not have access to this event'));
    mockSelectById([
      {
        id: '22222222-2222-2222-2222-222222222222',
        status: 'draft',
        createdBy: 'owner-9',
      },
    ]);

    await expect(
      updateEventStatus('22222222-2222-2222-2222-222222222222', 'published'),
    ).rejects.toThrow(/unauthorized|forbidden/i);
  });

  it('updateEventStatus should fail when the event status changed after it was read', async () => {
    const persistedEvent = {
      id: '33333333-3333-3333-3333-333333333333',
      status: 'draft',
      createdBy: 'owner-3',
      updatedBy: 'owner-3',
    };

    mockAssertEventAccess.mockResolvedValue({ userId: 'owner-3', role: 'org:super_admin' });
    mockSelectById([{ ...persistedEvent }]);

    let updatePayload: Record<string, unknown> | undefined;
    const where = vi.fn().mockImplementation(async () => {
      persistedEvent.status = 'cancelled';
      Object.assign(persistedEvent, updatePayload);
      return [persistedEvent];
    });
    const set = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return { where };
    });
    mockDb.update.mockReturnValue({ set });

    await expect(
      updateEventStatus('33333333-3333-3333-3333-333333333333', 'published'),
    ).rejects.toThrow(/stale|concurrent|conflict/i);
  });
});

describe('event actions — REQ 9/10/11 access control tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
  });

  // REQ 10: Super Admin sees all events
  it('getEvents returns all events for super admin (no join filtering)', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'admin-1',
      role: 'org:super_admin',
      isSuperAdmin: true,
    });

    const allEvents = [
      { id: 'e1', name: 'Event 1' },
      { id: 'e2', name: 'Event 2' },
    ];

    const orderBy = vi.fn().mockResolvedValue(allEvents);
    const from = vi.fn(() => ({ orderBy }));
    mockDb.select.mockReturnValue({ from });

    const result = await getEvents();
    expect(result).toEqual(allEvents);
    expect(from).toHaveBeenCalled();
  });

  // REQ 10: Non-super-admin sees only assigned events
  it('getEvents uses innerJoin for non-super-admin users', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'coordinator-1',
      role: 'org:event_coordinator',
      isSuperAdmin: false,
    });

    const assignedEvents = [{ id: 'e1', name: 'Assigned Event' }];

    const orderBy = vi.fn().mockResolvedValue(assignedEvents);
    const innerJoin = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn(() => ({ from }));
    mockDb.select.mockImplementation(select);

    const result = await getEvents();
    expect(result).toEqual(assignedEvents);
    expect(innerJoin).toHaveBeenCalled();
  });

  // REQ 10: Unauthenticated user gets rejected
  it('getEvents rejects unauthenticated users', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: '',
      role: null,
      isSuperAdmin: false,
    });

    await expect(getEvents()).rejects.toThrow('Unauthorized');
  });

  // REQ 9: getEvent uses assertEventAccess
  it('getEvent calls assertEventAccess before querying', async () => {
    const eventId = '44444444-4444-4444-4444-444444444444';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:event_coordinator' });
    mockSelectById([{ id: eventId, name: 'Test', status: 'draft' }]);

    await getEvent(eventId);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(eventId);
  });

  // REQ 9: updateEventStatus uses assertEventAccess
  it('updateEventStatus calls assertEventAccess before mutating', async () => {
    const eventId = '55555555-5555-5555-5555-555555555555';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    // Mock select for reading event + verification read
    const selectResults = [
      [{ id: eventId, status: 'draft', createdBy: 'user-1' }],
      [{ id: eventId, status: 'published' }],
    ];
    let selectCallCount = 0;
    const limit = vi.fn().mockImplementation(() => selectResults[selectCallCount++]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    const updateWhere = vi.fn().mockResolvedValue([]);
    const set = vi.fn(() => ({ where: updateWhere }));
    mockDb.update.mockReturnValue({ set });

    await updateEventStatus(eventId, 'published');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(eventId);
  });
});
