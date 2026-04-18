'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { Mail, MessageCircle, X, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  getLastLogisticsNotification,
  resendLogisticsNotification,
} from '@/lib/actions/logistics-notifications';

type LastLog = {
  id: string;
  channel: string;
  sentAt: Date | null;
  queuedAt: Date;
  status: string;
} | null;

type ResendNotificationDialogProps = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  recordId: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
  notificationType: 'travel' | 'accommodation';
};

export function ResendNotificationDialog({
  open,
  onClose,
  eventId,
  recordId,
  personName,
  personEmail,
  personPhone,
  notificationType,
}: ResendNotificationDialogProps) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(
    personEmail ? 'email' : 'whatsapp',
  );
  const [lastLog, setLastLog] = useState<LastLog>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ success?: boolean; error?: string } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setChannel(personEmail ? 'email' : 'whatsapp');
    getLastLogisticsNotification({ eventId, recordId }).then(setLastLog).catch(() => setLastLog(null));
  }, [open, eventId, recordId, personEmail]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function handleResend() {
    startTransition(async () => {
      try {
        const res = await resendLogisticsNotification({ eventId, recordId, channel });
        if (res.status === 'no_prior_notification') {
          setFeedback({ error: 'No previous notification found for this channel.' });
        } else {
          setFeedback({ success: true });
          setTimeout(onClose, 1200);
        }
      } catch {
        setFeedback({ error: 'Failed to resend. Please try again.' });
      }
    });
  }

  if (!open) return null;

  const description =
    notificationType === 'travel'
      ? `Resend travel itinerary notification to ${personName}?`
      : `Resend accommodation details notification to ${personName}?`;

  const cooldownText =
    lastLog?.sentAt
      ? `Last sent ${formatDistanceToNow(new Date(lastLog.sentAt), { addSuffix: true })} via ${lastLog.channel === 'email' ? 'Email' : 'WhatsApp'}`
      : null;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
        data-testid="resend-dialog-overlay"
      />

      {/* Bottom sheet (mobile) / Modal (desktop) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-6 shadow-xl md:bottom-auto md:left-1/2 md:top-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resend-dialog-title"
        data-testid="resend-dialog"
      >
        {/* Handle bar (mobile only) */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="resend-dialog-title" className="text-lg font-semibold text-text-primary">
            Resend Notification
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-border/50"
            aria-label="Close"
            data-testid="resend-dialog-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Description */}
        <p className="mt-3 text-sm text-text-secondary" data-testid="resend-dialog-description">
          {description}
        </p>

        {/* Channel selection */}
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-text-primary">Send via</p>
          <div className="space-y-2">
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                channel === 'email' ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80',
                !personEmail && 'cursor-not-allowed opacity-50',
              )}
              data-testid="resend-channel-email-label"
            >
              <input
                type="radio"
                name="resend-channel"
                value="email"
                checked={channel === 'email'}
                onChange={() => setChannel('email')}
                disabled={!personEmail}
                className="accent-primary"
                data-testid="resend-channel-email"
              />
              <Mail className="h-4 w-4 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">Email</span>
              {personEmail && (
                <span className="ml-auto truncate text-xs text-text-muted">{personEmail}</span>
              )}
            </label>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                channel === 'whatsapp'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border/80',
                !personPhone && 'cursor-not-allowed opacity-50',
              )}
              data-testid="resend-channel-whatsapp-label"
            >
              <input
                type="radio"
                name="resend-channel"
                value="whatsapp"
                checked={channel === 'whatsapp'}
                onChange={() => setChannel('whatsapp')}
                disabled={!personPhone}
                className="accent-primary"
                data-testid="resend-channel-whatsapp"
              />
              <MessageCircle className="h-4 w-4 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">WhatsApp</span>
              {personPhone && (
                <span className="ml-auto text-xs text-text-muted">{personPhone}</span>
              )}
            </label>
          </div>
        </div>

        {/* Cooldown warning */}
        {cooldownText && (
          <div
            className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5"
            data-testid="resend-cooldown-warning"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <span className="text-sm text-amber-700">{cooldownText}</span>
          </div>
        )}

        {/* Feedback */}
        {feedback?.error && (
          <p className="mt-3 text-sm text-red-600" data-testid="resend-error">{feedback.error}</p>
        )}
        {feedback?.success && (
          <p className="mt-3 text-sm text-green-600" data-testid="resend-success">
            Notification resent successfully.
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-border/30 disabled:opacity-50"
            data-testid="resend-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleResend}
            disabled={isPending || feedback?.success === true}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            data-testid="resend-confirm-btn"
          >
            {isPending ? 'Sending...' : 'Resend'}
          </button>
        </div>
      </div>
    </>
  );
}
