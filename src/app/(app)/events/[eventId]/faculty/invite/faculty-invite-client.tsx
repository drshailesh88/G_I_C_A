'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, Clock, CheckCircle2, XCircle, Eye, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { createFacultyInvite } from '@/lib/actions/program';
import { FormGrid } from '@/components/responsive/form-grid';

type Invite = {
  id: string;
  eventId: string;
  personId: string;
  token: string;
  status: string;
  sentAt: Date;
  respondedAt: Date | null;
};

type Session = {
  id: string;
  title: string;
  sessionDate: Date | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  hallId: string | null;
  sessionType: string;
  parentSessionId: string | null;
};

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; label: string }> = {
  sent: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Sent' },
  opened: { icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Opened' },
  accepted: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Accepted' },
  declined: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Declined' },
  expired: { icon: AlertTriangle, color: 'text-text-muted', bg: 'bg-border', label: 'Expired' },
};

export function FacultyInviteClient({
  eventId,
  invites,
  sessions,
}: {
  eventId: string;
  invites: Invite[];
  sessions: Session[];
}) {
  const router = useRouter();
  const { canWrite } = useRole();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [personId, setPersonId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Status counts
  const statusCounts = invites.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {});

  // Filter invites
  const filtered = statusFilter === 'all'
    ? invites
    : invites.filter((inv) => inv.status === statusFilter);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!personId.trim()) return;

    setError('');
    startTransition(async () => {
      try {
        await createFacultyInvite(eventId, { personId: personId.trim() });
        setPersonId('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invitation');
      }
    });
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}`}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Invite Faculty</h1>
          <p className="text-sm text-text-secondary">{invites.length} invitations</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Send New Invite */}
      {canWrite && (
        <form onSubmit={handleSendInvite} className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text-primary">Send New Invitation</h3>

          <FormGrid columns={2} className="mt-3">
            {/* Faculty select — full width */}
            <div className="col-span-full">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Person ID <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                placeholder="Enter person UUID"
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Find the person ID from the People section. One invite per person per event.
              </p>
            </div>

            {/* Send button — full width */}
            <div className="col-span-full">
              <button
                type="submit"
                disabled={isPending || !personId.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send Invitation Email
              </button>
            </div>
          </FormGrid>
        </form>
      )}

      {/* Status summary */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['sent', 'accepted', 'declined'] as const).map((s) => {
          const config = STATUS_CONFIG[s];
          const Icon = config.icon;
          return (
            <div key={s} className={cn('rounded-lg p-3 text-center', config.bg)}>
              <Icon className={cn('mx-auto h-4 w-4', config.color)} />
              <p className="mt-1 text-lg font-bold text-text-primary">{statusCounts[s] || 0}</p>
              <p className="text-[10px] text-text-muted">{config.label}</p>
            </div>
          );
        })}
      </div>

      {/* Status filters */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {['all', 'sent', 'opened', 'accepted', 'declined', 'expired'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors',
              statusFilter === s
                ? 'bg-primary text-white'
                : 'border border-border bg-surface text-text-secondary hover:border-accent',
            )}
          >
            {s} {s !== 'all' && statusCounts[s] ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Invites List */}
      <div className={cn('mt-4 space-y-2 transition-opacity', isPending && 'opacity-50')}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Send className="h-10 w-10 text-text-muted" />
            <p className="mt-3 font-medium text-text-primary">No invitations found</p>
            <p className="text-sm text-text-secondary">
              {statusFilter !== 'all' ? 'Try a different filter' : 'Send your first invitation above'}
            </p>
          </div>
        ) : (
          filtered.map((invite) => {
            const config = STATUS_CONFIG[invite.status] ?? STATUS_CONFIG.sent;
            const Icon = config.icon;
            const sentDate = new Date(invite.sentAt);

            return (
              <div
                key={invite.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {invite.personId.slice(0, 8)}...
                      </span>
                      <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', config.bg, config.color)}>
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Sent {sentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {invite.respondedAt && (
                      <p className="text-xs text-text-muted">
                        Responded {new Date(invite.respondedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
