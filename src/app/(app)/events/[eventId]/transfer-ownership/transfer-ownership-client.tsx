'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRightLeft, User } from 'lucide-react';
import Link from 'next/link';
import { type TeamMember } from '@/lib/actions/team';
import { transferEventOwnership } from '@/lib/actions/event';

interface TransferOwnershipClientProps {
  eventId: string;
  eventName: string;
  currentOwnerUserId: string | null;
  currentOwnerDisplayName: string | null;
  teamMembers: TeamMember[];
}

function getMemberLabel(member: TeamMember): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name || member.email;
}

export function TransferOwnershipClient({
  eventId,
  eventName,
  currentOwnerUserId,
  currentOwnerDisplayName,
  teamMembers,
}: TransferOwnershipClientProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const candidateMembers = teamMembers.filter((m) => m.userId !== currentOwnerUserId);

  function handleTransfer() {
    if (!selectedUserId) {
      setError('Select a team member to transfer ownership to');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await transferEventOwnership(eventId, selectedUserId);
      if (result.ok) {
        setSuccess(true);
        setSelectedUserId('');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ marginBottom: 'var(--space-lg)', gap: 'var(--space-xs)' }}>
        <Link
          href={`/events/${eventId}/team`}
          className="rounded-lg p-1 transition-colors hover:bg-border/30"
        >
          <ArrowLeft className="h-5 w-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1
            style={{ fontSize: 'var(--font-size-2xl)' }}
            className="font-bold text-text-primary"
          >
            Transfer Ownership
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-muted">
            {eventName}
          </p>
        </div>
        <ArrowRightLeft className="h-5 w-5 text-text-muted" />
      </div>

      {/* Current owner card */}
      <div
        className="rounded-xl border border-border bg-surface"
        style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-sm)' }}
      >
        <p
          className="font-semibold text-text-primary"
          style={{ marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}
        >
          Current Owner
        </p>
        <div className="flex items-center" style={{ gap: 'var(--space-xs)' }}>
          <User className="h-4 w-4 text-text-muted" />
          <span style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-primary">
            {currentOwnerDisplayName ?? 'No owner assigned'}
          </span>
        </div>
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
          Ownership transferred successfully. The new owner now has full access to this event.
        </div>
      )}

      {/* Transfer form */}
      {!success && (
        <div
          className="rounded-xl border border-border bg-surface"
          style={{ padding: 'var(--space-sm)' }}
        >
          <p
            className="font-semibold text-text-primary"
            style={{ marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}
          >
            Transfer to
          </p>
          <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setError(null);
              }}
              className="rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              <option value="">— Select new owner —</option>
              {candidateMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {getMemberLabel(m)}
                </option>
              ))}
            </select>
            <p
              className="text-text-muted"
              style={{ fontSize: 'var(--font-size-xs)', paddingLeft: '2px' }}
            >
              The current owner will be deactivated. Prior collaborator access is preserved.
            </p>
            <button
              onClick={handleTransfer}
              disabled={isPending || !selectedUserId}
              className="rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              style={{
                padding: 'var(--space-xs) var(--space-lg)',
                fontSize: 'var(--font-size-sm)',
                minHeight: 'var(--touch-min)',
              }}
            >
              {isPending ? 'Transferring…' : 'Transfer Ownership'}
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 text-center">
          <Link
            href={`/events/${eventId}/team`}
            className="text-accent underline"
            style={{ fontSize: 'var(--font-size-sm)' }}
          >
            Back to Team
          </Link>
        </div>
      )}
    </div>
  );
}
