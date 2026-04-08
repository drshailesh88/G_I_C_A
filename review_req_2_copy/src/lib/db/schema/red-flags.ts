import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { events } from './events';

// ── Red Flags ───────────────────────────────────────────────────
// System-generated downstream review alerts from the cascade system.
// Lifecycle: unreviewed → reviewed → resolved.
// Only one active (unresolved) flag per target + type at a time.
export const redFlags = pgTable('red_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),

  flagType: text('flag_type').notNull(),
  // CHECK: travel_change | travel_cancelled | accommodation_change | accommodation_cancelled | registration_cancelled | shared_room_affected
  flagDetail: text('flag_detail').notNull(),
  // Human-readable ops message

  // Target: which downstream record is affected
  targetEntityType: text('target_entity_type').notNull(),
  // CHECK: accommodation_record | transport_batch | transport_passenger_assignment
  targetEntityId: uuid('target_entity_id').notNull(),

  // Source: which upstream change triggered this flag
  sourceEntityType: text('source_entity_type').notNull(),
  // CHECK: travel_record | accommodation_record | registration
  sourceEntityId: uuid('source_entity_id').notNull(),
  sourceChangeSummaryJson: jsonb('source_change_summary_json'),
  // Structured machine-readable diff

  // Lifecycle
  flagStatus: text('flag_status').notNull().default('unreviewed'),
  // CHECK: unreviewed | reviewed | resolved
  reviewedBy: text('reviewed_by'), // clerk_user_id
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'), // clerk_user_id
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_red_flags_event_id').on(table.eventId),
  index('idx_red_flags_event_status').on(table.eventId, table.flagStatus),
  index('idx_red_flags_target').on(table.targetEntityType, table.targetEntityId),
  index('idx_red_flags_source').on(table.sourceEntityType, table.sourceEntityId),
  // Partial unique (one active per target+type) enforced via raw SQL migration:
  // CREATE UNIQUE INDEX uq_red_flag_active ON red_flags (event_id, target_entity_type, target_entity_id, flag_type) WHERE flag_status != 'resolved';
  // CREATE INDEX idx_red_flags_unreviewed ON red_flags (event_id) WHERE flag_status = 'unreviewed';
  index('idx_red_flags_target_type').on(table.eventId, table.targetEntityType, table.targetEntityId, table.flagType),
]);

export const redFlagsRelations = relations(redFlags, ({ one }) => ({
  event: one(events, { fields: [redFlags.eventId], references: [events.id] }),
}));
