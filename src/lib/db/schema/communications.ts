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

// ── Notification Templates ──────────────────────────────────────
// Governed sendable assets. Channel-specific, event-overridable.
// One active template per (event_id, channel, template_key).
export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  // Nullable: null = global default, set = event-specific override

  templateKey: text('template_key').notNull(),
  // Stable system key: registration_confirmation, faculty_invitation, etc.
  channel: text('channel').notNull(),
  // CHECK: email | whatsapp
  templateName: text('template_name').notNull(),

  metaCategory: text('meta_category').notNull(),
  // CHECK: registration | program | logistics | certificates | reminders | system
  triggerType: text('trigger_type'),
  // Business event: registration.created, session.updated, travel.saved
  sendMode: text('send_mode').notNull().default('manual'),
  // CHECK: automatic | manual | both

  status: text('status').notNull().default('draft'),
  // CHECK: draft | active | archived
  versionNo: integer('version_no').notNull().default(1),

  // Content
  subjectLine: text('subject_line'), // Required for email, null for WhatsApp
  bodyContent: text('body_content').notNull(),
  previewText: text('preview_text'), // Email inbox preview

  // Variable management
  allowedVariablesJson: jsonb('allowed_variables_json').notNull().default('[]'),
  requiredVariablesJson: jsonb('required_variables_json').notNull().default('[]'),

  // Branding
  brandingMode: text('branding_mode').notNull().default('event_branding'),
  // CHECK: event_branding | global_branding | custom
  customBrandingJson: jsonb('custom_branding_json'),

  // WhatsApp-specific (WABA future-proofing)
  whatsappTemplateName: text('whatsapp_template_name'),
  whatsappLanguageCode: text('whatsapp_language_code'),

  // Metadata
  isSystemTemplate: boolean('is_system_template').notNull().default(false),
  notes: text('notes'),
  lastActivatedAt: timestamp('last_activated_at', { withTimezone: true }),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_notif_templates_event_id').on(table.eventId),
  index('idx_notif_templates_key_channel').on(table.templateKey, table.channel),
  index('idx_notif_templates_status').on(table.status),
  index('idx_notif_templates_category').on(table.metaCategory),
  // One active template per event + channel + key
  unique('uq_notif_template_active').on(table.eventId, table.channel, table.templateKey).where(sql`status = 'active'`),
]);

export const notificationTemplatesRelations = relations(notificationTemplates, ({ one }) => ({
  event: one(events, { fields: [notificationTemplates.eventId], references: [events.id] }),
}));

// ── Notification Log ────────────────────────────────────────────
// Immutable proof-of-send. One row per delivery attempt per recipient per channel.
// Append-only status progression — failures are never hidden.
export const notificationLog = pgTable('notification_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),

  templateId: uuid('template_id').references(() => notificationTemplates.id, { onDelete: 'set null' }),
  // Nullable only for rare ad hoc/manual messages
  templateKeySnapshot: text('template_key_snapshot'),
  templateVersionNo: integer('template_version_no'),

  channel: text('channel').notNull(),
  // CHECK: email | whatsapp
  provider: text('provider').notNull(),
  // CHECK: resend | evolution_api | waba

  // Trigger context
  triggerType: text('trigger_type'),
  // registration.created, travel.saved, program.updated
  triggerEntityType: text('trigger_entity_type'),
  // registration, travel_record, session, certificate
  triggerEntityId: uuid('trigger_entity_id'),

  sendMode: text('send_mode').notNull(),
  // CHECK: automatic | manual
  idempotencyKey: text('idempotency_key').notNull().unique(),

  // Recipient (split for queryability)
  recipientEmail: text('recipient_email'),
  recipientPhoneE164: text('recipient_phone_e164'),

  // Rendered content snapshot
  renderedSubject: text('rendered_subject'),
  renderedBody: text('rendered_body').notNull(),
  renderedVariablesJson: jsonb('rendered_variables_json'),
  attachmentManifestJson: jsonb('attachment_manifest_json'),

  // Delivery lifecycle
  status: text('status').notNull().default('queued'),
  // CHECK: queued | sending | sent | delivered | read | failed | retrying
  attempts: integer('attempts').notNull().default(1),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),

  // Timestamps
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),

  // Provider tracking
  providerMessageId: text('provider_message_id'),
  providerConversationId: text('provider_conversation_id'),

  // Resend lineage
  isResend: boolean('is_resend').notNull().default(false),
  resendOfId: uuid('resend_of_id'),

  initiatedByUserId: text('initiated_by_user_id'), // clerk_user_id, null for automated

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notif_log_event_id').on(table.eventId),
  index('idx_notif_log_person_id').on(table.personId),
  index('idx_notif_log_template_id').on(table.templateId),
  index('idx_notif_log_event_person').on(table.eventId, table.personId),
  index('idx_notif_log_event_status').on(table.eventId, table.status),
  index('idx_notif_log_event_channel').on(table.eventId, table.channel),
  index('idx_notif_log_idempotency').on(table.idempotencyKey),
  index('idx_notif_log_trigger').on(table.triggerEntityType, table.triggerEntityId),
  index('idx_notif_log_resend_of').on(table.resendOfId),
  index('idx_notif_log_provider_msg').on(table.providerMessageId),
  // Failed notifications for retry screen
  index('idx_notif_log_failed').on(table.eventId, table.status).where(sql`status = 'failed'`),
]);

export const notificationLogRelations = relations(notificationLog, ({ one }) => ({
  event: one(events, { fields: [notificationLog.eventId], references: [events.id] }),
  person: one(people, { fields: [notificationLog.personId], references: [people.id] }),
  template: one(notificationTemplates, { fields: [notificationLog.templateId], references: [notificationTemplates.id] }),
  resendOf: one(notificationLog, {
    fields: [notificationLog.resendOfId],
    references: [notificationLog.id],
    relationName: 'resendChain',
  }),
}));

// ── Notification Delivery Events ────────────────────────────────
// Raw provider webhook payloads. Kept separate from notification_log
// to avoid turning the main log into a junk drawer.
export const notificationDeliveryEvents = pgTable('notification_delivery_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationLogId: uuid('notification_log_id').notNull().references(() => notificationLog.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  // sent, delivered, read, failed, bounced, complained
  providerPayloadJson: jsonb('provider_payload_json'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notif_delivery_log_id').on(table.notificationLogId),
  index('idx_notif_delivery_event_type').on(table.eventType),
]);

export const notificationDeliveryEventsRelations = relations(notificationDeliveryEvents, ({ one }) => ({
  notificationLog: one(notificationLog, { fields: [notificationDeliveryEvents.notificationLogId], references: [notificationLog.id] }),
}));

// ── Automation Triggers ─────────────────────────────────────────
// One trigger = one channel = one template. Bind business events to notifications.
export const automationTriggers = pgTable('automation_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),

  triggerEventType: text('trigger_event_type').notNull(),
  // registration.created, travel.saved, travel.updated, accommodation.saved, program.updated, certificate.generated
  guardConditionJson: jsonb('guard_condition_json'),
  // e.g., { "registration.status": "confirmed" }

  channel: text('channel').notNull(),
  // CHECK: email | whatsapp (singular — two rows for both channels)
  templateId: uuid('template_id').notNull().references(() => notificationTemplates.id, { onDelete: 'restrict' }),

  recipientResolution: text('recipient_resolution').notNull(),
  // CHECK: trigger_person | session_faculty | event_faculty | ops_team
  delaySeconds: integer('delay_seconds').notNull().default(0),

  idempotencyScope: text('idempotency_scope').notNull()
    .default('per_person_per_trigger_entity_per_channel'),

  isEnabled: boolean('is_enabled').notNull().default(true),
  priority: integer('priority'),
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_automation_triggers_event_id').on(table.eventId),
  index('idx_automation_triggers_template_id').on(table.templateId),
  index('idx_automation_triggers_event_type').on(table.eventId, table.triggerEventType),
  index('idx_automation_triggers_enabled').on(table.eventId, table.isEnabled),
]);

export const automationTriggersRelations = relations(automationTriggers, ({ one }) => ({
  event: one(events, { fields: [automationTriggers.eventId], references: [events.id] }),
  template: one(notificationTemplates, { fields: [automationTriggers.templateId], references: [notificationTemplates.id] }),
}));
