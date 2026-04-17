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
  if (isPlainObject(a) && isPlainObject(b)) {
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
 * Guard comparisons only need to support JSON-like objects.
 * Any non-plain object should fail closed instead of comparing like "{}".
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Encode a field value for use in idempotency keys.
 * Prefixes values so missing and present fields can never collide,
 * and URL-encodes delimiters to prevent key-shape injection.
 */
function encodeKeyField(value: string | undefined): string {
  if (value === undefined) {
    return 'm';
  }

  return `v:${encodeURIComponent(value)}`;
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
  const field = encodeKeyField;
  const eventPart = field(eventId);
  const personPart = field(personId);
  const channelPart = field(channel);
  const eventTypePart = field(triggerEventType);
  const entityPart = field(triggerEntityId);

  switch (scope) {
    case 'per_person_per_trigger_entity_per_channel':
      return `notify|${eventTypePart}|${eventPart}|${personPart}|${entityPart}|${channelPart}`;
    case 'per_person_per_event_per_channel':
      return `notify|${eventTypePart}|${eventPart}|${personPart}|${channelPart}`;
    case 'per_trigger_entity_per_channel':
      return `notify|${eventTypePart}|${eventPart}|${entityPart}|${channelPart}`;
    default:
      return `notify|${eventTypePart}|${eventPart}|${personPart}|${entityPart}|${channelPart}`;
  }
}
