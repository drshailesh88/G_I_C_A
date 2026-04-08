/**
 * POST /api/webhooks/whatsapp
 *
 * Receives Evolution API (and future WABA) delivery status webhooks.
 * ALWAYS returns 200 to prevent provider retries.
 */

import { NextResponse } from 'next/server';
import { ingestWhatsAppStatus } from '@/lib/notifications/webhook-ingest';

export async function POST(request: Request) {
  try {
    const rawPayload = await request.json();
    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload });
  } catch {
    // Swallow all errors — webhook endpoints MUST return 200.
    console.error('[webhook/whatsapp] Failed to process webhook');
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
