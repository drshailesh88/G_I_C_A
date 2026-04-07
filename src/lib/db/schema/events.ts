import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  unique,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';

// ── Events ──────────────────────────────────────────────────────
// Primary data boundary. Everything scopes to an event.
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),

  // Dates & timezone
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),

  // Lifecycle
  status: text('status').notNull().default('draft'),
  // CHECK: draft | published | completed | archived | cancelled
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  // Venue
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  venueCity: text('venue_city'),
  venueMapUrl: text('venue_map_url'),

  // JSONB config blocks
  moduleToggles: jsonb('module_toggles').notNull().default('{}'),
  fieldConfig: jsonb('field_config').notNull().default('{}'),
  branding: jsonb('branding').notNull().default('{}'),
  registrationSettings: jsonb('registration_settings').notNull().default('{}'),
  communicationSettings: jsonb('communication_settings').notNull().default('{}'),
  publicPageSettings: jsonb('public_page_settings').notNull().default('{}'),

  // Audit
  createdBy: text('created_by').notNull(), // clerk_user_id
  updatedBy: text('updated_by').notNull(), // clerk_user_id
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_events_organization_id').on(table.organizationId),
  index('idx_events_status').on(table.status),
  unique('uq_events_org_slug').on(table.organizationId, table.slug),
  index('idx_events_start_date').on(table.startDate),
]);

export const eventsRelations = relations(events, ({ one, many }) => ({
  organization: one(organizations, { fields: [events.organizationId], references: [organizations.id] }),
  halls: many(halls),
  eventUserAssignments: many(eventUserAssignments),
}));

// ── Halls ───────────────────────────────────────────────────────
// Physical spaces within an event venue.
export const halls = pgTable('halls', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  capacity: text('capacity'), // nullable, stored as text to avoid int limits debate
  sortOrder: text('sort_order').notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_halls_event_id').on(table.eventId),
  unique('uq_halls_event_name').on(table.eventId, table.name),
]);

export const hallsRelations = relations(halls, ({ one }) => ({
  event: one(events, { fields: [halls.eventId], references: [events.id] }),
}));

// ── Event User Assignments ──────────────────────────────────────
// Per-event access control. Clerk owns global roles; this table owns event scope.
export const eventUserAssignments = pgTable('event_user_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  authUserId: text('auth_user_id').notNull(), // clerk_user_id
  assignmentType: text('assignment_type').notNull().default('collaborator'),
  // CHECK: owner | collaborator
  isActive: boolean('is_active').notNull().default(true),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  assignedBy: text('assigned_by').notNull(), // clerk_user_id
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_event_user_assignments_event_id').on(table.eventId),
  index('idx_event_user_assignments_auth_user_id').on(table.authUserId),
  unique('uq_event_user_assignment').on(table.eventId, table.authUserId),
]);

export const eventUserAssignmentsRelations = relations(eventUserAssignments, ({ one }) => ({
  event: one(events, { fields: [eventUserAssignments.eventId], references: [events.id] }),
}));
