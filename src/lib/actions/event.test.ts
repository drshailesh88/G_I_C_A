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

  it('createEvent should return structured validation error for malformed moduleToggles', async () => {
    const formData = buildFormData({ moduleToggles: '{' });

    const result = await createEvent(formData);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
    }
  });

  it('createEvent should reject ops users that bypass the UI and call the action directly', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-1',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });

    await expect(createEvent(buildFormData())).rejects.toThrow(/forbidden/i);
    expect(mockDb.insert).not.toHaveBeenCalled();
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
      updatedAt: new Date('2026-04-17T08:00:00.000Z'),
    };

    mockAssertEventAccess.mockResolvedValue({ userId: 'owner-3', role: 'org:super_admin' });
    mockSelectById([{ ...persistedEvent }]);

    let updatePayload: Record<string, unknown> | undefined;
    const returning = vi.fn().mockImplementation(async () => {
      persistedEvent.status = 'cancelled';
      Object.assign(persistedEvent, updatePayload);
      return [];
    });
    const where = vi.fn(() => ({ returning }));
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

  it('getEvents still loads assigned events for users without a recognized Clerk role', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'user-without-role',
      role: 'org:event_coordinator',
      isSuperAdmin: false,
    });

    const assignedEvents = [{ id: 'e-fallback', name: 'Assigned Event' }];
    const orderBy = vi.fn().mockResolvedValue(assignedEvents);
    const innerJoin = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ innerJoin }));
    mockDb.select.mockReturnValue({ from });

    const result = await getEvents();
    expect(result).toEqual(assignedEvents);
    expect(innerJoin).toHaveBeenCalled();
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

    const limit = vi.fn().mockResolvedValue([
      { id: eventId, status: 'draft', createdBy: 'user-1', updatedAt: new Date('2026-04-17T08:05:00.000Z') },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    const updateReturning = vi.fn().mockResolvedValue([{ id: eventId }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const set = vi.fn(() => ({ where: updateWhere }));
    mockDb.update.mockReturnValue({ set });

    await updateEventStatus(eventId, 'published');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(eventId, { requireWrite: true });
  });

  // Codex Bug #2: updateEventStatus should pass requireWrite to block read-only users
  it('updateEventStatus passes requireWrite: true to assertEventAccess', async () => {
    const eventId = '66666666-6666-6666-6666-666666666666';
    mockAssertEventAccess.mockRejectedValue(new Error('forbidden'));

    await expect(updateEventStatus(eventId, 'published')).rejects.toThrow(/forbidden/i);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(eventId, { requireWrite: true });
  });
});

describe('event actions — hardening tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
    mockGetEventListContext.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin', isSuperAdmin: true });
  });

  // ── Mock helpers ────────────────────────────────────────────────────────────

  function mockOrgExists() {
    const limitOrg = vi.fn().mockResolvedValue([{ id: 'org-1' }]);
    const fromOrg = vi.fn(() => ({ limit: limitOrg }));
    mockDb.select.mockReturnValueOnce({ from: fromOrg });
  }

  function mockEventInsert(captureValues?: (v: Record<string, unknown>) => void) {
    const returning = vi.fn().mockResolvedValue([{ id: 'event-new' }]);
    const values = vi.fn((v: Record<string, unknown>) => {
      if (captureValues) captureValues(v);
      return { returning };
    });
    mockDb.insert.mockReturnValueOnce({ values });
  }

  function mockAssignmentInsert(captureValues?: (v: Record<string, unknown>) => void) {
    const values = vi.fn((v: Record<string, unknown>) => {
      if (captureValues) captureValues(v);
      return Promise.resolve([]);
    });
    mockDb.insert.mockReturnValueOnce({ values });
  }

  function mockCreateEventSuccess(
    captureEventValues?: (v: Record<string, unknown>) => void,
    captureAssignValues?: (v: Record<string, unknown>) => void,
  ) {
    mockOrgExists();
    mockEventInsert(captureEventValues);
    mockAssignmentInsert(captureAssignValues);
  }

  function mockUpdateEventStatusPath(
    eventId: string,
    currentStatus: string,
    captureUpdateSet?: (v: Record<string, unknown>) => void,
  ) {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    const limit = vi.fn().mockResolvedValue([
      { id: eventId, status: currentStatus, updatedAt: new Date('2026-04-17T08:10:00.000Z') },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    const updateReturning = vi.fn().mockResolvedValue([{ id: eventId }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const set = vi.fn((v: Record<string, unknown>) => {
      if (captureUpdateSet) captureUpdateSet(v);
      return { where: updateWhere };
    });
    mockDb.update.mockReturnValue({ set });
  }

  // ── slugify: special chars → single dash ───────────────────────────────────

  it('slugify converts consecutive spaces to a single dash (not double)', async () => {
    let insertedSlug = '';
    mockCreateEventSuccess((v) => { insertedSlug = v.slug as string; });

    const formData = buildFormData({ name: 'Hello  World' }); // two spaces
    await createEvent(formData);

    // Strip base36 timestamp suffix (no dashes in base36)
    const slugPart = insertedSlug.slice(0, insertedSlug.lastIndexOf('-'));
    expect(slugPart).toBe('hello-world');
  });

  // ── slugify: strips leading/trailing dashes from special-char names ─────────

  it('slugify strips leading and trailing dashes from names starting/ending with special chars', async () => {
    let insertedSlug = '';
    mockCreateEventSuccess((v) => { insertedSlug = v.slug as string; });

    // Name starts and ends with chars that become dashes after first replace
    const formData = buildFormData({ name: '---hello world---' });
    await createEvent(formData);

    const slugPart = insertedSlug.slice(0, insertedSlug.lastIndexOf('-'));
    expect(slugPart).toBe('hello-world');
    expect(slugPart).not.toMatch(/^-/);
    expect(slugPart).not.toMatch(/-$/);
  });

  // ── slugify: name > 80 chars truncates ─────────────────────────────────────

  it('slugify truncates the slug prefix to 80 chars for a long name', async () => {
    let insertedSlug = '';
    mockCreateEventSuccess((v) => { insertedSlug = v.slug as string; });

    const formData = buildFormData({ name: 'a'.repeat(90) });
    await createEvent(formData);

    const slugPart = insertedSlug.slice(0, insertedSlug.lastIndexOf('-'));
    expect(slugPart.length).toBeLessThanOrEqual(80);
  });

  // ── getOrCreateDefaultOrg: creates org when none exists ────────────────────

  it('createEvent inserts a new org with correct values when none exists', async () => {
    // Org select returns empty → triggers insert
    const limitOrg = vi.fn().mockResolvedValue([]);
    const fromOrg = vi.fn(() => ({ limit: limitOrg }));
    mockDb.select.mockReturnValueOnce({ from: fromOrg });

    // Org insert returning new id
    let capturedOrgValues: Record<string, unknown> = {};
    const orgReturning = vi.fn().mockResolvedValue([{ id: 'new-org-id' }]);
    const orgInsertValues = vi.fn((v: Record<string, unknown>) => {
      capturedOrgValues = v;
      return { returning: orgReturning };
    });
    mockDb.insert.mockReturnValueOnce({ values: orgInsertValues });

    mockEventInsert();
    mockAssignmentInsert();

    const formData = buildFormData();
    const result = await createEvent(formData);

    expect(result.ok).toBe(true);
    expect(capturedOrgValues).toMatchObject({ name: 'GEM India', slug: 'gem-india' });
  });

  // ── safeJsonParse: error field path and message ────────────────────────────

  it('createEvent returns fieldErrors.moduleToggles with Invalid JSON message', async () => {
    const formData = buildFormData({ moduleToggles: '{bad json' });
    const result = await createEvent(formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toHaveProperty('moduleToggles');
      expect(result.fieldErrors.moduleToggles).toContain('Invalid JSON');
    }
  });

  // ── createEvent: default timezone ─────────────────────────────────────────

  it('createEvent defaults timezone to Asia/Kolkata when not supplied', async () => {
    let capturedValues: Record<string, unknown> = {};
    mockCreateEventSuccess((v) => { capturedValues = v; });

    const formData = buildFormData(); // no timezone field
    await createEvent(formData);

    expect(capturedValues.timezone).toBe('Asia/Kolkata');
  });

  // ── createEvent: optional fields stored as null when absent ───────────────

  it('createEvent stores null for absent optional fields (description, venueAddress, venueCity, venueMapUrl)', async () => {
    let capturedValues: Record<string, unknown> = {};
    mockCreateEventSuccess((v) => { capturedValues = v; });

    const formData = buildFormData(); // no optional fields
    await createEvent(formData);

    expect(capturedValues.description).toBeNull();
    expect(capturedValues.venueAddress).toBeNull();
    expect(capturedValues.venueCity).toBeNull();
    expect(capturedValues.venueMapUrl).toBeNull();
  });

  it('createEvent stores provided optional fields (not null)', async () => {
    let capturedValues: Record<string, unknown> = {};
    mockCreateEventSuccess((v) => { capturedValues = v; });

    const formData = buildFormData({
      description: 'Annual summit',
      venueAddress: '123 Main St',
      venueCity: 'Mumbai',
      venueMapUrl: 'https://maps.google.com/test',
    });
    await createEvent(formData);

    expect(capturedValues.description).toBe('Annual summit');
    expect(capturedValues.venueAddress).toBe('123 Main St');
    expect(capturedValues.venueCity).toBe('Mumbai');
    expect(capturedValues.venueMapUrl).toBe('https://maps.google.com/test');
  });

  // ── createEvent: eventUserAssignment type must be 'owner' ─────────────────

  it('createEvent inserts eventUserAssignment with assignmentType "owner"', async () => {
    let capturedAssignment: Record<string, unknown> = {};
    mockCreateEventSuccess(undefined, (v) => { capturedAssignment = v; });

    const formData = buildFormData();
    await createEvent(formData);

    expect(capturedAssignment).toMatchObject({ assignmentType: 'owner' });
  });

  // ── getEvents: role=null returns empty array ───────────────────────────────

  it('getEvents returns [] when userId exists but role is null', async () => {
    mockGetEventListContext.mockResolvedValue({
      userId: 'user-no-role',
      role: null,
      isSuperAdmin: false,
    });

    const result = await getEvents();
    expect(result).toEqual([]);
  });

  // ── getEventBySlug: boundary slug.length > 100 ────────────────────────────

  it('getEventBySlug accepts a slug of exactly 100 chars', async () => {
    const slug100 = 'a'.repeat(100);
    const limit = vi.fn().mockResolvedValue([{ id: 'ev-1', slug: slug100, status: 'published' }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    mockDb.select.mockReturnValue({ from });

    const result = await getEventBySlug(slug100);
    expect(result.id).toBe('ev-1');
  });

  it('getEventBySlug rejects a slug of 101 chars', async () => {
    await expect(getEventBySlug('a'.repeat(101))).rejects.toThrow('Invalid event slug');
  });

  it('getEventBySlug rejects an empty slug', async () => {
    await expect(getEventBySlug('')).rejects.toThrow('Invalid event slug');
  });

  // ── updateEventStatus: event not found ────────────────────────────────────

  it('updateEventStatus throws "Event not found" when event does not exist', async () => {
    const eventId = '77777777-7777-7777-7777-777777777777';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    await expect(updateEventStatus(eventId, 'published')).rejects.toThrow('Event not found');
  });

  // ── updateEventStatus: invalid transition from terminal state ─────────────

  it('updateEventStatus error says "none (terminal state)" for archived → any', async () => {
    const eventId = '88888888-8888-8888-8888-888888888888';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    const limit = vi.fn().mockResolvedValue([{ id: eventId, status: 'archived' }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    await expect(updateEventStatus(eventId, 'draft')).rejects.toThrow('none (terminal state)');
  });

  it('updateEventStatus error says "none (terminal state)" for cancelled → any', async () => {
    const eventId = '99999999-9999-9999-9999-999999999999';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    const limit = vi.fn().mockResolvedValue([{ id: eventId, status: 'cancelled' }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    await expect(updateEventStatus(eventId, 'draft')).rejects.toThrow('none (terminal state)');
  });

  it('updateEventStatus error lists allowed transitions comma-separated for non-terminal state', async () => {
    const eventId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

    // draft can go to published or cancelled; trying completed is invalid
    const limit = vi.fn().mockResolvedValue([{ id: eventId, status: 'draft' }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where, limit }));
    mockDb.select.mockReturnValue({ from });

    await expect(updateEventStatus(eventId, 'completed')).rejects.toThrow('published, cancelled');
  });

  // ── updateEventStatus: archivedAt / cancelledAt set only for correct target ─

  it('updateEventStatus sets archivedAt when transitioning to archived', async () => {
    const eventId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    let updateSetPayload: Record<string, unknown> = {};
    mockUpdateEventStatusPath('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'completed', (v) => { updateSetPayload = v; });

    await updateEventStatus(eventId, 'archived');
    expect(updateSetPayload.archivedAt).toBeInstanceOf(Date);
    expect(updateSetPayload.cancelledAt).toBeUndefined();
  });

  it('updateEventStatus does NOT set archivedAt when transitioning to published', async () => {
    const eventId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    let updateSetPayload: Record<string, unknown> = {};
    mockUpdateEventStatusPath('cccccccc-cccc-cccc-cccc-cccccccccccc', 'draft', (v) => { updateSetPayload = v; });

    await updateEventStatus(eventId, 'published');
    expect(updateSetPayload.archivedAt).toBeUndefined();
    expect(updateSetPayload.cancelledAt).toBeUndefined();
  });

  it('updateEventStatus sets cancelledAt when transitioning to cancelled', async () => {
    const eventId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    let updateSetPayload: Record<string, unknown> = {};
    mockUpdateEventStatusPath('dddddddd-dddd-dddd-dddd-dddddddddddd', 'draft', (v) => { updateSetPayload = v; });

    await updateEventStatus(eventId, 'cancelled');
    expect(updateSetPayload.cancelledAt).toBeInstanceOf(Date);
    expect(updateSetPayload.archivedAt).toBeUndefined();
  });

  it('updateEventStatus does NOT set cancelledAt when transitioning to archived', async () => {
    const eventId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    let updateSetPayload: Record<string, unknown> = {};
    mockUpdateEventStatusPath('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'completed', (v) => { updateSetPayload = v; });

    await updateEventStatus(eventId, 'archived');
    expect(updateSetPayload.cancelledAt).toBeUndefined();
  });
});
