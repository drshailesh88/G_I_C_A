/**
 * Notification Log Queries
 *
 * CRUD for notification_log table. Every query scopes by eventId.
 */

import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type {
  CreateLogEntryInput,
  UpdateLogStatusInput,
  ListFailedLogsFilters,
} from './types';

export type NotificationLogRow = typeof notificationLog.$inferSelect;

/** Insert a new notification_log row and return it. */
export async function createLogEntry(
  input: CreateLogEntryInput,
): Promise<NotificationLogRow> {
  const rows = await db
    .insert(notificationLog)
    .values({
      eventId: input.eventId,
      personId: input.personId,
      templateId: input.templateId,
      templateKeySnapshot: input.templateKeySnapshot,
      templateVersionNo: input.templateVersionNo,
      channel: input.channel,
      provider: input.provider,
      triggerType: input.triggerType ?? null,
      triggerEntityType: input.triggerEntityType ?? null,
      triggerEntityId: input.triggerEntityId ?? null,
      sendMode: input.sendMode,
      idempotencyKey: input.idempotencyKey,
      recipientEmail: input.recipientEmail ?? null,
      recipientPhoneE164: input.recipientPhoneE164 ?? null,
      renderedSubject: input.renderedSubject ?? null,
      renderedBody: input.renderedBody,
      renderedVariablesJson: input.renderedVariablesJson ?? null,
      attachmentManifestJson: input.attachmentManifestJson ?? null,
      status: input.status ?? 'queued',
      initiatedByUserId: input.initiatedByUserId ?? null,
      isResend: input.isResend ?? false,
      resendOfId: input.resendOfId ?? null,
    })
    .returning();

  return rows[0];
}

/** Update status + provider data on an existing log row. Always scoped by eventId. */
export async function updateLogStatus(
  logId: string,
  eventId: string,
  update: UpdateLogStatusInput,
): Promise<NotificationLogRow | null> {
  const rows = await db
    .update(notificationLog)
    .set({
      status: update.status,
      providerMessageId: update.providerMessageId ?? undefined,
      providerConversationId: update.providerConversationId ?? undefined,
      lastErrorCode: update.lastErrorCode ?? undefined,
      lastErrorMessage: update.lastErrorMessage ?? undefined,
      sentAt: update.sentAt ?? undefined,
      failedAt: update.failedAt ?? undefined,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(notificationLog.id, logId), eq(notificationLog.eventId, eventId)))
    .returning();

  return rows[0] ?? null;
}

/**
 * Atomically mark a log as retrying — only if current status is 'failed'.
 * FIX #8: Prevents concurrent retry/resend race conditions.
 * Returns the updated row if successful, null if status was already changed.
 */
export async function markAsRetrying(
  logId: string,
  eventId: string,
): Promise<NotificationLogRow | null> {
  const rows = await db
    .update(notificationLog)
    .set({
      status: 'retrying',
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationLog.id, logId),
        eq(notificationLog.eventId, eventId),
        eq(notificationLog.status, 'failed'), // Optimistic lock
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Get a single log entry by ID, scoped to eventId. */
export async function getLogById(
  logId: string,
  eventId: string,
): Promise<NotificationLogRow | null> {
  const rows = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.id, logId), eq(notificationLog.eventId, eventId)))
    .limit(1);

  return rows[0] ?? null;
}

/** List failed notification logs for the retry screen. */
export async function listFailedLogs(
  eventId: string,
  filters?: ListFailedLogsFilters,
): Promise<NotificationLogRow[]> {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  let query = db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.eventId, eventId), eq(notificationLog.status, 'failed')))
    .orderBy(desc(notificationLog.failedAt))
    .limit(limit)
    .offset(offset);

  // Additional filters applied via post-filter since drizzle dynamic where chaining
  // is limited. For channel/templateKey, we use the DB-side filtering.
  if (filters?.channel) {
    query = db
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.eventId, eventId),
          eq(notificationLog.status, 'failed'),
          eq(notificationLog.channel, filters.channel),
        ),
      )
      .orderBy(desc(notificationLog.failedAt))
      .limit(limit)
      .offset(offset);
  }

  if (filters?.templateKey) {
    query = db
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.eventId, eventId),
          eq(notificationLog.status, 'failed'),
          ...(filters.channel ? [eq(notificationLog.channel, filters.channel)] : []),
          eq(notificationLog.templateKeySnapshot, filters.templateKey),
        ),
      )
      .orderBy(desc(notificationLog.failedAt))
      .limit(limit)
      .offset(offset);
  }

  return query;
}
