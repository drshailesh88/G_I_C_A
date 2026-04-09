/**
 * Event Automation Service
 *
 * Resolves active automation triggers for a domain event,
 * enforces guard conditions, and dispatches notifications.
 *
 * This is the bridge between the cascade system and the notification service.
 */

import { getActiveTriggersForEventType } from '@/lib/notifications/trigger-queries';
import { sendNotification } from '@/lib/notifications/send';
import type { Channel, NotificationTriggerType } from '@/lib/notifications/types';
import { evaluateGuard, buildIdempotencyKey } from './automation-utils';

// Re-export pure utils for convenience
export { evaluateGuard, buildIdempotencyKey } from './automation-utils';

export type AutomationDispatchParams = {
  eventId: string;
  triggerEventType: string;
  triggerEntityType?: string;
  triggerEntityId?: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
  /** Set to 'automation' to prevent infinite re-trigger loops */
  source?: 'manual' | 'automation';
};

export type AutomationDispatchResult = {
  triggersMatched: number;
  triggersDispatched: number;
  triggersSkipped: number;
  errors: Array<{ triggerId: string; error: string }>;
};

/**
 * Resolve the recipient personId from the event payload
 * based on the trigger's recipientResolution strategy.
 */
function resolveRecipientPersonId(
  recipientResolution: string,
  payload: Record<string, unknown>,
): string | null {
  switch (recipientResolution) {
    case 'trigger_person':
      // The person directly involved in the triggering event
      return (payload.personId as string) ?? null;
    case 'session_faculty':
    case 'event_faculty':
    case 'ops_team':
      // These resolve to multiple recipients — not yet supported in V1
      // For now, fall back to trigger_person if available
      return (payload.personId as string) ?? null;
    default:
      return (payload.personId as string) ?? null;
  }
}

/**
 * Handle a domain event: resolve triggers, evaluate guards, dispatch notifications.
 *
 * Infinite-loop guard: if source='automation', this function returns immediately
 * without dispatching. This prevents notification sends from re-triggering
 * automation which would trigger more sends ad infinitum.
 */
export async function handleDomainEvent(
  params: AutomationDispatchParams,
): Promise<AutomationDispatchResult> {
  const { eventId, triggerEventType, payload, source } = params;

  // Infinite-loop guard: automation-triggered events must not re-trigger automation
  if (source === 'automation') {
    return {
      triggersMatched: 0,
      triggersDispatched: 0,
      triggersSkipped: 0,
      errors: [],
    };
  }

  const triggersWithTemplates = await getActiveTriggersForEventType(
    eventId,
    triggerEventType,
  );

  const result: AutomationDispatchResult = {
    triggersMatched: triggersWithTemplates.length,
    triggersDispatched: 0,
    triggersSkipped: 0,
    errors: [],
  };

  for (const { trigger, template } of triggersWithTemplates) {
    try {
      // Evaluate guard condition
      const guardPasses = evaluateGuard(
        trigger.guardConditionJson as Record<string, unknown> | null,
        payload,
      );

      if (!guardPasses) {
        result.triggersSkipped++;
        continue;
      }

      // Check template is active
      if (template.status !== 'active') {
        result.triggersSkipped++;
        continue;
      }

      // Resolve recipient
      const personId = resolveRecipientPersonId(
        trigger.recipientResolution,
        payload,
      );

      if (!personId) {
        console.warn(
          `[automation] Cannot resolve recipient for trigger ${trigger.id} (resolution=${trigger.recipientResolution})`,
        );
        result.triggersSkipped++;
        continue;
      }

      // Build idempotency key
      const idempotencyKey = buildIdempotencyKey({
        scope: trigger.idempotencyScope,
        eventId,
        personId,
        triggerEntityId: params.triggerEntityId,
        channel: trigger.channel,
        triggerEventType,
      });

      // Send notification
      await sendNotification({
        eventId,
        personId,
        channel: trigger.channel as Channel,
        templateKey: template.templateKey,
        triggerType: triggerEventType as NotificationTriggerType,
        triggerEntityType: params.triggerEntityType,
        triggerEntityId: params.triggerEntityId,
        sendMode: 'automatic',
        idempotencyKey,
        variables: {
          ...payload,
          recipientEmail: (payload.recipientEmail as string) ?? null,
          recipientPhoneE164: (payload.recipientPhoneE164 as string) ?? null,
        },
      });

      result.triggersDispatched++;
    } catch (err) {
      result.errors.push({
        triggerId: trigger.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
