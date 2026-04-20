import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess, mockRevalidatePath } = vi.hoisted(() => ({
  mockDb: {
    update: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { updateRegistrationSettings } from './registration-settings';

const EVENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeUpdateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    set: vi.fn(),
    where: vi.fn(),
  };

  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue([]);

  return chain;
}

describe('registration settings RBAC adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });
  });

  it('should reject ops users before mutating registration settings', async () => {
    mockDb.update.mockReturnValue(makeUpdateChain());

    // BUG: updateRegistrationSettings trusts generic write access, so org:ops can reconfigure public registration.
    await expect(
      updateRegistrationSettings(EVENT_ID, { approvalRequired: true }),
    ).rejects.toThrow('Forbidden');

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
