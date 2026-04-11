/**
 * Mutation-killing tests for seed-system-templates.ts
 *
 * Targets: 16 NoCoverage mutations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReturning, mockLimit, mockWhere, mockValues, mockFrom, dbChain } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockWhere = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();

  const chain: Record<string, any> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = mockFrom.mockReturnValue(chain);
  chain.values = mockValues.mockReturnValue(chain);
  chain.where = mockWhere.mockReturnValue(chain);
  chain.returning = mockReturning;
  chain.limit = mockLimit;

  return { mockReturning, mockLimit, mockWhere, mockValues, mockFrom, dbChain: chain };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbChain.insert,
    select: dbChain.select,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
    templateKey: 'templateKey',
    channel: 'channel',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
}));

import { seedSystemTemplates } from './seed-system-templates';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: template doesn't exist yet
  mockLimit.mockResolvedValue([]);
  mockReturning.mockResolvedValue([{ id: 'new-tpl' }]);
  mockWhere.mockReturnValue(dbChain);
  mockFrom.mockReturnValue(dbChain);
});

describe('seedSystemTemplates', () => {
  it('inserts templates that do not exist yet', async () => {
    const result = await seedSystemTemplates('admin-1');

    // 24 seeds total, all inserted
    expect(result.inserted).toBe(24);
    expect(result.skipped).toBe(0);
    expect(mockValues).toHaveBeenCalledTimes(24);
  });

  it('skips templates that already exist', async () => {
    // All templates already exist
    mockLimit.mockResolvedValue([{ id: 'existing-tpl' }]);

    const result = await seedSystemTemplates('admin-1');

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(24);
    expect(mockValues).not.toHaveBeenCalled();
  });

  it('inserts with correct field mappings', async () => {
    await seedSystemTemplates('admin-1');

    // Check first insert call has all required fields
    const firstValues = mockValues.mock.calls[0][0];
    expect(firstValues.eventId).toBeNull();
    expect(firstValues.status).toBe('active');
    expect(firstValues.brandingMode).toBe('event_branding');
    expect(firstValues.isSystemTemplate).toBe(true);
    expect(firstValues.notes).toBe('System default template — seeded automatically');
    expect(firstValues.createdBy).toBe('admin-1');
    expect(firstValues.updatedBy).toBe('admin-1');
    expect(firstValues.templateKey).toBeTruthy();
    expect(firstValues.channel).toBeTruthy();
    expect(firstValues.templateName).toBeTruthy();
    expect(firstValues.metaCategory).toBeTruthy();
    expect(firstValues.bodyContent).toBeTruthy();
  });

  it('handles mixed existing/new templates', async () => {
    let callCount = 0;
    mockLimit.mockImplementation(() => {
      callCount++;
      // First 12 exist, next 12 don't
      return Promise.resolve(callCount <= 12 ? [{ id: 'existing' }] : []);
    });

    const result = await seedSystemTemplates('admin-1');

    expect(result.inserted).toBe(12);
    expect(result.skipped).toBe(12);
  });
});
