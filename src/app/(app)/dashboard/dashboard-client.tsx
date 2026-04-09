'use client';

import { UserButton } from '@clerk/nextjs';
import {
  Bell,
  Users,
  GraduationCap,
  Award,
  Send,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Truck,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition, useCallback } from 'react';
import {
  getDashboardMetrics,
  getNeedsAttention,
  type DashboardMetrics,
  type NeedsAttentionItem,
} from '@/lib/actions/dashboard';

interface EventOption {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

interface DashboardClientProps {
  events: EventOption[];
}

const STORAGE_KEY = 'gem-dashboard-selected-event';

function getInitialEventId(events: EventOption[]): string | null {
  if (events.length === 0) return null;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && events.some((e) => e.id === stored)) return stored;
  }
  return events[0].id;
}

export function DashboardClient({ events }: DashboardClientProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() =>
    getInitialEventId(events),
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [attention, setAttention] = useState<NeedsAttentionItem[]>([]);
  const [isPending, startTransition] = useTransition();

  // Fetch metrics when event changes
  const fetchMetrics = useCallback(
    (eventId: string) => {
      startTransition(async () => {
        try {
          const [m, a] = await Promise.all([
            getDashboardMetrics(eventId),
            getNeedsAttention(eventId),
          ]);
          setMetrics(m);
          setAttention(a);
        } catch {
          setMetrics(null);
          setAttention([]);
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (selectedEventId) {
      fetchMetrics(selectedEventId);
    }
  }, [selectedEventId, fetchMetrics]);

  function selectEvent(eventId: string) {
    setSelectedEventId(eventId);
    localStorage.setItem(STORAGE_KEY, eventId);
    setDropdownOpen(false);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">Good Morning</p>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full p-2 hover:bg-border/50">
            <Bell className="h-5 w-5 text-text-secondary" />
          </button>
          <UserButton afterSignOutUrl="/login" />
        </div>
      </div>

      {/* Event Selector */}
      <div className="relative mt-4">
        <button
          data-testid="event-selector"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full rounded-xl bg-primary px-4 py-3 text-left"
        >
          <p className="text-xs text-white/70">Active Event</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">
                {selectedEvent ? selectedEvent.name : 'No event selected'}
              </p>
              {selectedEvent && (
                <p className="text-xs text-white/70">
                  {new Date(selectedEvent.startDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  · {selectedEvent.status}
                </p>
              )}
              {!selectedEvent && events.length === 0 && (
                <p className="text-xs text-white/70">Create your first event to get started</p>
              )}
            </div>
            <ChevronDown className="h-5 w-5 text-white/70" />
          </div>
        </button>

        {dropdownOpen && events.length > 0 && (
          <div
            data-testid="event-dropdown"
            className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg"
          >
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => selectEvent(event.id)}
                className={`w-full px-4 py-3 text-left hover:bg-border/30 ${
                  event.id === selectedEventId ? 'bg-accent-light' : ''
                }`}
              >
                <p className="text-sm font-medium text-text-primary">{event.name}</p>
                <p className="text-xs text-text-secondary">
                  {new Date(event.startDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  · {event.status}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isPending && (
        <div className="mt-6 text-center text-sm text-text-secondary">Loading metrics…</div>
      )}

      {/* Metric Cards */}
      {selectedEventId && metrics && !isPending && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3" data-testid="metric-cards">
            <MetricCard
              icon={<Users className="h-5 w-5 text-primary" />}
              value={metrics.registrations.total}
              label="Registrations"
              badge={metrics.registrations.today > 0 ? `+${metrics.registrations.today} today` : undefined}
            />
            <MetricCard
              icon={<GraduationCap className="h-5 w-5 text-primary" />}
              value={metrics.faculty.confirmed}
              label="Faculty"
              sublabel={`${metrics.faculty.invited} invited`}
            />
            <MetricCard
              icon={<Award className="h-5 w-5 text-primary" />}
              value={metrics.certificates.issued}
              label="Certificates"
              sublabel={`${metrics.certificates.eligible} eligible`}
            />
            <MetricCard
              icon={<Send className="h-5 w-5 text-primary" />}
              value={metrics.notifications.sent}
              label="Notifications"
              sublabel={
                metrics.notifications.failed > 0
                  ? `${metrics.notifications.failed} failed`
                  : undefined
              }
            />
            <MetricCard
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
              value={metrics.redFlags.pending}
              label="Red Flags"
              sublabel="pending review"
            />
          </div>

          {/* Needs Attention */}
          {attention.length > 0 && (
            <div className="mt-6" data-testid="needs-attention">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Needs Attention</h2>
              <div className="space-y-2">
                {attention.map((item) => (
                  <Link
                    key={item.type}
                    href={item.href}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 hover:border-accent"
                  >
                    <div className="flex items-center gap-3">
                      <AttentionIcon type={item.type} />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.label}</p>
                        <p className="text-xs text-text-secondary">{item.count} item{item.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-text-secondary" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3" data-testid="quick-actions">
              <QuickAction
                href={`/events/${selectedEventId}/reports`}
                icon={<FileSpreadsheet className="h-5 w-5 text-accent" />}
                label="Export Attendee List"
              />
              <QuickAction
                href={`/events/${selectedEventId}/certificates/generate`}
                icon={<Award className="h-5 w-5 text-accent" />}
                label="Generate Certificates"
              />
              <QuickAction
                href={`/events/${selectedEventId}/reports`}
                icon={<Download className="h-5 w-5 text-accent" />}
                label="Emergency Kit"
              />
              <QuickAction
                href={`/events/${selectedEventId}/transport`}
                icon={<Truck className="h-5 w-5 text-accent" />}
                label="View Transport"
              />
            </div>
          </div>
        </>
      )}

      {/* No event state */}
      {!selectedEventId && events.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-text-secondary">No events yet. Create one to see your dashboard.</p>
          <Link
            href="/events/new"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Create Event
          </Link>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  value,
  label,
  badge,
  sublabel,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  badge?: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">{icon}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {badge && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-text-secondary">{label}</p>
      {sublabel && <p className="text-xs text-text-secondary/70">{sublabel}</p>}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-light">
        {icon}
      </div>
      <span className="text-center text-xs font-medium text-text-primary">{label}</span>
    </Link>
  );
}

function AttentionIcon({ type }: { type: NeedsAttentionItem['type'] }) {
  switch (type) {
    case 'red_flags':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </div>
      );
    case 'failed_notifications':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
          <Send className="h-4 w-4 text-amber-600" />
        </div>
      );
    case 'pending_faculty':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
          <GraduationCap className="h-4 w-4 text-blue-600" />
        </div>
      );
    case 'upcoming_no_kit':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
          <Download className="h-4 w-4 text-orange-600" />
        </div>
      );
  }
}
