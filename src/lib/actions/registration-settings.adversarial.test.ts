import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
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

import { updateRegistrationSettings } from './registration-settings';

const EVENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  mockDb.update.mockReturnValue({ set });
}

describe('updateRegistrationSettings adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('should reject an empty payload instead of overwriting existing settings with defaults', async () => {
    mockUpdateChain();

    // BUG: {} is accepted and silently resets approval, capacity, waitlist, cutoff, and preferences.
    const result = await updateRegistrationSettings(EVENT_ID, {});

    expect(result.ok).toBe(false);
  });
});
