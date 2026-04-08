/**
 * Delivery Event Queries
 *
 * Insert and query notification_delivery_events rows.
 * notification_delivery_events does not have its own eventId column —
 * it references notification_log which is event-scoped.
 */

import { db } from '@/lib/db';
import { notificationDeliveryEvents, notificationLog } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import type { NotificationStatus } from './types';

export type InsertDeliveryEventInput = {
  notificationLogId: string;
  eventType: string;
  providerPayloadJson?: unknown;
};

/** Insert a single delivery event row */
export async function insertDeliveryEvent(input: InsertDeliveryEventInput) {
  const [row] = await db
    .insert(notificationDeliveryEvents)
    .values({
      notificationLogId: input.notificationLogId,
      eventType: input.eventType,
      providerPayloadJson: input.providerPayloadJson ?? null,
    })
    .returning();

  return row;
}

/**
 * List all delivery events for a given notification log entry.
 * Validates that the notification_log row belongs to the given eventId
 * before returning results (event scoping).
 */
export async function listDeliveryEventsForLog(
  notificationLogId: string,
  eventId: string,
) {
  // First verify the log belongs to this event (event scope guard)
  const [log] = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(withEventScope(notificationLog.eventId, eventId, eq(notificationLog.id, notificationLogId)))
    .limit(1);

  if (!log) return [];

  return db
    .select()
    .from(notificationDeliveryEvents)
    .where(eq(notificationDeliveryEvents.notificationLogId, notificationLogId))
    .orderBy(desc(notificationDeliveryEvents.receivedAt));
}

/**
 * Find a notification_log row by provider message ID.
 * Returns the log row or null if not found.
 */
export async function findLogByProviderMessageId(providerMessageId: string) {
  const [row] = await db
    .select()
    .from(notificationLog)
    .where(eq(notificationLog.providerMessageId, providerMessageId))
    .limit(1);

  return row ?? null;
}

/**
 * Update notification_log status idempotently.
 * Only advances status forward (never regresses).
 */
export async function updateLogStatus(
  logId: string,
  newStatus: NotificationStatus,
  timestamp: string,
) {
  const timestampFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (newStatus === 'sent') timestampFields.sentAt = new Date(timestamp);
  if (newStatus === 'delivered') timestampFields.deliveredAt = new Date(timestamp);
  if (newStatus === 'read') timestampFields.readAt = new Date(timestamp);
  if (newStatus === 'failed') timestampFields.failedAt = new Date(timestamp);

  const [updated] = await db
    .update(notificationLog)
    .set({
      status: newStatus,
      ...timestampFields,
    })
    .where(eq(notificationLog.id, logId))
    .returning();

  return updated ?? null;
}
