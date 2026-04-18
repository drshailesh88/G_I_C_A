import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getTemplatesHub, getNotificationLog } from '@/lib/actions/notifications';
import { TemplatesHubClient } from './templates-hub-client';

const VALID_STATUSES = new Set([
  'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'retrying',
] as const);
type LogStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'retrying';

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string; channel?: string; status?: string; offset?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { eventId } = await params;
  const sp = await searchParams;

  const activeTab = sp.tab === 'log' ? 'log' : 'templates';
  const channel =
    sp.channel === 'email' || sp.channel === 'whatsapp' ? sp.channel : undefined;
  const status = sp.status && VALID_STATUSES.has(sp.status as LogStatus)
    ? (sp.status as LogStatus)
    : undefined;
  const offset = Math.max(0, parseInt(sp.offset ?? '0', 10) || 0);
  const limit = 50;

  const [templates, log] = await Promise.all([
    getTemplatesHub({ eventId, channel }),
    getNotificationLog({ eventId, channel, status, limit, offset }),
  ]);

  return (
    <TemplatesHubClient
      eventId={eventId}
      eventTemplates={templates.eventTemplates}
      globalTemplates={templates.globalTemplates}
      log={log}
      activeTab={activeTab}
      channelFilter={channel}
      statusFilter={status}
      offset={offset}
      limit={limit}
    />
  );
}
