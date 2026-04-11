/**
 * Mutation-killing tests for notification-template.ts validations
 *
 * Targets: 15 Survived mutations (9 MethodExpression max→min, StringLiteral,
 * ArrayDeclaration, BooleanLiteral, ObjectLiteral).
 */

import { describe, it, expect } from 'vitest';
import {
  createNotificationTemplateSchema,
  updateNotificationTemplateSchema,
  TEMPLATE_CHANNELS,
  TEMPLATE_STATUSES,
  TEMPLATE_SEND_MODES,
  TEMPLATE_META_CATEGORIES,
  TEMPLATE_BRANDING_MODES,
  SYSTEM_TEMPLATE_KEYS,
} from './notification-template';

describe('createNotificationTemplateSchema', () => {
  const validInput = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    templateKey: 'test_key',
    channel: 'email' as const,
    templateName: 'Test Template',
    metaCategory: 'registration' as const,
    subjectLine: 'Test Subject',
    bodyContent: '<p>Hello</p>',
  };

  it('accepts valid email template with subject line', () => {
    const result = createNotificationTemplateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects email template without subject line', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      subjectLine: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const subjectError = result.error.issues.find(i => i.path.includes('subjectLine'));
      expect(subjectError).toBeDefined();
      expect(subjectError!.message).toBe('Email templates require a subject line');
    }
  });

  it('allows whatsapp template without subject line', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      channel: 'whatsapp',
      subjectLine: undefined,
    });
    expect(result.success).toBe(true);
  });

  // ── .max() boundary tests (kills MethodExpression max→min mutations) ──

  it('rejects templateKey longer than 100 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateKey: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('accepts templateKey at exactly 100 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateKey: 'a'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('rejects templateName longer than 255 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateName: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('accepts templateName at exactly 255 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateName: 'a'.repeat(255),
    });
    expect(result.success).toBe(true);
  });

  it('rejects triggerType longer than 100 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      triggerType: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('accepts triggerType at exactly 100 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      triggerType: 'a'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('rejects subjectLine longer than 500 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      subjectLine: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts subjectLine at exactly 500 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      subjectLine: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('rejects previewText longer than 200 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      previewText: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts previewText at exactly 200 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      previewText: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('rejects whatsappLanguageCode longer than 10 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      channel: 'whatsapp',
      subjectLine: undefined,
      whatsappLanguageCode: 'a'.repeat(11),
    });
    expect(result.success).toBe(false);
  });

  it('accepts whatsappLanguageCode at exactly 10 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      channel: 'whatsapp',
      subjectLine: undefined,
      whatsappLanguageCode: 'a'.repeat(10),
    });
    expect(result.success).toBe(true);
  });

  it('rejects notes longer than 1000 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      notes: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts notes at exactly 1000 characters', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      notes: 'a'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  // ── .min() boundary tests ──

  it('rejects empty templateKey (after trim)', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateKey: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty templateName (after trim)', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      templateName: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty bodyContent', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      bodyContent: '',
    });
    expect(result.success).toBe(false);
  });

  // ── Default values ──

  it('defaults sendMode to manual', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.sendMode).toBe('manual');
  });

  it('defaults status to draft', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.status).toBe('draft');
  });

  it('defaults isSystemTemplate to false', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.isSystemTemplate).toBe(false);
  });

  it('defaults allowedVariablesJson to empty array', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.allowedVariablesJson).toEqual([]);
  });

  it('defaults requiredVariablesJson to empty array', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.requiredVariablesJson).toEqual([]);
  });

  it('defaults brandingMode to event_branding', () => {
    const result = createNotificationTemplateSchema.parse(validInput);
    expect(result.brandingMode).toBe('event_branding');
  });

  // ── Refinement error path ──

  it('error path points to subjectLine for email without subject', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validInput,
      subjectLine: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('subjectLine');
    }
  });
});

describe('updateNotificationTemplateSchema', () => {
  it('rejects templateName longer than 255', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      templateName: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects subjectLine longer than 500', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      subjectLine: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects previewText longer than 200', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      previewText: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes longer than 1000', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      notes: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all fields at boundary', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      templateName: 'a'.repeat(255),
      subjectLine: 'a'.repeat(500),
      previewText: 'a'.repeat(200),
      notes: 'a'.repeat(1000),
      bodyContent: 'a',
    });
    expect(result.success).toBe(true);
  });
});

describe('constants', () => {
  it('TEMPLATE_CHANNELS has correct values', () => {
    expect(TEMPLATE_CHANNELS).toEqual(['email', 'whatsapp']);
  });

  it('TEMPLATE_STATUSES has correct values', () => {
    expect(TEMPLATE_STATUSES).toEqual(['draft', 'active', 'archived']);
  });

  it('TEMPLATE_SEND_MODES has correct values', () => {
    expect(TEMPLATE_SEND_MODES).toEqual(['automatic', 'manual', 'both']);
  });

  it('SYSTEM_TEMPLATE_KEYS has 12 keys', () => {
    expect(SYSTEM_TEMPLATE_KEYS).toHaveLength(12);
  });
});
