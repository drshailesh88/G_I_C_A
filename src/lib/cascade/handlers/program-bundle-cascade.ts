import { db } from '@/lib/db';
import { events, people, programVersions } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { ProgramVersionPublishedPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

type SnapshotSession = {
  id: string;
  title?: string;
  hallId?: string | null;
  startAtUtc?: string | Date | null;
  endAtUtc?: string | Date | null;
  sessionDate?: string | Date | null;
};

type SnapshotAssignment = {
  personId: string;
  sessionId: string;
  role?: string;
  presentationTitle?: string | null;
};

type SnapshotHall = { id: string; name: string };

type Snapshot = {
  sessions?: SnapshotSession[];
  assignments?: SnapshotAssignment[];
  halls?: SnapshotHall[];
};

export type BundledResponsibility = {
  sessionId: string;
  title: string;
  role: string;
  hallName: string;
  startIst: string;
  endIst: string;
  presentationTitle: string | null;
};

export type ResponsibilityBundle = {
  byDay: Map<string, BundledResponsibility[]>;
  total: number;
};

const BUNDLE_CHANNELS = ['email', 'whatsapp'] as const;
type BundleChannel = (typeof BUNDLE_CHANNELS)[number];

function toIstDateKey(value: string | Date | null | undefined): string {
  if (!value) return 'TBA';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatIstTime(value: string | Date | null | undefined): string {
  if (!value) return 'TBA';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDayLabel(dateKey: string): string {
  if (dateKey === 'TBA') return 'TBA';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function buildResponsibilityBundle(
  snapshot: Snapshot,
  personId: string,
  hallNames: Map<string, string>,
): ResponsibilityBundle {
  const sessionsById = new Map((snapshot.sessions ?? []).map(s => [s.id, s]));
  const byDay = new Map<string, BundledResponsibility[]>();
  let total = 0;

  for (const a of snapshot.assignments ?? []) {
    if (a.personId !== personId) continue;
    const session = sessionsById.get(a.sessionId);
    if (!session) continue;

    const dateKey = toIstDateKey(session.startAtUtc ?? session.sessionDate ?? null);
    const list = byDay.get(dateKey) ?? [];
    list.push({
      sessionId: a.sessionId,
      title: session.title ?? a.sessionId,
      role: a.role ?? 'speaker',
      hallName: session.hallId ? hallNames.get(session.hallId) ?? 'Hall TBA' : 'No hall',
      startIst: formatIstTime(session.startAtUtc),
      endIst: formatIstTime(session.endAtUtc),
      presentationTitle: a.presentationTitle ?? null,
    });
    byDay.set(dateKey, list);
    total += 1;
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => a.startIst.localeCompare(b.startIst));
  }

  return { byDay, total };
}

export function renderResponsibilityBundleSummary(bundle: ResponsibilityBundle): string {
  if (bundle.total === 0) {
    return 'No responsibilities found for the latest published program version.';
  }
  const dayKeys = [...bundle.byDay.keys()]
    .filter(k => k !== 'TBA')
    .sort();
  if (bundle.byDay.has('TBA')) dayKeys.push('TBA');

  const sections: string[] = [];
  for (const key of dayKeys) {
    const items = bundle.byDay.get(key) ?? [];
    const lines = items.map(item => {
      const presentation = item.presentationTitle ? ` — "${item.presentationTitle}"` : '';
      return `  • ${item.startIst}–${item.endIst} IST | ${item.role} | ${item.hallName} | ${item.title}${presentation}`;
    });
    sections.push(`${formatDayLabel(key)}\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}

export type SendResponsibilityBundleResult = {
  personId: string;
  channel: BundleChannel;
  status: 'sent' | 'skipped' | 'failed';
  notificationLogId: string | null;
};

type BundleSendOptions = {
  channels?: readonly BundleChannel[];
  force?: boolean;
  initiatedByUserId?: string | null;
};

export function buildBundleIdempotencyKey(
  versionId: string,
  personId: string,
  channel: BundleChannel,
  force?: { at: number },
): string {
  const base = `notify:program-bundle:${versionId}:${personId}:${channel}`;
  return force ? `${base}:force:${force.at}` : base;
}

export async function sendFacultyResponsibilityBundles(params: {
  eventId: string;
  versionId: string;
  options?: BundleSendOptions;
}): Promise<SendResponsibilityBundleResult[]> {
  const { eventId, versionId, options } = params;
  const channels = options?.channels ?? BUNDLE_CHANNELS;
  const forceMarker = options?.force ? { at: Date.now() } : undefined;

  const [version] = await db
    .select({ snapshotJson: programVersions.snapshotJson, affectedPersonIdsJson: programVersions.affectedPersonIdsJson })
    .from(programVersions)
    .where(withEventScope(programVersions.eventId, eventId, eq(programVersions.id, versionId)))
    .limit(1);

  if (!version) return [];

  const snapshot = (version.snapshotJson ?? {}) as Snapshot;
  const affectedPersonIds = ((version.affectedPersonIdsJson ?? []) as string[]).filter(Boolean);
  if (affectedPersonIds.length === 0) return [];

  const peopleRows = await db
    .select({
      id: people.id,
      email: people.email,
      phoneE164: people.phoneE164,
      fullName: people.fullName,
      salutation: people.salutation,
    })
    .from(people)
    .where(inArray(people.id, affectedPersonIds));

  const [eventRow] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const eventName = eventRow?.name ?? '';

  const hallNames = new Map<string, string>();
  for (const h of snapshot.halls ?? []) hallNames.set(h.id, h.name);

  const results: SendResponsibilityBundleResult[] = [];

  for (const person of peopleRows) {
    const bundle = buildResponsibilityBundle(snapshot, person.id, hallNames);
    if (bundle.total === 0) continue;
    const responsibilitySummary = renderResponsibilityBundleSummary(bundle);

    for (const channel of channels) {
      if (channel === 'email' && !person.email) {
        results.push({ personId: person.id, channel, status: 'skipped', notificationLogId: null });
        continue;
      }
      if (channel === 'whatsapp' && !person.phoneE164) {
        results.push({ personId: person.id, channel, status: 'skipped', notificationLogId: null });
        continue;
      }

      const idempotencyKey = buildBundleIdempotencyKey(versionId, person.id, channel, forceMarker);

      try {
        const result = await sendNotification({
          eventId,
          personId: person.id,
          channel,
          templateKey: 'faculty_reminder',
          triggerType: 'program.version_published',
          triggerEntityType: 'program_version',
          triggerEntityId: versionId,
          sendMode: 'automatic',
          idempotencyKey,
          initiatedByUserId: options?.initiatedByUserId ?? null,
          variables: {
            salutation: person.salutation ?? '',
            fullName: person.fullName,
            eventName,
            responsibilitySummary,
            recipientEmail: person.email ?? '',
            recipientPhoneE164: person.phoneE164 ?? '',
          },
        });
        results.push({
          personId: person.id,
          channel,
          status: result.status === 'sent' ? 'sent' : 'failed',
          notificationLogId: result.notificationLogId,
        });
      } catch (error) {
        if (error instanceof CascadeNotificationRetryError) {
          throw error;
        }
        console.error('[cascade:program-bundle] send failed:', error);
        captureCascadeError(error, {
          handler: 'program-bundle-cascade',
          eventId,
          cascadeEvent: CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
        });
        results.push({ personId: person.id, channel, status: 'failed', notificationLogId: null });
      }
    }
  }

  return results;
}

export async function handleProgramVersionPublishedBundle(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as ProgramVersionPublishedPayload;

  try {
    const results = await sendFacultyResponsibilityBundles({
      eventId,
      versionId: data.versionId,
      options: { initiatedByUserId: null },
    });

    for (const r of results) {
      if (r.status !== 'sent') continue;
      await handleCascadeNotificationResult({
        eventId,
        cascadeEvent: CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
        payload,
        channel: r.channel,
        triggerId: data.versionId,
        targetEntityType: 'notification_log',
        targetEntityId: r.notificationLogId ?? data.versionId,
        result: {
          notificationLogId: r.notificationLogId ?? data.versionId,
          provider: r.channel === 'email' ? 'resend' : 'evolution',
          status: 'sent',
        },
      });
    }
  } catch (error) {
    if (error instanceof CascadeNotificationRetryError) {
      throw error;
    }
    console.error('[cascade:program-bundle] handler failed:', error);
    captureCascadeError(error, {
      handler: 'program-bundle-cascade',
      eventId,
      cascadeEvent: CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
    });
  }
}

export function registerProgramBundleCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED, handleProgramVersionPublishedBundle);
}
