import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  getEventListContext: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import { transferEventOwnership, updateEvent } from './event';

const EVENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildFormData(withModuleToggles = true) {
  const formData = new FormData();
  formData.set('name', 'Updated Summit 2026');
  formData.set('startDate', '2026-05-15');
  formData.set('endDate', '2026-05-18');
  formData.set('venueName', 'Pragati Maidan');

  if (withModuleToggles) {
    formData.set(
      'moduleToggles',
      JSON.stringify({
        scientific_program: true,
        registration: false,
        travel_accommodation: true,
        certificates: true,
        qr_checkin: true,
        transport_planning: true,
        communications: false,
      }),
    );
  }

  return formData;
}

function mockUpdatePath() {
  const returning = vi.fn().mockResolvedValue([{ id: EVENT_ID }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  mockDb.update.mockReturnValue({ set });
}

function mockSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

function mockInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([]),
  };
}

describe('updateEvent adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('should reject requests that omit module toggles instead of resetting them to defaults', async () => {
    mockUpdatePath();

    // BUG: missing moduleToggles is treated as {}, which silently re-enables every module.
    const result = await updateEvent(EVENT_ID, buildFormData(false));

    expect(result.ok).toBe(false);
  });

  it('should reject transferring ownership for an event that does not exist', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-sa',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });
    mockDb.select
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(mockSelectChain([]));
    mockDb.insert.mockReturnValueOnce(mockInsertChain());
    mockDb.update
      .mockReturnValueOnce(mockUpdateChain())
      .mockReturnValueOnce(mockUpdateChain());

    // BUG: transferEventOwnership never verifies that the target event exists before inserting owner assignments.
    const result = await transferEventOwnership(EVENT_ID, 'user-new-owner');

    expect(result).toEqual({ ok: false, error: 'Event not found' });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
