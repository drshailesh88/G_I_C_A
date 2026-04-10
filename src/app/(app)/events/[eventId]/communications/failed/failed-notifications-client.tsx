'use client';

import { useState, useTransition } from 'react';
import { retryNotification, manualResend } from '@/lib/actions/notifications';
import {
  ResponsiveList,
  type Column,
} from '@/components/responsive/responsive-list';
import {
  RefreshCw,
  Send,
  Mail,
  MessageSquare,
  AlertCircle,
  Clock,
} from 'lucide-react';

type NotificationLog = {
  id: string;
  eventId: string;
  personId: string;
  channel: string;
  status: string;
  templateKeySnapshot: string | null;
  recipientEmail: string | null;
  recipientPhoneE164: string | null;
  renderedSubject: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  failedAt: string | null;
  queuedAt: string;
  attempts: number;
  isResend: boolean;
  resendOfId: string | null;
};

function ChannelIcon({ channel }: { channel: string }) {
  return channel === 'email' ? (
    <Mail className="h-4 w-4 text-blue-500 shrink-0" />
  ) : (
    <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
  );
}

function formatTimestamp(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function FailedNotificationsClient({
  eventId,
  initialLogs,
}: {
  eventId: string;
  initialLogs: NotificationLog[];
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [isPending, startTransition] = useTransition();
  const [actionResult, setActionResult] = useState<{
    logId: string;
    type: 'retry' | 'resend';
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  const filteredLogs = channelFilter === 'all'
    ? logs
    : logs.filter((l) => l.channel === channelFilter);

  function handleRetry(logId: string) {
    startTransition(async () => {
      try {
        const result = await retryNotification({ eventId, notificationLogId: logId });
        if (result.status === 'failed') {
          setActionResult({
            logId,
            type: 'retry',
            status: 'error',
            message: 'Retry attempted but provider rejected the message',
          });
        } else {
          setLogs((prev) => prev.filter((l) => l.id !== logId));
          setActionResult({
            logId,
            type: 'retry',
            status: 'success',
            message: 'Retry sent successfully',
          });
        }
      } catch (err) {
        setActionResult({
          logId,
          type: 'retry',
          status: 'error',
          message: err instanceof Error ? err.message : 'Retry failed',
        });
      }
    });
  }

  function handleResend(logId: string) {
    startTransition(async () => {
      try {
        const result = await manualResend({ eventId, notificationLogId: logId });
        if (result.status === 'failed') {
          setActionResult({
            logId,
            type: 'resend',
            status: 'error',
            message: 'Resend attempted but provider rejected the message',
          });
        } else {
          setActionResult({
            logId,
            type: 'resend',
            status: 'success',
            message: 'Resend sent successfully (new log entry created)',
          });
        }
      } catch (err) {
        setActionResult({
          logId,
          type: 'resend',
          status: 'error',
          message: err instanceof Error ? err.message : 'Resend failed',
        });
      }
    });
  }

  const columns: Column<NotificationLog>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      priority: 'high' as const,
      render: (log) => (
        <div className="flex items-center gap-2 min-w-0">
          <ChannelIcon channel={log.channel} />
          <div className="min-w-0">
            <div className="font-medium truncate">
              {log.recipientEmail ?? log.recipientPhoneE164 ?? 'Unknown'}
            </div>
            <div className="text-xs text-muted-foreground">
              {log.templateKeySnapshot?.replace(/_/g, ' ') ?? 'Unknown template'}
              {log.isResend && <span className="ml-1 text-amber-600">(resend)</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      priority: 'high' as const,
      render: (log) => (
        <div>
          <span className="rounded-full bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 text-xs font-medium">
            {log.lastErrorCode ?? 'FAILED'}
          </span>
          <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
            {log.lastErrorMessage ?? 'No details'}
          </div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      priority: 'medium' as const,
      render: (log) => (
        <span className="capitalize">{log.channel}</span>
      ),
    },
    {
      key: 'time',
      header: 'Failed At',
      priority: 'medium' as const,
      render: (log) => (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTimestamp(log.failedAt)}</span>
          <span className="ml-2">{log.attempts} attempt{log.attempts !== 1 ? 's' : ''}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      priority: 'low' as const,
      render: (log) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleRetry(log.id); }}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleResend(log.id); }}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <Send className="h-3 w-3" />
            Resend
          </button>
        </div>
      ),
    },
  ];

  const renderCard = (log: NotificationLog) => (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ChannelIcon channel={log.channel} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {log.recipientEmail ?? log.recipientPhoneE164 ?? 'Unknown'}
            </div>
            <div className="text-xs text-muted-foreground">
              {log.templateKeySnapshot?.replace(/_/g, ' ') ?? 'Unknown template'}
              {log.isResend && <span className="ml-1 text-amber-600">(resend)</span>}
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 text-xs font-medium">
          {log.lastErrorCode ?? 'FAILED'}
        </span>
      </div>

      {log.lastErrorMessage && (
        <p className="text-xs text-red-600 line-clamp-2">{log.lastErrorMessage}</p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTimestamp(log.failedAt)}
        </div>
        <span>{log.attempts} attempt{log.attempts !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleRetry(log.id)}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-amber-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
        <button
          onClick={() => handleResend(log.id)}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <Send className="h-3 w-3" />
          Resend
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Action result toast */}
      {actionResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${
            actionResult.status === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{actionResult.message}</span>
          <button
            onClick={() => setActionResult(null)}
            className="ml-4 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Channel:</span>
        {['all', 'email', 'whatsapp'].map((ch) => (
          <button
            key={ch}
            onClick={() => setChannelFilter(ch)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              channelFilter === ch
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            }`}
          >
            {ch === 'all' ? 'All' : ch === 'email' ? 'Email' : 'WhatsApp'}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {filteredLogs.length} failed notification{filteredLogs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Responsive list: cards on mobile, table on desktop */}
      <ResponsiveList
        data={filteredLogs}
        columns={columns}
        renderCard={renderCard}
        keyExtractor={(log) => log.id}
        emptyState={
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No failed notifications</p>
          </div>
        }
      />
    </div>
  );
}
