import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import {
  upsertRedFlag,
  reviewRedFlag,
  resolveRedFlag,
  FLAG_TYPES,
  FLAG_STATUSES,
  FLAG_TRANSITIONS,
} from './red-flags';

// ── Chain helpers ─────────────────────────────────────────────
function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
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

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const FLAG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TARGET_ID = '550e8400-e29b-41d4-a716-446655440020';
const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440030';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Constants ─────────────────────────────────────────────────
describe('Red flag constants', () => {
  it('defines 7 flag types', () => {
    expect(FLAG_TYPES).toHaveLength(7);
    expect(FLAG_TYPES).toContain('travel_change');
    expect(FLAG_TYPES).toContain('travel_cancelled');
    expect(FLAG_TYPES).toContain('shared_room_affected');
    expect(FLAG_TYPES).toContain('system_dispatch_failure');
  });

  it('defines 3 flag statuses', () => {
    expect(FLAG_STATUSES).toEqual(['unreviewed', 'reviewed', 'resolved']);
  });

  it('resolved is terminal', () => {
    expect(FLAG_TRANSITIONS.resolved).toEqual([]);
  });

  it('unreviewed can transition to reviewed or resolved (Super Admin skip)', () => {
    expect(FLAG_TRANSITIONS.unreviewed).toContain('reviewed');
    expect(FLAG_TRANSITIONS.unreviewed).toContain('resolved');
  });

  it('reviewed can only transition to resolved', () => {
    expect(FLAG_TRANSITIONS.reviewed).toEqual(['resolved']);
  });
});

// ── upsertRedFlag ─────────────────────────────────────────────
describe('upsertRedFlag', () => {
  const baseParams = {
    eventId: EVENT_ID,
    flagType: 'travel_change' as const,
    flagDetail: 'Arrival time changed from 10:00 to 12:00',
    targetEntityType: 'accommodation_record' as const,
    targetEntityId: TARGET_ID,
    sourceEntityType: 'travel_record' as const,
    sourceEntityId: SOURCE_ID,
  };

  it('creates a new flag when no unresolved flag exists', async () => {
    chainedSelect([]);  // No existing flag for action detection
    const created = { id: FLAG_ID, ...baseParams, flagStatus: 'unreviewed' };
    chainedInsert([created]);

    const result = await upsertRedFlag(baseParams);
    expect(result.action).toBe('created');
    expect(result.flag.id).toBe(FLAG_ID);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('uses onConflictDoUpdate for atomic upsert', async () => {
    chainedSelect([]);
    const insertChain = chainedInsert([{ id: FLAG_ID, ...baseParams, flagStatus: 'unreviewed' }]);

    await upsertRedFlag(baseParams);

    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const conflictConfig = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictConfig.set.flagStatus).toBe('unreviewed');
    expect(conflictConfig.set.reviewedBy).toBeNull();
    expect(conflictConfig.set.reviewedAt).toBeNull();
  });

  it('upsert updates existing unresolved flag (cascade-035)', async () => {
    const existingFlag = { id: FLAG_ID, flagStatus: 'unreviewed' };
    chainedSelect([existingFlag]);
    const updated = { id: FLAG_ID, flagStatus: 'unreviewed', flagDetail: 'Updated detail' };
    chainedInsert([updated]);

    const result = await upsertRedFlag({ ...baseParams, flagDetail: 'Updated detail' });
    expect(result.action).toBe('updated');
    expect(result.flag.flagDetail).toBe('Updated detail');
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('resolved flag does not block new one (cascade-035)', async () => {
    chainedSelect([]);
    const newFlag = { id: 'new-flag-id', ...baseParams, flagStatus: 'unreviewed' };
    chainedInsert([newFlag]);

    const result = await upsertRedFlag(baseParams);
    expect(result.action).toBe('created');
    expect(result.flag.flagStatus).toBe('unreviewed');
  });

  it('passes change summary JSON when provided', async () => {
    chainedSelect([]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    await upsertRedFlag({
      ...baseParams,
      sourceChangeSummaryJson: { arrivalAtUtc: { from: '10:00', to: '12:00' } },
    });

    const insertValues = insertChain.values.mock.calls[0][0];
    expect(insertValues.sourceChangeSummaryJson).toEqual({
      arrivalAtUtc: { from: '10:00', to: '12:00' },
    });
  });
});

// ── reviewRedFlag ─────────────────────────────────────────────
describe('reviewRedFlag', () => {
  it('transitions unreviewed → reviewed', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'reviewed' }]);

    const result = await reviewRedFlag(EVENT_ID, FLAG_ID, 'user_123');
    expect(result.flagStatus).toBe('reviewed');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.reviewedBy).toBe('user_123');
    expect(setCall.reviewedAt).toBeInstanceOf(Date);
  });

  it('throws when flag not found', async () => {
    chainedSelect([]);
    await expect(reviewRedFlag(EVENT_ID, FLAG_ID, 'user_123')).rejects.toThrow('Red flag not found');
  });

  it('throws when reviewing resolved flag', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'resolved' }]);
    await expect(reviewRedFlag(EVENT_ID, FLAG_ID, 'user_123')).rejects.toThrow(
      'Cannot review a flag in "resolved" status',
    );
  });

  it('throws when reviewing already reviewed flag', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    await expect(reviewRedFlag(EVENT_ID, FLAG_ID, 'user_123')).rejects.toThrow(
      'Cannot review a flag in "reviewed" status',
    );
  });
});

// ── resolveRedFlag ────────────────────────────────────────────
describe('resolveRedFlag', () => {
  it('transitions reviewed → resolved with note', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'resolved' }]);

    const result = await resolveRedFlag(EVENT_ID, FLAG_ID, 'user_123', 'Manually verified OK');
    expect(result.flagStatus).toBe('resolved');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.resolvedBy).toBe('user_123');
    expect(setCall.resolvedAt).toBeInstanceOf(Date);
    expect(setCall.resolutionNote).toBe('Manually verified OK');
  });

  it('allows Super Admin skip: unreviewed → resolved', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);
    chainedUpdate([{ id: FLAG_ID, flagStatus: 'resolved' }]);

    const result = await resolveRedFlag(EVENT_ID, FLAG_ID, 'super_admin_123');
    expect(result.flagStatus).toBe('resolved');
  });

  it('throws when resolving already resolved flag', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'resolved' }]);
    await expect(resolveRedFlag(EVENT_ID, FLAG_ID, 'user_123')).rejects.toThrow(
      'Cannot resolve a flag in "resolved" status',
    );
  });

  it('throws when flag not found', async () => {
    chainedSelect([]);
    await expect(resolveRedFlag(EVENT_ID, FLAG_ID, 'user_123')).rejects.toThrow('Red flag not found');
  });

  it('sets null resolution note when not provided', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'resolved' }]);

    await resolveRedFlag(EVENT_ID, FLAG_ID, 'user_123');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.resolutionNote).toBeNull();
  });
});

// ── Edge case: migration exists ──────────────────────────────
describe('cascade-035 edge cases', () => {
  it('partial index migration exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(
      process.cwd(),
      'drizzle/migrations/0005_red_flags_partial_unique_index.sql',
    );
    const content = fs.readFileSync(migrationPath, 'utf8');
    expect(content).toContain('uq_red_flag_active');
    expect(content).toContain('flag_status');
    expect(content).toContain('resolved');
  });
});
