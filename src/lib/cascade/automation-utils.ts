/**
 * Automation Utility Functions (Pure — no DB dependency)
 *
 * Guard evaluation and idempotency key building.
 */

/**
 * Evaluate a guard condition against event payload.
 * Guard is a simple key-value object with AND logic.
 * Each key is a dot-notation path, value must match exactly.
 */
export function evaluateGuard(
  guard: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!guard || Object.keys(guard).length === 0) return true;

  for (const [path, expected] of Object.entries(guard)) {
    const actual = resolvePath(payload, path);
    if (actual !== expected) return false;
  }

  return true;
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Build an idempotency key for a notification based on the trigger's scope.
 */
export function buildIdempotencyKey(params: {
  scope: string;
  eventId: string;
  personId: string;
  triggerEntityId?: string;
  channel: string;
  triggerEventType: string;
}): string {
  const { scope, eventId, personId, triggerEntityId, channel, triggerEventType } = params;

  switch (scope) {
    case 'per_person_per_trigger_entity_per_channel':
      return `notify:${triggerEventType}:${eventId}:${personId}:${triggerEntityId ?? 'none'}:${channel}`;
    case 'per_person_per_event_per_channel':
      return `notify:${triggerEventType}:${eventId}:${personId}:${channel}`;
    case 'per_trigger_entity_per_channel':
      return `notify:${triggerEventType}:${eventId}:${triggerEntityId ?? 'none'}:${channel}`;
    default:
      return `notify:${triggerEventType}:${eventId}:${personId}:${triggerEntityId ?? 'none'}:${channel}`;
  }
}
