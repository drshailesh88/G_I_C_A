/**
 * Automation Trigger CRUD Queries
 *
 * All queries filter by eventId for event isolation.
 * One trigger = one channel = one template.
 */

import { db } from '@/lib/db';
import { automationTriggers, notificationTemplates } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { eventIdSchema } from '@/lib/validations/event';
import type { Channel } from './types';
import { z } from 'zod';

const automationTriggerIdSchema = z.string().uuid('Invalid automation trigger ID');
const notificationTemplateIdSchema = z.string().uuid('Invalid notification template ID');

function parseEventId(eventId: string) {
  return eventIdSchema.parse(eventId);
}

function parseTriggerId(triggerId: string) {
  return automationTriggerIdSchema.parse(triggerId);
}

function parseTemplateId(templateId: string) {
  return notificationTemplateIdSchema.parse(templateId);
}

async function assertTemplateInScope(templateId: string, eventId: string) {
  const scopedTemplateId = parseTemplateId(templateId);

  const [template] = await db
    .select({
      id: notificationTemplates.id,
      eventId: notificationTemplates.eventId,
    })
    .from(notificationTemplates)
    .where(eq(notificationTemplates.id, scopedTemplateId))
    .limit(1);

  if (!template) {
    throw new Error('Notification template not found');
  }

  if (template.eventId !== eventId && template.eventId !== null) {
    throw new Error('Notification template is outside the active event scope');
  }

  return scopedTemplateId;
}

export type CreateTriggerInput = {
  eventId: string;
  triggerEventType: string;
  guardConditionJson?: Record<string, unknown> | null;
  channel: Channel;
  templateId: string;
  recipientResolution: string;
  delaySeconds?: number;
  idempotencyScope?: string;
  isEnabled?: boolean;
  priority?: number | null;
  notes?: string | null;
  createdBy: string;
};

export type UpdateTriggerInput = {
  eventId: string; // Required for event isolation
  guardConditionJson?: Record<string, unknown> | null;
  templateId?: string;
  recipientResolution?: string;
  delaySeconds?: number;
  idempotencyScope?: string;
  isEnabled?: boolean;
  priority?: number | null;
  notes?: string | null;
  updatedBy: string;
};

/** Create a new automation trigger */
export async function createTrigger(input: CreateTriggerInput) {
  const scopedEventId = parseEventId(input.eventId);
  const scopedTemplateId = await assertTemplateInScope(input.templateId, scopedEventId);

  const [trigger] = await db
    .insert(automationTriggers)
    .values({
      eventId: scopedEventId,
      triggerEventType: input.triggerEventType,
      guardConditionJson: input.guardConditionJson ?? null,
      channel: input.channel,
      templateId: scopedTemplateId,
      recipientResolution: input.recipientResolution,
      delaySeconds: input.delaySeconds ?? 0,
      idempotencyScope: input.idempotencyScope ?? 'per_person_per_trigger_entity_per_channel',
      isEnabled: input.isEnabled ?? true,
      priority: input.priority ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();

  return trigger;
}

/** Update a trigger by ID */
export async function updateTrigger(triggerId: string, input: UpdateTriggerInput) {
  const scopedEventId = parseEventId(input.eventId);
  const scopedTriggerId = parseTriggerId(triggerId);
  const updateData: Record<string, unknown> = {
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  };

  if (input.guardConditionJson !== undefined) updateData.guardConditionJson = input.guardConditionJson;
  if (input.templateId !== undefined) {
    updateData.templateId = await assertTemplateInScope(input.templateId, scopedEventId);
  }
  if (input.recipientResolution !== undefined) updateData.recipientResolution = input.recipientResolution;
  if (input.delaySeconds !== undefined) updateData.delaySeconds = input.delaySeconds;
  if (input.idempotencyScope !== undefined) updateData.idempotencyScope = input.idempotencyScope;
  if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.notes !== undefined) updateData.notes = input.notes;

  const [updated] = await db
    .update(automationTriggers)
    .set(updateData)
    .where(
      withEventScope(
        automationTriggers.eventId,
        scopedEventId,
        eq(automationTriggers.id, scopedTriggerId),
      ),
    )
    .returning();

  return updated ?? null;
}

/** List triggers for an event, optionally filtered */
export async function listTriggersForEvent(
  eventId: string,
  filters?: {
    triggerEventType?: string;
    channel?: Channel;
    isEnabled?: boolean;
  },
) {
  const scopedEventId = parseEventId(eventId);

  return db
    .select()
    .from(automationTriggers)
    .where(
      withEventScope(
        automationTriggers.eventId,
        scopedEventId,
        filters?.triggerEventType
          ? eq(automationTriggers.triggerEventType, filters.triggerEventType)
          : undefined,
        filters?.channel ? eq(automationTriggers.channel, filters.channel) : undefined,
        filters?.isEnabled !== undefined
          ? eq(automationTriggers.isEnabled, filters.isEnabled)
          : undefined,
      ),
    )
    .orderBy(desc(automationTriggers.createdAt));
}

/** Get active triggers for a specific event type (for automation dispatch) */
export async function getActiveTriggersForEventType(
  eventId: string,
  triggerEventType: string,
) {
  const scopedEventId = parseEventId(eventId);
  // FIX #3: Also scope the joined template to the same event (or global defaults)
  // Prevents cross-event template leakage via malicious trigger rows
  const rows = await db
    .select({
      trigger: automationTriggers,
      template: notificationTemplates,
    })
    .from(automationTriggers)
    .innerJoin(
      notificationTemplates,
      eq(automationTriggers.templateId, notificationTemplates.id),
    )
    .where(
      withEventScope(
        automationTriggers.eventId,
        scopedEventId,
        eq(automationTriggers.triggerEventType, triggerEventType),
        eq(automationTriggers.isEnabled, true),
      ),
    )
    .orderBy(automationTriggers.priority);

  // Post-filter: only allow templates that belong to this event or are global defaults
  return rows.filter(({ template }) =>
    template.eventId === scopedEventId || template.eventId === null
  );
}

/** Get a single trigger by ID (event-scoped) */
export async function getTriggerById(triggerId: string, eventId: string) {
  const scopedEventId = parseEventId(eventId);
  const scopedTriggerId = parseTriggerId(triggerId);

  const [trigger] = await db
    .select()
    .from(automationTriggers)
    .where(
      withEventScope(
        automationTriggers.eventId,
        scopedEventId,
        eq(automationTriggers.id, scopedTriggerId),
      ),
    )
    .limit(1);

  return trigger ?? null;
}

/** Delete a trigger (event-scoped) */
export async function deleteTrigger(triggerId: string, eventId: string) {
  const scopedEventId = parseEventId(eventId);
  const scopedTriggerId = parseTriggerId(triggerId);

  const [deleted] = await db
    .delete(automationTriggers)
    .where(
      withEventScope(
        automationTriggers.eventId,
        scopedEventId,
        eq(automationTriggers.id, scopedTriggerId),
      ),
    )
    .returning();

  return deleted ?? null;
}
