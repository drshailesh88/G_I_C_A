'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Settings,
  LayoutGrid,
  Calendar,
  FileText,
  History,
  Users,
  UserPlus,
  Mail,
  Zap,
  Award,
  QrCode,
  Plane,
  Hotel,
  Bus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { updateEventStatus } from '@/lib/actions/event';
import { EVENT_TRANSITIONS, type EventStatus } from '@/lib/validations/event';

type Event = {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
  moduleToggles: unknown;
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-800' },
  published: { label: 'Live', color: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

const TRANSITION_LABELS: Record<string, string> = {
  published: 'Publish',
  completed: 'Mark Complete',
  archived: 'Archive',
  cancelled: 'Cancel Event',
};

type ModuleToggles = Record<string, boolean>;

const MODULE_TILES = [
  // PROGRAM & CONTENT
  { key: 'scientific_program', section: 'PROGRAM & CONTENT', label: 'Sessions', icon: LayoutGrid, href: '/sessions' },
  { key: 'scientific_program', section: 'PROGRAM & CONTENT', label: 'Schedule Grid', icon: Calendar, href: '/schedule' },
  { key: null, section: 'PROGRAM & CONTENT', label: 'Event Fields', icon: FileText, href: '/fields' },
  { key: null, section: 'PROGRAM & CONTENT', label: 'Changes', icon: History, href: '/changes' },
  // PEOPLE & REGISTRATION
  { key: 'registration', section: 'PEOPLE & REGISTRATION', label: 'Registrations', icon: Users, href: '/registrations' },
  { key: null, section: 'PEOPLE & REGISTRATION', label: 'Invite Faculty', icon: UserPlus, href: '/faculty/invite' },
  // COMMUNICATIONS
  { key: 'communications', section: 'COMMUNICATIONS', label: 'Templates', icon: Mail, href: '/templates' },
  { key: 'communications', section: 'COMMUNICATIONS', label: 'Triggers', icon: Zap, href: '/triggers' },
  // LOGISTICS
  { key: 'travel_accommodation', section: 'LOGISTICS', label: 'Travel', icon: Plane, href: '/travel' },
  { key: 'travel_accommodation', section: 'LOGISTICS', label: 'Accommodation', icon: Hotel, href: '/accommodation' },
  { key: 'transport_planning', section: 'LOGISTICS', label: 'Transport', icon: Bus, href: '/transport' },
  // CERTIFICATES & QR
  { key: 'certificates', section: 'CERTIFICATES & QR', label: 'Certificates', icon: Award, href: '/certificates' },
  { key: 'qr_checkin', section: 'CERTIFICATES & QR', label: 'QR Check-in', icon: QrCode, href: '/qr' },
];

export function EventWorkspaceClient({ event }: { event: Event }) {
  const router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const style = STATUS_STYLES[event.status] || STATUS_STYLES.draft;
  const toggles = (event.moduleToggles || {}) as ModuleToggles;
  const transitions = EVENT_TRANSITIONS[event.status as EventStatus] || [];

  const dateRange = `${format(new Date(event.startDate), 'MMM d')}-${format(new Date(event.endDate), 'd, yyyy')}`;

  async function handleTransition(newStatus: EventStatus) {
    if (transitioning) return;
    const confirmMsg =
      newStatus === 'cancelled'
        ? 'Are you sure you want to cancel this event? This cannot be undone.'
        : `Transition event to "${newStatus}"?`;
    if (!confirm(confirmMsg)) return;

    setTransitioning(true);
    try {
      await updateEventStatus(event.id, newStatus);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setTransitioning(false);
    }
  }

  // Group tiles by section, filtered by module toggles
  const visibleTiles = MODULE_TILES.filter((tile) => {
    if (tile.key === null) return true; // always visible
    return toggles[tile.key] !== false;
  });

  const sections = [...new Set(visibleTiles.map((t) => t.section))];

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/events" className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <Link href={`/events/${event.id}/settings`} className="rounded-lg p-1.5 hover:bg-border/50">
          <Settings className="h-5 w-5 text-text-secondary" />
        </Link>
      </div>

      {/* Event Info Banner */}
      <div className="mt-4 rounded-xl bg-primary px-4 py-4">
        <h1 className="text-lg font-bold text-white">{event.name}</h1>
        <p className="mt-1 text-xs text-white/70">
          {dateRange} · {event.venueName}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', style.color)}>
            {style.label}
          </span>
        </div>
      </div>

      {/* Status Transition Buttons */}
      {transitions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {transitions.map((t) => (
            <button
              key={t}
              onClick={() => handleTransition(t)}
              disabled={transitioning}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                t === 'cancelled'
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-accent/30 text-accent hover:bg-accent-light',
              )}
            >
              {TRANSITION_LABELS[t] || t}
            </button>
          ))}
        </div>
      )}

      {/* Module Tiles */}
      {sections.map((section) => (
        <div key={section} className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{section}</h2>
          <div className="grid grid-cols-2 gap-3">
            {visibleTiles
              .filter((t) => t.section === section)
              .map((tile) => {
                const Icon = tile.icon;
                return (
                  <Link
                    key={tile.label}
                    href={`/events/${event.id}${tile.href}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-text-primary">{tile.label}</span>
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
