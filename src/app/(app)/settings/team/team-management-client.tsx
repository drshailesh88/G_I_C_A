'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, UserPlus, Trash2, Shield } from 'lucide-react';
import Link from 'next/link';
import {
  type TeamMember,
  getRoleLabel,
  inviteTeamMember,
  changeMemberRole,
  removeTeamMember,
  getTeamMembers,
} from '@/lib/actions/team';
import { ROLES } from '@/lib/auth/roles';
import { FormGrid } from '@/components/responsive/form-grid';

const ROLE_OPTIONS = [
  { value: ROLES.SUPER_ADMIN, label: 'Super Admin' },
  { value: ROLES.EVENT_COORDINATOR, label: 'Event Coordinator' },
  { value: ROLES.OPS, label: 'Ops' },
  { value: ROLES.READ_ONLY, label: 'Read-only' },
];

interface TeamManagementClientProps {
  initialMembers: TeamMember[];
  currentUserId: string;
}

export function TeamManagementClient({ initialMembers, currentUserId }: TeamManagementClientProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(ROLES.READ_ONLY as string);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function refreshMembers() {
    try {
      const updated = await getTeamMembers();
      setMembers(updated);
    } catch {
      // Silently fail refresh — UI still shows last known state
    }
  }

  function handleInvite() {
    clearMessages();
    startTransition(async () => {
      const result = await inviteTeamMember({ emailAddress: inviteEmail, role: inviteRole });
      if (result.success) {
        setSuccess(`Invitation sent to ${inviteEmail}`);
        setInviteEmail('');
        setInviteRole(ROLES.READ_ONLY);
        setShowInvite(false);
        await refreshMembers();
      } else {
        setError(result.error ?? 'Failed to send invitation');
      }
    });
  }

  function handleChangeRole(userId: string, role: string) {
    clearMessages();
    startTransition(async () => {
      const result = await changeMemberRole({ userId, role });
      if (result.success) {
        setSuccess('Role updated');
        await refreshMembers();
      } else {
        setError(result.error ?? 'Failed to change role');
      }
    });
  }

  function handleRemove(userId: string) {
    clearMessages();
    startTransition(async () => {
      const result = await removeTeamMember({ userId });
      if (result.success) {
        setSuccess('Member removed');
        setConfirmRemove(null);
        await refreshMembers();
      } else {
        setError(result.error ?? 'Failed to remove member');
      }
    });
  }

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ marginBottom: 'var(--space-lg)', gap: 'var(--space-xs)' }}>
        <Link href="/more" className="rounded-lg p-1 transition-colors hover:bg-border/30">
          <ArrowLeft className="h-5 w-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 style={{ fontSize: 'var(--font-size-2xl)' }} className="font-bold text-text-primary">Team &amp; Roles</h1>
          <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowInvite(!showInvite); clearMessages(); }}
          className="flex items-center gap-2 rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90"
          style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
        >
          <UserPlus className="h-4 w-4" />
          Invite
        </button>
      </div>

      {/* Feedback messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800" style={{ fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800" style={{ fontSize: 'var(--font-size-sm)' }}>
          {success}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border border-border bg-surface" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-sm)' }}>
          <h2 className="font-semibold text-text-primary" style={{ marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}>Invite new member</h2>
          <FormGrid columns={1}>
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={isPending || !inviteEmail}
              className="rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              style={{ padding: 'var(--space-xs) var(--space-lg)', fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              {isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </FormGrid>
        </div>
      )}

      {/* Members list */}
      <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
        {members.map((member) => {
          const isCurrentUser = member.userId === currentUserId;
          return (
            <div
              key={member.userId}
              className="flex items-center rounded-xl border border-border bg-surface"
              style={{ gap: 'var(--space-xs)', padding: 'var(--space-xs) var(--space-sm)' }}
            >
              {/* Avatar */}
              {member.imageUrl ? (
                <img
                  src={member.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-medium text-primary" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {(member.firstName?.[0] ?? member.email[0] ?? '?').toUpperCase()}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-text-primary" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {member.firstName || member.lastName
                    ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
                    : member.email}
                  {isCurrentUser && (
                    <span className="ml-2 text-text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>(you)</span>
                  )}
                </p>
                <p className="truncate text-text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{member.email}</p>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-2">
                {isCurrentUser ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary" style={{ fontSize: 'var(--font-size-xs)' }}>
                    <Shield className="h-3 w-3" />
                    {getRoleLabel(member.role)}
                  </span>
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                    disabled={isPending}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                    style={{ fontSize: 'var(--font-size-xs)' }}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Remove button */}
                {!isCurrentUser && (
                  <>
                    {confirmRemove === member.userId ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRemove(member.userId)}
                          disabled={isPending}
                          className="rounded-lg bg-red-500 px-3 py-1.5 font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                          style={{ fontSize: 'var(--font-size-xs)' }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="rounded-lg border border-border px-3 py-1.5 text-text-muted transition-colors hover:bg-border/30"
                          style={{ fontSize: 'var(--font-size-xs)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmRemove(member.userId); clearMessages(); }}
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove member"
                        style={{ minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)' }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {members.length === 0 && (
        <div className="mt-8 text-center text-text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          No team members yet. Invite someone to get started.
        </div>
      )}
    </div>
  );
}
