'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, MapPin, User, BookOpen } from 'lucide-react';
import Link from 'next/link';
import type { PublicProgramData } from '@/lib/actions/program';

type Session = PublicProgramData['sessions'][number];
type Hall = PublicProgramData['halls'][number];

const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: 'bg-purple-50 border-purple-200',
  panel: 'bg-blue-50 border-blue-200',
  workshop: 'bg-orange-50 border-orange-200',
  free_paper: 'bg-green-50 border-green-200',
  plenary: 'bg-indigo-50 border-indigo-200',
  symposium: 'bg-teal-50 border-teal-200',
  break: 'bg-gray-50 border-gray-200',
  lunch: 'bg-gray-50 border-gray-200',
  registration: 'bg-gray-50 border-gray-200',
  other: 'bg-slate-50 border-slate-200',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  keynote: 'Keynote',
  panel: 'Panel',
  workshop: 'Workshop',
  free_paper: 'Free Papers',
  plenary: 'Plenary',
  symposium: 'Symposium',
  break: 'Break',
  lunch: 'Lunch',
  registration: 'Registration',
  other: 'Other',
};

const HOUR_HEIGHT = 72;

function formatTime(d: Date | string | null): string {
  if (!d) return '--:--';
  return new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    hour12: false,
  });
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function getDateKey(session: Session): string {
  if (!session.sessionDate) return 'undated';
  return new Date(session.sessionDate).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
}

function toISTMinutes(d: Date | string | null): number {
  if (!d) return 0;
  const utcMs = new Date(d).getTime();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
}

function MobileSessionCard({ session }: { session: Session }) {
  const typeColor = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;

  return (
    <div className={`rounded-xl border p-4 ${typeColor}`} data-testid="session-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="mb-1 inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-text-secondary">
            {typeLabel}
          </span>
          <p
            className="text-sm font-semibold text-text-primary leading-snug"
            data-testid="session-title"
          >
            {session.title}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {session.startAtUtc && (
            <p className="text-xs font-medium text-text-secondary whitespace-nowrap">
              {formatTime(session.startAtUtc)}
            </p>
          )}
          {session.endAtUtc && (
            <p className="text-xs text-text-muted whitespace-nowrap">
              — {formatTime(session.endAtUtc)}
            </p>
          )}
        </div>
      </div>

      {session.hallName && (
        <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
          <MapPin className="h-3 w-3 shrink-0" />
          <span data-testid="session-hall">{session.hallName}</span>
        </div>
      )}

      {session.speakers.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate" data-testid="session-speakers">
            {session.speakers.map(s => s.fullName).join(' · ')}
          </span>
        </div>
      )}

      {session.track && (
        <div className="mt-1 text-xs text-text-muted">Track: {session.track}</div>
      )}
      {session.cmeCredits != null && (
        <div className="mt-1 text-xs text-text-muted">
          {session.cmeCredits} CME credit{session.cmeCredits !== 1 ? 's' : ''}
        </div>
      )}

      {session.childSessions.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-white/50 pt-3">
          {session.childSessions.map(child => (
            <div key={child.id} className="border-l-2 border-white/70 pl-2">
              <p className="text-xs font-medium text-text-primary">{child.title}</p>
              {child.speakers.length > 0 && (
                <p className="text-xs text-text-muted">
                  {child.speakers.map(s => s.fullName).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopGridSession({
  session,
  dayStartHour,
}: {
  session: Session;
  dayStartHour: number;
}) {
  const startMins = toISTMinutes(session.startAtUtc);
  const endMins = toISTMinutes(session.endAtUtc);
  const top = ((startMins - dayStartHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 28);
  const typeColor = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;

  return (
    <div
      className={`absolute inset-x-0.5 overflow-hidden rounded-lg border px-2 py-1 ${typeColor}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      data-testid="grid-session"
    >
      <p className="truncate text-xs font-semibold text-text-primary leading-tight">
        {session.title}
      </p>
      <p className="text-xs text-text-muted">{typeLabel}</p>
      {session.speakers.length > 0 && (
        <p className="truncate text-xs text-text-muted">
          {session.speakers.map(s => s.fullName).join(', ')}
        </p>
      )}
    </div>
  );
}

function DesktopScheduleGrid({
  sessions,
  halls,
}: {
  sessions: Session[];
  halls: Hall[];
}) {
  const withTimes = sessions.filter(s => s.startAtUtc && s.endAtUtc);
  const allStartMins = withTimes.map(s => toISTMinutes(s.startAtUtc));
  const allEndMins = withTimes.map(s => toISTMinutes(s.endAtUtc));

  const dayStartHour =
    allStartMins.length > 0 ? Math.floor(Math.min(...allStartMins) / 60) : 8;
  const dayEndHour =
    allEndMins.length > 0 ? Math.ceil(Math.max(...allEndMins) / 60) : 18;

  const totalHours = Math.max(dayEndHour - dayStartHour, 1);
  const gridHeight = totalHours * HOUR_HEIGHT;
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => dayStartHour + i);

  const hallColumns =
    halls.length > 0
      ? halls.map(h => ({
          key: h.id,
          label: h.name,
          sessions: sessions.filter(s => s.hallName === h.name),
        }))
      : [{ key: 'all', label: 'Sessions', sessions }];

  return (
    <div className="overflow-x-auto" data-testid="desktop-grid">
      <div className="min-w-[560px]">
        <div className="flex border-b border-border">
          <div className="w-16 shrink-0" />
          {hallColumns.map(col => (
            <div
              key={col.key}
              className="flex-1 border-l border-border px-2 py-2 text-center text-xs font-semibold text-text-secondary"
            >
              {col.label}
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="relative w-16 shrink-0" style={{ height: `${gridHeight}px` }}>
            {hours.map(h => (
              <div
                key={h}
                className="absolute right-2 text-right text-xs text-text-muted"
                style={{ top: `${(h - dayStartHour) * HOUR_HEIGHT - 8}px` }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {hallColumns.map(col => (
            <div
              key={col.key}
              className="relative flex-1 border-l border-border"
              style={{ height: `${gridHeight}px` }}
            >
              {hours.map(h => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/40"
                  style={{ top: `${(h - dayStartHour) * HOUR_HEIGHT}px` }}
                />
              ))}
              {col.sessions.map(s => (
                <DesktopGridSession key={s.id} session={s} dayStartHour={dayStartHour} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type EventProps = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
};

export function PublicProgramClient({
  event,
  sessions,
  halls,
  hasPublishedVersion,
  initialDate,
}: {
  event: EventProps;
  sessions: Session[];
  halls: Hall[];
  hasPublishedVersion: boolean;
  initialDate: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const dateGroups = useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const s of sessions) {
      const key = getDateKey(s);
      const list = groups.get(key) ?? [];
      list.push(s);
      groups.set(key, list);
    }
    return groups;
  }, [sessions]);

  const dates = useMemo(() => {
    const keys = [...dateGroups.keys()].filter(k => k !== 'undated').sort();
    if (dateGroups.has('undated')) keys.push('undated');
    return keys;
  }, [dateGroups]);

  const defaultDate =
    initialDate && dates.includes(initialDate) ? initialDate : (dates[0] ?? null);
  const [activeDate, setActiveDate] = useState<string | null>(defaultDate);

  function selectDate(date: string) {
    setActiveDate(date);
    if (date !== 'undated') {
      router.replace(`${pathname}?d=${date}`, { scroll: false });
    } else {
      router.replace(pathname, { scroll: false });
    }
  }

  const activeSessions = activeDate ? (dateGroups.get(activeDate) ?? []) : sessions;

  if (!hasPublishedVersion) {
    return (
      <div className="px-4 py-8 text-center" data-testid="program-not-published">
        <BookOpen className="mx-auto h-10 w-10 text-text-muted" />
        <p className="mt-4 text-sm font-medium text-text-secondary">Scientific Program</p>
        <p className="mt-1 text-xs text-text-muted">
          The program has not been published yet. Check back soon.
        </p>
        <Link
          href={`/e/${event.slug}`}
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Back to event
        </Link>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-8 text-center" data-testid="program-empty">
        <Calendar className="mx-auto h-10 w-10 text-text-muted" />
        <p className="mt-4 text-sm font-medium text-text-secondary">
          No sessions scheduled yet.
        </p>
        <Link
          href={`/e/${event.slug}`}
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Back to event
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <Link
          href={`/e/${event.slug}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          ← Back to event
        </Link>
        <h1 className="mt-2 text-xl font-bold text-text-primary">{event.name}</h1>
        <p className="text-sm text-text-secondary">Scientific Program</p>
      </div>

      {dates.length > 1 && (
        <div
          className="mb-4 flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          data-testid="date-tabs"
        >
          {dates.map(date => (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={activeDate === date}
              onClick={() => selectDate(date)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                activeDate === date
                  ? 'bg-primary text-white'
                  : 'border border-border bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              {date === 'undated' ? 'Other' : formatDateLabel(date)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 md:hidden" data-testid="mobile-view">
        {activeSessions.map(session => (
          <MobileSessionCard key={session.id} session={session} />
        ))}
        {activeSessions.length === 0 && (
          <p className="py-4 text-center text-sm text-text-muted">No sessions on this day.</p>
        )}
      </div>

      <div className="hidden md:block" data-testid="desktop-view">
        <DesktopScheduleGrid sessions={activeSessions} halls={halls} />
      </div>
    </div>
  );
}
