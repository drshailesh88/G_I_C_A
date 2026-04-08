import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { events, halls } from './events';
import { people } from './people';

// ── Sessions ────────────────────────────────────────────────────
// Event-scoped scheduled time blocks — scientific or service.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  parentSessionId: uuid('parent_session_id'),
  // Self-FK added below. One level only: parent's parent must be null.

  title: text('title').notNull(),
  description: text('description'),

  // Time (stored UTC, display via event.timezone)
  sessionDate: timestamp('session_date', { withTimezone: true }),
  startAtUtc: timestamp('start_at_utc', { withTimezone: true }),
  endAtUtc: timestamp('end_at_utc', { withTimezone: true }),

  // Location
  hallId: uuid('hall_id').references(() => halls.id, { onDelete: 'set null' }),

  // Classification
  sessionType: text('session_type').notNull().default('other'),
  // CHECK: keynote | panel | workshop | free_paper | plenary | symposium | break | lunch | registration | other
  track: text('track'),
  isPublic: boolean('is_public').notNull().default(true),

  // Medical
  cmeCredits: integer('cme_credits'),

  // Ordering
  sortOrder: integer('sort_order').notNull().default(0),

  // Status
  status: text('status').notNull().default('draft'),
  // CHECK: draft | scheduled | completed | cancelled
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_sessions_event_id').on(table.eventId),
  index('idx_sessions_hall_id').on(table.hallId),
  index('idx_sessions_parent_session_id').on(table.parentSessionId),
  index('idx_sessions_event_status').on(table.eventId, table.status),
  index('idx_sessions_event_date').on(table.eventId, table.sessionDate),
  index('idx_sessions_event_hall_start').on(table.eventId, table.hallId, table.startAtUtc),
]);

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  event: one(events, { fields: [sessions.eventId], references: [events.id] }),
  hall: one(halls, { fields: [sessions.hallId], references: [halls.id] }),
  parentSession: one(sessions, {
    fields: [sessions.parentSessionId],
    references: [sessions.id],
    relationName: 'sessionHierarchy',
  }),
  childSessions: many(sessions, { relationName: 'sessionHierarchy' }),
  roleRequirements: many(sessionRoleRequirements),
  assignments: many(sessionAssignments),
}));

// ── Session Role Requirements ───────────────────────────────────
// Planning records: "Session X needs 1 Chair, 3 Speakers."
// No person_id — these are demand slots, not assignments.
export const sessionRoleRequirements = pgTable('session_role_requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  // CHECK: speaker | chair | co_chair | moderator | panelist | discussant | presenter
  requiredCount: integer('required_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_session_role_reqs_session_id').on(table.sessionId),
  unique('uq_session_role_req').on(table.sessionId, table.role),
]);

export const sessionRoleRequirementsRelations = relations(sessionRoleRequirements, ({ one }) => ({
  session: one(sessions, { fields: [sessionRoleRequirements.sessionId], references: [sessions.id] }),
}));

// ── Session Assignments (Session-Faculty Junction) ──────────────
// Confirmed assignments: person + session + role.
// person_id is ALWAYS non-null — no placeholder rows.
export const sessionAssignments = pgTable('session_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),

  role: text('role').notNull(),
  // CHECK: speaker | chair | co_chair | moderator | panelist | discussant | presenter
  sortOrder: integer('sort_order').notNull().default(0),
  presentationTitle: text('presentation_title'),
  presentationDurationMinutes: integer('presentation_duration_minutes'),
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_session_assignments_event_id').on(table.eventId),
  index('idx_session_assignments_session_id').on(table.sessionId),
  index('idx_session_assignments_person_id').on(table.personId),
  index('idx_session_assignments_event_person').on(table.eventId, table.personId),
  index('idx_session_assignments_session_sort').on(table.sessionId, table.sortOrder),
  unique('uq_session_assignment').on(table.sessionId, table.personId, table.role),
]);

export const sessionAssignmentsRelations = relations(sessionAssignments, ({ one }) => ({
  event: one(events, { fields: [sessionAssignments.eventId], references: [events.id] }),
  session: one(sessions, { fields: [sessionAssignments.sessionId], references: [sessions.id] }),
  person: one(people, { fields: [sessionAssignments.personId], references: [people.id] }),
}));

// ── Faculty Invites ─────────────────────────────────────────────
// Separate workflow: invitation & confirmation for responsibility bundles.
// V1: bundle-level (whole event), not per-assignment.
export const facultyInvites = pgTable('faculty_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),

  token: text('token').notNull().unique(),
  status: text('status').notNull().default('sent'),
  // CHECK: sent | opened | accepted | declined | expired
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  programVersionId: uuid('program_version_id'),
  // FK to program_versions added after that table is defined

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_faculty_invites_event_id').on(table.eventId),
  index('idx_faculty_invites_person_id').on(table.personId),
  index('idx_faculty_invites_event_person').on(table.eventId, table.personId),
  index('idx_faculty_invites_token').on(table.token),
  index('idx_faculty_invites_status').on(table.status),
]);

export const facultyInvitesRelations = relations(facultyInvites, ({ one }) => ({
  event: one(events, { fields: [facultyInvites.eventId], references: [events.id] }),
  person: one(people, { fields: [facultyInvites.personId], references: [people.id] }),
  programVersion: one(programVersions, { fields: [facultyInvites.programVersionId], references: [programVersions.id] }),
}));

// ── Program Versions ────────────────────────────────────────────
// Published snapshots of the scientific program.
// Draft edits do NOT create rows here — only deliberate Publish actions.
export const programVersions = pgTable('program_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),

  versionNo: integer('version_no').notNull(),
  baseVersionId: uuid('base_version_id'),
  // Self-FK to previous published version

  snapshotJson: jsonb('snapshot_json').notNull(),
  // Full program state: sessions, sub-sessions, halls, timings, assignments, TBA slots
  changesSummaryJson: jsonb('changes_summary_json'),
  // Structured diff: added_sessions, removed_sessions, moved_sessions, assignment_changes, tba_filled, tba_reopened
  changesDescription: text('changes_description'),
  // Coordinator-written release note
  affectedPersonIdsJson: jsonb('affected_person_ids_json'),
  publishReason: text('publish_reason'),

  // Notification tracking
  notificationStatus: text('notification_status').notNull().default('not_required'),
  // CHECK: not_required | pending | sent | partially_failed | failed
  notificationTriggeredAt: timestamp('notification_triggered_at', { withTimezone: true }),

  // Audit
  publishedBy: text('published_by').notNull(), // clerk_user_id
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_program_versions_event_id').on(table.eventId),
  index('idx_program_versions_base').on(table.baseVersionId),
  unique('uq_program_version').on(table.eventId, table.versionNo),
]);

export const programVersionsRelations = relations(programVersions, ({ one }) => ({
  event: one(events, { fields: [programVersions.eventId], references: [events.id] }),
  baseVersion: one(programVersions, {
    fields: [programVersions.baseVersionId],
    references: [programVersions.id],
    relationName: 'versionChain',
  }),
}));
