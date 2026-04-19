import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertEventAccess, mockReviewRedFlag, mockResolveRedFlag } = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockReviewRedFlag: vi.fn(),
  mockResolveRedFlag: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/cascade/red-flags', () => ({
  reviewRedFlag: mockReviewRedFlag,
  resolveRedFlag: mockResolveRedFlag,
}));

import { resolveFlag, reviewFlag } from './red-flag-actions';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const FLAG_ID = '550e8400-e29b-41d4-a716-446655440001';

beforeEach(() => {
  vi.clearAllMocks();
  mockReviewRedFlag.mockResolvedValue({ id: FLAG_ID, flagStatus: 'reviewed' });
  mockResolveRedFlag.mockResolvedValue({ id: FLAG_ID, flagStatus: 'resolved' });
});

describe('reviewFlag', () => {
  it('forbids event coordinators from reviewing logistics red flags', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });

    await expect(reviewFlag(EVENT_ID, FLAG_ID)).rejects.toThrow('Forbidden');
    expect(mockReviewRedFlag).not.toHaveBeenCalled();
  });
});

describe('resolveFlag', () => {
  it('forbids event coordinators from resolving logistics red flags', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });

    await expect(resolveFlag(EVENT_ID, FLAG_ID)).rejects.toThrow('Forbidden');
    expect(mockResolveRedFlag).not.toHaveBeenCalled();
  });
});
