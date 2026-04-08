import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { mockAuth, mockDb, mockRevalidatePath } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
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

import { createEvent, getEvent, updateEventStatus } from './event';

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

describe('event actions adversarial tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it('createEvent should reject malformed moduleToggles with Zod before parsing', async () => {
    const formData = buildFormData({ moduleToggles: '{' });

    await expect(createEvent(formData)).rejects.toBeInstanceOf(ZodError);
  });

  it('getEvent should reject invalid event ids with Zod before querying', async () => {
    mockSelectById([]);

    await expect(getEvent('not-a-uuid')).rejects.toBeInstanceOf(ZodError);
  });

  it('getEvent should deny access when the current user is not assigned to the event', async () => {
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

  it('updateEventStatus should deny status changes by users who are not assigned to the event', async () => {
    mockSelectById([
      {
        id: '22222222-2222-2222-2222-222222222222',
        status: 'draft',
        createdBy: 'owner-9',
      },
    ]);

    const where = vi.fn().mockResolvedValue([{ id: '22222222-2222-2222-2222-222222222222' }]);
    const set = vi.fn(() => ({ where }));
    mockDb.update.mockReturnValue({ set });

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
