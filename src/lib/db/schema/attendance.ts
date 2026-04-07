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
  // Prevent duplicate check-in per person per session (or per event if session is null)
  unique('uq_attendance_check').on(table.eventId, table.personId, table.sessionId),
]);

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  event: one(events, { fields: [attendanceRecords.eventId], references: [events.id] }),
  person: one(people, { fields: [attendanceRecords.personId], references: [people.id] }),
  registration: one(eventRegistrations, { fields: [attendanceRecords.registrationId], references: [eventRegistrations.id] }),
  session: one(sessions, { fields: [attendanceRecords.sessionId], references: [sessions.id] }),
}));
