'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import type { NavMode } from '@/hooks/use-responsive-nav';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

type Hall = { id: string; name: string; capacity: string | null; sortOrder: string };

export const SESSION_TYPE_COLORS: Record<string, string> = {
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

export const SESSION_TYPE_LABELS: Record<string, string> = {
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

export function formatTime(date: Date | null): string {
  if (!date) return '--:--';
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getHourHeight(mode: NavMode): number {
  if (mode === 'mobile') return 60;
  if (mode === 'tablet') return 70;
  return 80;
}

function formatAssignmentLabel(assignment: ScheduleSession['assignments'][number]): string {
  return assignment.personName ?? assignment.role.replace('_', '-');
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
  const { navMode, isMobile, isDesktop } = useResponsiveNav();
  const HOUR_HEIGHT = getHourHeight(navMode);

  // Hall filter for mobile view
  const [activeHallId, setActiveHallId] = useState<string | null>(null);

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

  // Calculate pixel position for a session (absolute positioning for tablet/desktop)
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

  // For desktop CSS Grid: calculate grid-row from time
  function getGridRow(session: ScheduleSession): string {
    if (!session.startAtUtc || !session.endAtUtc) return 'auto';
    const start = new Date(session.startAtUtc);
    const end = new Date(session.endAtUtc);
    // Each hour = 2 grid rows (30min slots), +1 for header row
    const startSlot = (start.getHours() - minHour) * 2 + Math.floor(start.getMinutes() / 30) + 2;
    const endSlot = (end.getHours() - minHour) * 2 + Math.ceil(end.getMinutes() / 30) + 2;
    return `${startSlot} / ${Math.max(endSlot, startSlot + 1)}`;
  }

  // For desktop: get grid-column from hall index
  function getGridColumn(hallId: string): number {
    const idx = halls.findIndex((h) => h.id === hallId);
    return idx + 2; // +1 for time column, +1 for 1-based
  }

  // Mobile: group sessions by time for agenda view
  function getAgendaSessions(): { hour: number; sessions: ScheduleSession[] }[] {
    const filtered = activeHallId
      ? daySessions.filter((s) => s.hallId === activeHallId || !s.hallId)
      : daySessions;

    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.startAtUtc ? new Date(a.startAtUtc).getTime() : 0;
      const bTime = b.startAtUtc ? new Date(b.startAtUtc).getTime() : 0;
      return aTime - bTime;
    });

    const groups = new Map<number, ScheduleSession[]>();
    for (const s of sorted) {
      const h = s.startAtUtc ? new Date(s.startAtUtc).getHours() : minHour;
      const list = groups.get(h) ?? [];
      list.push(s);
      groups.set(h, list);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, sessions]) => ({ hour, sessions }));
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
          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
            style={{ scrollSnapType: 'x mandatory' }}
          >
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
                  style={{ scrollSnapAlign: 'start' }}
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
      ) : isMobile ? (
        /* ── Mobile: Single-column agenda view ── */
        <div data-testid="schedule-grid-mobile" className="flex-1 overflow-y-auto px-4 pb-20">
          {/* Hall filter chips */}
          <div
            data-testid="hall-filter-chips"
            className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-background py-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            <button
              onClick={() => setActiveHallId(null)}
              style={{ scrollSnapAlign: 'start' }}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeHallId === null
                  ? 'bg-primary text-white'
                  : 'border border-border bg-surface text-text-secondary',
              )}
            >
              All
            </button>
            {halls.map((hall) => (
              <button
                key={hall.id}
                onClick={() => setActiveHallId(hall.id)}
                style={{ scrollSnapAlign: 'start' }}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeHallId === hall.id
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface text-text-secondary',
                )}
              >
                {hall.name}
              </button>
            ))}
          </div>

          {/* Chronological agenda */}
          {getAgendaSessions().map(({ hour, sessions: hourSessions }) => (
            <div key={hour}>
              <div className="sticky top-10 z-[5] bg-background py-1">
                <span className="text-xs font-semibold text-text-muted">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              <div className="flex flex-col gap-2 pb-2">
                {hourSessions.map((session) => {
                  const hasConflict = conflictSessionIds.has(session.id);
                  const typeColors =
                    SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
                  const hallName = halls.find((h) => h.id === session.hallId)?.name;
                  return (
                    <Link
                      key={session.id}
                      href={`/events/${eventId}/sessions/${session.id}`}
                      className={cn(
                        'rounded-lg border-l-4 p-3 transition-colors hover:ring-1 hover:ring-accent/50',
                        typeColors,
                        hasConflict && 'ring-1 ring-warning',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {session.title}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatTime(session.startAtUtc)}-{formatTime(session.endAtUtc)}
                            {' · '}
                            {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                          </p>
                          {session.assignments.length > 0 && (
                            <p className="mt-0.5 truncate text-xs text-text-muted">
                              {session.assignments
                                .map((a) => formatAssignmentLabel(a))
                                .join(', ')}
                            </p>
                          )}
                        </div>
                        {hallName && (
                          <span className="shrink-0 rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                            {hallName}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Unassigned sessions */}
          {unassignedSessions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Unassigned to a Hall
              </h3>
              <div className="mt-2 flex flex-col gap-2">
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
      ) : isDesktop ? (
        /* ── Desktop: Full CSS Grid ── */
        <div data-testid="schedule-grid-desktop" className="flex-1 overflow-auto px-4 pb-20">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `[times] 4rem ${halls.map((_, i) => `[hall-${i + 1}] 1fr`).join(' ')}`,
              gridTemplateRows: `[header] auto ${hours.flatMap((h) => [`[h${h}-0] ${HOUR_HEIGHT / 2}px`, `[h${h}-30] ${HOUR_HEIGHT / 2}px`]).join(' ')}`,
            }}
          >
            {/* Header row: time gutter + hall names */}
            <div className="sticky top-0 z-10 bg-background" style={{ gridColumn: 1, gridRow: 1 }} />
            {halls.map((hall, i) => (
              <div
                key={hall.id}
                className="sticky top-0 z-10 border-b border-border bg-background px-2 py-2 text-center"
                style={{ gridColumn: i + 2, gridRow: 1 }}
              >
                <span className="text-xs font-semibold text-text-primary">{hall.name}</span>
              </div>
            ))}

            {/* Time labels */}
            {hours.map((h, hi) => (
              <div
                key={h}
                className="border-t border-border/30 pr-2 pt-1 text-right"
                style={{ gridColumn: 1, gridRow: `${hi * 2 + 2} / span 2` }}
              >
                <span className="text-[10px] text-text-muted">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* Hour grid lines */}
            {hours.map((h, hi) =>
              halls.map((hall, ci) => (
                <div
                  key={`line-${h}-${hall.id}`}
                  className="border-l border-t border-border/20"
                  style={{ gridColumn: ci + 2, gridRow: `${hi * 2 + 2} / span 2` }}
                />
              )),
            )}

            {/* Session cards */}
            {halls.map((hall) => {
              const hallSessions = sessionsByHall.get(hall.id) ?? [];
              return hallSessions.map((session) => {
                const hasConflict = conflictSessionIds.has(session.id);
                const typeColors =
                  SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
                return (
                  <Link
                    key={session.id}
                    href={`/events/${eventId}/sessions/${session.id}`}
                    className={cn(
                      'z-[2] mx-1 overflow-hidden rounded border-l-4 p-1.5 transition-colors hover:ring-1 hover:ring-accent/50',
                      typeColors,
                      hasConflict && 'ring-1 ring-warning',
                    )}
                    style={{
                      gridColumn: getGridColumn(hall.id),
                      gridRow: getGridRow(session),
                    }}
                  >
                    <p className="truncate text-[10px] font-medium text-text-primary">
                      {session.title}
                    </p>
                    <p className="truncate text-[9px] text-text-muted">
                      {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                    </p>
                    {session.assignments.length > 0 && (
                      <p className="mt-0.5 truncate text-[9px] text-text-muted">
                        {session.assignments.map((a) => formatAssignmentLabel(a)).join(', ')}
                      </p>
                    )}
                  </Link>
                );
              });
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
      ) : (
        /* ── Tablet: Horizontal scroll multi-hall ── */
        <div
          data-testid="schedule-grid-tablet"
          className="flex-1 overflow-x-auto overflow-y-auto px-4 pb-20"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {/* Column headers */}
          <div className="sticky top-0 z-10 flex bg-background">
            {/* Time gutter */}
            <div data-testid="time-column" className="sticky left-0 z-20 w-16 shrink-0 bg-background" />
            {/* Hall columns */}
            {halls.map((hall) => (
              <div
                key={hall.id}
                className="shrink-0 border-b border-border px-2 py-2 text-center"
                style={{ minWidth: '280px', flex: 1, scrollSnapAlign: 'start' }}
              >
                <span className="text-xs font-semibold text-text-primary">{hall.name}</span>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative flex">
            {/* Time gutter */}
            <div data-testid="time-column" className="sticky left-0 z-10 w-16 shrink-0 bg-background">
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
                  className="relative shrink-0 border-l border-border/30"
                  style={{
                    minWidth: '280px',
                    flex: 1,
                    height: `${hours.length * HOUR_HEIGHT}px`,
                    scrollSnapAlign: 'start',
                  }}
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
                    const typeColors =
                      SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
                    return (
                      <Link
                        key={session.id}
                        href={`/events/${eventId}/sessions/${session.id}`}
                        className={cn(
                          'absolute left-1 right-1 overflow-hidden rounded border-l-4 p-1.5 transition-colors hover:ring-1 hover:ring-accent/50',
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
                            {session.assignments
                              .map((a) => formatAssignmentLabel(a))
                              .join(', ')}
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
        <div
          data-testid="conflict-banner"
          className="sticky bottom-0 z-20 border-t border-warning/30 bg-warning/10 px-4 py-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-medium text-warning">
                {conflicts[0].message}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {conflicts.length > 1 && (
                <span className="text-[10px] text-text-muted">
                  +{conflicts.length - 1} more
                </span>
              )}
              {conflicts[0].sessionIds[1] && (
                <Link
                  href={`/events/${eventId}/sessions/${conflicts[0].sessionIds[1]}?conflict=true`}
                  data-testid="conflict-fix-cta"
                  className="rounded bg-warning px-2.5 py-1 text-xs font-semibold text-white hover:bg-warning/90"
                >
                  Fix
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
