import { describe, expect, it } from 'vitest';
import {
  SYSTEM_TEMPLATE_SEEDS,
  getSystemTemplateKeys,
  getSeedsForKey,
} from './system-templates';
import { SYSTEM_TEMPLATE_KEYS } from '@/lib/validations/notification-template';
import { interpolate, validateRequiredVariables } from './template-utils';

describe('System template seeds', () => {
  it('has exactly 24 seeds (12 keys × 2 channels)', () => {
    expect(SYSTEM_TEMPLATE_SEEDS).toHaveLength(24);
  });

  it('has exactly 12 unique template keys', () => {
    const keys = getSystemTemplateKeys();
    expect(keys).toHaveLength(12);
  });

  it('every key has both email and WhatsApp variants', () => {
    const keys = getSystemTemplateKeys();
    for (const key of keys) {
      const seeds = getSeedsForKey(key);
      expect(seeds).toHaveLength(2);
      const channels = seeds.map((s) => s.channel).sort();
      expect(channels).toEqual(['email', 'whatsapp']);
    }
  });

  it('all template keys match the SYSTEM_TEMPLATE_KEYS constant', () => {
    const seedKeys = getSystemTemplateKeys().sort();
    const constantKeys = [...SYSTEM_TEMPLATE_KEYS].sort();
    expect(seedKeys).toEqual(constantKeys);
  });

  it('email templates all have subject lines', () => {
    const emailSeeds = SYSTEM_TEMPLATE_SEEDS.filter((s) => s.channel === 'email');
    for (const seed of emailSeeds) {
      expect(seed.subjectLine).toBeTruthy();
    }
  });

  it('whatsapp templates have no subject lines', () => {
    const waSeeds = SYSTEM_TEMPLATE_SEEDS.filter((s) => s.channel === 'whatsapp');
    for (const seed of waSeeds) {
      expect(seed.subjectLine).toBeNull();
    }
  });

  it('all seeds are marked as system templates', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(seed.isSystemTemplate).toBe(true);
    }
  });

  it('all seeds have non-empty bodyContent', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(seed.bodyContent.length).toBeGreaterThan(0);
    }
  });

  it('all required variables are subset of allowed variables', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      for (const req of seed.requiredVariablesJson) {
        expect(
          seed.allowedVariablesJson,
          `${seed.templateKey}/${seed.channel}: required var "${req}" not in allowed list`,
        ).toContain(req);
      }
    }
  });

  it('all template body placeholders use only allowed variables', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      const placeholders = seed.bodyContent.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) ?? [];
      const varNames = placeholders.map((p) => p.replace(/\{\{|\}\}/g, ''));
      for (const varName of varNames) {
        expect(
          seed.allowedVariablesJson,
          `${seed.templateKey}/${seed.channel}: placeholder "{{${varName}}}" not in allowed list`,
        ).toContain(varName);
      }
    }
  });

  it('all email subject placeholders use only allowed variables', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      if (!seed.subjectLine) continue;
      const placeholders = seed.subjectLine.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) ?? [];
      const varNames = placeholders.map((p) => p.replace(/\{\{|\}\}/g, ''));
      for (const varName of varNames) {
        expect(
          seed.allowedVariablesJson,
          `${seed.templateKey}/${seed.channel}: subject placeholder "{{${varName}}}" not in allowed list`,
        ).toContain(varName);
      }
    }
  });

  it('all seeds have valid metaCategory', () => {
    const validCategories = ['registration', 'program', 'logistics', 'certificates', 'reminders', 'system'];
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(validCategories).toContain(seed.metaCategory);
    }
  });

  it('all seeds have valid sendMode', () => {
    const validModes = ['automatic', 'manual', 'both'];
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(validModes).toContain(seed.sendMode);
    }
  });

  it('registration_confirmation renders correctly with sample data', () => {
    const emailSeed = getSeedsForKey('registration_confirmation').find(
      (s) => s.channel === 'email',
    )!;

    const variables = {
      salutation: 'Dr.',
      fullName: 'Rajesh Kumar',
      eventName: 'GEM India 2026',
      registrationNumber: 'REG-001',
      eventDate: '15 April 2026',
      venue: 'AIIMS, New Delhi',
    };

    // All required present
    const missing = validateRequiredVariables(
      emailSeed.requiredVariablesJson,
      variables,
    );
    expect(missing).toEqual([]);

    // Renders without leftover placeholders
    const body = interpolate(emailSeed.bodyContent, variables);
    expect(body).not.toContain('{{');
    expect(body).toContain('Rajesh Kumar');
    expect(body).toContain('GEM India 2026');
    expect(body).toContain('REG-001');
  });

  it('getSeedsForKey returns empty for unknown key', () => {
    expect(getSeedsForKey('nonexistent_key')).toEqual([]);
  });

  it('covers all cascade handler template keys', () => {
    // Template keys referenced by cascade handlers
    const cascadeTemplateKeys = [
      'travel_update',
      'travel_cancelled',
      'accommodation_update',
      'accommodation_cancelled',
    ];
    const seededKeys = getSystemTemplateKeys();
    for (const key of cascadeTemplateKeys) {
      expect(seededKeys, `Missing seed for cascade handler key: ${key}`).toContain(key);
    }
  });
});
