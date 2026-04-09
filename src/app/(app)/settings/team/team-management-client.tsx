'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, UserPlus, MoreVertical, Trash2, Shield } from 'lucide-react';
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
    <div className="px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/more" className="rounded-lg p-1 transition-colors hover:bg-border/30">
          <ArrowLeft className="h-5 w-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">Team & Roles</h1>
          <p className="text-sm text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowInvite(!showInvite); clearMessages(); }}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          <UserPlus className="h-4 w-4" />
          Invite
        </button>
      </div>

      {/* Feedback messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Invite new member</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="flex flex-col gap-2">
        {members.map((member) => {
          const isCurrentUser = member.userId === currentUserId;
          return (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              {/* Avatar */}
              {member.imageUrl ? (
                <img
                  src={member.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {(member.firstName?.[0] ?? member.email[0] ?? '?').toUpperCase()}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {member.firstName || member.lastName
                    ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
                    : member.email}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-text-muted">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-text-muted">{member.email}</p>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-2">
                {isCurrentUser ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Shield className="h-3 w-3" />
                    {getRoleLabel(member.role)}
                  </span>
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                    disabled={isPending}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
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
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-border/30"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmRemove(member.userId); clearMessages(); }}
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove member"
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
        <div className="mt-8 text-center text-sm text-text-muted">
          No team members yet. Invite someone to get started.
        </div>
      )}
    </div>
  );
}
