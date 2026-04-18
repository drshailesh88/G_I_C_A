import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ── People (Master People Database) ─────────────────────────────
// One person, one record, reusable across events.
// Identity anchor for all person-linked operational records.
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identity
  salutation: text('salutation'),
  // Recommended: Dr, Prof, Mr, Mrs, Ms, Mx, Other
  fullName: text('full_name').notNull(),
  email: text('email'),
  phoneE164: text('phone_e164'),
  // Normalized to E.164 on input via libphonenumber-js

  // Professional
  designation: text('designation'),
  specialty: text('specialty'),
  organization: text('organization'),
  city: text('city'),

  // Profile (public speaker profile)
  bio: text('bio'),
  photoStorageKey: text('photo_storage_key'), // R2 object key for signed URL

  // Categorization
  tags: jsonb('tags').notNull().default('[]'),
  // Array of strings: ["VIP", "sponsor", "volunteer"]

  // Lifecycle — archive, never hard delete
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedBy: text('archived_by'), // clerk_user_id
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  anonymizedBy: text('anonymized_by'), // clerk_user_id

  // Audit
  createdBy: text('created_by').notNull(), // clerk_user_id or 'system:registration' etc.
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Dedup indexes — email and phone are the primary match keys
  index('idx_people_email').on(table.email),
  index('idx_people_phone_e164').on(table.phoneE164),

  // Search indexes
  index('idx_people_full_name').on(table.fullName),
  index('idx_people_organization').on(table.organization),
  index('idx_people_city').on(table.city),
  index('idx_people_specialty').on(table.specialty),

  // Active records partial index (exclude archived)
  index('idx_people_active').on(table.fullName).where(sql`archived_at IS NULL AND anonymized_at IS NULL`),

  // Tags GIN index for containment queries
  index('idx_people_tags').using('gin', table.tags),
]);

export const peopleRelations = relations(people, ({ many }) => ({
  registrations: many(eventRegistrations),
  sessionAssignments: many(sessionAssignments),
  facultyInvites: many(facultyInvites),
  travelRecords: many(travelRecords),
  accommodationRecords: many(accommodationRecords),
  transportPassengerAssignments: many(transportPassengerAssignments),
  issuedCertificates: many(issuedCertificates),
}));

// Forward-declare imports for relations
import { eventRegistrations } from './registrations';
import { sessionAssignments, facultyInvites } from './program';
import { travelRecords, accommodationRecords, transportPassengerAssignments } from './logistics';
import { issuedCertificates } from './certificates';
