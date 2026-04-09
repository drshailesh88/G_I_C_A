/**
 * Event Automation Service
 *
 * Resolves active automation triggers for a domain event,
 * enforces guard conditions, and dispatches notifications.
 *
 * This is the bridge between the cascade system and the notification service.
 */

import { getActiveTriggersForEventType } from '@/lib/notifications/trigger-queries';
import { evaluateGuard, buildIdempotencyKey } from './automation-utils';
import { sendNotification } from '@/lib/notifications/send';
import type { NotificationTriggerType, Channel } from '@/lib/notifications/types';

// Re-export pure utils for convenience
export { evaluateGuard, buildIdempotencyKey } from './automation-utils';

export type AutomationDispatchParams = {
  eventId: string;
  triggerEventType: string;
  triggerEntityType?: string;
  triggerEntityId?: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
  /** If source is 'automation', skip to prevent infinite loops */
  source?: string;
};

export type AutomationDispatchResult = {
  triggersMatched: number;
  triggersDispatched: number;
  triggersSkipped: number;
  errors: Array<{ triggerId: string; error: string }>;
};

/**
 * Handle a domain event: resolve triggers, evaluate guards, dispatch notifications.
 */
export async function handleDomainEvent(
  params: AutomationDispatchParams,
): Promise<AutomationDispatchResult> {
  const { eventId, triggerEventType, payload, source } = params;

  // Infinite-loop guard: if this event was triggered by automation, do NOT re-trigger
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

      // Resolve recipient personId from payload
      const personId = resolveRecipientPersonId(
        trigger.recipientResolution as string,
        payload,
      );

      if (!personId) {
        result.triggersSkipped++;
        console.warn('[automation:dispatch] could not resolve recipient', {
          triggerId: trigger.id,
          recipientResolution: trigger.recipientResolution,
        });
        continue;
      }

      // Build idempotency key — include trigger.id to prevent collisions between triggers
      const baseKey = buildIdempotencyKey({
        scope: (trigger.idempotencyScope as string) ?? 'per_person_per_trigger_entity_per_channel',
        eventId,
        personId,
        triggerEntityId: params.triggerEntityId,
        channel: trigger.channel as string,
        triggerEventType,
      });
      const idempotencyKey = `${baseKey}|t:${trigger.id}`;

      // Send the notification (filter sensitive fields from payload)
      const variables = sanitizePayloadForVariables(payload);
      await sendNotification({
        eventId,
        personId,
        channel: trigger.channel as Channel,
        templateKey: template.templateKey as string,
        triggerType: triggerEventType as NotificationTriggerType,
        triggerEntityType: params.triggerEntityType,
        triggerEntityId: params.triggerEntityId,
        sendMode: 'automatic',
        idempotencyKey,
        variables: {
          ...variables,
          recipientEmail: payload.recipientEmail ?? null,
          recipientPhoneE164: payload.recipientPhoneE164 ?? null,
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

/**
 * Resolve the recipient personId based on the trigger's recipientResolution strategy.
 *
 * - trigger_person: personId comes from the event payload
 * - session_faculty / event_faculty / ops_team: future expansion (not implemented in V1)
 */
function resolveRecipientPersonId(
  resolution: string,
  payload: Record<string, unknown>,
): string | null {
  switch (resolution) {
    case 'trigger_person':
      return (payload.personId as string) ?? null;
    default:
      // Future: session_faculty, event_faculty, ops_team — skip until implemented
      console.warn(`[automation] unsupported recipientResolution: ${resolution} — skipping`);
      return null;
  }
}

/** Strip sensitive fields from payload before passing as template variables */
const SENSITIVE_KEYS = new Set([
  'accessToken', 'refreshToken', 'passwordResetToken', 'apiKey',
  'secret', 'password', 'token', 'sessionToken', 'confirmationToken',
]);

function sanitizePayloadForVariables(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SENSITIVE_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
