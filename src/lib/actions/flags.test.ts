import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockGetAllGlobalFlags, mockGetAllEventFlags } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetAllGlobalFlags: vi.fn(),
  mockGetAllEventFlags: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/flags', () => ({
  createFlagService: () => ({
    getAllGlobalFlags: mockGetAllGlobalFlags,
    getAllEventFlags: mockGetAllEventFlags,
    setGlobalFlag: vi.fn(),
    setEventFlag: vi.fn(),
  }),
  GLOBAL_FLAGS: ['whatsapp_enabled'],
  EVENT_FLAGS: ['registration_open'],
}));

import { getEventFlags, getGlobalFlags } from './flags';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('flags actions RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllGlobalFlags.mockResolvedValue({ whatsapp_enabled: true });
    mockGetAllEventFlags.mockResolvedValue({ registration_open: true });
  });

  it('allows super admins to read global flags', async () => {
    mockAuth.mockResolvedValue({
      userId: 'super-1',
      has: vi.fn(({ role }: { role: string }) => role === 'org:super_admin'),
    });

    await expect(getGlobalFlags()).resolves.toEqual({ whatsapp_enabled: true });
    expect(mockGetAllGlobalFlags).toHaveBeenCalledTimes(1);
  });

  it('rejects non-super-admin reads of global flags', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: vi.fn().mockReturnValue(false),
    });

    await expect(getGlobalFlags()).rejects.toThrow(/only Super Admin/i);
    expect(mockGetAllGlobalFlags).not.toHaveBeenCalled();
  });

  it('rejects non-super-admin reads of event flags', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: vi.fn().mockReturnValue(false),
    });

    await expect(getEventFlags(EVENT_ID)).rejects.toThrow(/only Super Admin/i);
    expect(mockGetAllEventFlags).not.toHaveBeenCalled();
  });
});
