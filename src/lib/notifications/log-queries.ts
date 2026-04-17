/**
 * Notification Log Queries
 *
 * CRUD for notification_log table. Every query scopes by eventId.
 */

import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { eventIdSchema } from '@/lib/validations/event';
import { z } from 'zod';
import type {
  CreateLogEntryInput,
  UpdateLogStatusInput,
  ListFailedLogsFilters,
} from './types';

export type NotificationLogRow = typeof notificationLog.$inferSelect;

export type BeginLogAttemptResult = {
  row: NotificationLogRow;
  shouldSend: boolean;
};

const notificationLogIdSchema = z.string().uuid('Invalid notification log ID');
const idempotencyKeySchema = z
  .string()
  .min(1, 'Invalid idempotency key')
  .max(512, 'Idempotency key is too long')
  .refine((value) => value.trim() === value, 'Idempotency key must not contain surrounding whitespace');
const failedLogFiltersSchema = z.object({
  channel: z.enum(['email', 'whatsapp']).optional(),
  templateKey: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
}).strict();

function assertEventId(eventId: string): void {
  eventIdSchema.parse(eventId);
}

function assertNotificationLogId(logId: string): void {
  notificationLogIdSchema.parse(logId);
}

function assertIdempotencyKey(idempotencyKey: string): void {
  idempotencyKeySchema.parse(idempotencyKey);
}

/** Insert a new notification_log row and return it. */
export async function createLogEntry(
  input: CreateLogEntryInput,
): Promise<NotificationLogRow> {
  assertEventId(input.eventId);
  assertIdempotencyKey(input.idempotencyKey);

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

/**
 * Upsert a notification_log row keyed by idempotency_key.
 * First attempt INSERTs with attempts=1. Retries UPDATE in place:
 * attempts incremented atomically, status/error/timestamps refreshed.
 * Never creates a second row for the same idempotency key.
 */
export async function upsertLogEntry(
  input: CreateLogEntryInput & {
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  },
): Promise<NotificationLogRow> {
  assertEventId(input.eventId);
  assertIdempotencyKey(input.idempotencyKey);

  const status = input.status ?? 'queued';
  const now = new Date();

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
      status,
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
      lastAttemptAt: now,
      sentAt: status === 'sent' ? now : null,
      failedAt: status === 'failed' ? now : null,
      initiatedByUserId: input.initiatedByUserId ?? null,
      isResend: input.isResend ?? false,
      resendOfId: input.resendOfId ?? null,
    })
    .onConflictDoUpdate({
      target: notificationLog.idempotencyKey,
      set: {
        attempts: sql`${notificationLog.attempts} + 1`,
        status,
        lastErrorCode: input.lastErrorCode ?? null,
        lastErrorMessage: input.lastErrorMessage ?? null,
        lastAttemptAt: now,
        updatedAt: now,
        ...(status === 'sent' ? { sentAt: now } : {}),
        ...(status === 'failed' ? { failedAt: now } : {}),
      },
      setWhere: eq(notificationLog.eventId, input.eventId),
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('Notification idempotency key is already reserved by another event');
  }

  return row;
}

/**
 * Begin a provider send attempt for an idempotency key.
 *
 * First attempt inserts one row. A retry only updates that same row when the
 * previous attempt failed; already-sent or currently-sending duplicates are
 * returned unchanged and must not call the provider again.
 */
export async function beginLogAttempt(
  input: CreateLogEntryInput,
): Promise<BeginLogAttemptResult> {
  assertEventId(input.eventId);
  assertIdempotencyKey(input.idempotencyKey);

  const now = new Date();

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
      status: 'queued',
      lastAttemptAt: now,
      initiatedByUserId: input.initiatedByUserId ?? null,
      isResend: input.isResend ?? false,
      resendOfId: input.resendOfId ?? null,
    })
    .onConflictDoUpdate({
      target: notificationLog.idempotencyKey,
      set: {
        attempts: sql`${notificationLog.attempts} + 1`,
        status: 'queued',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastAttemptAt: now,
        updatedAt: now,
      },
      setWhere: and(
        eq(notificationLog.eventId, input.eventId),
        eq(notificationLog.status, 'failed'),
      ),
    })
    .returning();

  if (rows[0]) {
    return { row: rows[0], shouldSend: true };
  }

  const existingRows = await db
    .select()
    .from(notificationLog)
    .where(and(
      eq(notificationLog.eventId, input.eventId),
      eq(notificationLog.idempotencyKey, input.idempotencyKey),
    ))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new Error(
      'Notification idempotency key is already reserved by another event',
    );
  }

  return { row: existing, shouldSend: false };
}

/** Update status + provider data on an existing log row. Always scoped by eventId. */
export async function updateLogStatus(
  logId: string,
  eventId: string,
  update: UpdateLogStatusInput,
): Promise<NotificationLogRow | null> {
  assertNotificationLogId(logId);
  assertEventId(eventId);

  const rows = await db
    .update(notificationLog)
    .set({
      status: update.status,
      providerMessageId: update.providerMessageId === undefined ? undefined : update.providerMessageId,
      providerConversationId: update.providerConversationId === undefined ? undefined : update.providerConversationId,
      lastErrorCode: update.lastErrorCode === undefined ? undefined : update.lastErrorCode,
      lastErrorMessage: update.lastErrorMessage === undefined ? undefined : update.lastErrorMessage,
      sentAt: update.sentAt === undefined ? undefined : update.sentAt,
      failedAt: update.failedAt === undefined ? undefined : update.failedAt,
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
  assertNotificationLogId(logId);
  assertEventId(eventId);

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
  assertNotificationLogId(logId);
  assertEventId(eventId);

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
  assertEventId(eventId);
  const validatedFilters = filters ? failedLogFiltersSchema.parse(filters) : undefined;
  const limit = validatedFilters?.limit ?? 50;
  const offset = validatedFilters?.offset ?? 0;

  let query = db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.eventId, eventId), eq(notificationLog.status, 'failed')))
    .orderBy(desc(notificationLog.failedAt))
    .limit(limit)
    .offset(offset);

  // Additional filters applied via post-filter since drizzle dynamic where chaining
  // is limited. For channel/templateKey, we use the DB-side filtering.
  if (validatedFilters?.channel) {
    query = db
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.eventId, eventId),
          eq(notificationLog.status, 'failed'),
          eq(notificationLog.channel, validatedFilters.channel),
        ),
      )
      .orderBy(desc(notificationLog.failedAt))
      .limit(limit)
      .offset(offset);
  }

  if (validatedFilters?.templateKey) {
    query = db
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.eventId, eventId),
          eq(notificationLog.status, 'failed'),
          ...(validatedFilters.channel ? [eq(notificationLog.channel, validatedFilters.channel)] : []),
          eq(notificationLog.templateKeySnapshot, validatedFilters.templateKey),
        ),
      )
      .orderBy(desc(notificationLog.failedAt))
      .limit(limit)
      .offset(offset);
  }

  return query;
}
