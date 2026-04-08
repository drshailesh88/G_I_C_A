'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export function RegistrationSuccessClient({
  eventSlug,
  registrationNumber,
  status,
  showQr,
}: {
  eventSlug: string;
  registrationNumber: string;
  status: string;
  showQr: boolean;
}) {
  const isPending = status === 'pending';
  const isWaitlisted = status === 'waitlisted';
  const isConfirmed = status === 'confirmed';

  return (
    <div className="flex flex-col items-center px-4 py-12">
      {/* Status icon */}
      <div className={`flex h-20 w-20 items-center justify-center rounded-full ${
        isPending ? 'bg-warning/10' : isWaitlisted ? 'bg-accent-light' : 'bg-success/10'
      }`}>
        {isPending ? (
          <Clock className="h-10 w-10 text-warning" />
        ) : isWaitlisted ? (
          <AlertTriangle className="h-10 w-10 text-accent" />
        ) : (
          <CheckCircle2 className="h-10 w-10 text-success" />
        )}
      </div>

      {/* Title */}
      <h1 className="mt-6 text-2xl font-bold text-text-primary">
        {isPending ? 'Registration Pending' : isWaitlisted ? 'You\'re Waitlisted' : 'Registration Confirmed'}
      </h1>
      <p className="mt-2 text-center text-sm text-text-secondary">
        {isPending
          ? 'Your registration is pending approval. You\'ll receive a confirmation email once approved.'
          : isWaitlisted
            ? 'The event is currently full. You\'ll be notified if a spot opens up.'
            : 'Your registration has been confirmed. Please save your QR code for check-in.'}
      </p>

      {/* Registration Number */}
      <div className="mt-8 w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-xs text-text-muted">Registration Number</p>
        <p className="mt-1 text-lg font-bold tracking-wider text-primary">{registrationNumber}</p>
      </div>

      {/* QR Code placeholder — only for confirmed registrations */}
      {showQr && isConfirmed && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-xs text-text-muted">Check-in QR Code</p>
          <div className="mt-3 flex items-center justify-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-lg border-2 border-dashed border-border bg-background">
              <p className="px-4 text-xs text-text-muted">
                QR code will be sent to your email
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Link
          href={`/e/${eventSlug}`}
          className="flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-text-secondary hover:bg-background"
        >
          Back to Event Page
        </Link>
      </div>
    </div>
  );
}
