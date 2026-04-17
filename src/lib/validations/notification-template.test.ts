import { describe, expect, it } from 'vitest';
import {
  createNotificationTemplateSchema,
  updateNotificationTemplateSchema,
  TEMPLATE_CHANNELS,
  TEMPLATE_STATUSES,
  TEMPLATE_SEND_MODES,
  TEMPLATE_META_CATEGORIES,
  SYSTEM_TEMPLATE_KEYS,
} from './notification-template';

// ── Constants ─────────────────────────────────────────────────
describe('Notification template constants', () => {
  it('defines 2 channels', () => {
    expect(TEMPLATE_CHANNELS).toHaveLength(2);
    expect(TEMPLATE_CHANNELS).toContain('email');
    expect(TEMPLATE_CHANNELS).toContain('whatsapp');
  });

  it('defines 3 statuses', () => {
    expect(TEMPLATE_STATUSES).toHaveLength(3);
    expect(TEMPLATE_STATUSES).toContain('draft');
    expect(TEMPLATE_STATUSES).toContain('active');
    expect(TEMPLATE_STATUSES).toContain('archived');
  });

  it('defines 3 send modes', () => {
    expect(TEMPLATE_SEND_MODES).toHaveLength(3);
    expect(TEMPLATE_SEND_MODES).toContain('automatic');
    expect(TEMPLATE_SEND_MODES).toContain('manual');
    expect(TEMPLATE_SEND_MODES).toContain('both');
  });

  it('defines 6 meta categories', () => {
    expect(TEMPLATE_META_CATEGORIES).toHaveLength(6);
    expect(TEMPLATE_META_CATEGORIES).toContain('registration');
    expect(TEMPLATE_META_CATEGORIES).toContain('logistics');
  });

  it('defines 12 system template keys', () => {
    expect(SYSTEM_TEMPLATE_KEYS).toHaveLength(12);
    expect(SYSTEM_TEMPLATE_KEYS).toContain('registration_confirmation');
    expect(SYSTEM_TEMPLATE_KEYS).toContain('accommodation_update');
    expect(SYSTEM_TEMPLATE_KEYS).toContain('accommodation_cancelled');
    expect(SYSTEM_TEMPLATE_KEYS).toContain('event_reminder');
  });
});

// ── createNotificationTemplateSchema ─────────────────────────
describe('createNotificationTemplateSchema', () => {
  const validEmail = {
    eventId: null,
    templateKey: 'registration_confirmation',
    channel: 'email' as const,
    templateName: 'Registration Confirmation Email',
    metaCategory: 'registration' as const,
    bodyContent: 'Dear {{name}}, your registration is confirmed.',
    subjectLine: 'Registration Confirmed — {{eventName}}',
  };

  const validWhatsApp = {
    eventId: null,
    templateKey: 'registration_confirmation',
    channel: 'whatsapp' as const,
    templateName: 'Registration Confirmation WhatsApp',
    metaCategory: 'registration' as const,
    bodyContent: 'Dear {{name}}, your registration is confirmed.',
  };

  it('accepts valid email template', () => {
    const result = createNotificationTemplateSchema.safeParse(validEmail);
    expect(result.success).toBe(true);
  });

  it('accepts valid WhatsApp template', () => {
    const result = createNotificationTemplateSchema.safeParse(validWhatsApp);
    expect(result.success).toBe(true);
  });

  it('rejects email template without subject line', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      subjectLine: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('allows WhatsApp template without subject line', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validWhatsApp,
      subjectLine: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty templateKey', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      templateKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty bodyContent', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      bodyContent: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid channel', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      channel: 'sms',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid metaCategory', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      metaCategory: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('defaults sendMode to manual', () => {
    const result = createNotificationTemplateSchema.parse(validEmail);
    expect(result.sendMode).toBe('manual');
  });

  it('defaults status to draft', () => {
    const result = createNotificationTemplateSchema.parse(validEmail);
    expect(result.status).toBe('draft');
  });

  it('accepts event-specific template with UUID eventId', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      eventId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID eventId', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      eventId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('defaults allowedVariablesJson to empty array', () => {
    const result = createNotificationTemplateSchema.parse(validEmail);
    expect(result.allowedVariablesJson).toEqual([]);
  });

  it('accepts variables arrays', () => {
    const result = createNotificationTemplateSchema.parse({
      ...validEmail,
      allowedVariablesJson: ['name', 'eventName', 'registrationNumber'],
      requiredVariablesJson: ['name'],
    });
    expect(result.allowedVariablesJson).toEqual(['name', 'eventName', 'registrationNumber']);
    expect(result.requiredVariablesJson).toEqual(['name']);
  });

  it('rejects whitespace-only templateKey', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      templateKey: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only subject line for email', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      subjectLine: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string variable identifiers', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      allowedVariablesJson: ['name', ''],
    });
    expect(result.success).toBe(false);
  });

  it('rejects required variables outside the allowed set', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      allowedVariablesJson: ['fullName'],
      requiredVariablesJson: ['confirmationUrl'],
    });
    expect(result.success).toBe(false);
  });

  it('trims variable identifiers with whitespace padding', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      allowedVariablesJson: ['  fullName  '],
      requiredVariablesJson: ['fullName'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedVariablesJson).toEqual(['fullName']);
    }
  });

  it('rejects reserved prototype-path variable identifiers', () => {
    const result = createNotificationTemplateSchema.safeParse({
      ...validEmail,
      allowedVariablesJson: ['branding.__proto__'],
    });
    expect(result.success).toBe(false);
  });
});

// ── updateNotificationTemplateSchema ─────────────────────────
describe('updateNotificationTemplateSchema', () => {
  it('accepts partial update', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      templateName: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('accepts status change', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      status: 'deleted',
    });
    expect(result.success).toBe(false);
  });

  it('accepts body content update', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      bodyContent: 'New body content with {{variable}}',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty body content', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      bodyContent: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateNotificationTemplateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects empty or whitespace-only variable identifiers in updates', () => {
    expect(updateNotificationTemplateSchema.safeParse({
      allowedVariablesJson: [''],
    }).success).toBe(false);
    expect(updateNotificationTemplateSchema.safeParse({
      requiredVariablesJson: ['   '],
    }).success).toBe(false);
  });

  it('rejects impossible required variable updates', () => {
    const result = updateNotificationTemplateSchema.safeParse({
      allowedVariablesJson: ['fullName'],
      requiredVariablesJson: ['confirmationUrl'],
    });
    expect(result.success).toBe(false);
  });
});
