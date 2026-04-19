'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type NotificationTemplate = {
  id: string;
  eventId: string | null;
  templateKey: string;
  channel: string;
  templateName: string;
  metaCategory: string;
  status: string;
  sendMode: string;
  lastActivatedAt: Date | null;
  updatedAt: Date;
  isSystemTemplate: boolean;
};

type NotificationLogEntry = {
  id: string;
  recipientEmail: string | null;
  recipientPhoneE164: string | null;
  channel: string;
  status: string;
  templateKeySnapshot: string | null;
  renderedSubject: string | null;
  queuedAt: Date;
};

type Props = {
  eventId: string;
  eventTemplates: NotificationTemplate[];
  globalTemplates: NotificationTemplate[];
  log: NotificationLogEntry[];
  activeTab: 'templates' | 'log';
  channelFilter?: string;
  statusFilter?: string;
  offset: number;
  limit: number;
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

const TEMPLATE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
};

const LOG_STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  read: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  retrying: 'bg-orange-100 text-orange-700',
};

const META_CATEGORY_LABELS: Record<string, string> = {
  registration: 'Registration',
  program: 'Program',
  logistics: 'Logistics',
  certificates: 'Certificates',
  reminders: 'Reminders',
  system: 'System',
};

export function TemplatesHubClient({
  eventId,
  eventTemplates,
  globalTemplates,
  log,
  activeTab,
  channelFilter,
  statusFilter,
  offset,
  limit,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function buildUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function setTab(tab: 'templates' | 'log') {
    router.replace(buildUrl({ tab, offset: null }));
  }

  function setChannelFilter(value: string) {
    router.push(buildUrl({ channel: value || null, offset: null }));
  }

  function setStatusFilter(value: string) {
    router.push(buildUrl({ status: value || null, offset: null }));
  }

  function paginate(direction: 'prev' | 'next') {
    const newOffset =
      direction === 'next' ? offset + limit : Math.max(0, offset - limit);
    router.push(buildUrl({ offset: String(newOffset) }));
  }

  // Combine event-specific and global templates, mark globals
  const allTemplates = [
    ...eventTemplates,
    ...globalTemplates,
  ];

  // Group by channel
  const templatesByChannel: Record<string, NotificationTemplate[]> = {};
  for (const t of allTemplates) {
    if (!templatesByChannel[t.channel]) templatesByChannel[t.channel] = [];
    templatesByChannel[t.channel].push(t);
  }

  const channelKeys = channelFilter
    ? [channelFilter].filter((ch) => templatesByChannel[ch])
    : Object.keys(templatesByChannel).sort();

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}`}
          className="rounded-lg p-1.5 hover:bg-border/50"
          data-testid="back-link"
        >
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <h1 className="text-lg font-bold text-text-primary">Communications</h1>
      </div>

      {/* Triggers shortcut */}
      <Link
        href={`/events/${eventId}/triggers`}
        className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
        data-testid="triggers-link"
      >
        <Zap className="h-4 w-4 shrink-0" />
        Automation Triggers
        <span className="ml-auto text-xs text-amber-600">Manage →</span>
      </Link>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 rounded-xl bg-border/30 p-1">
        <button
          onClick={() => setTab('templates')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'templates'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
          data-testid="tab-templates"
        >
          Templates
        </button>
        <button
          onClick={() => setTab('log')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'log'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
          data-testid="tab-log"
        >
          Delivery Log
        </button>
      </div>

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <div className="mt-4 space-y-6" data-testid="templates-panel">
          {/* Channel filter pills */}
          <div className="flex gap-2">
            {(['', 'email', 'whatsapp'] as const).map((ch) => (
              <button
                key={ch || 'all'}
                onClick={() => setChannelFilter(ch)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  (channelFilter ?? '') === ch
                    ? 'border-primary bg-primary text-white'
                    : 'border-border text-text-secondary hover:border-accent/50',
                )}
                data-testid={`channel-filter-${ch || 'all'}`}
              >
                {ch ? CHANNEL_LABELS[ch] : 'All'}
              </button>
            ))}
          </div>

          {/* Template groups */}
          {channelKeys.length === 0 ? (
            <div
              className="rounded-xl border border-border bg-surface p-8 text-center"
              data-testid="templates-empty"
            >
              <p className="text-sm text-text-secondary">
                No notification templates for this event yet.
              </p>
            </div>
          ) : (
            channelKeys.map((ch) => (
              <div key={ch} data-testid={`channel-section-${ch}`}>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {ch === 'email' ? (
                    <Mail className="h-3.5 w-3.5" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  {CHANNEL_LABELS[ch] ?? ch}
                  <span className="text-text-muted/60">
                    ({templatesByChannel[ch].length})
                  </span>
                </h2>
                <div className="space-y-2">
                  {templatesByChannel[ch].map((template) => (
                    <Link
                      key={template.id}
                      href={`/events/${eventId}/templates/${template.id}/edit`}
                      className="flex items-start justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                      data-testid="template-card"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {template.templateName}
                          </p>
                          {template.isSystemTemplate && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                              Global
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {META_CATEGORY_LABELS[template.metaCategory] ??
                            template.metaCategory}
                          {' · '}
                          {template.sendMode}
                        </p>
                      </div>
                      <div className="ml-3 shrink-0">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                            TEMPLATE_STATUS_STYLES[template.status] ??
                              'bg-gray-100 text-gray-600',
                          )}
                          data-testid="template-status"
                        >
                          {template.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Delivery Log Tab ── */}
      {activeTab === 'log' && (
        <div className="mt-4 space-y-4" data-testid="log-panel">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {(['', 'email', 'whatsapp'] as const).map((ch) => (
                <button
                  key={ch || 'all-ch'}
                  onClick={() => setChannelFilter(ch)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    (channelFilter ?? '') === ch
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text-secondary hover:border-accent/50',
                  )}
                  data-testid={`log-channel-${ch || 'all'}`}
                >
                  {ch ? CHANNEL_LABELS[ch] : 'All Channels'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['', 'sent', 'delivered', 'failed'] as const).map((s) => (
                <button
                  key={s || 'all-st'}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    (statusFilter ?? '') === s
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text-secondary hover:border-accent/50',
                  )}
                  data-testid={`status-filter-${s || 'all'}`}
                >
                  {s
                    ? s.charAt(0).toUpperCase() + s.slice(1)
                    : 'All Statuses'}
                </button>
              ))}
            </div>
          </div>

          {/* Log table */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {log.length === 0 ? (
              <p
                className="px-4 py-8 text-center text-sm text-text-secondary"
                data-testid="log-empty"
              >
                No notifications logged for this event yet.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {log.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    data-testid="log-entry"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {entry.renderedSubject ??
                          entry.templateKeySnapshot ??
                          'No subject'}
                      </p>
                      <p className="truncate text-xs text-text-secondary">
                        {entry.recipientEmail ??
                          entry.recipientPhoneE164 ??
                          'Unknown recipient'}
                        {' · '}
                        {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          LOG_STATUS_STYLES[entry.status] ??
                            'bg-gray-100 text-gray-600',
                        )}
                        data-testid="log-entry-status"
                      >
                        {entry.status}
                      </span>
                      <p className="mt-1 text-xs text-text-secondary">
                        {new Date(entry.queuedAt).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {(offset > 0 || log.length === limit) && (
            <div
              className="flex items-center justify-between"
              data-testid="pagination"
            >
              <button
                onClick={() => paginate('prev')}
                disabled={offset === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary disabled:opacity-40 hover:border-accent/50"
                data-testid="prev-page"
              >
                Previous
              </button>
              <span className="text-xs text-text-secondary">
                {offset + 1}–{offset + log.length}
              </span>
              <button
                onClick={() => paginate('next')}
                disabled={log.length < limit}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary disabled:opacity-40 hover:border-accent/50"
                data-testid="next-page"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
