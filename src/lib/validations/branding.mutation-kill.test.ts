import { describe, expect, it } from 'vitest';
import {
  eventBrandingSchema,
  updateBrandingSchema,
  DEFAULT_BRANDING,
  BRANDING_IMAGE_MIME_TYPES,
  BRANDING_IMAGE_MAX_SIZE,
  buildBrandingStorageKey,
  type EventBranding,
} from './branding';

/**
 * Mutation-killing tests for src/lib/validations/branding.ts
 * Derived from SPECIFICATIONS, not implementation.
 *
 * Spec sources:
 * - CLAUDE.md: "File upload max: 20MB" (global), branding images 5MB
 * - Module M15: Branding / Letterheads
 * - Hex colors must be #RRGGBB format
 * - Text fields are trimmed on input
 * - Storage keys are sanitized
 */

// ─── hexColor regex (lines 4-7) ────────────────────────────────────────

describe('hexColor validation', () => {
  it('accepts valid 6-digit hex colors', () => {
    const result = eventBrandingSchema.parse({ primaryColor: '#1E40AF' });
    expect(result.primaryColor).toBe('#1E40AF');
  });

  it('accepts empty string as valid (allows clearing)', () => {
    const result = eventBrandingSchema.parse({ primaryColor: '' });
    expect(result.primaryColor).toBe('');
  });

  it('rejects hex without leading #', () => {
    expect(() => eventBrandingSchema.parse({ primaryColor: '1E40AF' })).toThrow();
  });

  it('rejects hex with trailing garbage (regex must anchor end)', () => {
    expect(() => eventBrandingSchema.parse({ primaryColor: '#1E40AFZZ' })).toThrow();
  });

  it('rejects hex with leading garbage (regex must anchor start)', () => {
    expect(() => eventBrandingSchema.parse({ primaryColor: 'XX#1E40AF' })).toThrow();
  });

  it('rejects 3-digit shorthand hex', () => {
    expect(() => eventBrandingSchema.parse({ primaryColor: '#FFF' })).toThrow();
  });

  it('rejects 8-digit hex (alpha channel)', () => {
    expect(() => eventBrandingSchema.parse({ primaryColor: '#1E40AFFF' })).toThrow();
  });

  it('provides helpful error message for invalid hex', () => {
    const result = eventBrandingSchema.safeParse({ primaryColor: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0].message;
      expect(msg).toContain('#1E40AF');
    }
  });
});

// ─── eventBrandingSchema defaults (lines 10-18) ────────────────────────

describe('eventBrandingSchema defaults', () => {
  it('applies correct default primaryColor', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.primaryColor).toBe('#1E40AF');
  });

  it('applies correct default secondaryColor', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.secondaryColor).toBe('#9333EA');
  });

  it('defaults logoStorageKey to empty string', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.logoStorageKey).toBe('');
  });

  it('defaults headerImageStorageKey to empty string', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.headerImageStorageKey).toBe('');
  });

  it('defaults emailSenderName to empty string', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.emailSenderName).toBe('');
  });

  it('defaults emailFooterText to empty string', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.emailFooterText).toBe('');
  });

  it('defaults whatsappPrefix to empty string', () => {
    const result = eventBrandingSchema.parse({});
    expect(result.whatsappPrefix).toBe('');
  });
});

// ─── .trim() behavior (lines 15-17) ────────────────────────────────────

describe('eventBrandingSchema trims text fields', () => {
  it('trims whitespace from emailSenderName', () => {
    const result = eventBrandingSchema.parse({ emailSenderName: '  GEM India  ' });
    expect(result.emailSenderName).toBe('GEM India');
  });

  it('trims whitespace from emailFooterText', () => {
    const result = eventBrandingSchema.parse({ emailFooterText: '  Footer text  ' });
    expect(result.emailFooterText).toBe('Footer text');
  });

  it('trims whitespace from whatsappPrefix', () => {
    const result = eventBrandingSchema.parse({ whatsappPrefix: '  [GEM]  ' });
    expect(result.whatsappPrefix).toBe('[GEM]');
  });
});

// ─── .max() length enforcement (lines 11, 12, 15, 16, 17) ─────────────

describe('eventBrandingSchema max length enforcement', () => {
  it('rejects logoStorageKey exceeding 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ logoStorageKey: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts logoStorageKey at exactly 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ logoStorageKey: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects headerImageStorageKey exceeding 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ headerImageStorageKey: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts headerImageStorageKey at exactly 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ headerImageStorageKey: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects emailSenderName exceeding 100 chars', () => {
    const result = eventBrandingSchema.safeParse({ emailSenderName: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts emailSenderName at exactly 100 chars', () => {
    const result = eventBrandingSchema.safeParse({ emailSenderName: 'x'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('rejects emailFooterText exceeding 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ emailFooterText: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts emailFooterText at exactly 500 chars', () => {
    const result = eventBrandingSchema.safeParse({ emailFooterText: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects whatsappPrefix exceeding 200 chars', () => {
    const result = eventBrandingSchema.safeParse({ whatsappPrefix: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts whatsappPrefix at exactly 200 chars', () => {
    const result = eventBrandingSchema.safeParse({ whatsappPrefix: 'x'.repeat(200) });
    expect(result.success).toBe(true);
  });
});

// ─── updateBrandingSchema (lines 23-31) ────────────────────────────────

describe('updateBrandingSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = updateBrandingSchema.parse({});
    expect(result).toEqual({});
  });

  it('trims emailSenderName in update schema', () => {
    const result = updateBrandingSchema.parse({ emailSenderName: '  Trimmed  ' });
    expect(result.emailSenderName).toBe('Trimmed');
  });

  it('trims emailFooterText in update schema', () => {
    const result = updateBrandingSchema.parse({ emailFooterText: '  Footer  ' });
    expect(result.emailFooterText).toBe('Footer');
  });

  it('trims whatsappPrefix in update schema', () => {
    const result = updateBrandingSchema.parse({ whatsappPrefix: '  Prefix  ' });
    expect(result.whatsappPrefix).toBe('Prefix');
  });

  it('rejects headerImageStorageKey exceeding 500 chars in update', () => {
    const result = updateBrandingSchema.safeParse({ headerImageStorageKey: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts headerImageStorageKey at exactly 500 chars in update', () => {
    const result = updateBrandingSchema.safeParse({ headerImageStorageKey: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects whatsappPrefix exceeding 200 chars in update', () => {
    const result = updateBrandingSchema.safeParse({ whatsappPrefix: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts whatsappPrefix at exactly 200 chars in update', () => {
    const result = updateBrandingSchema.safeParse({ whatsappPrefix: 'x'.repeat(200) });
    expect(result.success).toBe(true);
  });
});

// ─── DEFAULT_BRANDING constant (lines 36-44) ──────────────────────────

describe('DEFAULT_BRANDING values', () => {
  it('has exact expected default values', () => {
    expect(DEFAULT_BRANDING).toEqual({
      logoStorageKey: '',
      headerImageStorageKey: '',
      primaryColor: '#1E40AF',
      secondaryColor: '#9333EA',
      emailSenderName: '',
      emailFooterText: '',
      whatsappPrefix: '',
    });
  });

  it('emailSenderName default is empty string not arbitrary text', () => {
    expect(DEFAULT_BRANDING.emailSenderName).toBe('');
    expect(DEFAULT_BRANDING.emailSenderName).not.toBe('Stryker was here!');
  });

  it('emailFooterText default is empty string not arbitrary text', () => {
    expect(DEFAULT_BRANDING.emailFooterText).toBe('');
    expect(DEFAULT_BRANDING.emailFooterText).not.toBe('Stryker was here!');
  });

  it('whatsappPrefix default is empty string not arbitrary text', () => {
    expect(DEFAULT_BRANDING.whatsappPrefix).toBe('');
    expect(DEFAULT_BRANDING.whatsappPrefix).not.toBe('Stryker was here!');
  });
});

// ─── BRANDING_IMAGE_MIME_TYPES and MAX_SIZE (lines 47-55) ──────────────

describe('branding image constants', () => {
  it('allows exactly 4 MIME types: png, jpeg, webp, svg+xml', () => {
    expect(BRANDING_IMAGE_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ]);
    expect(BRANDING_IMAGE_MIME_TYPES).toHaveLength(4);
  });

  it('max image size is exactly 5MB', () => {
    expect(BRANDING_IMAGE_MAX_SIZE).toBe(5 * 1024 * 1024);
    expect(BRANDING_IMAGE_MAX_SIZE).toBe(5242880);
  });
});

// ─── buildBrandingStorageKey (lines 58-67) ─────────────────────────────

describe('buildBrandingStorageKey', () => {
  it('returns a path starting with branding/', () => {
    const key = buildBrandingStorageKey('evt-1', 'logo', 'photo.png');
    expect(key).toMatch(/^branding\//);
  });

  it('includes eventId in the path', () => {
    const key = buildBrandingStorageKey('evt-123', 'logo', 'photo.png');
    expect(key).toContain('evt-123');
  });

  it('includes imageType in the path', () => {
    const keyLogo = buildBrandingStorageKey('evt-1', 'logo', 'photo.png');
    expect(keyLogo).toContain('/logo/');

    const keyHeader = buildBrandingStorageKey('evt-1', 'header', 'photo.png');
    expect(keyHeader).toContain('/header/');
  });

  it('sanitizes special characters in filename with underscores', () => {
    const key = buildBrandingStorageKey('evt-1', 'logo', 'my photo (1).png');
    // Spaces and parens should be replaced with _
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
    expect(key).not.toContain(')');
    expect(key).toContain('my_photo__1_');
  });

  it('truncates filename to 100 characters', () => {
    const longName = 'a'.repeat(200) + '.png';
    const key = buildBrandingStorageKey('evt-1', 'logo', longName);
    // The sanitized filename portion should be at most 100 chars
    const parts = key.split('/');
    const filenamePart = parts[parts.length - 1]; // ts-safe_filename
    // Format: {ts}-{safe} where safe is sliced to 100
    const dashIdx = filenamePart.indexOf('-');
    const safePart = filenamePart.slice(dashIdx + 1);
    expect(safePart.length).toBeLessThanOrEqual(100);
  });

  it('preserves alphanumeric chars, dots, and hyphens in filename', () => {
    const key = buildBrandingStorageKey('evt-1', 'logo', 'my-file.v2.png');
    expect(key).toContain('my-file.v2.png');
  });

  it('includes a timestamp segment for uniqueness', () => {
    const key = buildBrandingStorageKey('evt-1', 'logo', 'test.png');
    // Format: branding/{eventId}/{type}/{ts}-{safe}
    const parts = key.split('/');
    const lastPart = parts[parts.length - 1];
    // Should have a base36 timestamp before the dash
    expect(lastPart).toMatch(/^[a-z0-9]+-/);
  });
});
