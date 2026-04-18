'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { resendNotification } from '@/lib/notifications/send';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

const LOGISTICS_WRITE_ROLES: Set<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
]);

const LOGISTICS_READ_ROLES: Set<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

// ── Get last notification for a logistics record ──────────────

export async function getLastLogisticsNotification(input: unknown) {
  const validated = z.object({
    eventId: z.string().uuid(),
    recordId: z.string().uuid(),
  }).parse(input);

  const { role } = await assertEventAccess(validated.eventId);
  if (!role || !LOGISTICS_READ_ROLES.has(role)) {
    throw new Error('forbidden');
  }

  const rows = await db
    .select({
      id: notificationLog.id,
      channel: notificationLog.channel,
      sentAt: notificationLog.sentAt,
      queuedAt: notificationLog.queuedAt,
      status: notificationLog.status,
    })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.eventId, validated.eventId),
        eq(notificationLog.triggerEntityId, validated.recordId),
      ),
    )
    .orderBy(desc(notificationLog.queuedAt))
    .limit(1);

  return rows[0] ?? null;
}

// ── Resend notification for a logistics record ────────────────

export async function resendLogisticsNotification(input: unknown) {
  const validated = z.object({
    eventId: z.string().uuid(),
    recordId: z.string().uuid(),
    channel: z.enum(['email', 'whatsapp']),
  }).parse(input);

  const { userId, role } = await assertEventAccess(validated.eventId, { requireWrite: true });
  if (!role || !LOGISTICS_WRITE_ROLES.has(role)) {
    throw new Error('forbidden');
  }

  const rows = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.eventId, validated.eventId),
        eq(notificationLog.triggerEntityId, validated.recordId),
        eq(notificationLog.channel, validated.channel),
      ),
    )
    .orderBy(desc(notificationLog.queuedAt))
    .limit(1);

  if (rows.length === 0) {
    return { status: 'no_prior_notification' as const };
  }

  const result = await resendNotification({
    eventId: validated.eventId,
    notificationLogId: rows[0].id,
    initiatedByUserId: userId,
  });

  revalidatePath(`/events/${validated.eventId}/travel`);
  revalidatePath(`/events/${validated.eventId}/accommodation`);

  return { status: result.status, notificationLogId: result.notificationLogId };
}
