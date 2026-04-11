'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { FormGrid } from '@/components/responsive/form-grid';
import {
  createSession,
  updateSession,
  deleteSession,
  createRoleRequirement,
  updateRoleRequirement,
  deleteRoleRequirement,
} from '@/lib/actions/program';
import { SESSION_TYPES, ROLE_TYPES } from '@/lib/validations/program';

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

type Hall = { id: string; name: string; capacity: string | null; sortOrder: string };
type Session = {
  id: string;
  title: string;
  description: string | null;
  sessionDate: Date | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  hallId: string | null;
  sessionType: string;
  track: string | null;
  isPublic: boolean;
  cmeCredits: number | null;
  sortOrder: number;
  parentSessionId: string | null;
};

type RoleRequirement = {
  id: string;
  sessionId: string;
  role: string;
  requiredCount: number;
};

type Assignment = {
  id: string;
  sessionId: string;
  personId: string;
  role: string;
  sortOrder: number;
  presentationTitle: string | null;
  presentationDurationMinutes: number | null;
  notes: string | null;
};

function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

function formatTimeForInput(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toTimeString().slice(0, 5);
}

export function SessionFormClient({
  eventId,
  halls,
  parentSessions,
  mode,
  session,
  roleRequirements = [],
  assignments = [],
  canWriteOverride,
}: {
  eventId: string;
  halls: Hall[];
  parentSessions: Session[];
  mode: 'create' | 'edit';
  session?: Session;
  roleRequirements?: RoleRequirement[];
  assignments?: Assignment[];
  canWriteOverride?: boolean;
}) {
  const router = useRouter();
  const { canWrite } = useRole();
  const effectiveCanWrite = canWriteOverride ?? canWrite;
  const [isPending, startTransition] = useTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [title, setTitle] = useState(session?.title ?? '');
  const [description, setDescription] = useState(session?.description ?? '');
  const [sessionDate, setSessionDate] = useState(formatDateForInput(session?.sessionDate ?? null));
  const [startTime, setStartTime] = useState(formatTimeForInput(session?.startAtUtc ?? null));
  const [endTime, setEndTime] = useState(formatTimeForInput(session?.endAtUtc ?? null));
  const [hallId, setHallId] = useState(session?.hallId ?? '');
  const [sessionType, setSessionType] = useState(session?.sessionType ?? 'other');
  const [track, setTrack] = useState(session?.track ?? '');
  const [isPublic, setIsPublic] = useState(session?.isPublic ?? true);
  const [cmeCredits, setCmeCredits] = useState(session?.cmeCredits?.toString() ?? '');
  const [sortOrder, setSortOrder] = useState(session?.sortOrder?.toString() ?? '0');
  const [parentSessionId, setParentSessionId] = useState(session?.parentSessionId ?? '');

  // Role requirements state (for edit mode)
  const [localRoleReqs, setLocalRoleReqs] = useState<RoleRequirement[]>(roleRequirements);
  const [newReqRole, setNewReqRole] = useState('');
  const [newReqCount, setNewReqCount] = useState('1');

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const isReadOnly = !isHydrated || !effectiveCanWrite;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) return;

    setError('');
    startTransition(async () => {
      try {
        const formData = {
          title: title.trim(),
          description: description.trim(),
          sessionDate,
          startTime,
          endTime,
          hallId: hallId || '',
          sessionType,
          track: track.trim(),
          isPublic,
          cmeCredits: cmeCredits ? Number(cmeCredits) : undefined,
          sortOrder: Number(sortOrder) || 0,
          parentSessionId: parentSessionId || '',
        };

        if (mode === 'create') {
          await createSession(eventId, formData);
        } else if (session) {
          await updateSession(eventId, { sessionId: session.id, ...formData });
        }

        router.push(`/events/${eventId}/sessions`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save session');
      }
    });
  }

  async function handleDelete() {
    if (!session) return;
    if (!confirm('Delete this session and all its sub-sessions? This cannot be undone.')) return;

    setError('');
    startTransition(async () => {
      try {
        await deleteSession(eventId, session.id);
        router.push(`/events/${eventId}/sessions`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete session');
      }
    });
  }

  async function handleAddRoleRequirement() {
    if (!session || !newReqRole) return;

    setError('');
    startTransition(async () => {
      try {
        const req = await createRoleRequirement(eventId, {
          sessionId: session.id,
          role: newReqRole,
          requiredCount: Number(newReqCount) || 1,
        });
        setLocalRoleReqs((prev) => [...prev, req]);
        setNewReqRole('');
        setNewReqCount('1');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add role requirement');
      }
    });
  }

  async function handleDeleteRoleReq(reqId: string) {
    if (!confirm('Remove this role requirement?')) return;

    setError('');
    startTransition(async () => {
      try {
        await deleteRoleRequirement(eventId, reqId);
        setLocalRoleReqs((prev) => prev.filter((r) => r.id !== reqId));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove role requirement');
      }
    });
  }

  // Filter out roles that already have requirements
  const usedRoles = new Set(localRoleReqs.map((r) => r.role));
  const availableRoles = ROLE_TYPES.filter((r) => !usedRoles.has(r));

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eventId}/sessions`}
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-text-primary">
            {mode === 'create' ? 'Add Session' : 'Edit Session'}
          </h1>
        </div>
        {!isReadOnly && (
          <button
            type="submit"
            form="session-form"
            disabled={!isHydrated || isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Form */}
      <form
        id="session-form"
        onSubmit={handleSubmit}
        className={cn('mt-6 space-y-5', isPending && 'pointer-events-none opacity-50')}
      >
        {/* Session Name */}
        <div className="col-span-full">
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Session Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter session title"
            required
            disabled={isReadOnly}
            className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
        </div>

        {/* Date + Time row */}
        <FormGrid>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              Date <span className="text-error">*</span>
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
              disabled={isReadOnly}
              className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              Time <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                disabled={isReadOnly}
                className="min-h-[44px] flex-1 rounded-lg border border-border bg-surface px-2 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              <span className="text-text-muted">-</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                disabled={isReadOnly}
                className="min-h-[44px] flex-1 rounded-lg border border-border bg-surface px-2 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>
        </FormGrid>

        {/* Hall + Session Type row */}
        <FormGrid>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Hall</label>
            <select
              value={hallId}
              onChange={(e) => setHallId(e.target.value)}
              disabled={isReadOnly}
              className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              <option value="">No hall</option>
              {halls.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} {h.capacity ? `(${h.capacity})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              Session Type <span className="text-error">*</span>
            </label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              disabled={isReadOnly}
              className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SESSION_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
        </FormGrid>

        {/* Topic / Description */}
        <div className="col-span-full">
          <label className="mb-1 block text-sm font-medium text-text-primary">Topic / Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter topic or description"
            rows={3}
            disabled={isReadOnly}
            className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
        </div>

        {/* Track + CME Credits */}
        <FormGrid>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Track</label>
            <input
              type="text"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              placeholder="e.g., Cardiology"
              disabled={isReadOnly}
              className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">CME Credits</label>
            <input
              type="number"
              min="0"
              max="100"
              value={cmeCredits}
              onChange={(e) => setCmeCredits(e.target.value)}
              placeholder="0"
              disabled={isReadOnly}
              className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>
        </FormGrid>

        {/* Parent session (for sub-sessions) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Parent Session (for sub-sessions)
          </label>
          <select
            value={parentSessionId}
            onChange={(e) => setParentSessionId(e.target.value)}
            disabled={isReadOnly}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          >
            <option value="">None (top-level session)</option>
            {parentSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Public + Sort Order */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={isReadOnly}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">Public (visible to attendees)</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Order:</label>
            <input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={isReadOnly}
              className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>
        </div>
      </form>

      {/* Role Requirements Section (edit mode only) */}
      {mode === 'edit' && session && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Users className="h-4 w-4" />
            Role Requirements
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Define how many people are needed per role for this session.
          </p>

          <div className={cn('mt-3 space-y-2', isPending && 'opacity-50')}>
            {localRoleReqs.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {ROLE_LABELS[req.role] ?? req.role}
                  </span>
                  <span className="ml-2 text-xs text-text-muted">
                    {req.requiredCount} required
                  </span>
                </div>
                {effectiveCanWrite && (
                  <button
                    onClick={() => handleDeleteRoleReq(req.id)}
                    disabled={!isHydrated || isPending}
                    className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {/* Add new role requirement */}
            {effectiveCanWrite && availableRoles.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={newReqRole}
                  onChange={(e) => setNewReqRole(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Select role...</option>
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={newReqCount}
                  onChange={(e) => setNewReqCount(e.target.value)}
                  className="w-16 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={handleAddRoleRequirement}
                  disabled={!isHydrated || !newReqRole || isPending}
                  className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assignments Section (edit mode only, read-only display) */}
      {mode === 'edit' && session && assignments.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Users className="h-4 w-4" />
            Current Assignments
          </h2>
          <div className="mt-3 space-y-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
              >
                <div>
                  <span className="text-sm capitalize text-text-primary">
                    {ROLE_LABELS[a.role] ?? a.role}
                  </span>
                  {a.presentationTitle && (
                    <span className="ml-2 text-xs text-text-muted">
                      &mdash; {a.presentationTitle}
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-muted">
                  {a.personId.slice(0, 8)}...
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete button (edit mode) */}
      {mode === 'edit' && effectiveCanWrite && (
        <div className="mt-8 border-t border-border pt-6">
          <button
            onClick={handleDelete}
            disabled={!isHydrated || isPending}
            className="w-full rounded-lg border border-error/30 px-4 py-2.5 text-sm font-medium text-error hover:bg-error/5 disabled:opacity-50"
          >
            Delete Session
          </button>
        </div>
      )}
    </div>
  );
}
