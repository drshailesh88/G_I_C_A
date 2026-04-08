'use client';

import { useState, useTransition } from 'react';
import { retryNotification, manualResend } from '@/lib/actions/notifications';
import {
  RefreshCw,
  Send,
  Mail,
  MessageSquare,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
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

export function FailedNotificationsClient({
  eventId,
  initialLogs,
}: {
  eventId: string;
  initialLogs: NotificationLog[];
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
        // FIX #4: Check actual returned status — don't assume success
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
        // FIX #4: Check actual returned status
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

      {/* Notification list */}
      {filteredLogs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>No failed notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border bg-card"
            >
              {/* Row header */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Channel icon */}
                {log.channel === 'email' ? (
                  <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
                )}

                {/* Recipient */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {log.recipientEmail ?? log.recipientPhoneE164 ?? 'Unknown'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.templateKeySnapshot?.replace(/_/g, ' ') ?? 'Unknown template'}
                    {log.isResend && (
                      <span className="ml-2 text-amber-600">(resend)</span>
                    )}
                  </div>
                </div>

                {/* Error badge */}
                <span className="shrink-0 rounded-full bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 text-xs font-medium">
                  {log.lastErrorCode ?? 'FAILED'}
                </span>

                {/* Attempts */}
                <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {log.attempts} attempt{log.attempts !== 1 ? 's' : ''}
                </div>

                {/* Failed timestamp */}
                <div className="shrink-0 text-xs text-muted-foreground">
                  {log.failedAt
                    ? new Date(log.failedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                    : '—'}
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleRetry(log.id)}
                  disabled={isPending}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  title="Retry this failed notification"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
                <button
                  onClick={() => handleResend(log.id)}
                  disabled={isPending}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                  title="Send a fresh copy (new log entry)"
                >
                  <Send className="h-3 w-3" />
                  Resend
                </button>

                {/* Expand */}
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="shrink-0 p-1 rounded hover:bg-muted"
                >
                  {expandedId === log.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Expanded details */}
              {expandedId === log.id && (
                <div className="border-t px-4 py-3 bg-muted/30 space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Error:</span>{' '}
                    <span className="text-red-600">
                      {log.lastErrorMessage ?? 'No error details'}
                    </span>
                  </div>
                  {log.renderedSubject && (
                    <div>
                      <span className="font-medium">Subject:</span> {log.renderedSubject}
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>ID: {log.id.slice(0, 8)}...</span>
                    <span>Queued: {new Date(log.queuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    {log.resendOfId && <span>Resend of: {log.resendOfId.slice(0, 8)}...</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
