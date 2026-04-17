/**
 * Template CRUD Queries
 *
 * All queries filter by eventId for event isolation.
 * Global templates have eventId = null.
 */

import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq, and, isNull, desc, sql, type SQL } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { eventIdSchema } from '@/lib/validations/event';
import type { Channel } from './types';
import { z } from 'zod';

const notificationTemplateIdSchema = z.string().uuid('Invalid notification template ID');

function parseTemplateId(templateId: string) {
  return notificationTemplateIdSchema.parse(templateId);
}

function parseScopedEventId(eventId: string | null) {
  return eventId === null ? null : eventIdSchema.parse(eventId);
}

function buildTemplateScopeCondition(templateId: string, eventId: string | null): SQL {
  const scopedTemplateId = parseTemplateId(templateId);

  return eventId === null
    ? and(eq(notificationTemplates.id, scopedTemplateId), isNull(notificationTemplates.eventId))!
    : withEventScope(notificationTemplates.eventId, eventId, eq(notificationTemplates.id, scopedTemplateId));
}

export type CreateTemplateInput = {
  eventId: string | null;
  templateKey: string;
  channel: Channel;
  templateName: string;
  metaCategory: string;
  triggerType?: string | null;
  sendMode?: 'automatic' | 'manual' | 'both';
  status?: 'draft' | 'active' | 'archived';
  subjectLine?: string | null;
  bodyContent: string;
  previewText?: string | null;
  allowedVariablesJson?: string[];
  requiredVariablesJson?: string[];
  brandingMode?: 'event_branding' | 'global_branding' | 'custom';
  customBrandingJson?: Record<string, unknown> | null;
  whatsappTemplateName?: string | null;
  whatsappLanguageCode?: string | null;
  isSystemTemplate?: boolean;
  notes?: string | null;
  createdBy: string;
};

export type UpdateTemplateInput = {
  eventId: string | null; // Required for event isolation (null = global template)
  templateName?: string;
  status?: 'draft' | 'active' | 'archived';
  subjectLine?: string | null;
  bodyContent?: string;
  previewText?: string | null;
  allowedVariablesJson?: string[];
  requiredVariablesJson?: string[];
  brandingMode?: 'event_branding' | 'global_branding' | 'custom';
  customBrandingJson?: Record<string, unknown> | null;
  notes?: string | null;
  updatedBy: string;
};

/** Create a new notification template */
export async function createTemplate(input: CreateTemplateInput) {
  const scopedEventId = parseScopedEventId(input.eventId);

  const [template] = await db
    .insert(notificationTemplates)
    .values({
      eventId: scopedEventId,
      templateKey: input.templateKey,
      channel: input.channel,
      templateName: input.templateName,
      metaCategory: input.metaCategory,
      triggerType: input.triggerType ?? null,
      sendMode: input.sendMode ?? 'manual',
      status: input.status ?? 'draft',
      subjectLine: input.subjectLine ?? null,
      bodyContent: input.bodyContent,
      previewText: input.previewText ?? null,
      allowedVariablesJson: input.allowedVariablesJson ?? [],
      requiredVariablesJson: input.requiredVariablesJson ?? [],
      brandingMode: input.brandingMode ?? 'event_branding',
      customBrandingJson: input.customBrandingJson ?? null,
      whatsappTemplateName: input.whatsappTemplateName ?? null,
      whatsappLanguageCode: input.whatsappLanguageCode ?? null,
      isSystemTemplate: input.isSystemTemplate ?? false,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();

  return template;
}

/** Update an existing template by ID */
export async function updateTemplate(templateId: string, input: UpdateTemplateInput) {
  const scopedEventId = parseScopedEventId(input.eventId);
  const updateData: Record<string, unknown> = {
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  };

  if (input.templateName !== undefined) updateData.templateName = input.templateName;
  if (input.status !== undefined) {
    updateData.status = input.status;
    if (input.status === 'active') {
      updateData.lastActivatedAt = new Date();
      updateData.archivedAt = null; // Clear archived timestamp on reactivation
    }
    if (input.status === 'archived') updateData.archivedAt = new Date();
  }
  if (input.subjectLine !== undefined) updateData.subjectLine = input.subjectLine;
  if (input.bodyContent !== undefined) updateData.bodyContent = input.bodyContent;
  if (input.previewText !== undefined) updateData.previewText = input.previewText;
  if (input.allowedVariablesJson !== undefined) updateData.allowedVariablesJson = input.allowedVariablesJson;
  if (input.requiredVariablesJson !== undefined) updateData.requiredVariablesJson = input.requiredVariablesJson;
  if (input.brandingMode !== undefined) updateData.brandingMode = input.brandingMode;
  if (input.customBrandingJson !== undefined) updateData.customBrandingJson = input.customBrandingJson;
  if (input.notes !== undefined) updateData.notes = input.notes;

  // Increment version on content changes
  if (input.bodyContent !== undefined || input.subjectLine !== undefined) {
    updateData.versionNo = sql`${notificationTemplates.versionNo} + 1`;
  }

  const [updated] = await db
    .update(notificationTemplates)
    .set(updateData)
    .where(buildTemplateScopeCondition(templateId, scopedEventId))
    .returning();

  return updated ?? null;
}

/** List templates for an event (includes global defaults) */
export async function listTemplatesForEvent(
  eventId: string,
  filters?: {
    channel?: Channel;
    status?: string;
    metaCategory?: string;
  },
) {
  const scopedEventId = eventIdSchema.parse(eventId);

  const eventTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(withEventScope(
      notificationTemplates.eventId,
      scopedEventId,
      filters?.channel ? eq(notificationTemplates.channel, filters.channel) : undefined,
      filters?.status ? eq(notificationTemplates.status, filters.status) : undefined,
      filters?.metaCategory ? eq(notificationTemplates.metaCategory, filters.metaCategory) : undefined,
    ))
    .orderBy(desc(notificationTemplates.updatedAt));

  // Get global defaults (eventId is null) — used to show which system templates
  // the event hasn't overridden yet
  const globalConditions: SQL[] = [isNull(notificationTemplates.eventId)];
  if (filters?.channel) globalConditions.push(eq(notificationTemplates.channel, filters.channel));
  if (filters?.status) globalConditions.push(eq(notificationTemplates.status, filters.status));
  if (filters?.metaCategory) globalConditions.push(eq(notificationTemplates.metaCategory, filters.metaCategory));

  const globalTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(and(...globalConditions))
    .orderBy(desc(notificationTemplates.updatedAt));

  return { eventTemplates, globalTemplates };
}

/** Get a single template by ID (event-scoped) */
export async function getTemplateById(templateId: string, eventId: string | null) {
  const [template] = await db
    .select()
    .from(notificationTemplates)
    .where(buildTemplateScopeCondition(templateId, parseScopedEventId(eventId)))
    .limit(1);

  return template ?? null;
}

/** Archive a template (soft delete) */
export async function archiveTemplate(templateId: string, eventId: string | null, archivedBy: string) {
  return updateTemplate(templateId, {
    eventId,
    status: 'archived',
    updatedBy: archivedBy,
  });
}

/** Duplicate a global template as an event override */
export async function createEventOverride(
  globalTemplateId: string,
  eventId: string,
  createdBy: string,
) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const global = await getTemplateById(globalTemplateId, null);
  if (!global) throw new Error(`Global template ${globalTemplateId} not found`);
  if (global.eventId !== null) throw new Error('Source template is not a global template');

  return createTemplate({
    eventId: scopedEventId,
    templateKey: global.templateKey,
    channel: global.channel as Channel,
    templateName: `${global.templateName} (Event Override)`,
    metaCategory: global.metaCategory,
    triggerType: global.triggerType,
    sendMode: global.sendMode as 'automatic' | 'manual' | 'both',
    status: 'draft',
    subjectLine: global.subjectLine,
    bodyContent: global.bodyContent,
    previewText: global.previewText,
    allowedVariablesJson: global.allowedVariablesJson as string[],
    requiredVariablesJson: global.requiredVariablesJson as string[],
    brandingMode: global.brandingMode as 'event_branding' | 'global_branding' | 'custom',
    customBrandingJson: global.customBrandingJson as Record<string, unknown> | null,
    whatsappTemplateName: global.whatsappTemplateName,
    whatsappLanguageCode: global.whatsappLanguageCode,
    isSystemTemplate: false,
    notes: `Override of global template: ${global.templateName}`,
    createdBy,
  });
}
