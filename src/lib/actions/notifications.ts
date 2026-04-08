'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { listFailedLogs, getLogById } from '@/lib/notifications/log-queries';
import { retryFailedNotification, resendNotification } from '@/lib/notifications/send';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────

const retrySchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const resendSchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const listFailedSchema = z.object({
  eventId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']).optional(),
  templateKey: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── List failed notifications ────────────────────────────────

export async function getFailedNotifications(input: unknown) {
  const validated = listFailedSchema.parse(input);
  await assertEventAccess(validated.eventId, { requireWrite: true });

  return listFailedLogs(validated.eventId, {
    channel: validated.channel,
    templateKey: validated.templateKey,
    limit: validated.limit,
    offset: validated.offset,
  });
}

// ── Retry a failed notification ──────────────────────────────

export async function retryNotification(input: unknown) {
  const validated = retrySchema.parse(input);
  const { userId } = await assertEventAccess(validated.eventId, { requireWrite: true });

  const result = await retryFailedNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications`);
  return result;
}

// ── Manual resend of any notification ────────────────────────

export async function manualResend(input: unknown) {
  const validated = resendSchema.parse(input);
  const { userId } = await assertEventAccess(validated.eventId, { requireWrite: true });

  const result = await resendNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications`);
  return result;
}

// ── Get single notification log detail ───────────────────────

export async function getNotificationDetail(input: unknown) {
  const validated = z.object({
    eventId: z.string().uuid(),
    notificationLogId: z.string().uuid(),
  }).parse(input);

  await assertEventAccess(validated.eventId);

  const log = await getLogById(validated.notificationLogId, validated.eventId);
  if (!log) throw new Error('Notification not found');
  return log;
}
