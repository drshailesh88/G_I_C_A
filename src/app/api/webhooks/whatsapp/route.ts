/**
 * POST /api/webhooks/whatsapp
 *
 * Receives Evolution API (and future WABA) delivery status webhooks.
 * FIX #9: Verifies shared secret before processing.
 */

import { NextResponse } from 'next/server';
import { ingestWhatsAppStatus } from '@/lib/notifications/webhook-ingest';
import { verifyEvolutionSignature } from '@/lib/notifications/webhook-auth';
import { captureError } from '@/lib/sentry';

export async function POST(request: Request) {
  // FIX #9: Verify Evolution API webhook secret
  const authHeader = request.headers.get('authorization');
  if (!verifyEvolutionSignature({ authorizationHeader: authHeader })) {
    console.warn('[webhook/whatsapp] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const rawPayload = await request.json();
    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload });
  } catch (error) {
    console.error('[webhook/whatsapp] Failed to process webhook:', error);
    captureError(error, { module: 'webhook', tags: { webhook_type: 'whatsapp' } });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
