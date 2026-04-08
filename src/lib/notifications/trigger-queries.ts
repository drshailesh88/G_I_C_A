/**
 * Automation Trigger CRUD Queries
 *
 * All queries filter by eventId for event isolation.
 * One trigger = one channel = one template.
 */

import { db } from '@/lib/db';
import { automationTriggers, notificationTemplates } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import type { Channel } from './types';

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
  const [trigger] = await db
    .insert(automationTriggers)
    .values({
      eventId: input.eventId,
      triggerEventType: input.triggerEventType,
      guardConditionJson: input.guardConditionJson ?? null,
      channel: input.channel,
      templateId: input.templateId,
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
  const updateData: Record<string, unknown> = {
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  };

  if (input.guardConditionJson !== undefined) updateData.guardConditionJson = input.guardConditionJson;
  if (input.templateId !== undefined) updateData.templateId = input.templateId;
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
        input.eventId,
        eq(automationTriggers.id, triggerId),
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
  const conditions = [eq(automationTriggers.eventId, eventId)];
  if (filters?.triggerEventType) {
    conditions.push(eq(automationTriggers.triggerEventType, filters.triggerEventType));
  }
  if (filters?.channel) {
    conditions.push(eq(automationTriggers.channel, filters.channel));
  }
  if (filters?.isEnabled !== undefined) {
    conditions.push(eq(automationTriggers.isEnabled, filters.isEnabled));
  }

  return db
    .select()
    .from(automationTriggers)
    .where(and(...conditions))
    .orderBy(desc(automationTriggers.createdAt));
}

/** Get active triggers for a specific event type (for automation dispatch) */
export async function getActiveTriggersForEventType(
  eventId: string,
  triggerEventType: string,
) {
  return db
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
        eventId,
        eq(automationTriggers.triggerEventType, triggerEventType),
        eq(automationTriggers.isEnabled, true),
      ),
    )
    .orderBy(automationTriggers.priority);
}

/** Get a single trigger by ID (event-scoped) */
export async function getTriggerById(triggerId: string, eventId: string) {
  const [trigger] = await db
    .select()
    .from(automationTriggers)
    .where(
      withEventScope(
        automationTriggers.eventId,
        eventId,
        eq(automationTriggers.id, triggerId),
      ),
    )
    .limit(1);

  return trigger ?? null;
}

/** Delete a trigger (event-scoped) */
export async function deleteTrigger(triggerId: string, eventId: string) {
  const [deleted] = await db
    .delete(automationTriggers)
    .where(
      withEventScope(
        automationTriggers.eventId,
        eventId,
        eq(automationTriggers.id, triggerId),
      ),
    )
    .returning();

  return deleted ?? null;
}
