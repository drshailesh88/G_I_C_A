/**
 * Notification Template Validations
 *
 * Zod schemas for notification template CRUD operations.
 */

import { z } from 'zod';

export const TEMPLATE_CHANNELS = ['email', 'whatsapp'] as const;

export const TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;

export const TEMPLATE_SEND_MODES = ['automatic', 'manual', 'both'] as const;

export const TEMPLATE_META_CATEGORIES = [
  'registration',
  'program',
  'logistics',
  'certificates',
  'reminders',
  'system',
] as const;

export const TEMPLATE_BRANDING_MODES = [
  'event_branding',
  'global_branding',
  'custom',
] as const;

export const SYSTEM_TEMPLATE_KEYS = [
  'registration_confirmation',
  'registration_cancelled',
  'faculty_invitation',
  'faculty_reminder',
  'program_update',
  'travel_update',
  'travel_cancelled',
  'accommodation_details',
  'accommodation_update',
  'accommodation_cancelled',
  'certificate_ready',
  'event_reminder',
] as const;

export type SystemTemplateKey = (typeof SYSTEM_TEMPLATE_KEYS)[number];

export const createNotificationTemplateSchema = z.object({
  eventId: z.string().uuid().nullable(),
  templateKey: z.string().trim().min(1).max(100),
  channel: z.enum(TEMPLATE_CHANNELS),
  templateName: z.string().trim().min(1).max(255),
  metaCategory: z.enum(TEMPLATE_META_CATEGORIES),
  triggerType: z.string().max(100).nullable().optional(),
  sendMode: z.enum(TEMPLATE_SEND_MODES).default('manual'),
  status: z.enum(TEMPLATE_STATUSES).default('draft'),
  subjectLine: z.string().trim().min(1).max(500).nullable().optional(),
  bodyContent: z.string().min(1),
  previewText: z.string().max(200).nullable().optional(),
  allowedVariablesJson: z.array(z.string().min(1)).default([]),
  requiredVariablesJson: z.array(z.string().min(1)).default([]),
  brandingMode: z.enum(TEMPLATE_BRANDING_MODES).default('event_branding'),
  customBrandingJson: z.record(z.unknown()).nullable().optional(),
  whatsappTemplateName: z.string().max(255).nullable().optional(),
  whatsappLanguageCode: z.string().max(10).nullable().optional(),
  isSystemTemplate: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
}).refine(
  (data) => {
    // Email templates must have a subject line
    if (data.channel === 'email' && !data.subjectLine) {
      return false;
    }
    return true;
  },
  { message: 'Email templates require a subject line', path: ['subjectLine'] },
);

export const updateNotificationTemplateSchema = z.object({
  templateName: z.string().min(1).max(255).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  subjectLine: z.string().max(500).nullable().optional(),
  bodyContent: z.string().min(1).optional(),
  previewText: z.string().max(200).nullable().optional(),
  allowedVariablesJson: z.array(z.string()).optional(),
  requiredVariablesJson: z.array(z.string()).optional(),
  brandingMode: z.enum(TEMPLATE_BRANDING_MODES).optional(),
  customBrandingJson: z.record(z.unknown()).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
