import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildQrPayloadUrl,
  buildCompactQrPayload,
  parseQrPayload,
  isValidQrToken,
  checkRegistrationEligibility,
  determineScanResult,
  QR_CHECKIN_PATH,
} from './qr-utils';

vi.mock(
  'qrcode.react',
  () => ({
    QRCodeSVG: ({ value }: { value: string }) => createElement('svg', { 'data-value': value }),
  }),
);

import { RegistrationQrCode } from '@/components/shared/RegistrationQrCode';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
const BASE_URL = 'https://gem-india.vercel.app';

// ── buildQrPayloadUrl ────────────────────────────────────────
describe('buildQrPayloadUrl', () => {
  it('builds a valid URL with token and event params', () => {
    const url = buildQrPayloadUrl(BASE_URL, TOKEN, EVENT_ID);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(QR_CHECKIN_PATH);
    expect(parsed.searchParams.get('token')).toBe(TOKEN);
    expect(parsed.searchParams.get('event')).toBe(EVENT_ID);
  });

  it('throws if baseUrl is empty', () => {
    expect(() => buildQrPayloadUrl('', TOKEN, EVENT_ID)).toThrow('baseUrl is required');
  });

  it('throws if token is empty', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, '', EVENT_ID)).toThrow('token is required');
  });

  it('throws if eventId is empty', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, TOKEN, '')).toThrow('eventId is required');
  });

  it('throws if baseUrl is whitespace only', () => {
    expect(() => buildQrPayloadUrl('   ', TOKEN, EVENT_ID)).toThrow('baseUrl is required');
  });

  it('throws if token is whitespace only', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, '   ', EVENT_ID)).toThrow('token is required');
  });

  it('throws if eventId is whitespace only', () => {
    expect(() => buildQrPayloadUrl(BASE_URL, TOKEN, '   ')).toThrow('eventId is required');
  });

  it('handles baseUrl with trailing slash', () => {
    const url = buildQrPayloadUrl('https://example.com/', TOKEN, EVENT_ID);
    expect(url).toContain('/checkin?');
    expect(url).not.toContain('//checkin');
  });
});

// ── buildCompactQrPayload ────────────────────────────────────
describe('buildCompactQrPayload', () => {
  it('builds compact payload in eventId:token format', () => {
    const payload = buildCompactQrPayload(TOKEN, EVENT_ID);
    expect(payload).toBe(`${EVENT_ID}:${TOKEN}`);
  });

  it('throws if token is empty', () => {
    expect(() => buildCompactQrPayload('', EVENT_ID)).toThrow('token is required');
  });

  it('throws if eventId is empty', () => {
    expect(() => buildCompactQrPayload(TOKEN, '')).toThrow('eventId is required');
  });

  it('throws if token is whitespace only', () => {
    expect(() => buildCompactQrPayload('   ', EVENT_ID)).toThrow('token is required');
  });

  it('throws if eventId is whitespace only', () => {
    expect(() => buildCompactQrPayload(TOKEN, '   ')).toThrow('eventId is required');
  });
});

// ── parseQrPayload ───────────────────────────────────────────
describe('parseQrPayload', () => {
  it('parses a full URL payload', () => {
    const url = buildQrPayloadUrl(BASE_URL, TOKEN, EVENT_ID);
    const result = parseQrPayload(url);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });

  it('parses a compact payload', () => {
    const compact = buildCompactQrPayload(TOKEN, EVENT_ID);
    const result = parseQrPayload(compact);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });

  it('parses a compact payload with uppercase UUID characters', () => {
    const uppercaseEventId = EVENT_ID.toUpperCase();
    const result = parseQrPayload(`${uppercaseEventId}:${TOKEN}`);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: uppercaseEventId });
  });

  it('returns invalid for empty string', () => {
    const result = parseQrPayload('');
    expect(result).toEqual({ valid: false, error: 'Empty or invalid payload' });
  });

  it('returns invalid for null-ish input', () => {
    const result = parseQrPayload(null as unknown as string);
    expect(result).toEqual({ valid: false, error: 'Empty or invalid payload' });
  });

  it('returns invalid for URL missing token param', () => {
    const result = parseQrPayload(`${BASE_URL}/checkin?event=${EVENT_ID}`);
    expect(result).toEqual({ valid: false, error: 'Missing token or event parameter' });
  });

  it('returns invalid for URL missing event param', () => {
    const result = parseQrPayload(`${BASE_URL}/checkin?token=${TOKEN}`);
    expect(result).toEqual({ valid: false, error: 'Missing token or event parameter' });
  });

  it('returns invalid for URL with bad token format', () => {
    const result = parseQrPayload(`${BASE_URL}/checkin?token=short&event=${EVENT_ID}`);
    expect(result).toEqual({ valid: false, error: 'Invalid token format' });
  });

  it('returns invalid for URL with bad event format', () => {
    const result = parseQrPayload(`${BASE_URL}/checkin?token=${TOKEN}&event=not-a-uuid`);
    expect(result).toEqual({ valid: false, error: 'Invalid event ID format' });
  });

  it('returns invalid for URL with unexpected pathname', () => {
    const result = parseQrPayload(`${BASE_URL}/phish?token=${TOKEN}&event=${EVENT_ID}`);
    expect(result).toEqual({ valid: false, error: 'Invalid QR payload URL' });
  });

  it('returns invalid for garbage string', () => {
    const result = parseQrPayload('not-a-url-or-compact');
    expect(result).toEqual({ valid: false, error: 'Unrecognized QR format' });
  });

  it('handles whitespace around payload', () => {
    const compact = `  ${EVENT_ID}:${TOKEN}  `;
    const result = parseQrPayload(compact);
    expect(result).toEqual({ valid: true, token: TOKEN, eventId: EVENT_ID });
  });
});

// ── RegistrationQrCode ───────────────────────────────────────
describe('RegistrationQrCode', () => {
  it('renders an SVG QR code for valid props', () => {
    const markup = renderToStaticMarkup(
      createElement(RegistrationQrCode, {
        qrCodeToken: TOKEN,
        eventId: EVENT_ID,
        baseUrl: BASE_URL,
      }),
    );

    expect(markup).toContain('<svg');
  });

  it('fails closed instead of throwing when runtime props are invalid', () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(RegistrationQrCode, {
          qrCodeToken: null as unknown as string,
          eventId: '   ',
          baseUrl: BASE_URL,
        }),
      ),
    ).not.toThrow();

    const markup = renderToStaticMarkup(
      createElement(RegistrationQrCode, {
        qrCodeToken: null as unknown as string,
        eventId: '   ',
        baseUrl: BASE_URL,
      }),
    );

    expect(markup).toContain('QR code unavailable');
    expect(markup).not.toContain('<svg');
  });
});

// ── isValidQrToken ───────────────────────────────────────────
describe('isValidQrToken', () => {
  it('accepts a valid 32-char alphanumeric token', () => {
    expect(isValidQrToken(TOKEN)).toBe(true);
  });

  it('rejects a short token', () => {
    expect(isValidQrToken('short')).toBe(false);
  });

  it('rejects a token with special chars', () => {
    expect(isValidQrToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidQrToken('')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidQrToken(123 as unknown as string)).toBe(false);
  });

  it('accepts lowercase and mixed case', () => {
    expect(isValidQrToken('abcdefghijklmnopqrstuvwxyz012345')).toBe(true);
    expect(isValidQrToken('AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(true);
  });
});

// ── checkRegistrationEligibility ─────────────────────────────
describe('checkRegistrationEligibility', () => {
  it('confirmed registration is eligible', () => {
    const result = checkRegistrationEligibility('confirmed', null);
    expect(result).toEqual({ eligible: true });
  });

  it('pending registration is not eligible', () => {
    const result = checkRegistrationEligibility('pending', null);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('pending');
  });

  it('cancelled registration is not eligible', () => {
    const result = checkRegistrationEligibility('cancelled', null);
    expect(result.eligible).toBe(false);
  });

  it('declined registration is not eligible', () => {
    const result = checkRegistrationEligibility('declined', null);
    expect(result.eligible).toBe(false);
  });

  it('waitlisted registration is not eligible', () => {
    const result = checkRegistrationEligibility('waitlisted', null);
    expect(result.eligible).toBe(false);
  });

  it('registration with cancelledAt is not eligible even if confirmed', () => {
    const result = checkRegistrationEligibility('confirmed', new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('cancelled');
  });
});

// ── determineScanResult ──────────────────────────────────────
describe('determineScanResult', () => {
  const makeReg = (overrides: Partial<{
    status: string;
    cancelledAt: Date | null;
    personName: string;
    registrationNumber: string;
    category: string;
  }> = {}) => ({
    status: 'confirmed',
    cancelledAt: null,
    personName: 'Dr. Sharma',
    registrationNumber: 'GEM2026-DEL-00001',
    category: 'delegate',
    ...overrides,
  });

  it('returns success for valid, new check-in', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('success');
    expect(result.personName).toBe('Dr. Sharma');
    expect(result.registrationNumber).toBe('GEM2026-DEL-00001');
  });

  it('returns invalid when token not found', () => {
    const result = determineScanResult({
      tokenFound: false,
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('invalid');
  });

  it('returns invalid when registration is undefined', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: undefined,
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('invalid');
  });

  it('returns duplicate for already checked-in (event-level)', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
    });
    expect(result.type).toBe('duplicate');
    expect(result.message).toContain('this event');
  });

  it('returns duplicate for already checked-in (session-level)', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg(),
      alreadyCheckedIn: true,
      sessionId: 'some-session-id',
    });
    expect(result.type).toBe('duplicate');
    expect(result.message).toContain('this session');
  });

  it('returns ineligible for pending registration', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg({ status: 'pending' }),
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('ineligible');
    expect(result.message).toContain('pending');
  });

  it('returns ineligible for cancelled registration', () => {
    const result = determineScanResult({
      tokenFound: true,
      registration: makeReg({ cancelledAt: new Date() }),
      alreadyCheckedIn: false,
    });
    expect(result.type).toBe('ineligible');
    expect(result.message).toContain('cancelled');
  });

  it('includes person details in all non-invalid results', () => {
    const reg = makeReg();

    const success = determineScanResult({
      tokenFound: true,
      registration: reg,
      alreadyCheckedIn: false,
    });
    expect(success.personName).toBe('Dr. Sharma');
    expect(success.category).toBe('delegate');

    const duplicate = determineScanResult({
      tokenFound: true,
      registration: reg,
      alreadyCheckedIn: true,
    });
    expect(duplicate.personName).toBe('Dr. Sharma');

    const ineligible = determineScanResult({
      tokenFound: true,
      registration: makeReg({ status: 'declined' }),
      alreadyCheckedIn: false,
    });
    expect(ineligible.personName).toBe('Dr. Sharma');
  });
});
