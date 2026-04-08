/**
 * POST /api/webhooks/email
 *
 * Receives Resend delivery status webhooks.
 * FIX #9: Verifies Svix signature before processing.
 */

import { NextResponse } from 'next/server';
import { ingestEmailStatus } from '@/lib/notifications/webhook-ingest';
import { verifyResendSignature } from '@/lib/notifications/webhook-auth';

export async function POST(request: Request) {
  // Read raw body for signature verification
  const rawBody = await request.text();

  // FIX #9: Verify Resend webhook signature
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!verifyResendSignature({ payload: rawBody, svixId, svixTimestamp, svixSignature })) {
    console.warn('[webhook/email] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const rawPayload = JSON.parse(rawBody);
    await ingestEmailStatus({ provider: 'resend', rawPayload });
  } catch (error) {
    // Still return 200 — ingest already handles DLQ on failure.
    // This catch is for JSON parse errors only.
    console.error('[webhook/email] Failed to process webhook:', error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
