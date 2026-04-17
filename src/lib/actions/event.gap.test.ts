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

import { createEvent, getEvent, getEvents, getEventBySlug, updateEventStatus } from './event';

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

function mockInsertChain(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn(() => ({ returning }));
  mockDb.insert.mockReturnValue({ values });
  return { values, returning };
}

function mockSelectById(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where, limit }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe('createEvent — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it('rejects unauthenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(createEvent(buildFormData())).rejects.toThrow('Unauthorized');
  });

  it('returns structured validation error for empty name (no db.insert called)', async () => {
    const result = await createEvent(buildFormData({ name: '' }));
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.name.length).toBeGreaterThan(0);
    }
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns structured validation error for endDate before startDate (no db.insert called)', async () => {
    const result = await createEvent(buildFormData({ startDate: '2026-06-01', endDate: '2026-05-01' }));
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) {
      expect(result.fieldErrors.endDate).toBeDefined();
      expect(result.fieldErrors.endDate.length).toBeGreaterThan(0);
    }
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns structured validation error for all empty required fields', async () => {
    const result = await createEvent(buildFormData({ name: '', startDate: '', endDate: '', venueName: '' }));
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.startDate).toBeDefined();
      expect(result.fieldErrors.endDate).toBeDefined();
      expect(result.fieldErrors.venueName).toBeDefined();
    }
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates event with status draft', async () => {
    const createdEvent = { id: 'new-event-id', status: 'draft' };

    // Mock org lookup
    const orgLimit = vi.fn().mockResolvedValue([{ id: 'org-1' }]);
    const orgFrom = vi.fn(() => ({ limit: orgLimit }));

    // Track insert calls
    const insertCalls: Record<string, unknown>[] = [];
    const insertReturning = vi.fn().mockResolvedValue([createdEvent]);
    const insertValues = vi.fn((val: Record<string, unknown>) => {
      insertCalls.push(val);
      return { returning: insertReturning };
    });

    // Mock assignment insert (no returning needed)
    const assignmentReturning = vi.fn().mockResolvedValue([]);
    const assignmentValues = vi.fn(() => ({ returning: assignmentReturning }));

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return { values: insertValues };
      }
      return { values: assignmentValues };
    });

    mockDb.select.mockReturnValue({ from: orgFrom });

    const result = await createEvent(buildFormData());
    expect(result).toEqual({ ok: true, id: 'new-event-id' });

    // Verify status was draft
    expect(insertCalls[0]).toMatchObject({ status: 'draft' });

    // Verify createdBy/updatedBy
    expect(insertCalls[0]).toMatchObject({ createdBy: 'user-1', updatedBy: 'user-1' });
  });

  it('generates slug from event name', async () => {
    const createdEvent = { id: 'slug-test-id' };

    const orgLimit = vi.fn().mockResolvedValue([{ id: 'org-1' }]);
    const orgFrom = vi.fn(() => ({ limit: orgLimit }));
    mockDb.select.mockReturnValue({ from: orgFrom });

    const insertCalls: Record<string, unknown>[] = [];
    const insertReturning = vi.fn().mockResolvedValue([createdEvent]);
    const insertValues = vi.fn((val: Record<string, unknown>) => {
      insertCalls.push(val);
      return { returning: insertReturning };
    });

    const assignmentReturning = vi.fn().mockResolvedValue([]);
    const assignmentValues = vi.fn(() => ({ returning: assignmentReturning }));

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) return { values: insertValues };
      return { values: assignmentValues };
    });

    await createEvent(buildFormData({ name: 'GEM India Summit 2026' }));

    const slug = insertCalls[0].slug as string;
    expect(slug).toMatch(/^gem-india-summit-2026-/);
  });

  it('revalidates /events and /dashboard', async () => {
    const createdEvent = { id: 'reval-test' };

    const orgLimit = vi.fn().mockResolvedValue([{ id: 'org-1' }]);
    const orgFrom = vi.fn(() => ({ limit: orgLimit }));
    mockDb.select.mockReturnValue({ from: orgFrom });

    const insertReturning = vi.fn().mockResolvedValue([createdEvent]);
    const insertValues = vi.fn(() => ({ returning: insertReturning }));
    const assignmentValues = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }));

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) return { values: insertValues };
      return { values: assignmentValues };
    });

    await createEvent(buildFormData());

    expect(mockRevalidatePath).toHaveBeenCalledWith('/events');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });
});

describe('getEvent — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('throws "Event not found" for missing event', async () => {
    mockSelectById([]);
    await expect(getEvent('11111111-1111-1111-1111-111111111111')).rejects.toThrow('Event not found');
  });

  it('returns event when authorized and exists', async () => {
    const event = { id: '11111111-1111-1111-1111-111111111111', name: 'Test', status: 'draft' };
    mockSelectById([event]);
    const result = await getEvent('11111111-1111-1111-1111-111111111111');
    expect(result).toEqual(event);
  });
});

describe('getEvents — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('super admin results ordered by startDate desc', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'admin-1',
      role: 'org:super_admin',
      isSuperAdmin: true,
    });

    const orderBy = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ orderBy }));
    mockDb.select.mockReturnValue({ from });

    await getEvents();
    expect(orderBy).toHaveBeenCalled();
  });

  it('users with fallback assignment roles still query assigned events', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'user-1',
      role: 'org:read_only',
      isSuperAdmin: false,
    });

    const orderBy = vi.fn().mockResolvedValue([{ id: 'evt-1', name: 'Fallback Event' }]);
    const innerJoin = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin }));
    mockDb.select.mockReturnValue({ from });

    await expect(getEvents()).resolves.toEqual([{ id: 'evt-1', name: 'Fallback Event' }]);
    expect(innerJoin).toHaveBeenCalled();
  });
});

describe('getEventBySlug — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty slug', async () => {
    await expect(getEventBySlug('')).rejects.toThrow('Invalid event slug');
  });

  it('rejects slug over 100 chars', async () => {
    await expect(getEventBySlug('x'.repeat(101))).rejects.toThrow('Invalid event slug');
  });

  it('hides draft events', async () => {
    mockSelectById([{ id: 'e1', slug: 'test', status: 'draft' }]);
    await expect(getEventBySlug('test')).rejects.toThrow('Event not found');
  });

  it('returns published event', async () => {
    const event = {
      id: 'e1', slug: 'test', name: 'Test', description: null,
      startDate: new Date(), endDate: new Date(), timezone: 'Asia/Kolkata',
      status: 'published', venueName: 'Test', venueAddress: null,
      venueCity: null, venueMapUrl: null, branding: {},
      registrationSettings: {}, publicPageSettings: {},
    };
    mockSelectById([event]);
    const result = await getEventBySlug('test');
    expect(result.status).toBe('published');
  });

  it('throws for non-existent slug', async () => {
    mockSelectById([]);
    await expect(getEventBySlug('nonexistent')).rejects.toThrow('Event not found');
  });
});

describe('updateEventStatus — gap tests (transitions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  function setupTransitionTest(currentStatus: string, newStatus: string, verifyResult = true) {
    const eventId = '77777777-7777-7777-7777-777777777777';

    const limit = vi.fn().mockResolvedValue([
      {
        id: eventId,
        status: currentStatus,
        createdBy: 'user-1',
        updatedAt: new Date('2026-04-17T08:15:00.000Z'),
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    let capturedUpdateData: Record<string, unknown> | undefined;
    const updateReturning = vi.fn().mockResolvedValue(verifyResult ? [{ id: eventId, status: newStatus }] : []);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const set = vi.fn((data: Record<string, unknown>) => {
      capturedUpdateData = data;
      return { where: updateWhere };
    });
    mockDb.update.mockReturnValue({ set });

    return { eventId, getUpdateData: () => capturedUpdateData };
  }

  // Valid transitions
  it('draft -> published succeeds', async () => {
    const { eventId } = setupTransitionTest('draft', 'published');
    const result = await updateEventStatus(eventId, 'published');
    expect(result).toEqual({ success: true });
  });

  it('draft -> cancelled succeeds', async () => {
    const { eventId } = setupTransitionTest('draft', 'cancelled');
    const result = await updateEventStatus(eventId, 'cancelled');
    expect(result).toEqual({ success: true });
  });

  it('published -> completed succeeds', async () => {
    const { eventId } = setupTransitionTest('published', 'completed');
    const result = await updateEventStatus(eventId, 'completed');
    expect(result).toEqual({ success: true });
  });

  it('published -> cancelled succeeds', async () => {
    const { eventId } = setupTransitionTest('published', 'cancelled');
    const result = await updateEventStatus(eventId, 'cancelled');
    expect(result).toEqual({ success: true });
  });

  it('completed -> archived succeeds', async () => {
    const { eventId } = setupTransitionTest('completed', 'archived');
    const result = await updateEventStatus(eventId, 'archived');
    expect(result).toEqual({ success: true });
  });

  // Blocked transitions
  it('draft -> completed blocked', async () => {
    const { eventId } = setupTransitionTest('draft', 'completed');
    await expect(updateEventStatus(eventId, 'completed')).rejects.toThrow(/Cannot transition/);
  });

  it('draft -> archived blocked', async () => {
    const { eventId } = setupTransitionTest('draft', 'archived');
    await expect(updateEventStatus(eventId, 'archived')).rejects.toThrow(/Cannot transition/);
  });

  it('published -> draft blocked', async () => {
    const { eventId } = setupTransitionTest('published', 'draft');
    await expect(updateEventStatus(eventId, 'draft')).rejects.toThrow(/Cannot transition/);
  });

  it('archived -> published blocked', async () => {
    const { eventId } = setupTransitionTest('archived', 'published');
    await expect(updateEventStatus(eventId, 'published')).rejects.toThrow(/Cannot transition/);
  });

  it('cancelled -> draft blocked', async () => {
    const { eventId } = setupTransitionTest('cancelled', 'draft');
    await expect(updateEventStatus(eventId, 'draft')).rejects.toThrow(/Cannot transition/);
  });

  // Timestamp side effects
  it('sets archivedAt on archive', async () => {
    const { eventId, getUpdateData } = setupTransitionTest('completed', 'archived');
    await updateEventStatus(eventId, 'archived');
    expect(getUpdateData()?.archivedAt).toBeInstanceOf(Date);
  });

  it('sets cancelledAt on cancel', async () => {
    const { eventId, getUpdateData } = setupTransitionTest('draft', 'cancelled');
    await updateEventStatus(eventId, 'cancelled');
    expect(getUpdateData()?.cancelledAt).toBeInstanceOf(Date);
  });

  it('sets updatedBy to current userId', async () => {
    const { eventId, getUpdateData } = setupTransitionTest('draft', 'published');
    await updateEventStatus(eventId, 'published');
    expect(getUpdateData()?.updatedBy).toBe('user-1');
  });

  it('revalidates /events and /events/{eventId}', async () => {
    const { eventId } = setupTransitionTest('draft', 'published');
    await updateEventStatus(eventId, 'published');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/events');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
  });
});
