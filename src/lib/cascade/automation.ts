/**
 * Event Automation Service
 *
 * Resolves active automation triggers for a domain event,
 * enforces guard conditions, and dispatches notifications.
 *
 * This is the bridge between the cascade system and the notification service.
 */

import { getActiveTriggersForEventType } from '@/lib/notifications/trigger-queries';
import { evaluateGuard } from './automation-utils';

// Re-export pure utils for convenience
export { evaluateGuard, buildIdempotencyKey } from './automation-utils';

export type AutomationDispatchParams = {
  eventId: string;
  triggerEventType: string;
  triggerEntityType?: string;
  triggerEntityId?: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
};

export type AutomationDispatchResult = {
  triggersMatched: number;
  triggersDispatched: number;
  triggersSkipped: number;
  errors: Array<{ triggerId: string; error: string }>;
};

/**
 * Handle a domain event: resolve triggers, evaluate guards, dispatch notifications.
 *
 * NOTE: The actual notification sending is deferred to Req 4 (NotificationService).
 * This function returns the dispatch plan — what should be sent.
 */
export async function handleDomainEvent(
  params: AutomationDispatchParams,
): Promise<AutomationDispatchResult> {
  const { eventId, triggerEventType, payload } = params;

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

      // Build dispatch info (actual send happens via NotificationService in Req 4)
      // For now, we log the dispatch plan
      console.log('[automation:dispatch]', {
        triggerId: trigger.id,
        triggerEventType,
        channel: trigger.channel,
        templateKey: template.templateKey,
        recipientResolution: trigger.recipientResolution,
        delaySeconds: trigger.delaySeconds,
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
