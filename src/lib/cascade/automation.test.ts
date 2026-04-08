import { describe, expect, it } from 'vitest';
import { evaluateGuard, buildIdempotencyKey } from './automation-utils';

// ── evaluateGuard ────────────────────────────────────────────
describe('evaluateGuard', () => {
  it('returns true for null guard', () => {
    expect(evaluateGuard(null, { name: 'test' })).toBe(true);
  });

  it('returns true for undefined guard', () => {
    expect(evaluateGuard(undefined, {})).toBe(true);
  });

  it('returns true for empty guard object', () => {
    expect(evaluateGuard({}, { anything: 'value' })).toBe(true);
  });

  it('passes when simple condition matches', () => {
    const guard = { status: 'confirmed' };
    const payload = { status: 'confirmed', name: 'Test' };
    expect(evaluateGuard(guard, payload)).toBe(true);
  });

  it('fails when simple condition does not match', () => {
    const guard = { status: 'confirmed' };
    const payload = { status: 'pending' };
    expect(evaluateGuard(guard, payload)).toBe(false);
  });

  it('passes with nested dot-notation path', () => {
    const guard = { 'registration.status': 'confirmed' };
    const payload = { registration: { status: 'confirmed' } };
    expect(evaluateGuard(guard, payload)).toBe(true);
  });

  it('fails when nested path does not match', () => {
    const guard = { 'registration.status': 'confirmed' };
    const payload = { registration: { status: 'pending' } };
    expect(evaluateGuard(guard, payload)).toBe(false);
  });

  it('fails when path does not exist in payload', () => {
    const guard = { 'registration.status': 'confirmed' };
    const payload = { otherField: 'value' };
    expect(evaluateGuard(guard, payload)).toBe(false);
  });

  it('requires ALL conditions to match (AND logic)', () => {
    const guard = { status: 'confirmed', type: 'delegate' };
    const payloadBoth = { status: 'confirmed', type: 'delegate' };
    const payloadOne = { status: 'confirmed', type: 'faculty' };
    expect(evaluateGuard(guard, payloadBoth)).toBe(true);
    expect(evaluateGuard(guard, payloadOne)).toBe(false);
  });

  it('matches numeric values exactly', () => {
    const guard = { count: 5 };
    expect(evaluateGuard(guard, { count: 5 })).toBe(true);
    expect(evaluateGuard(guard, { count: '5' })).toBe(false); // strict equality
  });

  it('matches boolean values exactly', () => {
    const guard = { enabled: true };
    expect(evaluateGuard(guard, { enabled: true })).toBe(true);
    expect(evaluateGuard(guard, { enabled: 1 })).toBe(false);
  });

  it('does not resolve prototype chain', () => {
    const guard = { '__proto__.toString': 'hack' };
    expect(evaluateGuard(guard, {})).toBe(false);
  });
});

// ── buildIdempotencyKey ──────────────────────────────────────
describe('buildIdempotencyKey', () => {
  const base = {
    eventId: 'event-1',
    personId: 'person-1',
    triggerEntityId: 'entity-1',
    channel: 'email',
    triggerEventType: 'registration.created',
  };

  it('builds per_person_per_trigger_entity_per_channel key', () => {
    const key = buildIdempotencyKey({
      ...base,
      scope: 'per_person_per_trigger_entity_per_channel',
    });
    expect(key).toBe('notify:registration.created:event-1:person-1:entity-1:email');
  });

  it('builds per_person_per_event_per_channel key (no entity)', () => {
    const key = buildIdempotencyKey({
      ...base,
      scope: 'per_person_per_event_per_channel',
    });
    expect(key).toBe('notify:registration.created:event-1:person-1:email');
  });

  it('builds per_trigger_entity_per_channel key (no person)', () => {
    const key = buildIdempotencyKey({
      ...base,
      scope: 'per_trigger_entity_per_channel',
    });
    expect(key).toBe('notify:registration.created:event-1:entity-1:email');
  });

  it('uses "none" when triggerEntityId is undefined', () => {
    const key = buildIdempotencyKey({
      ...base,
      triggerEntityId: undefined,
      scope: 'per_person_per_trigger_entity_per_channel',
    });
    expect(key).toContain(':none:');
  });

  it('uses default scope for unknown scope values', () => {
    const key = buildIdempotencyKey({
      ...base,
      scope: 'unknown_scope',
    });
    // Falls back to default (same as per_person_per_trigger_entity_per_channel)
    expect(key).toBe('notify:registration.created:event-1:person-1:entity-1:email');
  });

  it('differentiates channels', () => {
    const emailKey = buildIdempotencyKey({ ...base, scope: 'per_person_per_event_per_channel' });
    const waKey = buildIdempotencyKey({
      ...base,
      channel: 'whatsapp',
      scope: 'per_person_per_event_per_channel',
    });
    expect(emailKey).not.toBe(waKey);
  });

  it('differentiates event types', () => {
    const key1 = buildIdempotencyKey({ ...base, scope: 'per_person_per_event_per_channel' });
    const key2 = buildIdempotencyKey({
      ...base,
      triggerEventType: 'travel.updated',
      scope: 'per_person_per_event_per_channel',
    });
    expect(key1).not.toBe(key2);
  });
});
