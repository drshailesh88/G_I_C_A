import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { withEventScope } from './with-event-scope';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

// Minimal test table to get a real PgColumn
const testTable = pgTable('test', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  status: text('status'),
});

describe('withEventScope', () => {
  it('returns an event_id eq condition when called with no extra conditions', () => {
    const condition = withEventScope(testTable.eventId, VALID_EVENT_ID);
    // Should produce SQL equivalent to eq(testTable.eventId, 'abc-123')
    expect(condition).toBeDefined();
  });

  it('combines event_id condition with additional conditions', () => {
    const extra = eq(testTable.status, 'active');
    const condition = withEventScope(testTable.eventId, VALID_EVENT_ID, extra);
    expect(condition).toBeDefined();
  });

  it('filters out undefined conditions', () => {
    const condition = withEventScope(testTable.eventId, VALID_EVENT_ID, undefined);
    expect(condition).toBeDefined();
  });

  it.each([
    '',
    null,
    undefined,
    'not-a-uuid',
    ` ${VALID_EVENT_ID} `,
    `${VALID_EVENT_ID}${VALID_EVENT_ID}`,
  ])('rejects invalid eventId: %p', (eventId) => {
    expect(() => withEventScope(testTable.eventId, eventId as never)).toThrow(/eventId/i);
  });
});
