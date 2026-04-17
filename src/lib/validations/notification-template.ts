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

const RESERVED_VARIABLE_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const REQUIRED_VARIABLES_MESSAGE = 'All required variables must be included in allowed variables';

const variableIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Variable name cannot be empty')
  .max(100, 'Variable name must be 100 characters or fewer')
  .regex(
    /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/,
    'Variable name must use dot-separated letters, numbers, or underscores only',
  )
  .refine(
    (value) => value.split('.').every((segment) => !RESERVED_VARIABLE_SEGMENTS.has(segment)),
    { message: 'Variable name contains a reserved path segment' },
  );

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
  allowedVariablesJson: z.array(variableIdentifierSchema).default([]),
  requiredVariablesJson: z.array(variableIdentifierSchema).default([]),
  brandingMode: z.enum(TEMPLATE_BRANDING_MODES).default('event_branding'),
  customBrandingJson: z.record(z.unknown()).nullable().optional(),
  whatsappTemplateName: z.string().max(255).nullable().optional(),
  whatsappLanguageCode: z.string().max(10).nullable().optional(),
  isSystemTemplate: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
}).superRefine((data, ctx) => {
  // Email templates must have a subject line
  if (data.channel === 'email' && !data.subjectLine) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email templates require a subject line',
      path: ['subjectLine'],
    });
  }

  const allowed = new Set(data.allowedVariablesJson);
  if (!data.requiredVariablesJson.every((variable) => allowed.has(variable))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: REQUIRED_VARIABLES_MESSAGE,
      path: ['requiredVariablesJson'],
    });
  }
});

export const updateNotificationTemplateSchema = z.object({
  templateName: z.string().min(1).max(255).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  subjectLine: z.string().max(500).nullable().optional(),
  bodyContent: z.string().min(1).optional(),
  previewText: z.string().max(200).nullable().optional(),
  allowedVariablesJson: z.array(variableIdentifierSchema).optional(),
  requiredVariablesJson: z.array(variableIdentifierSchema).optional(),
  brandingMode: z.enum(TEMPLATE_BRANDING_MODES).optional(),
  customBrandingJson: z.record(z.unknown()).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.allowedVariablesJson && data.requiredVariablesJson) {
    const allowed = new Set(data.allowedVariablesJson);
    if (!data.requiredVariablesJson.every((variable) => allowed.has(variable))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: REQUIRED_VARIABLES_MESSAGE,
        path: ['requiredVariablesJson'],
      });
    }
  }
});
