'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

type Hall = { id: string; name: string; capacity: string | null; sortOrder: string };

const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: 'border-l-purple-500 bg-purple-50',
  panel: 'border-l-blue-500 bg-blue-50',
  workshop: 'border-l-orange-500 bg-orange-50',
  free_paper: 'border-l-green-500 bg-green-50',
  plenary: 'border-l-indigo-500 bg-indigo-50',
  symposium: 'border-l-teal-500 bg-teal-50',
  break: 'border-l-gray-300 bg-gray-50',
  lunch: 'border-l-gray-300 bg-gray-50',
  registration: 'border-l-gray-300 bg-gray-50',
  other: 'border-l-slate-400 bg-slate-50',
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

function formatTime(date: Date | null): string {
  if (!date) return '--:--';
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ScheduleGridClient({
  eventId,
  sessions,
  halls,
  conflicts,
}: {
  eventId: string;
  sessions: ScheduleSession[];
  halls: Hall[];
  conflicts: ConflictWarning[];
}) {
  // Gather all unique dates from sessions
  const dateSet = new Set<string>();
  for (const s of sessions) {
    if (s.sessionDate) {
      dateSet.add(new Date(s.sessionDate).toISOString().split('T')[0]);
    }
    for (const child of s.childSessions) {
      if (child.sessionDate) {
        dateSet.add(new Date(child.sessionDate).toISOString().split('T')[0]);
      }
    }
  }
  const dates = Array.from(dateSet).sort();
  const [activeDate, setActiveDate] = useState(dates[0] ?? '');

  // Flatten all sessions (parents + children) for the active date
  const allFlat: ScheduleSession[] = [];
  for (const s of sessions) {
    allFlat.push(s);
    for (const child of s.childSessions) {
      allFlat.push(child);
    }
  }

  const daySessions = allFlat.filter((s) => {
    if (!s.sessionDate) return false;
    return new Date(s.sessionDate).toISOString().split('T')[0] === activeDate;
  });

  // Build time grid: find min/max hours, build hourly slots
  let minHour = 24;
  let maxHour = 0;
  for (const s of daySessions) {
    if (s.startAtUtc) {
      const h = new Date(s.startAtUtc).getHours();
      if (h < minHour) minHour = h;
    }
    if (s.endAtUtc) {
      const h = new Date(s.endAtUtc).getHours();
      const m = new Date(s.endAtUtc).getMinutes();
      if (h + (m > 0 ? 1 : 0) > maxHour) maxHour = h + (m > 0 ? 1 : 0);
    }
  }

  if (minHour >= maxHour) {
    minHour = 8;
    maxHour = 18;
  }

  const hours: number[] = [];
  for (let h = minHour; h < maxHour; h++) hours.push(h);

  // Build sessions by hall
  const sessionsByHall = new Map<string, ScheduleSession[]>();
  const unassignedSessions: ScheduleSession[] = [];

  for (const s of daySessions) {
    if (s.hallId) {
      const list = sessionsByHall.get(s.hallId) ?? [];
      list.push(s);
      sessionsByHall.set(s.hallId, list);
    } else {
      unassignedSessions.push(s);
    }
  }

  // Conflict lookup by session ID
  const conflictSessionIds = new Set<string>();
  for (const c of conflicts) {
    for (const sid of c.sessionIds) {
      conflictSessionIds.add(sid);
    }
  }

  // Calculate pixel position for a session
  const HOUR_HEIGHT = 80; // px per hour

  function getSessionStyle(session: ScheduleSession): React.CSSProperties {
    if (!session.startAtUtc || !session.endAtUtc) return {};
    const start = new Date(session.startAtUtc);
    const end = new Date(session.endAtUtc);
    const startMinutes = (start.getHours() - minHour) * 60 + start.getMinutes();
    const endMinutes = (end.getHours() - minHour) * 60 + end.getMinutes();
    const duration = Math.max(endMinutes - startMinutes, 15);

    return {
      top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${(duration / 60) * HOUR_HEIGHT}px`,
      minHeight: '24px',
    };
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/events/${eventId}`}
              className="text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold text-text-primary">Schedule Builder</h1>
          </div>
          <Link
            href={`/events/${eventId}/faculty/invite`}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Send className="h-4 w-4" />
            Send All
          </Link>
        </div>

        {/* Day tabs */}
        {dates.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {dates.map((d, i) => {
              const dateObj = new Date(d + 'T00:00:00');
              const label = dateObj.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              });
              return (
                <button
                  key={d}
                  onClick={() => setActiveDate(d)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                    activeDate === d
                      ? 'bg-primary text-white'
                      : 'border border-border bg-surface text-text-secondary hover:border-accent',
                  )}
                >
                  Day {i + 1} · {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid */}
      {daySessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="font-medium text-text-primary">No sessions for this day</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add sessions in the Session Manager
          </p>
          <Link
            href={`/events/${eventId}/sessions/new`}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Add Session
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-4 pb-20">
          {/* Column headers */}
          <div className="sticky top-0 z-10 flex bg-background">
            {/* Time gutter */}
            <div className="w-14 shrink-0" />
            {/* Hall columns */}
            {halls.map((hall) => (
              <div
                key={hall.id}
                className="min-w-[160px] flex-1 border-b border-border px-2 py-2 text-center"
              >
                <span className="text-xs font-semibold text-text-primary">{hall.name}</span>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative flex">
            {/* Time gutter */}
            <div className="w-14 shrink-0">
              {hours.map((h) => (
                <div
                  key={h}
                  className="flex items-start border-t border-border/30"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="pr-2 pt-1 text-[10px] text-text-muted">
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Hall columns */}
            {halls.map((hall) => {
              const hallSessions = sessionsByHall.get(hall.id) ?? [];
              return (
                <div
                  key={hall.id}
                  className="relative min-w-[160px] flex-1 border-l border-border/30"
                  style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
                >
                  {/* Hour lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/20"
                      style={{ top: `${(h - minHour) * HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* Session cards */}
                  {hallSessions.map((session) => {
                    const hasConflict = conflictSessionIds.has(session.id);
                    const typeColors = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
                    return (
                      <Link
                        key={session.id}
                        href={`/events/${eventId}/sessions/${session.id}`}
                        className={cn(
                          'absolute left-1 right-1 overflow-hidden rounded border-l-3 p-1.5 transition-colors hover:ring-1 hover:ring-accent/50',
                          typeColors,
                          hasConflict && 'ring-1 ring-warning',
                        )}
                        style={getSessionStyle(session)}
                      >
                        <p className="truncate text-[10px] font-medium text-text-primary">
                          {session.title}
                        </p>
                        <p className="truncate text-[9px] text-text-muted">
                          {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                        </p>
                        {session.assignments.length > 0 && (
                          <p className="mt-0.5 truncate text-[9px] text-text-muted">
                            {session.assignments.map((a) => a.role.replace('_', '-')).join(', ')}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Unassigned sessions */}
          {unassignedSessions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Unassigned to a Hall
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {unassignedSessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/events/${eventId}/sessions/${s.id}`}
                    className="rounded-lg border border-border bg-surface p-2 text-xs hover:border-accent/30"
                  >
                    <p className="font-medium text-text-primary">{s.title}</p>
                    <p className="text-text-muted">
                      {formatTime(s.startAtUtc)}-{formatTime(s.endAtUtc)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflict Banner */}
      {conflicts.length > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-warning/30 bg-warning/10 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-medium text-warning">
                {conflicts[0].message}
              </span>
            </div>
            {conflicts.length > 1 && (
              <span className="text-[10px] text-text-muted">
                +{conflicts.length - 1} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
