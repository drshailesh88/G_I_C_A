import { describe, expect, it } from 'vitest';

import {
  SYSTEM_TEMPLATE_SEEDS,
  getSeedsForKey,
  getSystemTemplateKeys,
  type SystemTemplateSeed,
} from './system-templates';

describe('system template registry hardening', () => {
  it('blocks process-wide registry poisoning through the exported seed array', () => {
    const originalKeys = getSystemTemplateKeys();
    const forgedSeed = {
      ...SYSTEM_TEMPLATE_SEEDS[0],
      templateKey: 'forged_runtime_template',
    } as SystemTemplateSeed;

    expect(() => {
      (SYSTEM_TEMPLATE_SEEDS as SystemTemplateSeed[]).push(forgedSeed);
    }).toThrow(TypeError);

    expect(getSystemTemplateKeys()).toEqual(originalKeys);
    expect(getSystemTemplateKeys()).not.toContain('forged_runtime_template');
  });

  it('blocks nested mutation of shared seed objects returned by getSeedsForKey', () => {
    const originalSeed = getSeedsForKey('registration_confirmation').find(
      (seed) => seed.channel === 'email',
    );

    expect(originalSeed).toBeDefined();
    expect(originalSeed?.bodyContent).toContain('{{registrationNumber}}');
    expect(originalSeed?.allowedVariablesJson).toContain('eventName');

    expect(() => {
      const emailSeed = getSeedsForKey('registration_confirmation').find(
        (seed) => seed.channel === 'email',
      ) as SystemTemplateSeed;

      (emailSeed as { bodyContent: string }).bodyContent = 'pwned';
    }).toThrow(TypeError);

    expect(() => {
      const emailSeed = getSeedsForKey('registration_confirmation').find(
        (seed) => seed.channel === 'email',
      ) as SystemTemplateSeed;

      (emailSeed.allowedVariablesJson as string[]).push('__proto__');
    }).toThrow(TypeError);

    const reloadedSeed = getSeedsForKey('registration_confirmation').find(
      (seed) => seed.channel === 'email',
    );

    expect(reloadedSeed?.bodyContent).toBe(originalSeed?.bodyContent);
    expect(reloadedSeed?.allowedVariablesJson).toEqual(originalSeed?.allowedVariablesJson);
    expect(reloadedSeed?.allowedVariablesJson).not.toContain('__proto__');
  });
});
