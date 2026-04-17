import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyResendSignature, verifyEvolutionSignature } from './webhook-auth';

describe('verifyResendSignature', () => {
  const WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldA=='; // base64 of "testsecret"
  const NOW_SECONDS = 1712592000;

  beforeEach(() => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function signPayload(payload: string, svixId: string, svixTimestamp: string) {
    const secretBytes = Buffer.from('dGVzdHNlY3JldA==', 'base64');
    const content = `${svixId}.${svixTimestamp}.${payload}`;
    const sig = createHmac('sha256', secretBytes).update(content).digest('base64');
    return `v1,${sig}`;
  }

  it('accepts a valid signature', () => {
    const payload = '{"type":"email.sent","data":{}}';
    const svixId = 'msg_123';
    const svixTimestamp = String(NOW_SECONDS);
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    expect(verifyResendSignature({ payload, svixId, svixTimestamp, svixSignature })).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyResendSignature({
      payload: '{"type":"email.sent"}',
      svixId: 'msg_123',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: 'v1,invalidsignaturedata',
    })).toBe(false);
  });

  it('rejects when svix headers are missing', () => {
    expect(verifyResendSignature({
      payload: '{}',
      svixId: null,
      svixTimestamp: null,
      svixSignature: null,
    })).toBe(false);
  });

  it('rejects when secret is not configured', () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    expect(verifyResendSignature({
      payload: '{}',
      svixId: 'msg_1',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: 'v1,abc',
    })).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = '{"type":"email.sent","data":{}}';
    const svixId = 'msg_123';
    const svixTimestamp = String(NOW_SECONDS);
    const svixSignature = signPayload(original, svixId, svixTimestamp);

    const tampered = '{"type":"email.sent","data":{"hacked":true}}';
    expect(verifyResendSignature({ payload: tampered, svixId, svixTimestamp, svixSignature })).toBe(false);
  });

  it('rejects a correctly signed stale timestamp to block webhook replay', () => {
    const payload = '{"type":"email.delivered","data":{}}';
    const svixId = 'msg_stale';
    const svixTimestamp = String(NOW_SECONDS - 301);
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    expect(verifyResendSignature({ payload, svixId, svixTimestamp, svixSignature })).toBe(false);
  });

  it('rejects a malformed timestamp even when the signature matches that value', () => {
    const payload = '{"type":"email.delivered","data":{}}';
    const svixId = 'msg_bad_ts';
    const svixTimestamp = '1712592000.5';
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    expect(verifyResendSignature({ payload, svixId, svixTimestamp, svixSignature })).toBe(false);
  });
});

describe('verifyEvolutionSignature', () => {
  const WEBHOOK_SECRET = 'my-evolution-secret';

  beforeEach(() => {
    vi.stubEnv('EVOLUTION_WEBHOOK_SECRET', WEBHOOK_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts valid Bearer token', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: `Bearer ${WEBHOOK_SECRET}`,
    })).toBe(true);
  });

  it('accepts raw token without Bearer prefix', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: WEBHOOK_SECRET,
    })).toBe(true);
  });

  it('rejects invalid token', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: 'Bearer wrong-secret',
    })).toBe(false);
  });

  it('rejects missing header', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: null,
    })).toBe(false);
  });

  it('rejects when secret not configured', () => {
    vi.stubEnv('EVOLUTION_WEBHOOK_SECRET', '');
    expect(verifyEvolutionSignature({
      authorizationHeader: 'Bearer something',
    })).toBe(false);
  });
});
