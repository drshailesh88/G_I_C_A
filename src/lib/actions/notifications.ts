'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { listFailedLogs, getLogById } from '@/lib/notifications/log-queries';
import { retryFailedNotification, resendNotification } from '@/lib/notifications/send';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const COMMUNICATIONS_READ_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

const COMMUNICATIONS_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);


function assertNotificationsRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
): void {
  const allowedRoles = options?.requireWrite
    ? COMMUNICATIONS_WRITE_ROLES
    : COMMUNICATIONS_READ_ROLES;

  if (!role || !allowedRoles.has(role)) {
    throw new Error('forbidden');
  }
}

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
  templateKey: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── List failed notifications ────────────────────────────────

export async function getFailedNotifications(input: unknown) {
  const validated = listFailedSchema.parse(input);
  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

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
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const result = await retryFailedNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications/failed`);
  return result;
}

// ── Manual resend of any notification ────────────────────────

export async function manualResend(input: unknown) {
  const validated = resendSchema.parse(input);
  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  assertNotificationsRole(role, { requireWrite: true });

  const result = await resendNotification({
    eventId: validated.eventId,
    notificationLogId: validated.notificationLogId,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/communications/failed`);
  return result;
}

// ── Get single notification log detail ───────────────────────

export async function getNotificationDetail(input: unknown) {
  const validated = z.object({
    eventId: z.string().uuid(),
    notificationLogId: z.string().uuid(),
  }).parse(input);

  const { role } = await assertEventAccess(validated.eventId);
  assertNotificationsRole(role);

  const log = await getLogById(validated.notificationLogId, validated.eventId);
  if (!log) throw new Error('Notification not found');
  return log;
}

