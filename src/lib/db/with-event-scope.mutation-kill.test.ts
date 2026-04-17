import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
  };
});

import { eq, and } from 'drizzle-orm';
import { withEventScope } from './with-event-scope';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const testTable = pgTable('wes_mk', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  status: text('status'),
});

describe('withEventScope — mutation kill: filter predicate and branch selection', () => {
  beforeEach(() => {
    vi.mocked(eq).mockClear();
    vi.mocked(and).mockClear();
  });

  // L26: `=== 1` → `false` — always calls and(); this asserts it does NOT for no-extras case
  it('does NOT call and() when no extra conditions are provided', () => {
    withEventScope(testTable.eventId, VALID_EVENT_ID);
    expect(vi.mocked(and)).not.toHaveBeenCalled();
  });

  // L26: `=== 1` → `true` — always returns allConditions[0]; kills because and() is expected
  // L26: `=== 1` → `!== 1` — inverts; 2-item case returns allConditions[0]; and() not called
  // L23: `c === undefined` — extra SQL filtered out; allConditions has 1 item; and() not called
  // L23: `false`, `() => undefined` — all extras filtered; allConditions has 1 item; and() not called
  it('calls and() exactly once when one extra SQL condition is provided', () => {
    const extra = eq(testTable.status, 'active');
    vi.mocked(and).mockClear();
    vi.mocked(eq).mockClear();
    withEventScope(testTable.eventId, VALID_EVENT_ID, extra);
    expect(vi.mocked(and)).toHaveBeenCalledOnce();
  });

  // L23: MethodExpression `...conditions` (no filter) — undefined kept; allConditions has 2 items; and() called
  // L23: `true` — undefined kept; same effect
  it('does NOT call and() when the only extra condition is undefined (filtered out)', () => {
    withEventScope(testTable.eventId, VALID_EVENT_ID, undefined);
    expect(vi.mocked(and)).not.toHaveBeenCalled();
  });

  // L23: `false`, `() => undefined`, `c === undefined` — all filter out the real SQL extra
  //   so and() called with only 1 arg (the eventId eq); toHaveLength(2) fails → mutant killed
  it('calls and() with exactly 2 args: eventId eq plus the extra SQL condition', () => {
    const extra = eq(testTable.status, 'confirmed');
    vi.mocked(and).mockClear();
    vi.mocked(eq).mockClear();
    withEventScope(testTable.eventId, VALID_EVENT_ID, extra);
    expect(vi.mocked(and).mock.calls[0]).toHaveLength(2);
  });

  // Compound: one real SQL + one undefined → only the real SQL passes the filter
  it('calls and() with 2 args when extras contain one SQL condition and one undefined', () => {
    const extra = eq(testTable.status, 'pending');
    vi.mocked(and).mockClear();
    vi.mocked(eq).mockClear();
    withEventScope(testTable.eventId, VALID_EVENT_ID, extra, undefined);
    expect(vi.mocked(and)).toHaveBeenCalledOnce();
    expect(vi.mocked(and).mock.calls[0]).toHaveLength(2);
  });

  it('rejects malformed event IDs before building any SQL', () => {
    expect(() => withEventScope(testTable.eventId, 'not-a-uuid')).toThrow(/eventId/i);
    expect(vi.mocked(eq)).not.toHaveBeenCalled();
    expect(vi.mocked(and)).not.toHaveBeenCalled();
  });
});
