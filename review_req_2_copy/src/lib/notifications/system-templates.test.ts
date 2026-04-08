import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SYSTEM_TEMPLATE_SEEDS,
  getSystemTemplateKeys,
  getSeedsForKey,
} from './system-templates';
import { SYSTEM_TEMPLATE_KEYS } from '@/lib/validations/notification-template';
import { interpolate, validateRequiredVariables } from './template-utils';

describe('System template seeds', () => {
  it('has exactly 20 seeds (10 keys × 2 channels)', () => {
    expect(SYSTEM_TEMPLATE_SEEDS).toHaveLength(20);
  });

  it('has exactly 10 unique template keys', () => {
    const keys = getSystemTemplateKeys();
    expect(keys).toHaveLength(10);
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

  it('covers every notification template key referenced by cascade handlers', () => {
    const handlersDir = join(__dirname, '..', 'cascade', 'handlers');
    const handlerFiles = ['travel-cascade.ts', 'accommodation-cascade.ts'];

    const referencedTemplateKeys = new Set<string>();

    for (const file of handlerFiles) {
      const source = readFileSync(join(handlersDir, file), 'utf8');
      const matches = source.matchAll(/templateKey:\s*'([^']+)'/g);
      for (const match of matches) {
        referencedTemplateKeys.add(match[1]);
      }
    }

    const seededTemplateKeys = new Set(getSystemTemplateKeys());

    expect(
      [...referencedTemplateKeys].filter((key) => !seededTemplateKeys.has(key)).sort(),
    ).toEqual([]);
  });

  it('keeps allowed and required variables consistent across email and WhatsApp variants', () => {
    const inconsistentKeys: Array<{
      key: string;
      allowedEmail: string[];
      allowedWhatsApp: string[];
      requiredEmail: string[];
      requiredWhatsApp: string[];
    }> = [];

    for (const key of getSystemTemplateKeys()) {
      const emailSeed = getSeedsForKey(key).find((seed) => seed.channel === 'email');
      const whatsappSeed = getSeedsForKey(key).find((seed) => seed.channel === 'whatsapp');

      expect(emailSeed, `${key}: missing email seed`).toBeDefined();
      expect(whatsappSeed, `${key}: missing WhatsApp seed`).toBeDefined();

      const allowedEmail = [...emailSeed!.allowedVariablesJson].sort();
      const allowedWhatsApp = [...whatsappSeed!.allowedVariablesJson].sort();
      const requiredEmail = [...emailSeed!.requiredVariablesJson].sort();
      const requiredWhatsApp = [...whatsappSeed!.requiredVariablesJson].sort();

      if (
        JSON.stringify(allowedEmail) !== JSON.stringify(allowedWhatsApp) ||
        JSON.stringify(requiredEmail) !== JSON.stringify(requiredWhatsApp)
      ) {
        inconsistentKeys.push({
          key,
          allowedEmail,
          allowedWhatsApp,
          requiredEmail,
          requiredWhatsApp,
        });
      }
    }

    expect(inconsistentKeys).toEqual([]);
  });
});
