'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, UserMinus, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { type EventAssignment, createEventAssignment, deactivateEventAssignment } from '@/lib/actions/event-assignments';
import { type TeamMember } from '@/lib/actions/team';
import { ASSIGNMENT_TYPES, type AssignmentType } from '@/lib/validations/event-assignments';

const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  owner: 'Coordinator',
  collaborator: 'Collaborator',
};

interface EventTeamClientProps {
  eventId: string;
  eventName: string;
  initialAssignments: EventAssignment[];
  teamMembers: TeamMember[];
}

export function EventTeamClient({
  eventId,
  eventName,
  initialAssignments,
  teamMembers,
}: EventTeamClientProps) {
  const [assignments, setAssignments] = useState<EventAssignment[]>(initialAssignments);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addType, setAddType] = useState<AssignmentType>('collaborator');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Lookup map for quick member info by userId
  const memberMap = Object.fromEntries(teamMembers.map((m) => [m.userId, m]));

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function refreshAssignments() {
    // Re-fetch via server action is not available client-side without router.refresh().
    // Parent page will revalidate on next navigation; for immediate feedback we patch local state.
  }

  function getMemberLabel(userId: string): string {
    const m = memberMap[userId];
    if (!m) return userId;
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ');
    return name || m.email;
  }

  function handleAdd() {
    clearMessages();
    if (!addUserId) {
      setError('Select a team member to assign');
      return;
    }
    startTransition(async () => {
      const result = await createEventAssignment({
        eventId,
        authUserId: addUserId,
        assignmentType: addType,
      });
      if (result.ok) {
        setSuccess(`Assignment created`);
        setAddUserId('');
        setAddType('collaborator');
        setShowAdd(false);
        // Optimistically update local state
        setAssignments((prev) => {
          const existing = prev.find((a) => a.authUserId === addUserId);
          if (existing) {
            return prev.map((a) =>
              a.authUserId === addUserId
                ? { ...a, isActive: true, assignmentType: addType }
                : a,
            );
          }
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              eventId,
              authUserId: addUserId,
              assignmentType: addType,
              isActive: true,
              assignedAt: new Date(),
              assignedBy: '',
            },
          ];
        });
      } else {
        setError(result.error ?? 'Failed to create assignment');
      }
    });
  }

  function handleDeactivate(authUserId: string) {
    clearMessages();
    startTransition(async () => {
      const result = await deactivateEventAssignment({ eventId, authUserId });
      if (result.ok) {
        setSuccess('Assignment deactivated');
        setConfirmDeactivate(null);
        setAssignments((prev) =>
          prev.map((a) =>
            a.authUserId === authUserId ? { ...a, isActive: false } : a,
          ),
        );
      } else {
        setError(result.error ?? 'Failed to deactivate assignment');
      }
    });
  }

  // Members not yet actively assigned (to offer in the add form)
  const unassignedMembers = teamMembers.filter(
    (m) => !assignments.some((a) => a.authUserId === m.userId && a.isActive),
  );

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ marginBottom: 'var(--space-lg)', gap: 'var(--space-xs)' }}>
        <Link
          href={`/events/${eventId}`}
          className="rounded-lg p-1 transition-colors hover:bg-border/30"
        >
          <ArrowLeft className="h-5 w-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1
            style={{ fontSize: 'var(--font-size-2xl)' }}
            className="font-bold text-text-primary"
          >
            Event Team
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-muted">
            {eventName}
          </p>
        </div>
        {unassignedMembers.length > 0 && (
          <button
            onClick={() => {
              setShowAdd(!showAdd);
              clearMessages();
            }}
            className="flex items-center gap-2 rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90"
            style={{
              padding: 'var(--space-xs) var(--space-sm)',
              fontSize: 'var(--font-size-sm)',
              minHeight: 'var(--touch-min)',
            }}
          >
            <UserPlus className="h-4 w-4" />
            Assign
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800"
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          {success}
        </div>
      )}

      {/* Add assignment form */}
      {showAdd && (
        <div
          className="rounded-xl border border-border bg-surface"
          style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-sm)' }}
        >
          <h2
            className="font-semibold text-text-primary"
            style={{ marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}
          >
            Add assignment
          </h2>
          <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              <option value="">— Select team member —</option>
              {unassignedMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}
                </option>
              ))}
            </select>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as AssignmentType)}
              className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              {ASSIGNMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSIGNMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={isPending || !addUserId}
              className="rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              style={{
                padding: 'var(--space-xs) var(--space-lg)',
                fontSize: 'var(--font-size-sm)',
                minHeight: 'var(--touch-min)',
              }}
            >
              {isPending ? 'Saving...' : 'Add Assignment'}
            </button>
          </div>
        </div>
      )}

      {/* Assignments list */}
      <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className="flex items-center rounded-xl border border-border bg-surface"
            style={{ gap: 'var(--space-xs)', padding: 'var(--space-xs) var(--space-sm)' }}
          >
            {/* Status icon */}
            {assignment.isActive ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 flex-shrink-0 text-text-muted" />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p
                className="truncate font-medium text-text-primary"
                style={{ fontSize: 'var(--font-size-sm)' }}
              >
                {getMemberLabel(assignment.authUserId)}
              </p>
              <p className="text-text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                {ASSIGNMENT_TYPE_LABELS[assignment.assignmentType as AssignmentType] ??
                  assignment.assignmentType}
                {!assignment.isActive && ' · Inactive'}
              </p>
            </div>

            {/* Deactivate button (only for active assignments) */}
            {assignment.isActive && (
              <>
                {confirmDeactivate === assignment.authUserId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDeactivate(assignment.authUserId)}
                      disabled={isPending}
                      className="rounded-lg bg-red-500 px-3 py-1.5 font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                      style={{ fontSize: 'var(--font-size-xs)' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-text-muted transition-colors hover:bg-border/30"
                      style={{ fontSize: 'var(--font-size-xs)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setConfirmDeactivate(assignment.authUserId);
                      clearMessages();
                    }}
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Deactivate assignment"
                    style={{ minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)' }}
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {assignments.length === 0 && (
        <div
          className="mt-8 text-center text-text-muted"
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          No assignments yet. Use &ldquo;Assign&rdquo; to add team members to this event.
        </div>
      )}
    </div>
  );
}
