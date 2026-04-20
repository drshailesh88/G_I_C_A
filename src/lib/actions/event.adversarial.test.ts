import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
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

import { updateEvent } from './event';

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
});
