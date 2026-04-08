'use client';

import { CheckCircle2 } from 'lucide-react';

type Event = {
  id: string;
  name: string;
  slug: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
};

export function FacultyConfirmedClient({ event }: { event: Event }) {
  const dateRange = `${new Date(event.startDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;

  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {/* Success icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>

      <h1 className="mt-6 text-2xl font-bold text-text-primary">Participation Confirmed!</h1>
      <p className="mt-2 text-sm text-text-secondary">Thank you for confirming.</p>

      {/* Event details card */}
      <div className="mt-8 w-full rounded-xl border border-border bg-surface p-4 text-left">
        <p className="text-center text-sm font-semibold text-text-primary">{event.name}</p>
        <p className="mt-1 text-center text-xs text-text-muted">{dateRange}</p>
        {event.venueName && (
          <p className="text-center text-xs text-text-muted">{event.venueName}</p>
        )}
      </div>

      {/* Info */}
      <p className="mt-8 text-xs text-text-muted">
        A confirmation email has been sent to your registered email address.
      </p>
    </div>
  );
}
