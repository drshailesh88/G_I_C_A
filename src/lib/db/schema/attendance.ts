import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { events } from './events';
import { people } from './people';
import { eventRegistrations } from './registrations';
import { sessions } from './program';

// ── Attendance / Check-in Records ───────────────────────────────
// Physical presence tracking. Separate from registration status.
// Repeatable (Day 1, Day 2) and per-session if configured.
export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  // Nullable: null = event-level check-in, set = session-level check-in

  checkInMethod: text('check_in_method').notNull(),
  // CHECK: qr_scan | manual_search | kiosk | self_service
  checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull().defaultNow(),
  checkInBy: text('check_in_by'), // clerk_user_id of staff who scanned, null for self-service

  // For offline-capable PWA: records queued locally, synced later
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  offlineDeviceId: text('offline_device_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_attendance_event_id').on(table.eventId),
  index('idx_attendance_person_id').on(table.personId),
  index('idx_attendance_registration_id').on(table.registrationId),
  index('idx_attendance_session_id').on(table.sessionId),
  index('idx_attendance_event_person').on(table.eventId, table.personId),
  // NOTE: Duplicate prevention for event-level check-ins (session_id IS NULL) requires
  // a COALESCE-based unique index since PostgreSQL NULLs don't collide in standard unique
  // constraints. This is handled by migration 0001_fix_attendance_null_uniqueness.sql:
  //   CREATE UNIQUE INDEX uq_attendance_check ON attendance_records
  //     (event_id, person_id, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'));
  // The application also uses deterministic IDs + catch 23505 as defense-in-depth.
]);

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  event: one(events, { fields: [attendanceRecords.eventId], references: [events.id] }),
  person: one(people, { fields: [attendanceRecords.personId], references: [people.id] }),
  registration: one(eventRegistrations, { fields: [attendanceRecords.registrationId], references: [eventRegistrations.id] }),
  session: one(sessions, { fields: [attendanceRecords.sessionId], references: [sessions.id] }),
}));
