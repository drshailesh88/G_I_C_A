/**
 * Webhook Authentication
 *
 * Verifies webhook signatures from Resend and Evolution API.
 * Rejects unsigned or forged requests before any processing.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

// ── Resend Webhook Verification ──────────────────────────────
// Resend sends a `svix-signature` header with HMAC-SHA256 signatures.
// Docs: https://resend.com/docs/dashboard/webhooks/introduction

/**
 * Verify a Resend webhook signature.
 * Returns true if valid, false if invalid or missing secret.
 */
export function verifyResendSignature(params: {
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook-auth] RESEND_WEBHOOK_SECRET not configured');
    return false;
  }

  const { payload, svixId, svixTimestamp, svixSignature } = params;
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  if (!/^\d+$/.test(svixTimestamp)) return false;

  const timestampSeconds = Number.parseInt(svixTimestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > SVIX_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return false;
  }

  // Resend/Svix uses base64-encoded secret with "whsec_" prefix
  const secretBytes = Buffer.from(
    secret.startsWith('whsec_') ? secret.slice(6) : secret,
    'base64',
  );

  // Signature content: "${svix-id}.${svix-timestamp}.${body}"
  const signatureContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expectedSignature = createHmac('sha256', secretBytes)
    .update(signatureContent)
    .digest('base64');

  // svix-signature can contain multiple signatures separated by spaces
  // Each prefixed with "v1,"
  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
    try {
      const expected = Buffer.from(expectedSignature, 'base64');
      const received = Buffer.from(sigValue, 'base64');
      if (expected.length === received.length && timingSafeEqual(expected, received)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

// ── Evolution API Webhook Verification ───────────────────────
// Evolution API supports a shared secret token sent as a query param or header.

/**
 * Verify an Evolution API webhook request.
 * Evolution API sends the API key as authorization header.
 */
export function verifyEvolutionSignature(params: {
  authorizationHeader: string | null;
}): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook-auth] EVOLUTION_WEBHOOK_SECRET not configured');
    return false;
  }

  const { authorizationHeader } = params;
  if (!authorizationHeader) return false;

  // Evolution API sends "Bearer <token>" or raw token
  const token = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice(7)
    : authorizationHeader;

  // Timing-safe comparison
  try {
    const expected = Buffer.from(secret);
    const received = Buffer.from(token);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
