import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  getEventListContext: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));

import { updateEvent } from './event';

const VALID_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields: Record<string, string> = {
    name: 'Updated Summit 2026',
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
  for (const [k, v] of Object.entries(fields)) formData.set(k, v);
  return formData;
}

function mockUpdatePath(captureSet?: (v: Record<string, unknown>) => void) {
  const returning = vi.fn().mockResolvedValue([{ id: VALID_UUID }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((v: Record<string, unknown>) => {
    if (captureSet) captureSet(v);
    return { where };
  });
  mockDb.update.mockReturnValue({ set });
}

describe('updateEvent — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('rejects a non-UUID eventId with ZodError before any DB call', async () => {
    await expect(updateEvent('not-a-uuid', buildFormData())).rejects.toBeInstanceOf(ZodError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 with fieldErrors when endDate is before startDate', async () => {
    mockUpdatePath();
    const result = await updateEvent(VALID_UUID, buildFormData({ endDate: '2026-05-10', startDate: '2026-05-15' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.formErrors.length + Object.keys(result.fieldErrors).length).toBeGreaterThan(0);
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty', async () => {
    mockUpdatePath();
    const result = await updateEvent(VALID_UUID, buildFormData({ name: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.fieldErrors).toHaveProperty('name');
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed moduleToggles JSON', async () => {
    const result = await updateEvent(VALID_UUID, buildFormData({ moduleToggles: '{bad' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.fieldErrors).toHaveProperty('moduleToggles');
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 when venueName is empty', async () => {
    mockUpdatePath();
    const result = await updateEvent(VALID_UUID, buildFormData({ venueName: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.fieldErrors).toHaveProperty('venueName');
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe('updateEvent — access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it('calls assertEventAccess with requireWrite: true before touching DB', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
    mockUpdatePath();

    await updateEvent(VALID_UUID, buildFormData());
    expect(mockAssertEventAccess).toHaveBeenCalledWith(VALID_UUID, { requireWrite: true });
  });

  it('propagates rejection from assertEventAccess without calling DB', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden: read-only access'));

    await expect(updateEvent(VALID_UUID, buildFormData())).rejects.toThrow(/forbidden/i);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('blocks ops users from event settings (assertEventAccess decides)', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('forbidden'));

    await expect(updateEvent(VALID_UUID, buildFormData())).rejects.toThrow(/forbidden/i);
  });
});

describe('updateEvent — persistence and side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('returns { ok: true } for a valid update', async () => {
    mockUpdatePath();
    const result = await updateEvent(VALID_UUID, buildFormData());
    expect(result).toEqual({ ok: true });
  });

  it('writes correct editable fields to DB', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData({
      name: 'GEM 2026 New Name',
      venueName: 'New Venue',
      description: 'Updated desc',
      venueCity: 'Hyderabad',
    }));

    expect(captured.name).toBe('GEM 2026 New Name');
    expect(captured.venueName).toBe('New Venue');
    expect(captured.description).toBe('Updated desc');
    expect(captured.venueCity).toBe('Hyderabad');
    expect(captured.startDate).toBeInstanceOf(Date);
    expect(captured.endDate).toBeInstanceOf(Date);
    expect(captured.moduleToggles).toBeDefined();
  });

  it('does NOT include status field in the update payload', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData());
    expect(captured).not.toHaveProperty('status');
  });

  it('stores null for absent optional fields (description, venueAddress, venueCity, venueMapUrl)', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData());
    expect(captured.description).toBeNull();
    expect(captured.venueAddress).toBeNull();
    expect(captured.venueCity).toBeNull();
    expect(captured.venueMapUrl).toBeNull();
  });

  it('stores provided optional fields when given', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData({
      description: 'Annual GEM conference',
      venueAddress: '1 MG Road',
      venueCity: 'Bangalore',
      venueMapUrl: 'https://maps.example.com/venue',
    }));

    expect(captured.description).toBe('Annual GEM conference');
    expect(captured.venueAddress).toBe('1 MG Road');
    expect(captured.venueCity).toBe('Bangalore');
    expect(captured.venueMapUrl).toBe('https://maps.example.com/venue');
  });

  it('sets updatedBy to the current userId', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData());
    expect(captured.updatedBy).toBe('user-1');
  });

  it('sets updatedAt to a Date', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdatePath((v) => { captured = v; });

    await updateEvent(VALID_UUID, buildFormData());
    expect(captured.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates /events/[eventId] and /events/[eventId]/settings after success', async () => {
    mockUpdatePath();

    await updateEvent(VALID_UUID, buildFormData());
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}/settings`);
  });
});
