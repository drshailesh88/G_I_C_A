import { describe, expect, it } from 'vitest';
import { evaluateGuard, buildIdempotencyKey } from './automation-utils';

/**
 * Mutation-kill tests for automation-utils.ts.
 * Each group targets specific surviving mutants identified by Stryker.
 */

// ── L41 null-check mutants (NoCoverage — no prior test reached this branch) ──
describe('evaluateGuard — null values in guard or payload', () => {
  it('returns true when guard specifies null and payload value is null', () => {
    // deepEqual(null, null): L40 a===b → true; NoCoverage branch not needed
    expect(evaluateGuard({ x: null }, { x: null })).toBe(true);
  });

  it('returns false when guard specifies null but payload value is a string', () => {
    // Kills L41:40 NoCoverage BooleanLiteral (return false → return true):
    // deepEqual(null, 'other') hits L41 (null===null), returns false.
    // With the mutant it would return true, making evaluateGuard return true.
    expect(evaluateGuard({ x: null }, { x: 'other' })).toBe(false);
  });

  it('returns false when guard specifies an object but payload value is null', () => {
    // Kills L41:7 ConditionalExpression→false, L41 LogicalOperator→&&, L41:21 b===null→false:
    // deepEqual(null, {}) — null-check on L41 fires; without it the code reaches
    // Object.keys(null) which throws or the hasOwnProperty path returns wrong result.
    expect(evaluateGuard({ x: {} }, { x: null })).toBe(false);
  });

  it('returns false when guard specifies null but payload value is an object', () => {
    // Extra coverage for symmetric null case
    expect(evaluateGuard({ x: null }, { x: { a: 1 } })).toBe(false);
  });
});

// ── L45 every→some in array element comparison ───────────────────────────────
describe('evaluateGuard — array deep equality', () => {
  it('returns false when arrays have same length but a later element differs', () => {
    // Kills L45:12 MethodExpression every→some:
    // a=['a','b'], b=['a','c']. With every: deepEqual('b','c')=false → false ✓
    // With some: deepEqual('a','a')=true → some returns true → evaluateGuard returns true ✗
    expect(evaluateGuard({ x: ['a', 'b'] }, { x: ['a', 'c'] })).toBe(false);
  });

  it('returns false when guard array is shorter than payload array', () => {
    // Additional coverage for L43 BlockStatement (equivalent, but confirms correct behavior)
    expect(evaluateGuard({ x: ['a'] }, { x: ['a', 'b'] })).toBe(false);
  });
});

// ── L47→true mutants for non-object primitive types ──────────────────────────
describe('evaluateGuard — primitive type inequality', () => {
  it('returns false when guard is integer 1 but payload value is integer 2', () => {
    // Kills L47:7 ConditionalExpression→true (and the duplicate):
    // deepEqual(1,2): types equal, not arrays; L47 original=false → skip → return false.
    // With →true: enters object branch; Object.keys(1)=[], Object.keys(2)=[];
    // vacuously equal → returns true → evaluateGuard returns true (wrong).
    expect(evaluateGuard({ count: 1 }, { count: 2 })).toBe(false);
  });

  it('returns false when guard is true but payload value is false', () => {
    // Same L47→true kill for booleans: Object.keys(true)=[], Object.keys(false)=[]
    expect(evaluateGuard({ flag: true }, { flag: false })).toBe(false);
  });
});

// ── L52 object key-length check (NoCoverage) ─────────────────────────────────
describe('evaluateGuard — object key count mismatch', () => {
  it('returns false when payload object has more keys than the guard object', () => {
    // Kills L52:47 NoCoverage BooleanLiteral (return false → return true):
    // aKeys=['a'], bKeys=['a','b']; 1≠2 → return false.
    // With →true: returns true. evaluateGuard returns true (wrong).
    // Also kills L52:9 ConditionalExpression→false (length check skipped):
    // aKeys.every checks only 'a': deepEqual(1,1)=true → returns true (wrong).
    expect(evaluateGuard({ x: { a: 1 } }, { x: { a: 1, b: 2 } })).toBe(false);
  });

  it('returns false when payload object has fewer keys than the guard object', () => {
    expect(evaluateGuard({ x: { a: 1, b: 2 } }, { x: { a: 1 } })).toBe(false);
  });
});

// ── L53 every→some in object key comparison ──────────────────────────────────
describe('evaluateGuard — object value mismatch with multiple keys', () => {
  it('returns false when objects have same keys but a later value differs', () => {
    // Kills L53:12 MethodExpression every→some:
    // {a:1,b:2} vs {a:1,b:3}: every→deepEqual(b:2,b:3)=false ✓
    // some→deepEqual(a:1,a:1)=true → returns true (wrong).
    expect(evaluateGuard({ x: { a: 1, b: 2 } }, { x: { a: 1, b: 3 } })).toBe(false);
  });
});

describe('evaluateGuard — non-plain objects fail closed', () => {
  it('returns false when the guard expects an empty plain object but payload provides a Date', () => {
    expect(evaluateGuard({ meta: {} }, { meta: new Date('2026-04-17T00:00:00.000Z') })).toBe(false);
  });

  it('returns false when the guard expects an empty plain object but payload provides a Map', () => {
    expect(evaluateGuard({ meta: {} }, { meta: new Map([['status', 'confirmed']]) })).toBe(false);
  });
});

// ── Idempotency field encoding + collision resistance ────────────────────────
describe('buildIdempotencyKey — encoded fields avoid delimiter collisions', () => {
  it('encodes colons instead of emitting raw delimiters in triggerEventType', () => {
    const key = buildIdempotencyKey({
      scope: 'per_person_per_event_per_channel',
      eventId: 'event-1',
      personId: 'person-1',
      channel: 'email',
      triggerEventType: 'conference:registration.created',
    });
    expect(key).toContain('v:conference%3Aregistration.created');
    expect(key).not.toContain('|conference:registration');
  });

  it('encodes colons in eventId', () => {
    const key = buildIdempotencyKey({
      scope: 'per_person_per_event_per_channel',
      eventId: 'ev:001',
      personId: 'p1',
      channel: 'email',
      triggerEventType: 'conference.registration',
    });
    expect(key).toContain('v:ev%3A001');
    expect(key).not.toContain('|ev:001|');
  });

  it('encodes colons in triggerEntityId', () => {
    const key = buildIdempotencyKey({
      scope: 'per_person_per_trigger_entity_per_channel',
      eventId: 'event-1',
      personId: 'p1',
      channel: 'email',
      triggerEventType: 'conference.update',
      triggerEntityId: 'entity:abc',
    });
    expect(key).toContain('v:entity%3Aabc');
    expect(key).not.toContain('|entity:abc|');
  });

  it('does not collide a missing triggerEntityId with a literal "__missing__" value', () => {
    const missing = buildIdempotencyKey({
      scope: 'per_person_per_trigger_entity_per_channel',
      eventId: 'event-1',
      personId: 'person-1',
      channel: 'email',
      triggerEventType: 'conference.update',
    });
    const literal = buildIdempotencyKey({
      scope: 'per_person_per_trigger_entity_per_channel',
      eventId: 'event-1',
      personId: 'person-1',
      channel: 'email',
      triggerEventType: 'conference.update',
      triggerEntityId: '__missing__',
    });

    expect(missing).not.toBe(literal);
  });

  it('does not collide when pipe characters appear in present values', () => {
    const first = buildIdempotencyKey({
      scope: 'per_person_per_trigger_entity_per_channel',
      eventId: 'event-1',
      personId: 'person-1|entity-1',
      channel: 'email',
      triggerEventType: 'conference.update',
      triggerEntityId: 'sms',
    });
    const second = buildIdempotencyKey({
      scope: 'per_person_per_trigger_entity_per_channel',
      eventId: 'event-1',
      personId: 'person-1',
      channel: 'email|sms',
      triggerEventType: 'conference.update',
      triggerEntityId: 'entity-1',
    });

    expect(first).not.toBe(second);
  });
});
