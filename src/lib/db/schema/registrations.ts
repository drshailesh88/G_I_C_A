import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { events } from './events';
import { people } from './people';

// ── Event Registrations ─────────────────────────────────────────
// Per-event participation record linking a person to an event.
// No payment fields — Indian medical conferences handle payments offline.
// No ticket types — uses category (participation classification) instead.
export const eventRegistrations = pgTable('event_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),

  registrationNumber: text('registration_number').notNull().unique(),
  // Auto-generated unique ID (e.g., GEM2026-DEL-00412)

  category: text('category').notNull().default('delegate'),
  // CHECK: delegate | faculty | invited_guest | sponsor | volunteer

  age: integer('age'),
  // Captured at registration time (changes yearly, event-specific)

  status: text('status').notNull().default('pending'),
  // CHECK: pending | confirmed | waitlisted | declined | cancelled
  // If event does not require approval: starts as 'confirmed'
  // If event requires approval: starts as 'pending'

  preferencesJson: jsonb('preferences_json').notNull().default('{}'),
  // Travel date/time preferences, dietary needs, accessibility requirements

  qrCodeToken: text('qr_code_token').notNull().unique(),
  // Unique string for check-in QR code

  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  // Audit
  createdBy: text('created_by').notNull(), // clerk_user_id or 'system:registration'
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // FK indexes
  index('idx_event_registrations_event_id').on(table.eventId),
  index('idx_event_registrations_person_id').on(table.personId),

  // One registration per person per event
  unique('uq_event_registration').on(table.eventId, table.personId),

  // Status-based queries
  index('idx_event_registrations_event_status').on(table.eventId, table.status),

  // Category-based queries
  index('idx_event_registrations_event_category').on(table.eventId, table.category),

  // QR lookup
  index('idx_event_registrations_qr_token').on(table.qrCodeToken),

  // Registration number lookup
  index('idx_event_registrations_reg_number').on(table.registrationNumber),
]);

export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  event: one(events, { fields: [eventRegistrations.eventId], references: [events.id] }),
  person: one(people, { fields: [eventRegistrations.personId], references: [people.id] }),
}));
