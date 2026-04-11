/**
 * Mutation-killing tests for qr-utils.ts
 *
 * Targets surviving mutations:
 * - Regex: QR_TOKEN_PATTERN and UUID_PATTERN mutations
 * - StringLiteral: exact error/protocol strings
 * - ConditionalExpression: typeof checks, .trim().length === 0
 * - MethodExpression: .trim() in normalizeRequiredString
 */
import { describe, expect, it } from 'vitest';
import {
  buildQrPayloadUrl,
  buildCompactQrPayload,
  parseQrPayload,
  isValidQrToken,
  checkRegistrationEligibility,
  determineScanResult,
  QR_CHECKIN_PATH,
} from './qr-utils';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'; // 32 chars

// ── Regex mutation killers ──────────────────────────────────────
describe('QR_TOKEN_PATTERN boundary tests (kill Regex mutations)', () => {
  // Pattern is /^[A-Za-z0-9]{32}$/
  it('rejects token with underscore (non-alphanumeric)', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcde')).toBe(false); // 32 chars with _
  });

  it('rejects token with hyphen', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcde')).toBe(false);
  });

  it('rejects token with dot', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ.abcde')).toBe(false);
  });

  it('accepts token with all digits', () => {
    expect(isValidQrToken('01234567890123456789012345678901')).toBe(true);
  });

  it('accepts token with all uppercase', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF')).toBe(true);
  });

  it('accepts token with all lowercase', () => {
    expect(isValidQrToken('abcdefghijklmnopqrstuvwxyzabcdef')).toBe(true);
  });
});

describe('UUID_PATTERN mutation killers', () => {
  it('rejects UUID with wrong segment lengths', () => {
    // Missing a character in segment 2
    expect(() =>
      buildQrPayloadUrl('https://example.com', TOKEN, '550e8400-e29b-41d-a716-446655440000'),
    ).toThrow('eventId format is invalid');
  });

  it('rejects UUID with non-hex characters', () => {
    expect(() =>
      buildQrPayloadUrl('https://example.com', TOKEN, '550g8400-e29b-41d4-a716-446655440000'),
    ).toThrow('eventId format is invalid');
  });

  it('accepts UUID with uppercase hex digits', () => {
    const url = buildQrPayloadUrl(
      'https://example.com',
      TOKEN,
      '550E8400-E29B-41D4-A716-446655440000',
    );
    expect(url).toContain('event=550E8400-E29B-41D4-A716-446655440000');
  });
});

// ── normalizeRequiredString .trim() mutation killer ──────────────
describe('normalizeRequiredString .trim() behavior', () => {
  it('trims leading/trailing whitespace from baseUrl', () => {
    const url = buildQrPayloadUrl('  https://example.com  ', TOKEN, EVENT_ID);
    expect(url).toContain('https://example.com/checkin');
  });

  it('trims leading/trailing whitespace from token', () => {
    const url = buildQrPayloadUrl('https://example.com', `  ${TOKEN}  `, EVENT_ID);
    expect(url).toContain(`token=${TOKEN}`);
  });

  it('trims leading/trailing whitespace from eventId', () => {
    const url = buildQrPayloadUrl('https://example.com', TOKEN, `  ${EVENT_ID}  `);
    expect(url).toContain(`event=${EVENT_ID}`);
  });
});

// ── StringLiteral: protocol check in parseQrPayload ─────────────
describe('parseQrPayload protocol string mutations', () => {
  it('accepts http: protocol', () => {
    const url = `http://example.com/checkin?token=${TOKEN}&event=${EVENT_ID}`;
    const result = parseQrPayload(url);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });

  it('accepts https: protocol', () => {
    const url = `https://example.com/checkin?token=${TOKEN}&event=${EVENT_ID}`;
    const result = parseQrPayload(url);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });

  it('rejects javascript: protocol', () => {
    // The URL constructor may throw or parse differently, but either way it should be invalid
    const result = parseQrPayload(`javascript:alert(1)//checkin?token=${TOKEN}&event=${EVENT_ID}`);
    expect(result.valid).toBe(false);
  });
});

// ── StringLiteral: exact error messages ─────────────────────────
describe('buildQrPayloadUrl exact error strings', () => {
  it('throws "baseUrl must use http or https" for non-http protocol', () => {
    expect(() =>
      buildQrPayloadUrl('ftp://example.com', TOKEN, EVENT_ID),
    ).toThrow('baseUrl must use http or https');
  });

  it('throws "token format is invalid" for bad token', () => {
    expect(() =>
      buildQrPayloadUrl('https://example.com', 'short', EVENT_ID),
    ).toThrow('token format is invalid');
  });

  it('throws "eventId format is invalid" for bad eventId', () => {
    expect(() =>
      buildQrPayloadUrl('https://example.com', TOKEN, 'bad'),
    ).toThrow('eventId format is invalid');
  });
});

// ── ConditionalExpression: typeof check in normalizeRequiredString ──
describe('normalizeRequiredString typeof guard', () => {
  it('throws for non-string baseUrl (number)', () => {
    expect(() =>
      buildQrPayloadUrl(123 as unknown as string, TOKEN, EVENT_ID),
    ).toThrow('baseUrl is required');
  });

  it('throws for non-string token (undefined)', () => {
    expect(() =>
      buildQrPayloadUrl('https://example.com', undefined as unknown as string, EVENT_ID),
    ).toThrow('token is required');
  });
});

// ── ConditionalExpression: isValidQrToken typeof check ──────────
describe('isValidQrToken typeof guard', () => {
  it('returns false for number input', () => {
    expect(isValidQrToken(12345678901234567890123456789012 as unknown as string)).toBe(false);
  });

  it('returns false for boolean input', () => {
    expect(isValidQrToken(true as unknown as string)).toBe(false);
  });

  it('returns false for object input', () => {
    expect(isValidQrToken({} as unknown as string)).toBe(false);
  });
});

// ── parseQrPayload: falsy/empty guard ───────────────────────────
describe('parseQrPayload empty/falsy guard', () => {
  it('returns error for undefined', () => {
    const result = parseQrPayload(undefined as unknown as string);
    expect(result).toEqual({ valid: false, error: 'Empty or invalid payload' });
  });

  it('returns error for number 0', () => {
    const result = parseQrPayload(0 as unknown as string);
    expect(result).toEqual({ valid: false, error: 'Empty or invalid payload' });
  });
});

// ── determineScanResult: sessionId truthy check for scope message ──
describe('determineScanResult sessionId scope differentiation', () => {
  const makeReg = () => ({
    status: 'confirmed',
    cancelledAt: null,
    personName: 'Test',
    registrationNumber: 'REG-001',
    category: 'delegate',
  });

  it('says "this event" when sessionId is undefined', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      // sessionId not provided (undefined)
    });
    expect(result.message).toContain('this event');
  });

  it('says "this event" when sessionId is empty string', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      sessionId: '',
    });
    // Empty string is falsy, so scope should be "this event"
    expect(result.message).toContain('this event');
  });

  it('says "this session" when sessionId is a non-empty string', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      sessionId: 'session-123',
    });
    expect(result.message).toContain('this session');
  });
});

// ── QR_CHECKIN_PATH constant ────────────────────────────────────
describe('QR_CHECKIN_PATH value', () => {
  it('equals /checkin', () => {
    expect(QR_CHECKIN_PATH).toBe('/checkin');
  });
});
