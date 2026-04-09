/**
 * Status Transitions — Gap Coverage Tests
 * Covers: CP-10 through CP-18 from spec-02-status-transitions.md
 */
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

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { updateRegistrationStatus } from '@/lib/actions/registration';

const REG_UUID = '550e8400-e29b-41d4-a716-446655440000';

function chainedSelect(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: 'admin-1' });
  mockAssertEventAccess.mockResolvedValue({ userId: 'admin-1' });
});

// ── CP-10: cancelledAt timestamp set on cancel ──────────────
describe('CP-10: cancelledAt set when transitioning to cancelled', () => {
  it('includes cancelledAt in update data for pending → cancelled', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);

    const updateChain = chainedUpdate([{ ...reg, status: 'cancelled' }]);

    await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'cancelled',
    });

    // Verify .set() was called with cancelledAt
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('cancelled');
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });
});

// ── CP-11: waitlisted → confirmed ───────────────────────────
describe('CP-11: waitlisted → confirmed allowed', () => {
  it('transitions successfully', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'waitlisted' };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'confirmed' }]);

    const result = await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'confirmed',
    });

    expect(result.status).toBe('confirmed');
  });
});

// ── CP-12: waitlisted → declined ────────────────────────────
describe('CP-12: waitlisted → declined allowed', () => {
  it('transitions successfully', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'waitlisted' };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'declined' }]);

    const result = await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'declined',
    });

    expect(result.status).toBe('declined');
  });
});

// ── CP-13: waitlisted → cancelled ───────────────────────────
describe('CP-13: waitlisted → cancelled allowed', () => {
  it('transitions and sets cancelledAt', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'waitlisted' };
    chainedSelect([reg]);

    const updateChain = chainedUpdate([{ ...reg, status: 'cancelled' }]);

    await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'cancelled',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('cancelled');
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });
});

// ── CP-14: pending → declined ───────────────────────────────
describe('CP-14: pending → declined allowed', () => {
  it('transitions successfully', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'declined' }]);

    const result = await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'declined',
    });

    expect(result.status).toBe('declined');
  });
});

// ── CP-15: pending → cancelled (with cancelledAt) ───────────
describe('CP-15: pending → cancelled allowed with cancelledAt', () => {
  it('transitions and sets cancelledAt', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);

    const updateChain = chainedUpdate([{ ...reg, status: 'cancelled' }]);

    await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'cancelled',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });
});

// ── CP-16: pending → waitlisted ─────────────────────────────
describe('CP-16: pending → waitlisted allowed', () => {
  it('transitions successfully', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'waitlisted' }]);

    const result = await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'waitlisted',
    });

    expect(result.status).toBe('waitlisted');
  });
});

// ── CP-17: confirmed → confirmed blocked ────────────────────
describe('CP-17: confirmed → confirmed blocked', () => {
  it('throws Cannot transition', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'confirmed' };
    chainedSelect([reg]);

    await expect(
      updateRegistrationStatus({
        registrationId: REG_UUID,
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Cannot transition');
  });
});

// ── CP-18: assertEventAccess called with requireWrite ───────
describe('CP-18: assertEventAccess enforces write permission', () => {
  it('calls assertEventAccess with requireWrite: true', async () => {
    const reg = { id: REG_UUID, eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'confirmed' }]);

    await updateRegistrationStatus({
      registrationId: REG_UUID,
      newStatus: 'confirmed',
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith('event-1', { requireWrite: true });
  });
});
