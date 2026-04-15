/**
 * Mutation-killing tests for src/lib/cascade/red-flags.ts
 *
 * Targets: NoCoverage on getRedFlagsForTarget, getUnresolvedFlags,
 * getFlaggedEntityIds; LogicalOperator on sourceChangeSummaryJson ?? null;
 * StringLiteral on status values in set calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((..._args: unknown[]) => 'event-scope-condition'),
}));

import {
  upsertRedFlag,
  reviewRedFlag,
  resolveRedFlag,
  getRedFlagsForTarget,
  getUnresolvedFlags,
  getFlaggedEntityIds,
  FLAG_TYPES,
  TARGET_ENTITY_TYPES,
  SOURCE_ENTITY_TYPES,
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

function chainedSelectNoLimit(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
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

// ── Constants: kill ArrayDeclaration and exact value mutations ──

describe('Red flag type registries', () => {
  it('FLAG_TYPES has exactly 7 entries', () => {
    expect(FLAG_TYPES).toHaveLength(7);
  });

  it('FLAG_TYPES contains all required types', () => {
    expect(FLAG_TYPES).toContain('travel_change');
    expect(FLAG_TYPES).toContain('travel_cancelled');
    expect(FLAG_TYPES).toContain('accommodation_change');
    expect(FLAG_TYPES).toContain('accommodation_cancelled');
    expect(FLAG_TYPES).toContain('registration_cancelled');
    expect(FLAG_TYPES).toContain('shared_room_affected');
    expect(FLAG_TYPES).toContain('system_dispatch_failure');
  });

  it('TARGET_ENTITY_TYPES has exactly 4 entries', () => {
    expect(TARGET_ENTITY_TYPES).toHaveLength(4);
    expect(TARGET_ENTITY_TYPES).toContain('accommodation_record');
    expect(TARGET_ENTITY_TYPES).toContain('transport_batch');
    expect(TARGET_ENTITY_TYPES).toContain('transport_passenger_assignment');
    expect(TARGET_ENTITY_TYPES).toContain('notification_log');
  });

  it('SOURCE_ENTITY_TYPES has exactly 4 entries', () => {
    expect(SOURCE_ENTITY_TYPES).toHaveLength(4);
    expect(SOURCE_ENTITY_TYPES).toContain('travel_record');
    expect(SOURCE_ENTITY_TYPES).toContain('accommodation_record');
    expect(SOURCE_ENTITY_TYPES).toContain('registration');
    expect(SOURCE_ENTITY_TYPES).toContain('cascade_dispatch');
  });

  it('FLAG_STATUSES are in lifecycle order', () => {
    expect(FLAG_STATUSES).toEqual(['unreviewed', 'reviewed', 'resolved']);
  });

  it('FLAG_TRANSITIONS: unreviewed allows reviewed and resolved', () => {
    expect(FLAG_TRANSITIONS.unreviewed).toEqual(['reviewed', 'resolved']);
  });

  it('FLAG_TRANSITIONS: reviewed only allows resolved', () => {
    expect(FLAG_TRANSITIONS.reviewed).toEqual(['resolved']);
  });

  it('FLAG_TRANSITIONS: resolved is terminal (empty array)', () => {
    expect(FLAG_TRANSITIONS.resolved).toEqual([]);
  });
});

// ── upsertRedFlag: kill LogicalOperator on sourceChangeSummaryJson ?? null ──

describe('upsertRedFlag sourceChangeSummaryJson handling', () => {
  const baseParams = {
    eventId: EVENT_ID,
    flagType: 'travel_change' as const,
    flagDetail: 'Arrival changed',
    targetEntityType: 'accommodation_record' as const,
    targetEntityId: TARGET_ID,
    sourceEntityType: 'travel_record' as const,
    sourceEntityId: SOURCE_ID,
  };

  it('sets sourceChangeSummaryJson to null when not provided (create path)', async () => {
    chainedSelect([]); // no existing
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    await upsertRedFlag(baseParams);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.sourceChangeSummaryJson).toBeNull();
  });

  it('passes sourceChangeSummaryJson through when provided (create path)', async () => {
    chainedSelect([]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    const summary = { arrival: { from: '10:00', to: '14:00' } };
    await upsertRedFlag({ ...baseParams, sourceChangeSummaryJson: summary });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.sourceChangeSummaryJson).toEqual(summary);
  });

  it('sets sourceChangeSummaryJson to null when not provided (update path via onConflict)', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    await upsertRedFlag(baseParams);

    const conflictConfig = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictConfig.set.sourceChangeSummaryJson).toBeNull();
  });

  it('passes sourceChangeSummaryJson through when provided (update path via onConflict)', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    const summary = { room: { from: 'A101', to: 'B202' } };
    await upsertRedFlag({ ...baseParams, sourceChangeSummaryJson: summary });

    const conflictConfig = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictConfig.set.sourceChangeSummaryJson).toEqual(summary);
  });
});

// ── upsertRedFlag: kill StringLiteral on flagStatus values ──

describe('upsertRedFlag status values', () => {
  const baseParams = {
    eventId: EVENT_ID,
    flagType: 'accommodation_change' as const,
    flagDetail: 'Room reassigned',
    targetEntityType: 'transport_batch' as const,
    targetEntityId: TARGET_ID,
    sourceEntityType: 'accommodation_record' as const,
    sourceEntityId: SOURCE_ID,
  };

  it('creates flag with exact status "unreviewed"', async () => {
    chainedSelect([]);
    const insertChain = chainedInsert([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);

    await upsertRedFlag(baseParams);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.flagStatus).toBe('unreviewed');
  });

  it('resets updated flag to exact status "unreviewed" (via onConflict set)', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    await upsertRedFlag(baseParams);

    const conflictConfig = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictConfig.set.flagStatus).toBe('unreviewed');
  });

  it('clears reviewedBy and reviewedAt on update (via onConflict set)', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const insertChain = chainedInsert([{ id: FLAG_ID }]);

    await upsertRedFlag(baseParams);

    const conflictConfig = insertChain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflictConfig.set.reviewedBy).toBeNull();
    expect(conflictConfig.set.reviewedAt).toBeNull();
    expect(conflictConfig.set.updatedAt).toBeInstanceOf(Date);
  });
});

// ── reviewRedFlag: kill StringLiteral on 'reviewed' status ──

describe('reviewRedFlag status values', () => {
  it('sets flagStatus to exact string "reviewed"', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'reviewed' }]);

    await reviewRedFlag(EVENT_ID, FLAG_ID, 'user-abc');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.flagStatus).toBe('reviewed');
    expect(setCall.reviewedBy).toBe('user-abc');
    expect(setCall.reviewedAt).toBeInstanceOf(Date);
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

// ── resolveRedFlag: kill StringLiteral on 'resolved' status ──

describe('resolveRedFlag status values', () => {
  it('sets flagStatus to exact string "resolved"', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'reviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'resolved' }]);

    await resolveRedFlag(EVENT_ID, FLAG_ID, 'admin-1', 'Checked manually');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.flagStatus).toBe('resolved');
    expect(setCall.resolvedBy).toBe('admin-1');
    expect(setCall.resolvedAt).toBeInstanceOf(Date);
    expect(setCall.resolutionNote).toBe('Checked manually');
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });

  it('sets resolutionNote to null when empty string provided', async () => {
    chainedSelect([{ id: FLAG_ID, flagStatus: 'unreviewed' }]);
    const updateChain = chainedUpdate([{ id: FLAG_ID, flagStatus: 'resolved' }]);

    await resolveRedFlag(EVENT_ID, FLAG_ID, 'admin-1', '');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.resolutionNote).toBeNull();
  });
});

// ── getRedFlagsForTarget: kill NoCoverage ──

describe('getRedFlagsForTarget', () => {
  it('returns all flags for a specific target entity', async () => {
    const flagRows = [
      { id: 'f1', flagType: 'travel_change', flagStatus: 'unreviewed' },
      { id: 'f2', flagType: 'accommodation_change', flagStatus: 'resolved' },
    ];
    chainedSelectNoLimit(flagRows);

    const result = await getRedFlagsForTarget(
      EVENT_ID,
      'accommodation_record',
      TARGET_ID,
    );

    expect(result).toEqual(flagRows);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('returns empty array when no flags exist', async () => {
    chainedSelectNoLimit([]);

    const result = await getRedFlagsForTarget(
      EVENT_ID,
      'transport_batch',
      'non-existent-id',
    );

    expect(result).toEqual([]);
  });
});

// ── getUnresolvedFlags: kill NoCoverage + ConditionalExpression on optional filter ──

describe('getUnresolvedFlags', () => {
  it('returns unresolved flags for an event without type filter', async () => {
    const flagRows = [
      { id: 'f1', flagStatus: 'unreviewed', targetEntityType: 'accommodation_record' },
      { id: 'f2', flagStatus: 'reviewed', targetEntityType: 'transport_batch' },
    ];
    chainedSelectNoLimit(flagRows);

    const result = await getUnresolvedFlags(EVENT_ID);

    expect(result).toEqual(flagRows);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters by targetEntityType when provided', async () => {
    const flagRows = [
      { id: 'f1', flagStatus: 'unreviewed', targetEntityType: 'transport_batch' },
    ];
    chainedSelectNoLimit(flagRows);

    const result = await getUnresolvedFlags(EVENT_ID, 'transport_batch');

    expect(result).toEqual(flagRows);
  });

  it('returns empty array when no unresolved flags', async () => {
    chainedSelectNoLimit([]);

    const result = await getUnresolvedFlags(EVENT_ID);

    expect(result).toEqual([]);
  });
});

// ── getFlaggedEntityIds: kill NoCoverage + deduplication ──

describe('getFlaggedEntityIds', () => {
  it('returns unique target entity IDs with unresolved flags', async () => {
    const rows = [
      { targetEntityId: 'ent-1' },
      { targetEntityId: 'ent-2' },
      { targetEntityId: 'ent-1' }, // duplicate
    ];
    chainedSelectNoLimit(rows);

    const result = await getFlaggedEntityIds(EVENT_ID, 'accommodation_record');

    expect(result).toHaveLength(2);
    expect(result).toContain('ent-1');
    expect(result).toContain('ent-2');
  });

  it('returns empty array when no flagged entities', async () => {
    chainedSelectNoLimit([]);

    const result = await getFlaggedEntityIds(EVENT_ID, 'transport_batch');

    expect(result).toEqual([]);
  });

  it('deduplicates IDs that appear multiple times', async () => {
    const rows = [
      { targetEntityId: 'same-id' },
      { targetEntityId: 'same-id' },
      { targetEntityId: 'same-id' },
    ];
    chainedSelectNoLimit(rows);

    const result = await getFlaggedEntityIds(EVENT_ID, 'accommodation_record');

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('same-id');
  });
});
