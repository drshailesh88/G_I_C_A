import { describe, expect, it } from 'vitest';
import {
  createAutomationTriggerSchema,
  updateAutomationTriggerSchema,
  TRIGGER_EVENT_TYPES,
  TRIGGER_CHANNELS,
  RECIPIENT_RESOLUTIONS,
  IDEMPOTENCY_SCOPES,
} from './automation-trigger';

// ── Constants ─────────────────────────────────────────────────
describe('Automation trigger constants', () => {
  it('defines 13 trigger event types', () => {
    expect(TRIGGER_EVENT_TYPES).toHaveLength(13);
    expect(TRIGGER_EVENT_TYPES).toContain('registration.created');
    expect(TRIGGER_EVENT_TYPES).toContain('certificate.generated');
  });

  it('defines 2 channels', () => {
    expect(TRIGGER_CHANNELS).toHaveLength(2);
    expect(TRIGGER_CHANNELS).toContain('email');
    expect(TRIGGER_CHANNELS).toContain('whatsapp');
  });

  it('defines 4 recipient resolutions', () => {
    expect(RECIPIENT_RESOLUTIONS).toHaveLength(4);
    expect(RECIPIENT_RESOLUTIONS).toContain('trigger_person');
    expect(RECIPIENT_RESOLUTIONS).toContain('ops_team');
  });

  it('defines 3 idempotency scopes', () => {
    expect(IDEMPOTENCY_SCOPES).toHaveLength(3);
  });
});

// ── createAutomationTriggerSchema ────────────────────────────
describe('createAutomationTriggerSchema', () => {
  const valid = {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    triggerEventType: 'registration.created' as const,
    channel: 'email' as const,
    templateId: '123e4567-e89b-12d3-a456-426614174001',
    recipientResolution: 'trigger_person' as const,
  };

  it('accepts valid trigger', () => {
    const result = createAutomationTriggerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults delaySeconds to 0', () => {
    const result = createAutomationTriggerSchema.parse(valid);
    expect(result.delaySeconds).toBe(0);
  });

  it('defaults isEnabled to true', () => {
    const result = createAutomationTriggerSchema.parse(valid);
    expect(result.isEnabled).toBe(true);
  });

  it('defaults idempotencyScope', () => {
    const result = createAutomationTriggerSchema.parse(valid);
    expect(result.idempotencyScope).toBe('per_person_per_trigger_entity_per_channel');
  });

  it('rejects invalid eventId', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      eventId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trigger event type', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      triggerEventType: 'unknown.event',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid channel', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      channel: 'sms',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid recipient resolution', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      recipientResolution: 'everyone',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative delay', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      delaySeconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects delay > 24 hours', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      delaySeconds: 86401,
    });
    expect(result.success).toBe(false);
  });

  it('accepts guard condition as JSON object', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      guardConditionJson: { 'registration.status': 'confirmed' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts null guard condition', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      guardConditionJson: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts priority within range', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      priority: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects priority > 100', () => {
    const result = createAutomationTriggerSchema.safeParse({
      ...valid,
      priority: 101,
    });
    expect(result.success).toBe(false);
  });
});

// ── updateAutomationTriggerSchema ────────────────────────────
describe('updateAutomationTriggerSchema', () => {
  it('accepts partial update', () => {
    const result = updateAutomationTriggerSchema.safeParse({
      isEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateAutomationTriggerSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid templateId', () => {
    const result = updateAutomationTriggerSchema.safeParse({
      templateId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});
