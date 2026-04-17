/**
 * Delivery Event Queries
 *
 * Insert and query notification_delivery_events rows.
 * notification_delivery_events does not have its own eventId column —
 * it references notification_log which is event-scoped.
 */

import { db } from '@/lib/db';
import { notificationDeliveryEvents, notificationLog } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import type { NotificationStatus, ProviderName } from './types';

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
export async function findLogByProviderMessageId(
  providerMessageId: string,
  provider: ProviderName,
) {
  const [row] = await db
    .select()
    .from(notificationLog)
    .where(and(
      eq(notificationLog.providerMessageId, providerMessageId),
      eq(notificationLog.provider, provider),
    ))
    .limit(1);

  return row ?? null;
}

// ── Status ordering for DB-level CAS ─────────────────────────
// FIX #11: Use CASE expression in WHERE to enforce forward-only at DB level.
// This prevents race conditions when concurrent webhooks try to update status.
const STATUS_ORDER_SQL: Record<NotificationStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99, // failed can override anything
  retrying: 1,
};

/**
 * Update notification_log status with DB-level compare-and-set.
 * FIX #11: Only updates if the new status has a higher order than current.
 * Returns the updated row, or null if the CAS check rejected the update.
 */
export async function updateLogStatus(
  logId: string,
  newStatus: NotificationStatus,
  timestamp: string,
) {
  const newOrder = STATUS_ORDER_SQL[newStatus];

  const timestampFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (newStatus === 'sent') timestampFields.sentAt = new Date(timestamp);
  if (newStatus === 'delivered') timestampFields.deliveredAt = new Date(timestamp);
  if (newStatus === 'read') timestampFields.readAt = new Date(timestamp);
  if (newStatus === 'failed') timestampFields.failedAt = new Date(timestamp);

  // DB-level CAS: only update if new status order is higher than current
  // Uses CASE expression to map current status text to numeric order
  const [updated] = await db
    .update(notificationLog)
    .set({
      status: newStatus,
      ...timestampFields,
    })
    .where(
      and(
        eq(notificationLog.id, logId),
        // CAS: current status order must be less than new status order
        // "failed" (order 99) always wins
        sql`CASE ${notificationLog.status}
          WHEN 'queued' THEN 0
          WHEN 'sending' THEN 1
          WHEN 'retrying' THEN 1
          WHEN 'sent' THEN 2
          WHEN 'delivered' THEN 3
          WHEN 'read' THEN 4
          WHEN 'failed' THEN 99
          ELSE 0
        END < ${newOrder}`,
      ),
    )
    .returning();

  return updated ?? null;
}
