import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess, mockRevalidatePath } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
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

import { updateEventBranding } from './branding';

const EVENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);

  return chain;
}

function makeUpdateChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };

  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);

  return chain;
}

describe('branding RBAC adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });
  });

  it('should reject ops users before changing event branding', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ branding: {}, updatedAt: null }]));
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: EVENT_ID }]));

    // BUG: updateEventBranding accepts org:ops because it only asks assertEventAccess(requireWrite:true).
    await expect(
      updateEventBranding(EVENT_ID, { primaryColor: '#123456' }),
    ).rejects.toThrow('Forbidden');

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
