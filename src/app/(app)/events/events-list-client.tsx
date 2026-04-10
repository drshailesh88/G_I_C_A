'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ResponsiveMetricGrid } from '@/components/responsive/responsive-metric-grid';

type Event = {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
  venueCity: string | null;
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  published: { label: 'Live', color: 'bg-green-100 text-green-800 border-green-300' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
};

export function EventsListClient({ events }: { events: Event[] }) {
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.endDate) >= now && e.status !== 'archived' && e.status !== 'cancelled');
  const past = events.filter((e) => new Date(e.endDate) < now || e.status === 'archived' || e.status === 'cancelled');

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: 'var(--font-size-2xl)' }} className="font-bold text-text-primary">Events</h1>
        <Link
          href="/events/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-light"
          style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section style={{ marginTop: 'var(--space-lg)' }}>
          <h2 style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-xs)' }} className="font-semibold uppercase tracking-wider text-text-muted">Upcoming</h2>
          <ResponsiveMetricGrid minCardWidth={280} gap="var(--space-sm)">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ResponsiveMetricGrid>
        </section>
      )}

      {/* Past Events */}
      {past.length > 0 && (
        <section style={{ marginTop: 'var(--space-lg)' }}>
          <h2 style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-xs)' }} className="font-semibold uppercase tracking-wider text-text-muted">Past Events</h2>
          <ResponsiveMetricGrid minCardWidth={280} gap="var(--space-sm)">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ResponsiveMetricGrid>
        </section>
      )}

      {events.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
            <Plus className="h-8 w-8 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">No events yet</p>
            <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-secondary">Create your first event to get started</p>
          </div>
          <Link
            href="/events/new"
            className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white hover:bg-primary-light"
            style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
          >
            Create Event
          </Link>
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const style = STATUS_STYLES[event.status] || STATUS_STYLES.draft;
  const startStr = format(new Date(event.startDate), 'MMM d, yyyy');
  const endStr = format(new Date(event.endDate), 'MMM d, yyyy');
  const dateRange = startStr === endStr ? startStr : `${format(new Date(event.startDate), 'MMM d')}-${format(new Date(event.endDate), 'd, yyyy')}`;
  const venue = [event.venueName, event.venueCity].filter(Boolean).join(', ');

  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded-xl border border-border bg-surface transition-colors hover:border-accent/50"
      style={{ padding: 'var(--space-sm)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full border px-2.5 py-0.5 font-medium', style.color)} style={{ fontSize: 'var(--font-size-xs)' }}>
            {style.label}
          </span>
        </div>
        <span style={{ fontSize: 'var(--font-size-xs)' }} className="text-text-muted">{dateRange}</span>
      </div>
      <h3 className="mt-2 font-semibold text-text-primary" style={{ fontSize: 'var(--font-size-base)' }}>{event.name}</h3>
      {venue && <p className="mt-1 text-text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>{venue}</p>}
    </Link>
  );
}
