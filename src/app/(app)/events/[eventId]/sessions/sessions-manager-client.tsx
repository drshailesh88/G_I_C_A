'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  MapPin,
  ChevronDown,
  ChevronRight,
  Users,
  Trash2,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import { DetailView } from '@/components/responsive/detail-view';
import { deleteSession } from '@/lib/actions/program';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

type Hall = { id: string; name: string; capacity: string | null; sortOrder: string };

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

function formatTime(date: Date | null): string {
  if (!date) return '--:--';
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function SessionsManagerClient({
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
  const router = useRouter();
  const { canWrite } = useRole();
  const { isMobile } = useResponsiveNav();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [showHallManager, setShowHallManager] = useState(false);
  const [error, setError] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Build conflict lookup: sessionId -> warnings
  const conflictsBySession = new Map<string, ConflictWarning[]>();
  for (const c of conflicts) {
    for (const sid of c.sessionIds) {
      const list = conflictsBySession.get(sid) ?? [];
      list.push(c);
      conflictsBySession.set(sid, list);
    }
  }

  // Hall name lookup
  const hallMap = new Map(halls.map((h) => [h.id, h.name]));

  // Total session count (including children)
  const totalCount = sessions.reduce(
    (sum, s) => sum + 1 + s.childSessions.length,
    0,
  );

  // Filter sessions
  const filtered = sessions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.hallName?.toLowerCase().includes(q) ||
      s.sessionType.toLowerCase().includes(q) ||
      s.track?.toLowerCase().includes(q)
    );
  });

  // Group sessions by date
  const sessionsByDate = new Map<string, ScheduleSession[]>();
  for (const s of filtered) {
    const dateKey = s.sessionDate
      ? new Date(s.sessionDate).toISOString().split('T')[0]
      : 'unscheduled';
    const group = sessionsByDate.get(dateKey) ?? [];
    group.push(s);
    sessionsByDate.set(dateKey, group);
  }

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ??
      sessions.flatMap((s) => s.childSessions).find((s) => s.id === selectedSessionId) ??
      null
    : null;

  function toggleExpand(sessionId: string) {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function handleDelete(sessionId: string) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setError('');
    startTransition(async () => {
      try {
        await deleteSession(eventId, sessionId);
        if (selectedSessionId === sessionId) setSelectedSessionId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete session');
      }
    });
  }

  function handleSelectSession(sessionId: string) {
    if (isMobile) {
      // On mobile, navigate to the session detail page
      router.push(`/events/${eventId}/sessions/${sessionId}`);
    } else {
      setSelectedSessionId(sessionId);
    }
  }

  // ── List panel content ──
  const listContent = (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eventId}`}
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-fluid-lg font-bold text-text-primary">Sessions</h1>
            <p className="text-fluid-sm text-text-secondary">{totalCount} sessions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <>
              <button
                onClick={() => setShowHallManager(!showHallManager)}
                className="rounded-lg border border-border p-2 text-text-secondary hover:bg-surface"
                title="Manage Halls"
              >
                <Settings className="h-4 w-4" />
              </button>
              <Link
                href={`/events/${eventId}/sessions/new`}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                <Plus className="h-4 w-4" />
                Add
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Conflict Warnings Banner */}
      {conflicts.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-sm font-medium text-warning">
              {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected
            </p>
          </div>
          <ul className="mt-2 space-y-1">
            {conflicts.slice(0, 3).map((c, i) => (
              <li key={i} className="text-xs text-text-muted">
                {c.message}
              </li>
            ))}
            {conflicts.length > 3 && (
              <li className="text-xs text-text-muted">
                ...and {conflicts.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Hall Manager Panel */}
      {showHallManager && (
        <HallManagerPanel
          eventId={eventId}
          halls={halls}
          onClose={() => setShowHallManager(false)}
        />
      )}

      {/* Search */}
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search sessions, halls, types..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Sessions List */}
      <div className={cn('mt-4 space-y-6 transition-opacity', isPending && 'opacity-50')}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Clock className="h-10 w-10 text-text-muted" />
            <p className="mt-3 font-medium text-text-primary">No sessions found</p>
            <p className="text-sm text-text-secondary">
              {searchQuery ? 'Try a different search' : 'Add your first session to get started'}
            </p>
          </div>
        ) : (
          Array.from(sessionsByDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, dateSessions]) => (
              <div key={dateKey}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {dateKey === 'unscheduled'
                    ? 'Unscheduled'
                    : new Date(dateKey + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                </h2>

                {/* Desktop: table layout */}
                {!isMobile ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-muted">
                        <th className="pb-2 font-medium">Title</th>
                        <th className="pb-2 font-medium">Hall</th>
                        <th className="pb-2 font-medium">Time</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Status</th>
                        {canWrite && <th className="pb-2 font-medium sr-only">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {dateSessions.map((session) => {
                        const colors = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
                        const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
                        const hasConflicts = (conflictsBySession.get(session.id) ?? []).length > 0;
                        return (
                          <tr
                            key={session.id}
                            onClick={() => handleSelectSession(session.id)}
                            className={cn(
                              'cursor-pointer border-b border-border/50 transition-colors hover:bg-surface',
                              selectedSessionId === session.id && 'bg-accent/5',
                              hasConflicts && 'bg-warning/5',
                            )}
                          >
                            <td className="py-2 pr-3">
                              <span className="text-fluid-sm font-medium text-text-primary">{session.title}</span>
                              {session.childSessions.length > 0 && (
                                <span className="ml-1 text-xs text-text-muted">
                                  ({session.childSessions.length} sub)
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-text-muted">{session.hallName ?? '\u2014'}</td>
                            <td className="py-2 pr-3 text-text-muted whitespace-nowrap">
                              {formatTime(session.startAtUtc)}\u2013{formatTime(session.endAtUtc)}
                            </td>
                            <td className="py-2 pr-3">
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-xs capitalize text-text-muted">
                              {session.status}
                            </td>
                            {canWrite && (
                              <td className="py-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(session.id);
                                  }}
                                  className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
                                  title="Delete session"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* Mobile: card layout */
                  <div className="space-y-2">
                    {dateSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        eventId={eventId}
                        conflicts={conflictsBySession.get(session.id) ?? []}
                        hallMap={hallMap}
                        canWrite={canWrite}
                        isExpanded={expandedSessions.has(session.id)}
                        onToggleExpand={() => toggleExpand(session.id)}
                        onDelete={() => handleDelete(session.id)}
                        onSelect={() => handleSelectSession(session.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );

  // ── Detail panel content ──
  const detailContent = selectedSession ? (
    <div className="p-4">
      <SessionDetailPanel session={selectedSession} eventId={eventId} hallMap={hallMap} />
    </div>
  ) : null;

  return (
    <DetailView
      list={listContent}
      detail={detailContent}
      showDetail={!!selectedSessionId}
      onBack={() => setSelectedSessionId(null)}
      emptyMessage="Select a session to view details"
    />
  );
}

// ── Session Detail Panel ──────────────────────────────────────
function SessionDetailPanel({
  session,
  eventId,
  hallMap,
}: {
  session: ScheduleSession;
  eventId: string;
  hallMap: Map<string, string>;
}) {
  const colors = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', colors.bg, colors.text)}>
          {typeLabel}
        </span>
        <Link
          href={`/events/${eventId}/sessions/${session.id}`}
          className="text-sm text-accent hover:underline"
        >
          Edit
        </Link>
      </div>

      <h2 className="text-fluid-lg font-bold text-text-primary">{session.title}</h2>

      {session.description && (
        <p className="text-fluid-sm text-text-secondary">{session.description}</p>
      )}

      <div className="space-y-2 text-sm text-text-muted">
        {session.hallName && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>{session.hallName}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>
            {formatTime(session.startAtUtc)} \u2013 {formatTime(session.endAtUtc)}
            {session.sessionDate && (
              <> \u00b7 {formatDate(session.sessionDate)}</>
            )}
          </span>
        </div>
      </div>

      {session.assignments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Speakers</h3>
          <div className="mt-1 space-y-1">
            {session.assignments.map((a) => (
              <div key={a.id} className="text-sm text-text-muted">
                {a.role.replace('_', ' ')}: {a.presentationTitle || 'Assigned'}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.roleRequirements.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Role Requirements</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {session.roleRequirements.map((req) => {
              const filled = session.assignments.filter((a) => a.role === req.role).length;
              const isFull = filled >= req.requiredCount;
              return (
                <span
                  key={req.id}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    isFull ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  <Users className="h-3 w-3" />
                  {req.role.replace('_', ' ')}: {filled}/{req.requiredCount}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {session.cmeCredits != null && session.cmeCredits > 0 && (
        <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {session.cmeCredits} CME Credits
        </span>
      )}

      {session.childSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Sub-sessions ({session.childSessions.length})
          </h3>
          <div className="mt-2 space-y-1">
            {session.childSessions.map((child) => (
              <Link
                key={child.id}
                href={`/events/${eventId}/sessions/${child.id}`}
                className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent/30"
              >
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {formatTime(child.startAtUtc)}-{formatTime(child.endAtUtc)}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
                    {SESSION_TYPE_LABELS[child.sessionType] ?? child.sessionType}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-text-primary">{child.title}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session Card (mobile) ─────────────────────────────────────
function SessionCard({
  session,
  eventId,
  conflicts,
  hallMap,
  canWrite,
  isExpanded,
  onToggleExpand,
  onDelete,
  onSelect,
}: {
  session: ScheduleSession;
  eventId: string;
  conflicts: ConflictWarning[];
  hallMap: Map<string, string>;
  canWrite: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const colors = SESSION_TYPE_COLORS[session.sessionType] ?? SESSION_TYPE_COLORS.other;
  const typeLabel = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
  const hasChildren = session.childSessions.length > 0;
  const hasConflicts = conflicts.length > 0;

  // Check role requirement fill status
  const filledRoles = new Map<string, number>();
  for (const a of session.assignments) {
    filledRoles.set(a.role, (filledRoles.get(a.role) ?? 0) + 1);
  }

  return (
    <div>
      <div
        className={cn(
          'rounded-xl border bg-surface transition-colors',
          hasConflicts ? 'border-warning/50' : 'border-border',
          'border-l-4',
          colors.border,
        )}
      >
        <button
          onClick={onSelect}
          className="block w-full p-4 text-left"
        >
          {/* Top row: time + hall + type badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {formatTime(session.startAtUtc)}-{formatTime(session.endAtUtc)}
              </span>
              {session.hallName && (
                <>
                  <span className="text-border">\u00b7</span>
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{session.hallName}</span>
                </>
              )}
            </div>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
              {typeLabel}
            </span>
          </div>

          {/* Title */}
          <h3 className="mt-2 text-fluid-sm font-medium text-text-primary">{session.title}</h3>

          {/* Faculty assignments */}
          {session.assignments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
              {session.assignments.map((a) => (
                <span key={a.id}>
                  {a.role.replace('_', '-')}: {a.presentationTitle || 'Assigned'}
                </span>
              ))}
            </div>
          )}

          {/* Role requirements summary */}
          {session.roleRequirements.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {session.roleRequirements.map((req) => {
                const filled = filledRoles.get(req.role) ?? 0;
                const isFull = filled >= req.requiredCount;
                return (
                  <span
                    key={req.id}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      isFull
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning',
                    )}
                  >
                    <Users className="h-3 w-3" />
                    {req.role.replace('_', ' ')}: {filled}/{req.requiredCount}
                  </span>
                );
              })}
            </div>
          )}

          {/* CME badge */}
          {session.cmeCredits != null && session.cmeCredits > 0 && (
            <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {session.cmeCredits} CME
            </span>
          )}
        </button>

        {/* Conflict warnings inline */}
        {hasConflicts && (
          <div className="border-t border-warning/20 bg-warning/5 px-4 py-2">
            {conflicts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{c.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sub-sessions toggle + delete action */}
        {(hasChildren || canWrite) && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-2">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onToggleExpand();
                }}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {session.childSessions.length} sub-session{session.childSessions.length !== 1 ? 's' : ''}
              </button>
            ) : (
              <div />
            )}
            {canWrite && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
                title="Delete session"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded sub-sessions */}
      {isExpanded && hasChildren && (
        <div className="ml-4 mt-1 space-y-1 border-l-2 border-border/50 pl-3">
          {session.childSessions.map((child) => (
            <Link
              key={child.id}
              href={`/events/${eventId}/sessions/${child.id}`}
              className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent/30"
            >
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  {formatTime(child.startAtUtc)}-{formatTime(child.endAtUtc)}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors.bg, colors.text)}>
                  {SESSION_TYPE_LABELS[child.sessionType] ?? child.sessionType}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-text-primary">{child.title}</p>
              {child.assignments.length > 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  {child.assignments.map((a) => a.role.replace('_', '-')).join(', ')}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hall Manager Panel ───────────────────────────────────────────
function HallManagerPanel({
  eventId,
  halls,
  onClose,
}: {
  eventId: string;
  halls: Hall[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newHallName, setNewHallName] = useState('');
  const [newHallCapacity, setNewHallCapacity] = useState('');
  const [error, setError] = useState('');

  async function handleAddHall(e: React.FormEvent) {
    e.preventDefault();
    if (!newHallName.trim()) return;

    setError('');
    const { createHall } = await import('@/lib/actions/program');
    startTransition(async () => {
      try {
        await createHall(eventId, {
          name: newHallName.trim(),
          capacity: newHallCapacity || '',
          sortOrder: String(halls.length),
        });
        setNewHallName('');
        setNewHallCapacity('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add hall');
      }
    });
  }

  async function handleDeleteHall(hallId: string) {
    if (!confirm('Delete this hall? Sessions using it will lose their hall assignment.')) return;
    setError('');
    const { deleteHall } = await import('@/lib/actions/program');
    startTransition(async () => {
      try {
        await deleteHall(eventId, hallId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete hall');
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Manage Halls</h3>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary">
          Close
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-error">{error}</p>
      )}

      {/* Existing halls */}
      <div className={cn('mt-3 space-y-2 transition-opacity', isPending && 'opacity-50')}>
        {halls.length === 0 ? (
          <p className="text-xs text-text-muted">No halls yet. Add one below.</p>
        ) : (
          halls.map((hall) => (
            <div
              key={hall.id}
              className="flex items-center justify-between rounded-lg bg-surface px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-text-primary">{hall.name}</span>
                {hall.capacity && (
                  <span className="ml-2 text-xs text-text-muted">({hall.capacity} seats)</span>
                )}
              </div>
              <button
                onClick={() => handleDeleteHall(hall.id)}
                className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add hall form */}
      <form onSubmit={handleAddHall} className="mt-3 flex gap-2">
        <input
          type="text"
          placeholder="Hall name"
          value={newHallName}
          onChange={(e) => setNewHallName(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          required
        />
        <input
          type="text"
          placeholder="Capacity"
          value={newHallCapacity}
          onChange={(e) => setNewHallCapacity(e.target.value)}
          className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={isPending || !newHallName.trim()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
