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
    // Deep equality for arrays/objects, strict equality for primitives
    if (!deepEqual(actual, expected)) return false;
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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(bObj, key) && deepEqual(aObj[key], bObj[key]));
  }
  return false;
}

/**
 * Sanitize a field value for use in idempotency keys.
 * Replaces colons to prevent delimiter injection.
 */
function sanitizeKeyField(value: string): string {
  return value.replace(/:/g, '_');
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
  const s = sanitizeKeyField;
  const entityPart = triggerEntityId ? s(triggerEntityId) : '__missing__';

  switch (scope) {
    case 'per_person_per_trigger_entity_per_channel':
      return `notify|${s(triggerEventType)}|${s(eventId)}|${s(personId)}|${entityPart}|${s(channel)}`;
    case 'per_person_per_event_per_channel':
      return `notify|${s(triggerEventType)}|${s(eventId)}|${s(personId)}|${s(channel)}`;
    case 'per_trigger_entity_per_channel':
      return `notify|${s(triggerEventType)}|${s(eventId)}|${entityPart}|${s(channel)}`;
    default:
      return `notify|${s(triggerEventType)}|${s(eventId)}|${s(personId)}|${entityPart}|${s(channel)}`;
  }
}
