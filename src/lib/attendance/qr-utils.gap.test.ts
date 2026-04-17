import { describe, expect, it, vi } from 'vitest';
import {
  buildQrPayloadUrl,
  buildCompactQrPayload,
  parseQrPayload,
  isValidQrToken,
  checkRegistrationEligibility,
  determineScanResult,
} from './qr-utils';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
const BASE_URL = 'https://gem-india.vercel.app';

// ── Gap: Round-trip integrity ─────────────────────────────────
describe('QR payload round-trip integrity', () => {
  it('URL format: build then parse returns same token and eventId', () => {
    const url = buildQrPayloadUrl(BASE_URL, TOKEN, EVENT_ID);
    const parsed = parseQrPayload(url);
    expect(parsed).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });

  it('compact format: build then parse returns same token and eventId', () => {
    const compact = buildCompactQrPayload(TOKEN, EVENT_ID);
    const parsed = parseQrPayload(compact);
    expect(parsed).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });
});

// ── Gap: Protocol validation ─────────────────────────────────
describe('buildQrPayloadUrl protocol validation', () => {
  it('rejects ftp:// protocol', () => {
    expect(() => buildQrPayloadUrl('ftp://example.com', TOKEN, EVENT_ID)).toThrow();
  });

  it('rejects data: protocol', () => {
    expect(() => buildQrPayloadUrl('data:text/html,hello', TOKEN, EVENT_ID)).toThrow();
  });

  it('accepts http:// protocol', () => {
    const url = buildQrPayloadUrl('http://localhost:3000', TOKEN, EVENT_ID);
    expect(url).toContain('http://localhost:3000/checkin');
  });
});

// ── Gap: Format validation on build ─────────────────────────
describe('buildQrPayloadUrl format rejection', () => {
  it('rejects token with wrong length', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, 'short', EVENT_ID)).toThrow('token format is invalid');
  });

  it('rejects token with special characters', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^', EVENT_ID)).toThrow('token format is invalid');
  });

  it('rejects non-UUID eventId', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, TOKEN, 'not-a-uuid')).toThrow('eventId format is invalid');
  });
});

describe('buildCompactQrPayload format rejection', () => {
  it('rejects token with wrong length', () => {
    expect(() => buildCompactQrPayload('short', EVENT_ID)).toThrow('token format is invalid');
  });

  it('rejects non-UUID eventId', () => {
    expect(() => buildCompactQrPayload(TOKEN, 'not-a-uuid')).toThrow('eventId format is invalid');
  });
});

// ── Gap: isValidQrToken edge cases ─────────────────────────
describe('isValidQrToken additional edges', () => {
  it('rejects 33-char token (too long)', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefX')).toBe(false);
  });

  it('rejects 31-char token (too short)', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZabcde')).toBe(false);
  });

  it('rejects token with spaces', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWX YZabcd')).toBe(false);
  });

  it('rejects undefined input', () => {
    expect(isValidQrToken(undefined as unknown as string)).toBe(false);
  });

  it('rejects null input', () => {
    expect(isValidQrToken(null as unknown as string)).toBe(false);
  });

  it('accepts all-numeric 32-char token', () => {
    expect(isValidQrToken('12345678901234567890123456789012')).toBe(true);
  });
});

// ── Gap: checkRegistrationEligibility additional statuses ───
describe('checkRegistrationEligibility extra statuses', () => {
  it('unknown/random status is not eligible', () => {
    const result = checkRegistrationEligibility('unknown_status', null);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('unknown_status');
  });

  it('empty string status is not eligible', () => {
    const result = checkRegistrationEligibility('', null);
    expect(result.eligible).toBe(false);
  });

  it('cancelledAt takes precedence over eligibility check', () => {
    // Even if status was somehow 'confirmed', cancelledAt must block
    const result = checkRegistrationEligibility('confirmed', new Date('2025-01-01'));
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('cancelled');
  });
});

// ── Gap: determineScanResult message specifics ──────────────
describe('determineScanResult message specifics', () => {
  const makeReg = (overrides = {}) => ({
    status: 'confirmed',
    cancelledAt: null,
    personName: 'Dr. Sharma',
    registrationNumber: 'GEM2026-DEL-00001',
    category: 'delegate',
    ...overrides,
  });

  it('success message says "Check-in successful"', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: false,
    });
    expect(result.message).toBe('Check-in successful!');
  });

  it('invalid result has no personName/registrationNumber/category', () => {
    const result = determineScanResult({
      tokenFound: false,
      alreadyCheckedIn: false,
    });
    expect(result.personName).toBeUndefined();
    expect(result.registrationNumber).toBeUndefined();
    expect(result.category).toBeUndefined();
  });

  it('event-level duplicate mentions "this event" not "this session"', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      sessionId: null,
    });
    expect(result.message).toContain('this event');
    expect(result.message).not.toContain('this session');
  });

  it('session-level duplicate mentions "this session" not "this event"', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      sessionId: '550e8400-e29b-41d4-a716-446655440010',
    });
    expect(result.message).toContain('this session');
    expect(result.message).not.toContain('this event');
  });

  it('ineligible result includes registrationNumber and category', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg({ status: 'waitlisted' }),
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('ineligible');
    expect(result.registrationNumber).toBe('GEM2026-DEL-00001');
    expect(result.category).toBe('delegate');
  });
});

// ── Gap: parseQrPayload with non-http URL ────────────────────
describe('parseQrPayload protocol edge cases', () => {
  it('returns invalid for ftp:// URL with correct path', () => {
    const result = parseQrPayload(`ftp://example.com/checkin?token=${TOKEN}&event=${EVENT_ID}`);
    expect(result).toEqual({ valid: false, error: 'Invalid QR payload URL' });
  });

  it('returns invalid for compact payload with extra colons', () => {
    const result = parseQrPayload(`${EVENT_ID}:${TOKEN}:extra`);
    expect(result).toEqual({ valid: false, error: 'Unrecognized QR format' });
  });

  it('returns invalid for compact payload with non-UUID prefix', () => {
    const result = parseQrPayload(`not-a-uuid:${TOKEN}`);
    expect(result.valid).toBe(false);
  });
});

describe('QR payload hardening regressions', () => {
  it('rejects duplicate token parameters in URL payloads', () => {
    const result = parseQrPayload(
      `https://example.com/checkin?token=${TOKEN}&token=12345678901234567890123456789012&event=${EVENT_ID}`,
    );

    expect(result).toEqual({
      valid: false,
      error: 'Duplicate token or event parameter',
    });
  });

  it('rejects traversal-like URL payload paths that normalize to /checkin', () => {
    const result = parseQrPayload(
      `https://example.com/foo/../checkin?token=${TOKEN}&event=${EVENT_ID}`,
    );

    expect(result).toEqual({
      valid: false,
      error: 'Invalid QR payload URL',
    });
  });

  it('rejects URL payloads with fragments', () => {
    const result = parseQrPayload(
      `https://example.com/checkin?token=${TOKEN}&event=${EVENT_ID}#scanner-cache`,
    );

    expect(result).toEqual({
      valid: false,
      error: 'Invalid QR payload URL',
    });
  });

  it('rejects payloads longer than the attendance validation limit', () => {
    const longPayload = `https://example.com/checkin?token=${TOKEN}&event=${EVENT_ID}&pad=${'x'.repeat(500)}`;
    const result = parseQrPayload(longPayload);

    expect(result).toEqual({
      valid: false,
      error: 'QR payload exceeds maximum length',
    });
  });

  it('rejects building a full QR URL that downstream attendance validation would refuse', () => {
    const longBaseUrl = `https://${'a'.repeat(430)}.example.com`;

    expect(() => buildQrPayloadUrl(longBaseUrl, TOKEN, EVENT_ID)).toThrow(
      'QR payload exceeds maximum length',
    );
  });
});
