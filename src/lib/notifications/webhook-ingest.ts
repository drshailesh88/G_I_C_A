/**
 * Webhook Ingest Service
 *
 * Implements ProviderWebhookIngestService from SERVICE_CONTRACTS.md.
 * Parses raw payloads, records delivery events, and advances log status.
 */

import { parseResendWebhook, parseEvolutionWebhook, isStatusForward } from './webhook-parsers';
import { insertDeliveryEvent, findLogByProviderMessageId, updateLogStatus } from './delivery-event-queries';
import type { NotificationStatus, ProviderName } from './types';

/**
 * Ingest an email status webhook from Resend.
 * Always succeeds (no throws) — webhook routes must return 200.
 */
export async function ingestEmailStatus(params: {
  provider: 'resend';
  rawPayload: unknown;
}): Promise<void> {
  const parsed = parseResendWebhook(params.rawPayload);
  if (!parsed) {
    // Unknown or malformed payload — silently ignore.
    // Providers send many event types we don't track (e.g. email.clicked).
    return;
  }

  await processDeliveryEvent(parsed.providerMessageId, parsed.eventType, parsed.timestamp, params.rawPayload, 'email');
}

/**
 * Ingest a WhatsApp status webhook from Evolution API or WABA.
 * Always succeeds (no throws) — webhook routes must return 200.
 */
export async function ingestWhatsAppStatus(params: {
  provider: 'evolution_api' | 'waba';
  rawPayload: unknown;
}): Promise<void> {
  const parsed = parseEvolutionWebhook(params.rawPayload);
  if (!parsed) {
    return;
  }

  await processDeliveryEvent(parsed.providerMessageId, parsed.eventType, parsed.timestamp, params.rawPayload, 'whatsapp');
}

/**
 * Core processing logic shared by both channels:
 * 1. Find notification_log by providerMessageId
 * 2. Insert delivery event (forensic record)
 * 3. Advance log status if the new event is forward progress
 */
async function processDeliveryEvent(
  providerMessageId: string,
  eventType: NotificationStatus,
  timestamp: string,
  rawPayload: unknown,
  expectedChannel: 'email' | 'whatsapp',
): Promise<void> {
  try {
    // Find the matching notification_log row
    const logRow = await findLogByProviderMessageId(providerMessageId);
    if (!logRow) {
      // No matching log — might be a stale webhook or a message we didn't send.
      return;
    }

    // Verify the webhook channel matches the log's channel
    if (logRow.channel !== expectedChannel) {
      // Channel mismatch — a WhatsApp webhook for an email log (or vice versa).
      // This can happen if provider message IDs collide across channels.
      return;
    }

    // Always insert the delivery event (forensic/audit trail)
    await insertDeliveryEvent({
      notificationLogId: logRow.id,
      eventType,
      providerPayloadJson: rawPayload,
    });

    // Only advance status forward, never regress
    const currentStatus = logRow.status as NotificationStatus;
    if (isStatusForward(currentStatus, eventType)) {
      await updateLogStatus(logRow.id, eventType, timestamp);
    }
  } catch (error) {
    // Swallow errors — webhook routes MUST return 200.
    // In production, this would go to structured logging.
    console.error('[webhook-ingest] Error processing delivery event:', error);
  }
}
