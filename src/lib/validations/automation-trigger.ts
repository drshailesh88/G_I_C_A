/**
 * Automation Trigger Validations
 *
 * Zod schemas for automation trigger CRUD.
 * One trigger = one channel = one template.
 */

import { z } from 'zod';

export const TRIGGER_EVENT_TYPES = [
  'registration.created',
  'registration.cancelled',
  'faculty.invitation',
  'program.version_published',
  'session.cancelled',
  'travel.saved',
  'travel.updated',
  'travel.cancelled',
  'accommodation.saved',
  'accommodation.updated',
  'accommodation.cancelled',
  'transport.updated',
  'certificate.generated',
] as const;

export const TRIGGER_CHANNELS = ['email', 'whatsapp'] as const;

export const RECIPIENT_RESOLUTIONS = [
  'trigger_person',
  'session_faculty',
  'event_faculty',
  'ops_team',
] as const;

export const IDEMPOTENCY_SCOPES = [
  'per_person_per_trigger_entity_per_channel',
  'per_person_per_event_per_channel',
  'per_trigger_entity_per_channel',
] as const;

export const createAutomationTriggerSchema = z.object({
  eventId: z.string().uuid(),
  triggerEventType: z.enum(TRIGGER_EVENT_TYPES),
  guardConditionJson: z.record(z.unknown()).nullable().optional(),
  channel: z.enum(TRIGGER_CHANNELS),
  templateId: z.string().uuid(),
  recipientResolution: z.enum(RECIPIENT_RESOLUTIONS),
  delaySeconds: z.number().int().min(0).max(86400).default(0),
  idempotencyScope: z.enum(IDEMPOTENCY_SCOPES).default('per_person_per_trigger_entity_per_channel'),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateAutomationTriggerSchema = z.object({
  guardConditionJson: z.record(z.unknown()).nullable().optional(),
  templateId: z.string().uuid().optional(),
  recipientResolution: z.enum(RECIPIENT_RESOLUTIONS).optional(),
  delaySeconds: z.number().int().min(0).max(86400).optional(),
  idempotencyScope: z.enum(IDEMPOTENCY_SCOPES).optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
