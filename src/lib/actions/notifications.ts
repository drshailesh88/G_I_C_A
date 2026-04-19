'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { listFailedLogs, getLogById } from '@/lib/notifications/log-queries';
import { retryFailedNotification, resendNotification } from '@/lib/notifications/send';
import {
  getTemplateById,
  listTemplatesForEvent,
  updateTemplate,
  createEventOverride,
} from '@/lib/notifications/template-queries';
import {
  listTriggersForEvent,
  createTrigger,
  updateTrigger as updateTriggerRow,
  deleteTrigger as deleteTriggerRow,
} from '@/lib/notifications/trigger-queries';
import {
  TRIGGER_EVENT_TYPES,
  TRIGGER_CHANNELS,
  RECIPIENT_RESOLUTIONS,
  IDEMPOTENCY_SCOPES,
} from '@/lib/validations/automation-trigger';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const COMMUNICATIONS_READ_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

const COMMUNICATIONS_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);


function assertNotificationsRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
): void {
  const allowedRoles = options?.requireWrite
    ? COMMUNICATIONS_WRITE_ROLES
    : COMMUNICATIONS_READ_ROLES;

  if (!role || !allowedRoles.has(role)) {
    throw new Error('forbidden');
  }
}

// ── Schemas ──────────────────────────────────────────────────

const retrySchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const resendSchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const listFailedSchema = z.object({
  eventId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']).optional(),
  templateKey: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── List failed notifications ────────────────────────────────

export async function getFailedNotifications(input: unknown) {
  const validated = listFailedSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  return listFailedLogs(validated.eventId, {
    channel: validated.channel,
    templateKey: validated.templateKey,
    limit: validated.limit,
    offset: validated.offset,
  });
}

// ── Retry a failed notification ──────────────────────────────

export async function retryNotification(input: unknown) {
  const validated = retrySchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const result = await retryFailedNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications/failed`);
  return result;
}

// ── Manual resend of any notification ────────────────────────

export async function manualResend(input: unknown) {
  const validated = resendSchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const result = await resendNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications/failed`);
  return result;
}

// ── Templates hub — list templates for event ─────────────────

const listTemplatesHubSchema = z.object({
  eventId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']).optional(),
});

export async function getTemplatesHub(input: unknown) {
  const validated = listTemplatesHubSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);
  return listTemplatesForEvent(validated.eventId, { channel: validated.channel });
}

const templateEditorSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export async function getTemplateEditorEntry(input: unknown) {
  const validated = templateEditorSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  const eventScopedTemplate = await getTemplateById(
    validated.templateId,
    validated.eventId,
  );
  if (eventScopedTemplate) {
    return eventScopedTemplate;
  }

  const globalTemplate = await getTemplateById(validated.templateId, null);
  if (!globalTemplate) {
    throw new Error('Notification template not found');
  }

  return globalTemplate;
}

// ── Notification log — all statuses (hub delivery log) ───────

const listAllLogsSchema = z.object({
  eventId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']).optional(),
  status: z.enum(['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'retrying']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export async function getNotificationLog(input: unknown) {
  const validated = listAllLogsSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  const limit = validated.limit ?? 50;
  const offset = validated.offset ?? 0;

  return db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.eventId, validated.eventId),
        validated.channel ? eq(notificationLog.channel, validated.channel) : undefined,
        validated.status ? eq(notificationLog.status, validated.status) : undefined,
      ),
    )
    .orderBy(desc(notificationLog.createdAt))
    .limit(limit)
    .offset(offset);
}

// ── Save (create-or-update) a template for an event ──────────

const saveTemplateSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid(),
  templateName: z.string().trim().min(1).max(200).optional(),
  subjectLine: z.string().max(500).nullable().optional(),
  bodyContent: z.string().min(1).max(50000).optional(),
  previewText: z.string().max(200).nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function saveTemplate(input: unknown) {
  const validated = saveTemplateSchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  let targetId = validated.templateId;

  const eventScoped = await getTemplateById(validated.templateId, validated.eventId);
  if (!eventScoped) {
    const global = await getTemplateById(validated.templateId, null);
    if (!global) throw new Error('Template not found');

    // Reuse existing event override if one already exists for this key+channel
    const channel = global.channel as 'email' | 'whatsapp';
    const { eventTemplates } = await listTemplatesForEvent(validated.eventId, { channel });
    const existingOverride = eventTemplates.find((t) => t.templateKey === global.templateKey);

    const override = existingOverride ?? await createEventOverride(validated.templateId, validated.eventId, userId);
    targetId = override.id;
  }

  const updated = await updateTemplate(targetId, {
    eventId: validated.eventId,
    templateName: validated.templateName,
    subjectLine: validated.subjectLine,
    bodyContent: validated.bodyContent,
    previewText: validated.previewText,
    status: validated.status,
    notes: validated.notes,
    updatedBy: userId,
  });

  if (!updated) throw new Error('Failed to save template');

  revalidatePath(`/events/${validated.eventId}/templates`);

  return { ok: true as const, template: updated, templateId: targetId };
}

// ── Get sibling template (other-channel variant of same key) ──

const getSiblingTemplateSchema = z.object({
  eventId: z.string().uuid(),
  templateKey: z.string().trim().min(1).max(100),
  channel: z.enum(['email', 'whatsapp']),
});

export async function getSiblingTemplate(input: unknown) {
  const validated = getSiblingTemplateSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  const siblingChannel = validated.channel === 'email' ? 'whatsapp' : 'email';
  const { eventTemplates, globalTemplates } = await listTemplatesForEvent(validated.eventId, {
    channel: siblingChannel,
  });

  const eventSibling = eventTemplates.find((t) => t.templateKey === validated.templateKey);
  if (eventSibling) return eventSibling;

  return globalTemplates.find((t) => t.templateKey === validated.templateKey) ?? null;
}

// ── Get single notification log detail ───────────────────────

export async function getNotificationDetail(input: unknown) {
  const validated = z.object({
    eventId: z.string().uuid(),
    notificationLogId: z.string().uuid(),
  }).parse(input);

  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  const log = await getLogById(validated.notificationLogId, validated.eventId);
  if (!log) throw new Error('Notification not found');
  return log;
}

// ── Automation Triggers ──────────────────────────────────────

const listTriggersSchema = z.object({
  eventId: z.string().uuid(),
});

export async function getTriggersForEvent(input: unknown) {
  const validated = listTriggersSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);
  return listTriggersForEvent(validated.eventId);
}

const createTriggerActionSchema = z.object({
  eventId: z.string().uuid(),
  triggerEventType: z.enum(TRIGGER_EVENT_TYPES),
  guardConditionJson: z.record(z.unknown()).nullable().optional(),
  channel: z.enum(TRIGGER_CHANNELS),
  templateId: z.string().uuid(),
  recipientResolution: z.enum(RECIPIENT_RESOLUTIONS),
  delaySeconds: z.number().int().min(0).max(86400).optional(),
  idempotencyScope: z.enum(IDEMPOTENCY_SCOPES).optional(),
  priority: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function createAutomationTrigger(input: unknown) {
  const validated = createTriggerActionSchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const trigger = await createTrigger({
    eventId: validated.eventId,
    triggerEventType: validated.triggerEventType,
    guardConditionJson: validated.guardConditionJson,
    channel: validated.channel,
    templateId: validated.templateId,
    recipientResolution: validated.recipientResolution,
    delaySeconds: validated.delaySeconds,
    idempotencyScope: validated.idempotencyScope,
    isEnabled: true,
    priority: validated.priority,
    notes: validated.notes,
    createdBy: userId,
  });

  revalidatePath(`/events/${validated.eventId}/templates/triggers`);
  return { ok: true as const, trigger };
}

const updateTriggerActionSchema = z.object({
  eventId: z.string().uuid(),
  triggerId: z.string().uuid(),
  guardConditionJson: z.record(z.unknown()).nullable().optional(),
  templateId: z.string().uuid().optional(),
  recipientResolution: z.enum(RECIPIENT_RESOLUTIONS).optional(),
  delaySeconds: z.number().int().min(0).max(86400).optional(),
  idempotencyScope: z.enum(IDEMPOTENCY_SCOPES).optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function updateAutomationTrigger(input: unknown) {
  const validated = updateTriggerActionSchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const { triggerId, eventId, ...rest } = validated;
  const updated = await updateTriggerRow(triggerId, { ...rest, eventId, updatedBy: userId });

  if (!updated) return { ok: false as const, error: 'Trigger not found' };

  revalidatePath(`/events/${eventId}/templates/triggers`);
  return { ok: true as const, trigger: updated };
}

const deleteTriggerActionSchema = z.object({
  eventId: z.string().uuid(),
  triggerId: z.string().uuid(),
});

export async function deleteAutomationTrigger(input: unknown) {
  const validated = deleteTriggerActionSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const deleted = await deleteTriggerRow(validated.triggerId, validated.eventId);

  if (!deleted) return { ok: false as const, error: 'Trigger not found' };

  revalidatePath(`/events/${validated.eventId}/templates/triggers`);
  return { ok: true as const, trigger: deleted };
}
