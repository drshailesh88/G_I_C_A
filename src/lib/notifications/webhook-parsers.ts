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

function createNullPrototypeMap<T>(entries: Record<string, T>): Readonly<Record<string, T>> {
  return Object.freeze(Object.assign(Object.create(null), entries));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getOwnUnknown(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function getOwnString(record: Record<string, unknown>, key: string): string | undefined {
  const value = getOwnUnknown(record, key);
  return typeof value === 'string' ? value : undefined;
}

function getOwnNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = getOwnUnknown(record, key);
  return typeof value === 'number' ? value : undefined;
}

function getOwnRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = getOwnUnknown(record, key);
  return isObjectRecord(value) ? value : undefined;
}

// ── Status progression ─────────────────────────────────────────
// Defines the forward-only ordering of notification statuses.
// A webhook can only advance status, never regress.
const STATUS_ORDER = createNullPrototypeMap<number>({
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  retrying: 1, // treated same as sending
}) as Readonly<Record<NotificationStatus, number>>;

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

const RESEND_EVENT_MAP = createNullPrototypeMap<NotificationStatus>({
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'sending',
  'email.complained': 'failed',
  'email.bounced': 'failed',
  'email.opened': 'read',
});

/**
 * Parse a Resend webhook payload into a structured event.
 * Returns null if the payload is malformed or has an unknown event type.
 */
export function parseResendWebhook(payload: unknown): ParsedWebhookEvent | null {
  if (!isObjectRecord(payload)) return null;

  const type = getOwnString(payload, 'type');
  if (!type) return null;

  const eventType = RESEND_EVENT_MAP[type];
  if (typeof eventType !== 'string') return null;

  const data = getOwnRecord(payload, 'data');
  if (!data) return null;

  const emailId = getOwnString(data, 'email_id');
  if (!emailId) return null;

  const createdAt = getOwnString(data, 'created_at');
  const timestamp = typeof createdAt === 'string' ? createdAt : new Date().toISOString();

  return {
    providerMessageId: emailId,
    eventType,
    timestamp,
  };
}

// ── Evolution API (WhatsApp) parser ────────────────────────────

// Evolution API numeric status codes
const EVOLUTION_STATUS_MAP = Object.freeze({
  0: 'failed',    // ERROR
  1: 'sending',   // PENDING
  2: 'sent',      // SERVER_ACK
  3: 'delivered',  // DELIVERY_ACK
  4: 'read',      // READ
  5: 'read',      // PLAYED (treat as read)
} as const satisfies Record<number, NotificationStatus>);

/**
 * Parse an Evolution API webhook payload into a structured event.
 * Returns null if the payload is malformed or has an unknown event/status.
 */
export function parseEvolutionWebhook(payload: unknown): ParsedWebhookEvent | null {
  if (!isObjectRecord(payload)) return null;

  const event = getOwnString(payload, 'event');

  // Evolution API sends various events; we only care about message status updates
  if (event !== 'messages.update') return null;

  const data = getOwnRecord(payload, 'data');
  if (!data) return null;

  // Extract message ID from key.id
  const key = getOwnRecord(data, 'key');
  if (!key) return null;

  const messageId = getOwnString(key, 'id');
  if (!messageId) return null;

  // Extract status code from update.status
  const update = getOwnRecord(data, 'update');
  if (!update) return null;

  const statusCode = getOwnNumber(update, 'status');
  if (statusCode === undefined) return null;

  const eventType = EVOLUTION_STATUS_MAP[statusCode];
  if (!eventType) return null;

  // Evolution API doesn't always include a timestamp; use now as fallback
  const providerTimestamp = getOwnString(data, 'timestamp');
  const timestamp = providerTimestamp ?? new Date().toISOString();

  return {
    providerMessageId: messageId,
    eventType,
    timestamp,
  };
}
