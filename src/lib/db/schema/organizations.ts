import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ── Organizations ───────────────────────────────────────────────
// Future multi-tenancy anchor. V1 has a single org (GEM India).
// Modeled now to avoid painful migration later.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: text('is_active').notNull().default('true'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  events: many(events),
}));

// Forward-declare for relation — actual import happens in events.ts
import { events } from './events';
