'use client';

import Link from 'next/link';
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react';

type Event = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  startDate: Date | string;
  endDate: Date | string;
  timezone: string;
  status: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueMapUrl: string | null;
  branding: unknown;
  registrationSettings: unknown;
  publicPageSettings: unknown;
};

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function EventLandingClient({ event }: { event: Event }) {
  const regSettings = (event.registrationSettings ?? {}) as Record<string, unknown>;
  const isRegistrationOpen = event.status === 'published';

  return (
    <div className="px-4 py-8">
      {/* Event Header */}
      <div className="text-center">
        <div className="inline-block rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent">
          {event.status === 'published' ? 'Registration Open' : event.status === 'completed' ? 'Completed' : 'Upcoming'}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-text-primary">{event.name}</h1>
        {event.description && (
          <p className="mt-2 text-sm text-text-secondary">{event.description}</p>
        )}
      </div>

      {/* Event Details */}
      <div className="mt-8 space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {formatDate(event.startDate) !== formatDate(event.endDate)
                ? `${formatDate(event.startDate)} — ${formatDate(event.endDate)}`
                : formatDate(event.startDate)}
            </p>
            <p className="text-xs text-text-secondary">
              {formatTime(event.startDate)} — {formatTime(event.endDate)} IST
            </p>
          </div>
        </div>

        {event.venueName && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-text-primary">{event.venueName}</p>
              {event.venueAddress && (
                <p className="text-xs text-text-secondary">{event.venueAddress}</p>
              )}
              {event.venueCity && (
                <p className="text-xs text-text-secondary">{event.venueCity}</p>
              )}
              {event.venueMapUrl && (event.venueMapUrl.startsWith('https://') || event.venueMapUrl.startsWith('http://')) && (
                <a
                  href={event.venueMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
                >
                  View on Google Maps
                </a>
              )}
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-text-primary">Timezone</p>
            <p className="text-xs text-text-secondary">{event.timezone}</p>
          </div>
        </div>
      </div>

      {/* Capacity info */}
      {!!regSettings.maxCapacity && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-xs text-text-muted">Limited seats available</p>
          <p className="text-sm font-medium text-text-primary">
            Max capacity: {String(regSettings.maxCapacity)}
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="mt-8">
        {isRegistrationOpen ? (
          <Link
            href={`/e/${event.slug}/register`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-white hover:bg-primary-light"
          >
            Register Now
            <ArrowRight className="h-5 w-5" />
          </Link>
        ) : (
          <div className="rounded-xl bg-border/50 py-4 text-center text-sm font-medium text-text-muted">
            Registration is currently closed
          </div>
        )}
      </div>
    </div>
  );
}
