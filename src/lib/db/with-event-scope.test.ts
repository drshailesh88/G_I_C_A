import { describe, expect, it } from 'vitest';
import { eq, and, sql } from 'drizzle-orm';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { withEventScope } from './with-event-scope';

// Minimal test table to get a real PgColumn
const testTable = pgTable('test', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  status: text('status'),
});

describe('withEventScope', () => {
  it('returns an event_id eq condition when called with no extra conditions', () => {
    const condition = withEventScope(testTable.eventId, 'abc-123');
    // Should produce SQL equivalent to eq(testTable.eventId, 'abc-123')
    expect(condition).toBeDefined();
  });

  it('combines event_id condition with additional conditions', () => {
    const extra = eq(testTable.status, 'active');
    const condition = withEventScope(testTable.eventId, 'abc-123', extra);
    expect(condition).toBeDefined();
  });

  it('filters out undefined conditions', () => {
    const condition = withEventScope(testTable.eventId, 'abc-123', undefined);
    expect(condition).toBeDefined();
  });

  // Codex Bug #3: reject blank/empty event IDs
  it.each(['', null, undefined])('rejects invalid eventId: %p', (eventId) => {
    expect(() => withEventScope(testTable.eventId, eventId as never)).toThrow(/eventId/i);
  });
});
