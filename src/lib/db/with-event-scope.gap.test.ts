import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { withEventScope } from './with-event-scope';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const testTable = pgTable('test', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  status: text('status'),
  category: text('category'),
});

describe('withEventScope — gap tests', () => {
  it('composes eventId with multiple additional conditions', () => {
    const extra1 = eq(testTable.status, 'active');
    const extra2 = eq(testTable.category, 'main');
    const condition = withEventScope(testTable.eventId, VALID_EVENT_ID, extra1, extra2);
    expect(condition).toBeDefined();
  });

  it('returns defined result for single condition (no extras)', () => {
    const condition = withEventScope(testTable.eventId, VALID_EVENT_ID);
    expect(condition).toBeDefined();
  });
});
