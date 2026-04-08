/**
 * POST /api/webhooks/email
 *
 * Receives Resend delivery status webhooks.
 * ALWAYS returns 200 to prevent provider retries.
 */

import { NextResponse } from 'next/server';
import { ingestEmailStatus } from '@/lib/notifications/webhook-ingest';

export async function POST(request: Request) {
  try {
    const rawPayload = await request.json();
    await ingestEmailStatus({ provider: 'resend', rawPayload });
  } catch {
    // Swallow all errors — webhook endpoints MUST return 200.
    // Malformed JSON, DB errors, etc. are logged inside ingestEmailStatus.
    console.error('[webhook/email] Failed to process webhook');
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
