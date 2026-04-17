import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  getEventListContext: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));

import { updateRegistrationSettings } from './registration-settings';

const VALID_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function validInput() {
  return {
    approvalRequired: false,
    maxCapacity: 200,
    waitlistEnabled: true,
    cutoffDate: '2026-05-01',
    preferenceFields: {
      dietaryNeeds: true,
      travelPreferences: false,
      accessibilityRequirements: true,
    },
  };
}

function mockUpdateChain(captureSet?: (v: Record<string, unknown>) => void) {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn((v: Record<string, unknown>) => {
    if (captureSet) captureSet(v);
    return { where };
  });
  mockDb.update.mockReturnValue({ set });
}

describe('updateRegistrationSettings — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('rejects non-UUID eventId with ZodError before any DB call', async () => {
    await expect(
      updateRegistrationSettings('not-a-uuid', validInput()),
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 for maxCapacity of 0 (below minimum)', async () => {
    const result = await updateRegistrationSettings(VALID_UUID, { ...validInput(), maxCapacity: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.fieldErrors).toHaveProperty('maxCapacity');
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 for negative maxCapacity', async () => {
    const result = await updateRegistrationSettings(VALID_UUID, { ...validInput(), maxCapacity: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('accepts null maxCapacity (no capacity limit)', async () => {
    mockUpdateChain();
    const result = await updateRegistrationSettings(VALID_UUID, { ...validInput(), maxCapacity: null });
    expect(result.ok).toBe(true);
  });

  it('accepts empty input (all defaults)', async () => {
    mockUpdateChain();
    const result = await updateRegistrationSettings(VALID_UUID, {});
    expect(result.ok).toBe(true);
  });

  it('accepts full valid input', async () => {
    mockUpdateChain();
    const result = await updateRegistrationSettings(VALID_UUID, validInput());
    expect(result.ok).toBe(true);
  });
});

describe('updateRegistrationSettings — access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls assertEventAccess with requireWrite: true before touching DB', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
    mockUpdateChain();

    await updateRegistrationSettings(VALID_UUID, validInput());
    expect(mockAssertEventAccess).toHaveBeenCalledWith(VALID_UUID, { requireWrite: true });
  });

  it('propagates rejection from assertEventAccess without calling DB', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden: read-only access'));

    await expect(
      updateRegistrationSettings(VALID_UUID, validInput()),
    ).rejects.toThrow(/forbidden/i);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe('updateRegistrationSettings — persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('returns { ok: true } for valid input', async () => {
    mockUpdateChain();
    const result = await updateRegistrationSettings(VALID_UUID, validInput());
    expect(result).toEqual({ ok: true });
  });

  it('writes registrationSettings block to DB', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, validInput());

    const rs = captured.registrationSettings as Record<string, unknown>;
    expect(rs.approvalRequired).toBe(false);
    expect(rs.maxCapacity).toBe(200);
    expect(rs.waitlistEnabled).toBe(true);
    expect(rs.cutoffDate).toBe('2026-05-01');
  });

  it('stores null maxCapacity when absent from input', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, { approvalRequired: true, waitlistEnabled: false });
    const rs = captured.registrationSettings as Record<string, unknown>;
    expect(rs.maxCapacity).toBeNull();
  });

  it('stores null cutoffDate when absent from input', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, { approvalRequired: false });
    const rs = captured.registrationSettings as Record<string, unknown>;
    expect(rs.cutoffDate).toBeNull();
  });

  it('sets updatedBy to the current userId', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, validInput());
    expect(captured.updatedBy).toBe('user-1');
  });

  it('sets updatedAt to a Date instance', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, validInput());
    expect(captured.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates event and registration-settings paths after save', async () => {
    mockUpdateChain();

    await updateRegistrationSettings(VALID_UUID, validInput());
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}/registration-settings`);
  });

  it('does not include status field in the update payload', async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateChain((v) => { captured = v; });

    await updateRegistrationSettings(VALID_UUID, validInput());
    expect(captured).not.toHaveProperty('status');
  });
});
