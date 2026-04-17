/**
 * Webhook Ingest Service
 *
 * Implements ProviderWebhookIngestService from SERVICE_CONTRACTS.md.
 * Parses raw payloads, records delivery events, and advances log status.
 *
 * FIX #10: On processing failure, payloads are pushed to a Redis DLQ
 * instead of being silently lost.
 * FIX #11: Status progression enforced at DB level via CAS (not app-level).
 */

import { parseResendWebhook, parseEvolutionWebhook } from './webhook-parsers';
import { insertDeliveryEvent, findLogByProviderMessageId, updateLogStatus } from './delivery-event-queries';
import { pushToDlq } from './webhook-dlq';
import type { NotificationStatus, ProviderName } from './types';

function normalizeWebhookTimestamp(timestamp: string): string {
  return Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : new Date().toISOString();
}

/**
 * Ingest an email status webhook from Resend.
 * Returns 200 to provider. On failure, pushes to DLQ.
 */
export async function ingestEmailStatus(params: {
  provider: 'resend';
  rawPayload: unknown;
}): Promise<void> {
  const parsed = parseResendWebhook(params.rawPayload);
  if (!parsed) return;

  await processDeliveryEvent(
    parsed.providerMessageId,
    parsed.eventType,
    parsed.timestamp,
    params.rawPayload,
    'email',
    params.provider,
  );
}

/**
 * Ingest a WhatsApp status webhook from Evolution API or WABA.
 * Returns 200 to provider. On failure, pushes to DLQ.
 */
export async function ingestWhatsAppStatus(params: {
  provider: 'evolution_api' | 'waba';
  rawPayload: unknown;
}): Promise<void> {
  const parsed = parseEvolutionWebhook(params.rawPayload);
  if (!parsed) return;

  await processDeliveryEvent(
    parsed.providerMessageId,
    parsed.eventType,
    parsed.timestamp,
    params.rawPayload,
    'whatsapp',
    params.provider,
  );
}

/**
 * Core processing logic shared by both channels.
 * FIX #10: On error, push to DLQ instead of silent swallow.
 * FIX #11: CAS is now enforced in updateLogStatus at DB level —
 *   isStatusForward check removed (DB handles it).
 */
async function processDeliveryEvent(
  providerMessageId: string,
  eventType: NotificationStatus,
  timestamp: string,
  rawPayload: unknown,
  expectedChannel: 'email' | 'whatsapp',
  provider: ProviderName,
): Promise<void> {
  try {
    const logRow = await findLogByProviderMessageId(providerMessageId, provider);
    if (!logRow) return;

    // Channel mismatch guard
    if (logRow.channel !== expectedChannel) return;

    // Normalize malformed provider timestamps to the current time so
    // bad-but-authentic payloads do not loop forever through the DLQ.
    const normalizedTimestamp = normalizeWebhookTimestamp(timestamp);

    // Advance status first. If CAS rejects the update, this webhook is a
    // duplicate, regression, or lost a race to a newer status.
    const updatedLog = await updateLogStatus(logRow.id, eventType, normalizedTimestamp);
    if (!updatedLog) return;

    // Record the accepted status transition for the forensic trail.
    await insertDeliveryEvent({
      notificationLogId: logRow.id,
      eventType,
      providerPayloadJson: rawPayload,
    });
  } catch (error) {
    // FIX #10: Push to DLQ instead of silently losing the event
    console.error('[webhook-ingest] Processing failed, pushing to DLQ:', error);
    await pushToDlq({
      provider,
      channel: expectedChannel,
      rawPayload,
      failedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
