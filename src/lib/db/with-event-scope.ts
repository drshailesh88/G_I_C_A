import { eq, and, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Append event_id scoping to any existing where clause.
 * Ensures every event-scoped query includes the event_id filter.
 *
 * Usage:
 *   .where(withEventScope(table.eventId, eventId))
 *   .where(withEventScope(table.eventId, eventId, eq(table.status, 'active')))
 */
export function withEventScope(
  eventIdColumn: PgColumn,
  eventId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  const allConditions = [
    eq(eventIdColumn, eventId),
    ...conditions.filter((c): c is SQL => c !== undefined),
  ];

  return allConditions.length === 1
    ? allConditions[0]
    : and(...allConditions)!;
}
