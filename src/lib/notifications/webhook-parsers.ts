/**
 * Webhook Payload Parsers
 *
 * Pure functions that extract structured data from raw provider payloads.
 * No DB access, no side effects — highly testable.
 */

import type { NotificationStatus } from './types';

export type ParsedWebhookEvent = {
  providerMessageId: string;
  eventType: NotificationStatus;
  timestamp: string;
};

// ── Status progression ─────────────────────────────────────────
// Defines the forward-only ordering of notification statuses.
// A webhook can only advance status, never regress.
const STATUS_ORDER: Record<NotificationStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  retrying: 1, // treated same as sending
};

/**
 * Check if moving from `current` to `next` is a forward progression.
 * "failed" can override any status (provider says it failed).
 * Otherwise, next must have a strictly higher order than current.
 */
export function isStatusForward(
  current: NotificationStatus,
  next: NotificationStatus,
): boolean {
  // failed/bounced can always override
  if (next === 'failed') return true;
  // Otherwise, must be strictly forward
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}

// ── Resend (email) parser ──────────────────────────────────────

const RESEND_EVENT_MAP: Record<string, NotificationStatus> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'sending',
  'email.complained': 'failed',
  'email.bounced': 'failed',
  'email.opened': 'read',
};

/**
 * Parse a Resend webhook payload into a structured event.
 * Returns null if the payload is malformed or has an unknown event type.
 */
export function parseResendWebhook(payload: unknown): ParsedWebhookEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  const obj = payload as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string') return null;

  const eventType = RESEND_EVENT_MAP[type];
  if (!eventType) return null;

  const data = obj.data;
  if (!data || typeof data !== 'object') return null;

  const dataObj = data as Record<string, unknown>;
  const emailId = dataObj.email_id;
  if (typeof emailId !== 'string' || !emailId) return null;

  const createdAt = dataObj.created_at;
  const timestamp = typeof createdAt === 'string' ? createdAt : new Date().toISOString();

  return {
    providerMessageId: emailId,
    eventType,
    timestamp,
  };
}

// ── Evolution API (WhatsApp) parser ────────────────────────────

// Evolution API numeric status codes
const EVOLUTION_STATUS_MAP: Record<number, NotificationStatus> = {
  0: 'failed',    // ERROR
  1: 'sending',   // PENDING
  2: 'sent',      // SERVER_ACK
  3: 'delivered',  // DELIVERY_ACK
  4: 'read',      // READ
  5: 'read',      // PLAYED (treat as read)
};

/**
 * Parse an Evolution API webhook payload into a structured event.
 * Returns null if the payload is malformed or has an unknown event/status.
 */
export function parseEvolutionWebhook(payload: unknown): ParsedWebhookEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  const obj = payload as Record<string, unknown>;
  const event = obj.event;

  // Evolution API sends various events; we only care about message status updates
  if (event !== 'messages.update') return null;

  const data = obj.data;
  if (!data || typeof data !== 'object') return null;

  const dataObj = data as Record<string, unknown>;

  // Extract message ID from key.id
  const key = dataObj.key;
  if (!key || typeof key !== 'object') return null;
  const keyObj = key as Record<string, unknown>;
  const messageId = keyObj.id;
  if (typeof messageId !== 'string' || !messageId) return null;

  // Extract status code from update.status
  const update = dataObj.update;
  if (!update || typeof update !== 'object') return null;
  const updateObj = update as Record<string, unknown>;
  const statusCode = updateObj.status;
  if (typeof statusCode !== 'number') return null;

  const eventType = EVOLUTION_STATUS_MAP[statusCode];
  if (!eventType) return null;

  // Evolution API doesn't always include a timestamp; use now as fallback
  const timestamp = typeof dataObj.timestamp === 'string'
    ? dataObj.timestamp
    : new Date().toISOString();

  return {
    providerMessageId: messageId,
    eventType,
    timestamp,
  };
}
