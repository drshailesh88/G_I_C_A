/**
 * Template CRUD Queries
 *
 * All queries filter by eventId for event isolation.
 * Global templates have eventId = null.
 */

import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq, and, isNull, desc, type SQL } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import type { Channel } from './types';

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
  const [template] = await db
    .insert(notificationTemplates)
    .values({
      eventId: input.eventId,
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
    // We use raw SQL increment since drizzle doesn't have increment helper
    // For now, we read-then-write; acceptable for admin-only operations
    const existing = await db
      .select({ versionNo: notificationTemplates.versionNo })
      .from(notificationTemplates)
      .where(eq(notificationTemplates.id, templateId))
      .limit(1);

    if (existing.length > 0) {
      updateData.versionNo = existing[0].versionNo + 1;
    }
  }

  const [updated] = await db
    .update(notificationTemplates)
    .set(updateData)
    .where(eq(notificationTemplates.id, templateId))
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
  // Get event-specific templates
  const conditions: SQL[] = [eq(notificationTemplates.eventId, eventId)];
  if (filters?.channel) conditions.push(eq(notificationTemplates.channel, filters.channel));
  if (filters?.status) conditions.push(eq(notificationTemplates.status, filters.status));
  if (filters?.metaCategory) conditions.push(eq(notificationTemplates.metaCategory, filters.metaCategory));

  const eventTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(and(...conditions))
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

/** Get a single template by ID */
export async function getTemplateById(templateId: string) {
  const [template] = await db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.id, templateId))
    .limit(1);

  return template ?? null;
}

/** Archive a template (soft delete) */
export async function archiveTemplate(templateId: string, archivedBy: string) {
  return updateTemplate(templateId, {
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
  if (!eventId || !eventId.trim()) {
    throw new Error('createEventOverride: eventId is required');
  }
  const global = await getTemplateById(globalTemplateId);
  if (!global) throw new Error(`Global template ${globalTemplateId} not found`);
  if (global.eventId !== null) throw new Error('Source template is not a global template');

  return createTemplate({
    eventId,
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
