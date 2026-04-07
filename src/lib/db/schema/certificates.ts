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
import { events } from './events';
import { people } from './people';

// ── Certificate Templates ───────────────────────────────────────
// Visual document blueprints stored as pdfme JSON.
// One active template per (event_id, certificate_type).
export const certificateTemplates = pgTable('certificate_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),

  templateName: text('template_name').notNull(),
  certificateType: text('certificate_type').notNull(),
  // CHECK: delegate_attendance | faculty_participation | speaker_recognition | chairperson_recognition | panelist_recognition | moderator_recognition | cme_attendance
  audienceScope: text('audience_scope').notNull(),
  // CHECK: delegate | faculty | speaker | chairperson | panelist | moderator | mixed

  templateJson: jsonb('template_json').notNull(),
  // Full pdfme designer payload

  pageSize: text('page_size').notNull().default('A4_landscape'),
  // CHECK: A4_landscape | A4_portrait
  orientation: text('orientation').notNull().default('landscape'),
  // CHECK: landscape | portrait

  allowedVariablesJson: jsonb('allowed_variables_json').notNull().default('[]'),
  requiredVariablesJson: jsonb('required_variables_json').notNull().default('[]'),
  defaultFileNamePattern: text('default_file_name_pattern').notNull()
    .default('{{full_name}}-{{event_name}}-certificate.pdf'),

  previewThumbnailUrl: text('preview_thumbnail_url'), // R2 key
  signatureConfigJson: jsonb('signature_config_json'),
  // Signer name, title, image URL, placement rules
  brandingSnapshotJson: jsonb('branding_snapshot_json'),
  // Logo/header/color assumptions for stable historical rendering

  qrVerificationEnabled: boolean('qr_verification_enabled').notNull().default(true),
  verificationText: text('verification_text'),

  status: text('status').notNull().default('draft'),
  // CHECK: draft | active | archived
  versionNo: integer('version_no').notNull().default(1),
  isSystemTemplate: boolean('is_system_template').notNull().default(false),

  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_cert_templates_event_id').on(table.eventId),
  index('idx_cert_templates_event_type').on(table.eventId, table.certificateType),
  index('idx_cert_templates_status').on(table.status),
  // Only one active template per event + type
  unique('uq_cert_template_active').on(table.eventId, table.certificateType).where(sql`status = 'active'`),
]);

export const certificateTemplatesRelations = relations(certificateTemplates, ({ one, many }) => ({
  event: one(events, { fields: [certificateTemplates.eventId], references: [events.id] }),
  issuedCertificates: many(issuedCertificates),
}));

// ── Issued Certificates ─────────────────────────────────────────
// Immutable issuance record. One per person per generation.
// Regeneration creates new row (supersedes old one), never overwrites.
export const issuedCertificates = pgTable('issued_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),
  templateId: uuid('template_id').notNull().references(() => certificateTemplates.id, { onDelete: 'restrict' }),
  templateVersionNo: integer('template_version_no').notNull(),

  certificateType: text('certificate_type').notNull(),
  // Mirrors template type for direct querying

  eligibilityBasisType: text('eligibility_basis_type').notNull(),
  // CHECK: registration | attendance | session_assignment | event_role | manual
  eligibilityBasisId: uuid('eligibility_basis_id'),
  // Polymorphic: registration_id, session_assignment_id, etc.

  certificateNumber: text('certificate_number').notNull().unique(),
  // Human-readable: GEM2026-ATT-00412
  verificationToken: uuid('verification_token').notNull().unique().defaultRandom(),
  // For QR / verify URL

  storageKey: text('storage_key').notNull(),
  // Private R2 object path — signed URLs generated on demand
  fileName: text('file_name').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  fileChecksumSha256: text('file_checksum_sha256'),

  renderedVariablesJson: jsonb('rendered_variables_json').notNull(),
  brandingSnapshotJson: jsonb('branding_snapshot_json'),
  templateSnapshotJson: jsonb('template_snapshot_json'),

  status: text('status').notNull().default('issued'),
  // CHECK: issued | superseded | revoked
  supersededById: uuid('superseded_by_id'),
  // Points to the newer version
  supersedesId: uuid('supersedes_id'),
  // Points to the older version this replaced
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeReason: text('revoke_reason'),

  // Convenience tracking (source of truth for delivery is notification_log)
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastDownloadedAt: timestamp('last_downloaded_at', { withTimezone: true }),
  downloadCount: integer('download_count').notNull().default(0),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  verificationCount: integer('verification_count').notNull().default(0),

  // Audit
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  issuedBy: text('issued_by').notNull(), // clerk_user_id
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_issued_certs_event_id').on(table.eventId),
  index('idx_issued_certs_person_id').on(table.personId),
  index('idx_issued_certs_template_id').on(table.templateId),
  index('idx_issued_certs_event_person').on(table.eventId, table.personId),
  index('idx_issued_certs_event_type').on(table.eventId, table.certificateType),
  index('idx_issued_certs_cert_number').on(table.certificateNumber),
  index('idx_issued_certs_verification').on(table.verificationToken),
  index('idx_issued_certs_status').on(table.status),
  index('idx_issued_certs_superseded_by').on(table.supersededById),
  index('idx_issued_certs_supersedes').on(table.supersedesId),
]);

export const issuedCertificatesRelations = relations(issuedCertificates, ({ one }) => ({
  event: one(events, { fields: [issuedCertificates.eventId], references: [events.id] }),
  person: one(people, { fields: [issuedCertificates.personId], references: [people.id] }),
  template: one(certificateTemplates, { fields: [issuedCertificates.templateId], references: [certificateTemplates.id] }),
  supersededBy: one(issuedCertificates, {
    fields: [issuedCertificates.supersededById],
    references: [issuedCertificates.id],
    relationName: 'certificateChain',
  }),
}));
