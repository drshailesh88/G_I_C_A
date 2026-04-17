import { describe, expect, it } from 'vitest';
import { buildBrandingStorageKey, eventBrandingSchema } from './branding';

describe('eventBrandingSchema', () => {
  it('treats null persisted fields as missing instead of failing the full branding payload', () => {
    const result = eventBrandingSchema.parse({
      primaryColor: '#AABBCC',
      emailFooterText: null,
      logoStorageKey: null,
      whatsappPrefix: null,
    });

    expect(result.primaryColor).toBe('#AABBCC');
    expect(result.emailFooterText).toBe('');
    expect(result.logoStorageKey).toBe('');
    expect(result.whatsappPrefix).toBe('');
  });

  it('defaults nullable color and sender fields without dropping valid sibling values', () => {
    const result = eventBrandingSchema.parse({
      secondaryColor: null,
      headerImageStorageKey: null,
      emailSenderName: '  GEM India 2026  ',
    });

    expect(result.secondaryColor).toBe('#9333EA');
    expect(result.headerImageStorageKey).toBe('');
    expect(result.emailSenderName).toBe('GEM India 2026');
  });
});

describe('buildBrandingStorageKey', () => {
  it('strips path segments and leading dots from attacker-controlled filenames', () => {
    const key = buildBrandingStorageKey(
      '11111111-1111-4111-8111-111111111111',
      'logo',
      '../../secrets/.env',
    );

    const filename = key.split('/').at(-1) ?? '';
    expect(filename).toMatch(/^[a-z0-9]+-env$/);
    expect(key).not.toContain('..');
  });

  it('falls back to a safe filename when sanitization would otherwise empty the name', () => {
    const key = buildBrandingStorageKey(
      '11111111-1111-4111-8111-111111111111',
      'header',
      '..',
    );

    expect(key.split('/').at(-1)).toMatch(/^[a-z0-9]+-file$/);
  });
});
