/**
 * Mutation-killing tests for webhook-auth.ts
 *
 * Targets: 17 survivors — ConditionalExpression, StringLiteral,
 * LogicalOperator, BlockStatement, BooleanLiteral in signature verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyResendSignature, verifyEvolutionSignature } from './webhook-auth';

describe('verifyResendSignature — mutation killing', () => {
  const RAW_SECRET = 'dGVzdHNlY3JldA=='; // base64 of "testsecret"
  const WEBHOOK_SECRET = `whsec_${RAW_SECRET}`;
  const NOW_SECONDS = 1712600000;

  function signPayload(payload: string, svixId: string, svixTimestamp: string): string {
    const secretBytes = Buffer.from(RAW_SECRET, 'base64');
    const content = `${svixId}.${svixTimestamp}.${payload}`;
    const sig = createHmac('sha256', secretBytes).update(content).digest('base64');
    return `v1,${sig}`;
  }

  beforeEach(() => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns false when RESEND_WEBHOOK_SECRET is not set', () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    // env is empty string which is falsy
    const result = verifyResendSignature({
      payload: '{}',
      svixId: 'msg_1',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: 'v1,abc',
    });
    expect(result).toBe(false);
  });

  it('returns false when svixId is null', () => {
    const result = verifyResendSignature({
      payload: '{}',
      svixId: null,
      svixTimestamp: '123',
      svixSignature: 'v1,abc',
    });
    expect(result).toBe(false);
  });

  it('returns false when svixTimestamp is null', () => {
    const result = verifyResendSignature({
      payload: '{}',
      svixId: 'msg_1',
      svixTimestamp: null,
      svixSignature: 'v1,abc',
    });
    expect(result).toBe(false);
  });

  it('returns false when svixSignature is null', () => {
    const result = verifyResendSignature({
      payload: '{}',
      svixId: 'msg_1',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: null,
    });
    expect(result).toBe(false);
  });

  it('strips whsec_ prefix from secret before decoding', () => {
    const payload = '{"event":"email.delivered"}';
    const svixId = 'msg_strip';
    const svixTimestamp = String(NOW_SECONDS);
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    const result = verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature,
    });
    expect(result).toBe(true);
  });

  it('handles secret without whsec_ prefix', () => {
    // Set secret without the whsec_ prefix
    vi.stubEnv('RESEND_WEBHOOK_SECRET', RAW_SECRET);

    const payload = '{"event":"email.delivered"}';
    const svixId = 'msg_nopre';
    const svixTimestamp = String(NOW_SECONDS);

    // Sign with raw secret (no prefix stripping needed)
    const secretBytes = Buffer.from(RAW_SECRET, 'base64');
    const content = `${svixId}.${svixTimestamp}.${payload}`;
    const sig = createHmac('sha256', secretBytes).update(content).digest('base64');
    const svixSignature = `v1,${sig}`;

    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature,
    })).toBe(true);
  });

  it('strips v1, prefix from signature before comparison', () => {
    const payload = '{"test":true}';
    const svixId = 'msg_v1';
    const svixTimestamp = String(NOW_SECONDS + 1);
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    // Verify the signature starts with v1,
    expect(svixSignature.startsWith('v1,')).toBe(true);
    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature,
    })).toBe(true);
  });

  it('accepts when one of multiple space-separated signatures is valid', () => {
    const payload = '{"multi":true}';
    const svixId = 'msg_multi';
    const svixTimestamp = String(NOW_SECONDS + 2);
    const validSig = signPayload(payload, svixId, svixTimestamp);

    // Multiple signatures separated by spaces
    const combined = `v1,invalidbase64garbage ${validSig}`;
    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature: combined,
    })).toBe(true);
  });

  it('rejects when all signatures are invalid', () => {
    expect(verifyResendSignature({
      payload: '{}',
      svixId: 'msg_bad',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: 'v1,aW52YWxpZA== v1,YWxzb2JhZA==',
    })).toBe(false);
  });

  it('handles signature without v1, prefix gracefully', () => {
    const payload = '{"raw":true}';
    const svixId = 'msg_raw';
    const svixTimestamp = String(NOW_SECONDS + 3);

    // Create valid sig but without v1, prefix
    const secretBytes = Buffer.from(RAW_SECRET, 'base64');
    const content = `${svixId}.${svixTimestamp}.${payload}`;
    const rawSig = createHmac('sha256', secretBytes).update(content).digest('base64');

    // Without v1, prefix, it should still attempt comparison
    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature: rawSig,
    })).toBe(true);
  });

  it('catches and continues on malformed base64 in signature', () => {
    // This tests the catch block in the for loop
    expect(verifyResendSignature({
      payload: '{}',
      svixId: 'msg_catch',
      svixTimestamp: String(NOW_SECONDS),
      svixSignature: 'v1,!!!not-base64!!!',
    })).toBe(false);
  });

  it('rejects a stale but otherwise valid signature', () => {
    const payload = '{"event":"email.delivered"}';
    const svixId = 'msg_stale';
    const svixTimestamp = String(NOW_SECONDS - 301);
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature,
    })).toBe(false);
  });

  it('rejects a non-numeric timestamp even when signed', () => {
    const payload = '{"event":"email.delivered"}';
    const svixId = 'msg_non_numeric';
    const svixTimestamp = '1712600000abc';
    const svixSignature = signPayload(payload, svixId, svixTimestamp);

    expect(verifyResendSignature({
      payload,
      svixId,
      svixTimestamp,
      svixSignature,
    })).toBe(false);
  });
});

describe('verifyEvolutionSignature — mutation killing', () => {
  beforeEach(() => {
    vi.stubEnv('EVOLUTION_WEBHOOK_SECRET', 'my-secret-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when EVOLUTION_WEBHOOK_SECRET is not set', () => {
    vi.stubEnv('EVOLUTION_WEBHOOK_SECRET', '');
    expect(verifyEvolutionSignature({ authorizationHeader: 'Bearer token' })).toBe(false);
  });

  it('returns false when authorizationHeader is null', () => {
    expect(verifyEvolutionSignature({ authorizationHeader: null })).toBe(false);
  });

  it('returns true with exact matching Bearer token', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: 'Bearer my-secret-token',
    })).toBe(true);
  });

  it('returns true with raw token (no Bearer prefix)', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: 'my-secret-token',
    })).toBe(true);
  });

  it('returns false with wrong token', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: 'Bearer wrong-token',
    })).toBe(false);
  });

  it('returns false when token length differs from secret', () => {
    expect(verifyEvolutionSignature({
      authorizationHeader: 'short',
    })).toBe(false);
  });

  it('returns false on catch block (e.g., encoding error)', () => {
    // This tests the catch block — timingSafeEqual might throw on weird inputs
    // but in practice, the length check handles it. Test the false return.
    expect(verifyEvolutionSignature({
      authorizationHeader: 'Bearer completely-different-length-token-that-does-not-match',
    })).toBe(false);
  });
});
