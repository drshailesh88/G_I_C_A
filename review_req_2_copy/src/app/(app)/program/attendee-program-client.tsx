'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type PublicSession = {
  id: string;
  title: string;
  description: string | null;
  sessionDate: Date | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  hallName: string | null;
  sessionType: string;
  track: string | null;
  cmeCredits: number | null;
  assignments: Array<{ personId: string; role: string; presentationTitle: string | null }>;
  childSessions: PublicSession[];
};

type Hall = { id: string; name: string; sortOrder: string };

const SESSION_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  keynote: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-l-purple-500' },
  panel: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500' },
  workshop: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-l-orange-500' },
  free_paper: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-l-green-500' },
  plenary: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-l-indigo-500' },
  symposium: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-l-teal-500' },
  break: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-l-gray-300' },
  lunch: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-l-gray-300' },
  registration: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-l-gray-300' },
  other: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-l-slate-400' },
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

const ROLE_LABELS: Record<string, string> = {
  speaker: 'Speaker',
  chair: 'Chair',
  co_chair: 'Co-Chair',
  moderator: 'Moderator',
  panelist: 'Panelist',
  discussant: 'Discussant',
  presenter: 'Presenter',
};

function formatTime(date: Date | null): string {
  if (!date) return '--:--';
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AttendeeProgram({
  eventId,
  sessions,
  halls,
}: {
  eventId: string;
  sessions: PublicSession[];
  halls: Hall[];
}) {
  // Gather dates
  const dateSet = new Set<string>();
  for (const s of sessions) {
    if (s.sessionDate) {
      dateSet.add(new Date(s.sessionDate).toISOString().split('T')[0]);
    }
  }
  const dates = Array.from(dateSet).sort();
  const [activeDate, setActiveDate] = useState(dates[0] ?? '');
  const [hallFilter, setHallFilter] = useState<string>('all');

  // Collect unique hall names from sessions
  const hallNames = [...new Set(sessions.map((s) => s.hallName).filter(Boolean))] as string[];

  // Filter sessions
  const daySessions = sessions.filter((s) => {
    if (!s.sessionDate) return false;
    const d = new Date(s.sessionDate).toISOString().split('T')[0];
    if (d !== activeDate) return false;
    if (hallFilter !== 'all' && s.hallName !== hallFilter) return false;
    return true;
  });

  // Group by time slot
  const timeGroups = new Map<string, PublicSession[]>();
  for (const s of daySessions) {
    const key = `${formatTime(s.startAtUtc)} - ${formatTime(s.endAtUtc)}`;
    const group = timeGroups.get(key) ?? [];
    group.push(s);
    timeGroups.set(key, group);
  }

  return (
    <div className="px-4 py-6 pb-24">
      {/* Title */}
      <h1 className="text-xl font-bold text-text-primary">Scientific Program</h1>

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

      {/* Hall filter */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setHallFilter('all')}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            hallFilter === 'all'
              ? 'bg-primary/10 text-primary'
              : 'border border-border text-text-muted hover:border-accent',
          )}
        >
          All Halls
        </button>
        {hallNames.map((name) => (
          <button
            key={name}
            onClick={() => setHallFilter(name)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              hallFilter === name
                ? 'bg-primary/10 text-primary'
                : 'border border-border text-text-muted hover:border-accent',
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Card View (< md) / Grid View (>= md) */}
      {daySessions.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="font-medium text-text-primary">No sessions for this day</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check back later or try a different day.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: Card list */}
          <div className="mt-4 space-y-4 md:hidden">
            {Array.from(timeGroups.entries()).map(([timeKey, timeSessions]) => (
              <div key={timeKey}>
                <h3 className="mb-2 text-xs font-semibold text-text-muted">{timeKey}</h3>
                <div className="space-y-2">
                  {timeSessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Grid view */}
          <div className="mt-4 hidden md:block">
            <div className="overflow-x-auto">
              {/* Column headers */}
              <div className="flex border-b border-border pb-2">
                <div className="w-20 shrink-0" />
                {(hallFilter === 'all' ? hallNames : [hallFilter]).map((name) => (
                  <div
                    key={name}
                    className="min-w-[200px] flex-1 px-2 text-center text-xs font-semibold text-text-primary"
                  >
                    {name}
                  </div>
                ))}
              </div>

              {/* Time rows */}
              {Array.from(timeGroups.entries()).map(([timeKey, timeSessions]) => {
                const visibleHalls = hallFilter === 'all' ? hallNames : [hallFilter];
                return (
                  <div key={timeKey} className="flex border-b border-border/30 py-2">
                    <div className="flex w-20 shrink-0 items-start pt-1 text-[10px] text-text-muted">
                      {timeKey.split(' - ')[0]}
                    </div>
                    {visibleHalls.map((hallName) => {
                      const hallSession = timeSessions.find(
                        (s) => s.hallName === hallName,
                      );
                      return (
                        <div
                          key={hallName}
                          className="min-w-[200px] flex-1 px-2"
                        >
                          {hallSession ? (
                            <SessionCard session={hallSession} compact />
                          ) : (
                            <div className="h-full" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SessionCard({
  session,
  compact = false,
}: {
  session: PublicSession;
  compact?: boolean;
}) {
  const colors = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;

  return (
    <div
      className={cn(
        'rounded-xl border border-border border-l-4 bg-surface',
        colors.border,
        compact ? 'p-2' : 'p-3',
      )}
    >
      <div className="flex items-center justify-between">
        {session.hallName && (
          <span className="text-[10px] text-text-muted">{session.hallName}</span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
          {typeLabel}
        </span>
      </div>

      <h4 className={cn('mt-1 font-medium text-text-primary', compact ? 'text-xs' : 'text-sm')}>
        {session.title}
      </h4>

      {session.assignments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {session.assignments.map((a, i) => (
            <span
              key={i}
              className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] text-text-muted"
            >
              {ROLE_LABELS[a.role] ?? a.role}
            </span>
          ))}
        </div>
      )}

      {session.cmeCredits != null && session.cmeCredits > 0 && (
        <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {session.cmeCredits} CME
        </span>
      )}

      {/* Child sessions */}
      {session.childSessions.length > 0 && !compact && (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
          {session.childSessions.map((child) => (
            <div key={child.id} className="text-xs text-text-muted">
              <span className="font-medium text-text-secondary">{child.title}</span>
              {child.assignments.length > 0 && (
                <span className="ml-1">
                  ({child.assignments.map((a) => ROLE_LABELS[a.role] ?? a.role).join(', ')})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
