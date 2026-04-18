'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy } from 'lucide-react';
import { duplicateEvent } from '@/lib/actions/event';
import { format } from 'date-fns';

type SourceEvent = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
};

export function DuplicateEventClient({ sourceEvent }: { sourceEvent: SourceEvent }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(`Copy of ${sourceEvent.name}`);
  const [newStartDate, setNewStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const durationDays =
    Math.round(
      (new Date(sourceEvent.endDate).getTime() - new Date(sourceEvent.startDate).getTime()) /
        (1000 * 60 * 60 * 24),
    );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await duplicateEvent(sourceEvent.id, { name, newStartDate });
      if (result.ok) {
        router.push(`/events/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/events/${sourceEvent.id}`} className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Duplicate Event</h1>
      </div>

      {/* Source event info */}
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Duplicating from</p>
        <p className="mt-1 font-medium text-text-primary">{sourceEvent.name}</p>
        <p className="text-sm text-text-secondary">
          {format(new Date(sourceEvent.startDate), 'MMM d, yyyy')}
          {sourceEvent.venueName ? ` · ${sourceEvent.venueName}` : ''}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Copies: halls, sessions, role requirements, branding, templates, triggers
        </p>
        <p className="text-xs text-text-muted">
          Does not copy: registrations, assignments, travel, accommodation, certificates
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="dup-name">
            New event name
          </label>
          <input
            id="dup-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Enter event name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary" htmlFor="dup-date">
            New start date
          </label>
          <input
            id="dup-date"
            type="date"
            required
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {newStartDate && (
            <p className="mt-1 text-xs text-text-muted">
              End date will be{' '}
              {format(
                new Date(new Date(newStartDate).getTime() + durationDays * 24 * 60 * 60 * 1000),
                'MMM d, yyyy',
              )}{' '}
              ({durationDays}-day event)
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !name.trim() || !newStartDate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
          {isPending ? 'Duplicating…' : 'Duplicate Event'}
        </button>
      </form>
    </div>
  );
}
