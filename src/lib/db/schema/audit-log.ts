import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { events } from './events';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: uuid('resource_id').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb('meta').notNull().default({}),
}, (table) => [
  index('idx_audit_log_event_id').on(table.eventId),
  index('idx_audit_log_actor').on(table.actorUserId),
  index('idx_audit_log_resource').on(table.resource, table.resourceId),
  index('idx_audit_log_timestamp').on(table.timestamp),
]);
