import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { events } from './events';
import { people } from './people';

// ── Event–People Junction ──────────────────────────────────────
// Auto-upserted on first event touchpoint (registration, invite,
// assignment, travel, accommodation). Never a manual step.
export const eventPeople = pgTable('event_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),

  // How they became linked to this event
  source: text('source').notNull(),
  // registration | invite | assignment | travel | accommodation | manual

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_event_people_event_id').on(table.eventId),
  index('idx_event_people_person_id').on(table.personId),
  unique('uq_event_people').on(table.eventId, table.personId),
]);

export const eventPeopleRelations = relations(eventPeople, ({ one }) => ({
  event: one(events, { fields: [eventPeople.eventId], references: [events.id] }),
  person: one(people, { fields: [eventPeople.personId], references: [people.id] }),
}));
