'use server';

import { db } from '@/lib/db';
import {
  eventRegistrations,
  sessionAssignments,
  facultyInvites,
  issuedCertificates,
  notificationLog,
  redFlags,
  people,
} from '@/lib/db/schema';
import { eq, and, count, sql, gte, inArray, desc, not } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { eventIdSchema } from '@/lib/validations/event';

export interface DashboardMetrics {
  registrations: { total: number; today: number };
  faculty: { confirmed: number; invited: number };
  certificates: { issued: number; eligible: number };
  notifications: { sent: number; failed: number };
  redFlags: { pending: number };
}

export interface NeedsAttentionItem {
  type: 'red_flags' | 'failed_notifications' | 'pending_faculty' | 'upcoming_no_kit';
  label: string;
  count: number;
  href: string;
}

export async function getDashboardMetrics(eventId: string): Promise<DashboardMetrics> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId, { requireWrite: false });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return await db.transaction(async (tx) => {
    // Registrations: total confirmed + today's new
    const [regTotal] = await tx
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          eventId,
          eq(eventRegistrations.status, 'confirmed'),
        ),
      );

    const [regToday] = await tx
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          eventId,
          gte(eventRegistrations.registeredAt, todayStart),
        ),
      );

    // Faculty: distinct people assigned to sessions
    const [facultyConfirmed] = await tx
      .select({ count: sql<number>`count(distinct ${sessionAssignments.personId})` })
      .from(sessionAssignments)
      .where(withEventScope(sessionAssignments.eventId, eventId));

    // Faculty invited: distinct people with pending/sent invites
    const [facultyInvited] = await tx
      .select({ count: sql<number>`count(distinct ${facultyInvites.personId})` })
      .from(facultyInvites)
      .where(
        withEventScope(
          facultyInvites.eventId,
          eventId,
          inArray(facultyInvites.status, ['sent', 'opened']),
        ),
      );

    // Certificates: issued (current valid)
    const [certsIssued] = await tx
      .select({ count: count() })
      .from(issuedCertificates)
      .where(
        withEventScope(
          issuedCertificates.eventId,
          eventId,
          eq(issuedCertificates.status, 'issued'),
        ),
      );

    // Certificates eligible: confirmed registrations (potential recipients)
    const [certsEligible] = await tx
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          eventId,
          eq(eventRegistrations.status, 'confirmed'),
        ),
      );

    // Notifications: sent (sent+delivered+read) and failed
    const [notifSent] = await tx
      .select({ count: count() })
      .from(notificationLog)
      .where(
        withEventScope(
          notificationLog.eventId,
          eventId,
          inArray(notificationLog.status, ['sent', 'delivered', 'read']),
        ),
      );

    const [notifFailed] = await tx
      .select({ count: count() })
      .from(notificationLog)
      .where(
        withEventScope(
          notificationLog.eventId,
          eventId,
          eq(notificationLog.status, 'failed'),
        ),
      );

    // Red flags: unreviewed
    const [flagsPending] = await tx
      .select({ count: count() })
      .from(redFlags)
      .where(
        withEventScope(
          redFlags.eventId,
          eventId,
          eq(redFlags.flagStatus, 'unreviewed'),
        ),
      );

    return {
      registrations: {
        total: regTotal.count,
        today: regToday.count,
      },
      faculty: {
        confirmed: Number(facultyConfirmed.count),
        invited: Number(facultyInvited.count),
      },
      certificates: {
        issued: certsIssued.count,
        eligible: certsEligible.count,
      },
      notifications: {
        sent: notifSent.count,
        failed: notifFailed.count,
      },
      redFlags: {
        pending: flagsPending.count,
      },
    };
  }, { isolationLevel: 'repeatable read' });
}

export type RecentNotificationItem = {
  id: string;
  subject: string;
  recipientName: string;
  recipientContact: string | null;
  channel: string;
  status: string;
  queuedAt: Date;
  isUnread: boolean;
};

export async function getRecentNotifications(
  eventId: string,
): Promise<{ items: RecentNotificationItem[]; unreadCount: number }> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId, { requireWrite: false });

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: notificationLog.id,
        renderedSubject: notificationLog.renderedSubject,
        templateKeySnapshot: notificationLog.templateKeySnapshot,
        recipientEmail: notificationLog.recipientEmail,
        recipientPhoneE164: notificationLog.recipientPhoneE164,
        channel: notificationLog.channel,
        status: notificationLog.status,
        queuedAt: notificationLog.queuedAt,
        personFullName: people.fullName,
      })
      .from(notificationLog)
      .leftJoin(people, eq(notificationLog.personId, people.id))
      .where(withEventScope(notificationLog.eventId, eventId))
      .orderBy(desc(notificationLog.queuedAt))
      .limit(20),
    db
      .select({ count: count() })
      .from(notificationLog)
      .where(withEventScope(notificationLog.eventId, eventId, not(eq(notificationLog.status, 'read')))),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      subject:
        row.renderedSubject ??
        row.templateKeySnapshot?.replace(/_/g, ' ') ??
        'Notification',
      recipientName: row.personFullName ?? 'Unknown',
      recipientContact: row.recipientEmail ?? row.recipientPhoneE164 ?? null,
      channel: row.channel,
      status: row.status,
      queuedAt: row.queuedAt,
      isUnread: row.status !== 'read',
    })),
    unreadCount: countRow?.count ?? 0,
  };
}

export async function getNotificationUnreadCount(eventId: string): Promise<number> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId, { requireWrite: false });

  const [row] = await db
    .select({ count: count() })
    .from(notificationLog)
    .where(withEventScope(notificationLog.eventId, eventId, not(eq(notificationLog.status, 'read'))));

  return row?.count ?? 0;
}

export async function markAllNotificationsRead(eventId: string): Promise<void> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId, { requireWrite: true });

  await db
    .update(notificationLog)
    .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notificationLog.eventId, eventId),
        not(inArray(notificationLog.status, ['read', 'failed', 'retrying', 'sending'])),
      ),
    );
}

export async function getNeedsAttention(eventId: string): Promise<NeedsAttentionItem[]> {
  eventIdSchema.parse(eventId);
  await assertEventAccess(eventId, { requireWrite: false });

  return await db.transaction(async (tx) => {
    const items: NeedsAttentionItem[] = [];
    // Red flags pending
    const [flagsPending] = await tx
      .select({ count: count() })
      .from(redFlags)
      .where(
        withEventScope(
          redFlags.eventId,
          eventId,
          eq(redFlags.flagStatus, 'unreviewed'),
        ),
      );

    if (flagsPending.count > 0) {
      items.push({
        type: 'red_flags',
        label: 'Red flags need review',
        count: flagsPending.count,
        href: `/events/${eventId}/flags`,
      });
    }

    // Failed notifications
    const [notifFailed] = await tx
      .select({ count: count() })
      .from(notificationLog)
      .where(
        withEventScope(
          notificationLog.eventId,
          eventId,
          eq(notificationLog.status, 'failed'),
        ),
      );

    if (notifFailed.count > 0) {
      items.push({
        type: 'failed_notifications',
        label: 'Failed notifications',
        count: notifFailed.count,
        href: `/events/${eventId}/communications/failed`,
      });
    }

    // Pending faculty invites
    const [pendingFaculty] = await tx
      .select({ count: sql<number>`count(distinct ${facultyInvites.personId})` })
      .from(facultyInvites)
      .where(
        withEventScope(
          facultyInvites.eventId,
          eventId,
          inArray(facultyInvites.status, ['sent', 'opened']),
        ),
      );

    if (Number(pendingFaculty.count) > 0) {
      items.push({
        type: 'pending_faculty',
        label: 'Faculty awaiting response',
        count: Number(pendingFaculty.count),
        href: `/events/${eventId}/faculty/invite`,
      });
    }

    return items;
  }, { isolationLevel: 'repeatable read' });
}
